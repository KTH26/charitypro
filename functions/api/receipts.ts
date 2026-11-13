/**
 * Official donation receipts (Canada Revenue Agency), in the Hatzolah design (see receipt-pdf.ts).
 * - Every eligible payment (card, check, e-transfer, wire…) can get one receipt with its own number.
 * - Card payments entered in the program and checks marked deposited are sent by themselves (when turned on).
 * - Everything else (imports, Sola sync…) waits in the "To send" list, so it can be reviewed first.
 * Each receipt is saved (type 'receipts', id rcpt-<paymentId>), so you always see who got one and who did not.
 */
import { getMessagingSettings, isEmail, sendEmail } from './messaging';
import { buildReceiptPdf, toBase64, type ReceiptFields } from './receipt-pdf';

export type ReceiptSettings = { startDate: string; eligibleMethods: string[]; numberStart: number; emailSubject: string; emailMessage: string };
export const defaultReceiptSettings: ReceiptSettings = {
  startDate: '', eligibleMethods: ['credit_card', 'check', 'e_transfer', 'wire', 'ach'], numberStart: 1,
  emailSubject: 'Official donation receipt #{{receiptNumber}}',
  emailMessage: 'Dear {{donorName}},\n\nThank you very much for your generous donation of {{amount}} on {{giftDate}}.\nYour official receipt for income tax purposes is attached.\n\nHatzolah Quebec – חברה הצלה קרית טאהש'
};
export const METHOD_NAMES: Record<string, string> = { credit_card: 'Credit card', check: 'Check', e_transfer: 'E-Transfer', wire: 'Wire', ach: 'ACH', cash: 'Cash', vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'Other' };
const parse = (raw: unknown, fallback: any) => { try { return JSON.parse(String(raw)); } catch { return fallback; } };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[ch]);
const money = (value: number) => '$' + Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** 2024-11-03 → 3/11/2024 (day/month/year, like the sample receipt). */
export const receiptDate = (iso: string) => { const [year, month, day] = String(iso || '').split('-'); return year && month && day ? `${Number(day)}/${Number(month)}/${year}` : iso; };
export const fillTemplate = (template: string, values: Record<string, string>) => template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => values[key] ?? '');

export const getReceiptSettings = async (db: any): Promise<ReceiptSettings> => {
  const row: any = await db.prepare("SELECT value FROM sync_metadata WHERE key='receipt_settings'").first();
  return { ...defaultReceiptSettings, ...parse(row?.value, {}) };
};

/** What is printed on the receipt. Saved with the receipt the first time, so a re-send is the same receipt. */
export type ReceiptCopy = { donorName: string; addressLine1: string; addressLine2: string; yiddishPreTitle: string; yiddishName: string; yiddishPostTitle: string; amount: number; giftDate: string };
type Gift = ReceiptCopy & { paymentId: string; donorId: string; email: string; method: string; type: string };
/** Split "106 Car Andre-Ouellet, Boisbriand Qc., J7E 4H4" into two lines at the first comma (or use the city). */
// Street types as they are saved in the donor list ("432 Tash Ch de"), and how they are written on a letter.
const STREET_TYPES: [RegExp, string][] = [
  [/^ch\.? de la$/i, 'Chemin de la'], [/^ch\.? de$/i, 'Chemin de'], [/^ch\.? du$/i, 'Chemin du'], [/^ch\.?$/i, 'Chemin'],
  [/^carr\.?$|^car\.?$|^carré$/i, 'Carré'], [/^rue de la$/i, 'Rue de la'], [/^rue de$/i, 'Rue de'], [/^rue$/i, 'Rue'], [/^cour$/i, 'Cour'],
  [/^place$|^pl\.?$/i, 'Place'], [/^boul\.?$|^bd$/i, 'Boulevard'], [/^av\.?$|^ave$|^avenue$/i, 'Avenue'], [/^mtée$|^montee$|^montée$/i, 'Montée'],
  [/^cr\.?$|^crois\.?$/i, 'Croissant'], [/^imp\.?$/i, 'Impasse'], [/^terr\.?$/i, 'Terrasse'], [/^rang$/i, 'Rang'], [/^allée$|^allee$/i, 'Allée']
];
const STREET_TYPE_WORDS = /\s+((?:ch\.?|rue)(?:\s+(?:de\s+la|de|du))?|carr\.?|car\.?|carré|cour|place|pl\.?|boul\.?|bd|av\.?|ave|avenue|mtée|montee|montée|cr\.?|crois\.?|imp\.?|terr\.?|rang|allée|allee)$/i;
/** Postal codes that are Boisbriand (Kiryas Tosh and around). */
const CITY_BY_POSTAL: Record<string, string> = { J7E: 'Boisbriand, Quebec', J7G: 'Boisbriand, Quebec', J7H: 'Boisbriand, Quebec' };

