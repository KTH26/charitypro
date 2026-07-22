import Papa from 'papaparse';

export type SheetDonorOperation = {
  action: 'create' | 'update';
  code: string;
  id: string;
  revision: number;
  previousData: string | null;
  data: Record<string, any>;
  changedFields: string[];
};

type SheetDonorPlan = {
  operations: SheetDonorOperation[];
  summary: { rows: number; creates: number; updates: number; unchanged: number; skipped: number; conflicts: number };
  samples: Array<{ code: string; name: string; action: 'create' | 'update'; changedFields: string[] }>;
  warnings: string[];
  columns: string[];
};

const normalizeHeader = (value: unknown) => String(value ?? '').replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ').toLowerCase();
const normalizedAliases = (values: string[]) => values.map(normalizeHeader);

const aliases: Record<string, string[]> = {
  displayId: ['CODE'],
  firstName: ['HID First name', ' title ×¢×¨×©×˜×¢ × ××ž×¢×Ÿ', 'HH Given Names', 'ערשטע נאמען'],
  lastName: ['Last name', '×ž×©×¤×—×” × ××ž×¢×Ÿ', 'HH Surname', 'משפחה נאמען'],
  email: ['Email'],
  notes: ['HID Note'],
  hebFirstName: ['×¢×¨×©×˜×¢ × ××ž×¢×Ÿ', 'ערשטע נאמען'],
  hebLastName: ['×ž×©×¤×—×” × ××ž×¢×Ÿ', 'משפחה נאמען'],
  preTitle: ['title', 'Title', ' title', 'title ', 'Title ', ' TITLE '],
  title: ['×˜×™×˜×œ', 'טיטל'],
  postTitle: ['× ××š ×˜×™×˜×œ', 'נאך טיטל'],
  doubleNames: ['×“××¤×¢×œ×˜×¢ × ×¢×ž×¢×Ÿ', 'דאפעלטע נעמען'],
  hisFather: ['×–×™×™×Ÿ ×˜××˜×¢', 'זיין טאטע'],
  herFather: ['××™×¨ ×˜××˜×¢', 'איר טאטע'],
  householdFullName: ['Household Full Name'],
  allMaiden: ['All Maiden'],
  homePhone: ['HomePhone'],
  mobilePhone: ['MobilePhone'],
  mobilePhone2: ['MobilePhone2'],
  phone3: ['Phone 3'],
  confidentialMobile: ['Confidentiel Mobile Phone not to display'],
  confidentialMobile2: ['2 Confidentiel Mobile Phone not to display'],
  addrBuildingNum: ['Building #'],
  addrStreet: ['Street'],
  addrApt: ['Apt.'],
  addrType: ['Type'],
  addrNo: ['No.'],
  addrPostalCode: ['Postel Code', 'Postal Code'],
  addrLandlord: ['Landlord']
};

const findCell = (row: Record<string, unknown>, names: string[]) => {
  const wanted = new Set(normalizedAliases(names));
  for (const [header, raw] of Object.entries(row)) {
    if (wanted.has(normalizeHeader(header))) return { present: true, value: String(raw ?? '').trim() };
  }
  return { present: false, value: '' };
};

const firstCell = (row: Record<string, unknown>, names: string[]) => {
  let present = false;
  for (const name of names) {
    const cell = findCell(row, [name]);
    present ||= cell.present;
    if (cell.value) return { present: true, value: cell.value };
  }
  return { present, value: '' };
};

const mappedRow = (row: Record<string, unknown>) => {
  const mapped: Record<string, string> = {};
  const present = new Set<string>();
  for (const [field, names] of Object.entries(aliases)) {
    const cell = field === 'firstName' || field === 'lastName' || field === 'preTitle' ? firstCell(row, names) : findCell(row, names);
    if (cell.present) { present.add(field); mapped[field] = cell.value; }
  }

  const mobile = findCell(row, ['MobilePhone']);
  const home = findCell(row, ['HomePhone']);
  if (mobile.present || home.present) { present.add('phone'); mapped.phone = mobile.value || home.value; }

  const street = findCell(row, ['Street']);
  const fallbackAddress = firstCell(row, ['HID Adress', 'HID Address', 'HH Address (columns J, I, and H combined)']);
  const addressParts = [findCell(row, ['No.']).value, street.value, findCell(row, ['Type']).value];
  const building = findCell(row, ['Building #']).value;
  const apartment = findCell(row, ['Apt.']).value;
  if (building) addressParts.push(`Bldg ${building}`);
  if (apartment) addressParts.push(`Apt ${apartment}`);
  addressParts.push(findCell(row, ['Postel Code', 'Postal Code']).value);
  if (street.present || fallbackAddress.present) {
    present.add('address');
    mapped.address = street.value ? addressParts.filter(Boolean).join(' ') : fallbackAddress.value;
  }
  return { mapped, present };
};