/**
 * The donor address as two letter lines:
 * "432 Tash Ch de  Apt #A J7E 4H4" → ["432 Chemin de Tash, Apt #A", "Boisbriand, Quebec J7E 4H4"].
 */
export const addressLines = (donor: any): [string, string] => {
  let address = String(donor.address || '').replace(/\s+/g, ' ').trim();
  if (!address) return ['', ''];
  // Already written with separate lines or commas: keep it as it is.
  if (String(donor.address).includes('\n')) { const [first, ...rest] = String(donor.address).split('\n').map(line => line.trim()).filter(Boolean); return [first || '', rest.join(', ')]; }
  const postalMatch = /\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\s*$/i.exec(address);
  const postal = postalMatch ? `${postalMatch[1].toUpperCase()} ${postalMatch[2].toUpperCase()}` : String(donor.postalCode || '').toUpperCase();
  if (postalMatch) address = address.slice(0, postalMatch.index).trim();
  // The apartment / building is left off (not needed on a receipt).
  const unitMatch = /\s+((?:apt|app|appt|unit|suite|bldg|#)\b.*)$/i.exec(address);
  if (unitMatch) address = address.slice(0, unitMatch.index).trim();
  if (address.includes(',')) { const comma = address.indexOf(','); return [address.slice(0, comma).trim(), [address.slice(comma + 1).trim(), postal].filter(Boolean).join(' ')]; }
  // "432 Tash Ch de" → "432 Chemin de Tash"
  const street = /^(\d+[A-Z]?(?:-\d+)?)\s+(.+)$/i.exec(address);
  if (street) {
    const typeMatch = STREET_TYPE_WORDS.exec(' ' + street[2]);
    if (typeMatch) {
      const name = (' ' + street[2]).slice(0, typeMatch.index).trim();
      const type = STREET_TYPES.find(([pattern]) => pattern.test(typeMatch[1].replace(/\s+/g, ' ')))?.[1] || typeMatch[1];
      if (name) address = `${street[1]} ${type} ${name}`;
    }
  }
  const city = [donor.city, donor.province].filter(Boolean).join(', ') || CITY_BY_POSTAL[postal.slice(0, 3)] || '';
  return [address, [city, postal].filter(Boolean).join(' ')];
};
export const loadGift = async (db: any, paymentId: string): Promise<Gift | null> => {
  const row: any = await db.prepare("SELECT p.data AS payment,d.data AS donor FROM sync_records p LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(p.data,'$.donorId') AND d.is_deleted=0 WHERE p.type='transactions' AND p.id=? AND p.is_deleted=0").bind(paymentId).first();
  if (!row) return null;
  const payment = parse(row.payment, {}); const donor = parse(row.donor, {});
  const [addressLine1, addressLine2] = addressLines(donor);
  return {
    paymentId, donorId: String(payment.donorId || ''), email: String(donor.email || ''), method: String(payment.method || ''), type: String(payment.type || ''),
    donorName: String(donor.name || [donor.firstName, donor.lastName].filter(Boolean).join(' ') || payment.donorName || '').trim(), addressLine1, addressLine2,
    yiddishPreTitle: String(donor.preTitle || '').trim(), yiddishName: [donor.hebFirstName, donor.hebLastName].filter(Boolean).join(' ').trim(), yiddishPostTitle: [donor.title, donor.postTitle].filter(Boolean).join(' ').trim(),
    amount: Number(payment.amountCAD ?? payment.amount ?? 0), giftDate: String(payment.date || '')
  };
};
const copyOf = (gift: ReceiptCopy): ReceiptCopy => ({ donorName: gift.donorName, addressLine1: gift.addressLine1, addressLine2: gift.addressLine2, yiddishPreTitle: gift.yiddishPreTitle, yiddishName: gift.yiddishName, yiddishPostTitle: gift.yiddishPostTitle, amount: gift.amount, giftDate: gift.giftDate });
export const receiptFields = (copy: ReceiptCopy, receiptNumber: string): ReceiptFields => ({ ...copy, date: receiptDate(copy.giftDate), receiptNumber, amount: Number(copy.amount || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });

/** Is this payment one that should get an official receipt? */
export const receiptProblem = (settings: ReceiptSettings, gift: Gift | null) => {
  if (!gift) return 'Payment not found.';
  if (gift.type !== 'approved') return 'The payment is not final yet (a check must be deposited first).';
  if (!settings.eligibleMethods.includes(gift.method)) return `${METHOD_NAMES[gift.method] || gift.method} payments do not get a receipt.`;
  if (!(gift.amount > 0)) return 'The amount must be more than zero.';
  return '';
};

/** The next receipt number, like 00664. One counter for all years; never the same number twice. */
const nextReceiptNumber = async (db: any, settings: ReceiptSettings) => {
  const row: any = await db.prepare("INSERT INTO sync_metadata(key,value,updated_at) VALUES('receipt_counter','1',?) ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1,updated_at=excluded.updated_at RETURNING value").bind(Date.now()).first();
  const count = Number(row?.value || 1) + Math.max(0, Number(settings.numberStart || 1) - 1);
  return String(count).padStart(5, '0');
};

/**
 * Make (once) and email the receipt for one payment. Sending again re-uses the same number and details.
 * Returns what happened, so the list can show it.
 */
export const issueAndSendReceipt = async (c: any, paymentId: string, options: { to?: string; force?: boolean } = {}) => {
  const db = c.env.DB;
  const [settings, messaging, gift] = await Promise.all([getReceiptSettings(db), getMessagingSettings(db), loadGift(db, paymentId)]);
  const problem = receiptProblem(settings, gift); if (problem || !gift) return { ok: false, paymentId, error: problem };
  const to = String(options.to || gift.email).trim();
  if (!isEmail(to)) return { ok: false, paymentId, error: 'The donor has no email address.' };
  const id = `rcpt-${paymentId}`; const now = Date.now();
  let receipt: any = parse((await db.prepare("SELECT data FROM sync_records WHERE type='receipts' AND id=? AND is_deleted=0").bind(id).first() as any)?.data, null);
  if (receipt?.status === 'sent' && !options.force) return { ok: true, paymentId, already: true, receiptNumber: receipt.receiptNumber };
  if (!receipt) {
    const receiptNumber = await nextReceiptNumber(db, settings);
    receipt = { id, paymentId, donorId: gift.donorId, method: gift.method, ...copyOf(gift), receiptNumber, issueDate: today(), status: 'issued', history: [] };
    // After a void, the old (cancelled) row is reused for the new receipt.
    const revived = await db.prepare("UPDATE sync_records SET data=?,updated_at=?,revision=revision+1,is_deleted=0 WHERE type='receipts' AND id=? AND is_deleted=1").bind(JSON.stringify(receipt), now, id).run();
    const inserted = Number(revived?.meta?.changes ?? revived?.changes ?? 0) ? revived : await db.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) SELECT ?,'receipts',?,?,1,0 WHERE NOT EXISTS(SELECT 1 FROM sync_records WHERE type='receipts' AND id=?)").bind(id, JSON.stringify(receipt), now, id).run();
    if (!Number(inserted?.meta?.changes ?? inserted?.changes ?? 1)) receipt = parse((await db.prepare("SELECT data FROM sync_records WHERE type='receipts' AND id=?").bind(id).first() as any)?.data, receipt);
  }
  const pdf = toBase64(await buildReceiptPdf(receiptFields(receipt, receipt.receiptNumber)));
  const values = { donorName: receipt.donorName, amount: money(receipt.amount), giftDate: receipt.giftDate, receiptNumber: receipt.receiptNumber, orgName: messaging.orgName };
  const message = fillTemplate(settings.emailMessage, values);
  const result = await sendEmail(c, { to, subject: fillTemplate(settings.emailSubject, values), html: `<div style="font-family:Arial;font-size:15px;white-space:pre-line" dir="auto">${esc(message)}</div>`, text: message, attachments: [{ filename: `Receipt-${receipt.receiptNumber}.pdf`, base64: pdf, mimeType: 'application/pdf' }], bcc: messaging.receiptCc || '', kind: 'receipt', donorId: gift.donorId, relatedId: paymentId });
  const next = { ...receipt, status: result.ok ? 'sent' : (receipt.status === 'sent' ? 'sent' : 'failed'), sentTo: result.ok ? to : receipt.sentTo, sentAt: result.ok ? new Date().toISOString() : receipt.sentAt, error: result.ok ? '' : result.error, history: [...(receipt.history || []), { at: new Date().toISOString(), to, ok: result.ok, error: result.error || '' }].slice(-20) };
  await db.prepare("UPDATE sync_records SET data=?,updated_at=?,revision=revision+1 WHERE type='receipts' AND id=?").bind(JSON.stringify(next), Date.now(), id).run();
  return result.ok ? { ok: true, paymentId, receiptNumber: receipt.receiptNumber } : { ok: false, paymentId, receiptNumber: receipt.receiptNumber, error: result.error };
};

/** Called right after a card is charged, a payment is entered or a check is deposited. */
export const autoReceipt = async (c: any, paymentId: string) => {
  try {
    const settings = await getMessagingSettings(c.env.DB); if (!settings.receiptAuto || !paymentId) return null;
    const receiptSettings = await getReceiptSettings(c.env.DB); const gift = await loadGift(c.env.DB, paymentId);
    if (receiptProblem(receiptSettings, gift) || !gift || (receiptSettings.startDate && gift.giftDate < receiptSettings.startDate)) return null;
    if (!isEmail(gift.email)) return null; // stays in the "To send" list
    return await issueAndSendReceipt(c, paymentId);
  } catch { return null; }
};

export const registerReceiptRoutes = (app: any, requirePermission: (c: any, permission: string) => any) => {
  // After these actions finish, send the receipt by itself when it is turned on.
  const after = async (c: any, next: any) => {
    await next();
    if (c.req.method !== 'POST' || c.res.status >= 300) return;
    let paymentIds: string[] = c.req.param('id') ? [String(c.req.param('id'))] : [];
    if (!paymentIds.length) { try { const data: any = await c.res.clone().json(); paymentIds = Array.isArray(data?.depositedPaymentIds) ? data.depositedPaymentIds.map(String) : [String(data?.item?.id || data?.payment?.id || '')].filter(Boolean); } catch { /* not JSON */ } }
    if (!paymentIds.length) return;
    const work = (async () => { for (const id of paymentIds) await autoReceipt(c, id); })();
    try { c.executionCtx.waitUntil(work); } catch { await work; }
  };
  app.use('/v3/payments', after);
  app.use('/v3/payments/:id/deposit-check', after);
  app.use('/v3/donors/:donorId/charge-saved-card', after);
  app.use('/v3/bank/match-checks', after);

  app.get('/v3/receipts/settings', async (c: any) => {
    const denied = requirePermission(c, 'system.manage'); if (denied) return denied;
    const messaging = await getMessagingSettings(c.env.DB);
    const counter: any = await c.env.DB.prepare("SELECT value FROM sync_metadata WHERE key='receipt_counter'").first();
    const settings = await getReceiptSettings(c.env.DB);
    return c.json({ success: true, settings, receiptAuto: messaging.receiptAuto, receiptCc: messaging.receiptCc, nextNumber: String(Number(counter?.value || 0) + Math.max(1, Number(settings.numberStart || 1))).padStart(5, '0') });
  });
  app.put('/v3/receipts/settings', async (c: any) => {
    const denied = requirePermission(c, 'system.manage'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({})); const incoming = body.settings || {};
    const next: any = { ...(await getReceiptSettings(c.env.DB)) };
    for (const key of Object.keys(defaultReceiptSettings)) {
      if (!(key in incoming)) continue;
      if (key === 'eligibleMethods') next[key] = (Array.isArray(incoming[key]) ? incoming[key] : []).map(String).filter((value: string) => METHOD_NAMES[value]);
      else if (key === 'numberStart') next[key] = Math.max(1, Math.min(10_000_000, Math.floor(Number(incoming[key]) || 1)));
      else next[key] = String(incoming[key] ?? '').slice(0, 3000);
    }
    if (next.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(next.startDate)) return c.json({ success: false, error: 'Choose a valid start date.' }, 400);
    // "Next receipt number": numberStart is set so that the next number is exactly what was typed.
    if (incoming.nextNumber !== undefined) {
      const wanted = Math.floor(Number(incoming.nextNumber)); if (!(wanted >= 1)) return c.json({ success: false, error: 'Enter the next receipt number.' }, 400);
      const counter: any = await c.env.DB.prepare("SELECT value FROM sync_metadata WHERE key='receipt_counter'").first();
      const used = Number(counter?.value || 0);
      const highest: any = await c.env.DB.prepare("SELECT MAX(CAST(json_extract(data,'$.receiptNumber') AS INTEGER)) AS top FROM sync_records WHERE type='receipts'").first();
      if (wanted <= Number(highest?.top || 0)) return c.json({ success: false, error: `Receipt ${String(highest.top).padStart(5, '0')} was already given. The next number must be higher.` }, 400);
      next.numberStart = wanted - used;
    }
    await c.env.DB.prepare("INSERT INTO sync_metadata(key,value,updated_at) VALUES('receipt_settings',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(next), Date.now()).run();
    if (typeof body.receiptAuto === 'boolean' || typeof body.receiptCc === 'string') {
      const messaging: any = await getMessagingSettings(c.env.DB);
      if (typeof body.receiptAuto === 'boolean') messaging.receiptAuto = body.receiptAuto;
      if (typeof body.receiptCc === 'string') { if (body.receiptCc.trim() && !isEmail(body.receiptCc.trim())) return c.json({ success: false, error: 'The copy email is not valid.' }, 400); messaging.receiptCc = body.receiptCc.trim(); }
      await c.env.DB.prepare("INSERT INTO sync_metadata(key,value,updated_at) VALUES('messaging_settings',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(messaging), Date.now()).run();
    }
    return c.json({ success: true, settings: next });
  });
  // The receipt lists: "waiting" = payments that should get a receipt and did not get one yet.
  /** Payments that should get a receipt and did not get one yet (filters: from, to, search). */
  const waitingQuery = (settings: ReceiptSettings, query: { from: string; to: string; search: string }) => {
    const methods = settings.eligibleMethods.length ? settings.eligibleMethods : ['none'];
    const binds: any[] = [...methods];
    let where = `p.type='transactions' AND p.is_deleted=0 AND json_extract(p.data,'$.type')='approved' AND json_extract(p.data,'$.method') IN (${methods.map(() => '?').join(',')}) AND NOT EXISTS(SELECT 1 FROM sync_records r WHERE r.type='receipts' AND r.id='rcpt-'||p.id AND r.is_deleted=0 AND json_extract(r.data,'$.status')='sent')`;
    const start = query.from || settings.startDate; if (start) { where += " AND json_extract(p.data,'$.date')>=?"; binds.push(start); }
    if (query.to) { where += " AND json_extract(p.data,'$.date')<=?"; binds.push(query.to); }
    if (query.search) { where += " AND (lower(COALESCE(json_extract(d.data,'$.name'),'')) LIKE ? OR CAST(json_extract(p.data,'$.amount') AS TEXT) LIKE ?)"; binds.push(`%${query.search}%`, `%${query.search}%`); }
    const from = "FROM sync_records p LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(p.data,'$.donorId') AND d.is_deleted=0";
    return { where, binds, from };
  };
  const hasEmail = "COALESCE(json_extract(d.data,'$.email'),'') LIKE '%_@_%._%'";
  app.get('/v3/receipts', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read'); if (denied) return denied;
    const status = String(c.req.query('status') || 'waiting'); const search = String(c.req.query('search') || '').trim().toLowerCase();
    const from = String(c.req.query('from') || ''); const to = String(c.req.query('to') || '');
    const limit = Math.min(100, Math.max(10, Number(c.req.query('limit')) || 50)); const page = Math.max(1, Math.floor(Number(c.req.query('page')) || 1)); const offset = (page - 1) * limit;
    const settings = await getReceiptSettings(c.env.DB);
    if (status === 'waiting') {
      const query = waitingQuery(settings, { from, to, search });
      const [rows, totals] = await c.env.DB.batch([
        c.env.DB.prepare(`SELECT p.id,p.data,json_extract(d.data,'$.name') AS donor_name,json_extract(d.data,'$.email') AS donor_email,r.data AS receipt ${query.from} LEFT JOIN sync_records r ON r.type='receipts' AND r.id='rcpt-'||p.id AND r.is_deleted=0 WHERE ${query.where} ORDER BY json_extract(p.data,'$.date') DESC,p.id LIMIT ? OFFSET ?`).bind(...query.binds, limit, offset),
        c.env.DB.prepare(`SELECT COUNT(*) AS count,SUM(CASE WHEN ${hasEmail} THEN 1 ELSE 0 END) AS with_email,COALESCE(SUM(COALESCE(json_extract(p.data,'$.amountCAD'),json_extract(p.data,'$.amount'),0)),0) AS amount ${query.from} WHERE ${query.where}`).bind(...query.binds)
      ]);
      const total: any = totals.results?.[0] || {};
      return c.json({ success: true, page, limit, total: Number(total.count || 0), totalPages: Math.max(1, Math.ceil(Number(total.count || 0) / limit)), withEmail: Number(total.with_email || 0), totalAmount: Number(total.amount || 0), items: (rows.results || []).map((row: any) => { const payment = parse(row.data, {}); const receipt = parse(row.receipt, null); return { paymentId: row.id, donorId: payment.donorId, donorName: String(row.donor_name || ''), email: String(row.donor_email || ''), amount: Number(payment.amountCAD ?? payment.amount ?? 0), date: payment.date, method: payment.method, receiptNumber: receipt?.receiptNumber || '', error: receipt?.error || '' }; }) });
    }
    let where = "type='receipts' AND is_deleted=0"; const binds: any[] = [];
    if (status !== 'all') { where += " AND json_extract(data,'$.status')=?"; binds.push(status); }
    if (search) { where += " AND lower(data) LIKE ?"; binds.push(`%${search}%`); }
    if (from) { where += " AND json_extract(data,'$.giftDate')>=?"; binds.push(from); }
    if (to) { where += " AND json_extract(data,'$.giftDate')<=?"; binds.push(to); }
    const [rows, totals] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT data FROM sync_records WHERE ${where} ORDER BY json_extract(data,'$.receiptNumber') DESC LIMIT ? OFFSET ?`).bind(...binds, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(json_extract(data,'$.amount')),0) AS amount FROM sync_records WHERE ${where}`).bind(...binds)
    ]);
    const total: any = totals.results?.[0] || {};
    return c.json({ success: true, page, limit, total: Number(total.count || 0), totalPages: Math.max(1, Math.ceil(Number(total.count || 0) / limit)), totalAmount: Number(total.amount || 0), items: (rows.results || []).map((row: any) => { const { history, ...item } = parse(row.data, {}); return item; }) });
  });
  app.post('/v3/receipts/send', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const ids = [...new Set((Array.isArray(body.paymentIds) ? body.paymentIds : []).map(String))].slice(0, 100) as string[];
    if (!ids.length) return c.json({ success: false, error: 'Choose at least one payment.' }, 400);
    const results = [];
    for (const id of ids) results.push(await issueAndSendReceipt(c, id, { to: ids.length === 1 ? body.to : undefined, force: Boolean(body.resend) }));
    return c.json({ success: true, results, sent: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length });
  });
  // "Send all": sends the next group (up to 25) of waiting receipts that have an email, skipping ones that failed in this run.
  app.post('/v3/receipts/send-next', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const size = Math.min(25, Math.max(1, Number(body.size) || 25)); const skip = (Array.isArray(body.skip) ? body.skip : []).map(String).slice(0, 5000);
    const settings = await getReceiptSettings(c.env.DB);
    const query = waitingQuery(settings, { from: String(body.from || ''), to: String(body.to || ''), search: String(body.search || '').trim().toLowerCase() });
    const rows = await c.env.DB.prepare(`SELECT p.id ${query.from} WHERE ${query.where} AND ${hasEmail} AND p.id NOT IN (SELECT value FROM json_each(?)) ORDER BY json_extract(p.data,'$.date'),p.id LIMIT ?`).bind(...query.binds, JSON.stringify(skip), size).all();
    const results = [];
    for (const row of rows.results || []) results.push(await issueAndSendReceipt(c, String((row as any).id)));
    const left: any = await c.env.DB.prepare(`SELECT COUNT(*) AS count ${query.from} WHERE ${query.where} AND ${hasEmail}`).bind(...query.binds).first();
    return c.json({ success: true, results, sent: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok), remaining: Number(left?.count || 0) });
  });
  // See the receipt PDF (before it is sent it shows "(new)" instead of the number).
  app.get('/v3/receipts/:paymentId/pdf', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read'); if (denied) return denied;
    const paymentId = String(c.req.param('paymentId') || ''); const voidNumber = String(c.req.query('void') || '');
    const row: any = await c.env.DB.prepare(voidNumber ? "SELECT data FROM sync_records WHERE type='receipts' AND id=?" : "SELECT data FROM sync_records WHERE type='receipts' AND id=? AND is_deleted=0").bind(voidNumber ? `rcpt-${paymentId}-void-${voidNumber}` : `rcpt-${paymentId}`).first();
    const receipt = parse(row?.data, null);
    let fields: ReceiptFields;
    if (receipt) fields = receiptFields(receipt, receipt.receiptNumber);
    else { const gift = await loadGift(c.env.DB, paymentId); if (!gift) return c.json({ success: false, error: 'Payment not found.' }, 404); fields = receiptFields(gift, '(new)'); }
    const pdf = await buildReceiptPdf(fields);
    return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Receipt-${fields.receiptNumber}.pdf"`, 'Cache-Control': 'no-store' } });
  });
  // Cancel a receipt (the cancelled copy keeps its number, as the CRA asks; a new receipt can be sent after).
  app.post('/v3/receipts/:paymentId/void', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve'); if (denied) return denied;
    const id = `rcpt-${String(c.req.param('paymentId') || '')}`; const body = await c.req.json().catch(() => ({}));
    const row: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='receipts' AND id=? AND is_deleted=0").bind(id).first();
    if (!row) return c.json({ success: false, error: 'This receipt was not found.' }, 404);
    const receipt = parse(row.data, {}); const voidId = `${id}-void-${receipt.receiptNumber}`;
    const voided = { ...receipt, id: voidId, status: 'void', voidedAt: new Date().toISOString(), voidReason: String(body.reason || '').slice(0, 500) };
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,'receipts',?,?,1,0)").bind(voidId, JSON.stringify(voided), Date.now()),
      c.env.DB.prepare("UPDATE sync_records SET is_deleted=1,updated_at=?,revision=revision+1 WHERE type='receipts' AND id=?").bind(Date.now(), id)
    ]);
    return c.json({ success: true });
  });
};