const equalValue = (left: unknown, right: unknown) => JSON.stringify(left ?? '') === JSON.stringify(right ?? '');

export const buildDonorSheetPlan = (csv: string, existingRows: Array<{ id: string; data: string; revision: number }>, clearBlankFields = false): SheetDonorPlan => {
  const parsed = Papa.parse<Record<string, unknown>>(csv, { header: true, skipEmptyLines: 'greedy' });
  if (parsed.errors.some(error => error.type === 'Quotes' || error.type === 'Delimiter')) {
    throw new Error(`The CSV could not be read: ${parsed.errors[0].message}`);
  }
  const columns = (parsed.meta.fields || []).map(value => String(value).replace(/^\uFEFF/, '').trim()).filter(Boolean);
  if (!columns.some(column => normalizeHeader(column) === 'code')) throw new Error("The sheet must contain a 'CODE' column.");

  const existingByCode = new Map<string, Array<{ id: string; data: string; revision: number; donor: Record<string, any> }>>();
  for (const row of existingRows) {
    const donor = JSON.parse(String(row.data));
    const key = String(donor.displayId || '').trim().toLowerCase();
    if (!key) continue;
    const matches = existingByCode.get(key) || [];
    matches.push({ ...row, donor });
    existingByCode.set(key, matches);
  }

  const seen = new Set<string>();
  const duplicateSheetCodes = new Set<string>();
  for (const row of parsed.data) {
    const code = findCell(row, ['CODE']).value.toLowerCase();
    if (!code) continue;
    if (seen.has(code)) duplicateSheetCodes.add(code);
    seen.add(code);
  }

  const operations: SheetDonorOperation[] = [];
  const samples: SheetDonorPlan['samples'] = [];
  const warnings: string[] = [];
  let unchanged = 0;
  let skipped = 0;
  let conflicts = 0;
  for (const row of parsed.data) {
    const { mapped, present } = mappedRow(row);
    const code = String(mapped.displayId || '').trim();
    const key = code.toLowerCase();
    if (!code) { skipped++; continue; }
    if (duplicateSheetCodes.has(key)) { conflicts++; continue; }
    const matches = existingByCode.get(key) || [];
    if (matches.length > 1) { conflicts++; continue; }

    const patch: Record<string, string> = { displayId: code };
    for (const field of present) {
      if (field === 'displayId') continue;
      const value = String(mapped[field] || '').trim().slice(0, field === 'notes' ? 2000 : 500);
      if (value || clearBlankFields) patch[field] = value;
    }

    if (matches.length === 0) {
      const id = crypto.randomUUID();
      const firstName = patch.firstName || '';
      const lastName = patch.lastName || '';
      const data = { id, ...patch, firstName, lastName, name: `${firstName} ${lastName}`.trim() || code, phone: patch.phone || '', email: patch.email || '', address: patch.address || '', notes: patch.notes || '', totalGiven: 0, balanceOwed: 0, cards: [], sponsorshipDays: [] };
      const changedFields = Object.keys(patch).filter(field => field !== 'displayId');
      operations.push({ action: 'create', code, id, revision: 0, previousData: null, data, changedFields });
      if (samples.length < 50) samples.push({ code, name: data.name, action: 'create', changedFields });
      continue;
    }

    const current = matches[0];
    const next = { ...current.donor, ...patch, id: current.id };
    if ('firstName' in patch || 'lastName' in patch) next.name = `${next.firstName || ''} ${next.lastName || ''}`.trim() || code;
    const changedFields = Object.keys(patch).filter(field => !equalValue(current.donor[field], next[field]));
    if (!changedFields.length) { unchanged++; continue; }
    operations.push({ action: 'update', code, id: current.id, revision: Number(current.revision), previousData: current.data, data: next, changedFields });
    if (samples.length < 50) samples.push({ code, name: next.name || code, action: 'update', changedFields });
  }

  if (duplicateSheetCodes.size) warnings.push(`${duplicateSheetCodes.size} duplicate CODE value(s) in the sheet were skipped.`);
  const duplicateCloudCodes = [...existingByCode.values()].filter(rows => rows.length > 1).length;
  if (duplicateCloudCodes) warnings.push(`${duplicateCloudCodes} duplicate donor CODE value(s) already online were skipped for safety.`);
  if (skipped) warnings.push(`${skipped} row(s) without a CODE were skipped.`);
  if (!clearBlankFields) warnings.push('Blank sheet cells will preserve the existing online value.');
  warnings.push('Donors absent from the sheet will not be deleted. Transactions, pledges, payments, and totals are not changed.');
  const creates = operations.filter(operation => operation.action === 'create').length;
  const updates = operations.length - creates;
  return { operations, summary: { rows: parsed.data.length, creates, updates, unchanged, skipped, conflicts }, samples, warnings, columns };
};
