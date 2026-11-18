/**
 * Report data for the Reports page and the "Export to Excel" buttons.
 * GET /v3/report-data?source=payments  → every row of that kind, flat and with names filled in
 * (donor name, account name, campaign, pledge balance …), so the page can filter, group, total and export it.
 * It only reads. Saved reports are kept in sync_metadata under 'saved_reports'.
 */
import { calculatePledgeFinancials, donorDisplayName, torontoToday } from './server-data';

const parse = (raw: unknown, fallback: any = {}) => { try { return JSON.parse(String(raw)); } catch { return fallback; } };
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const round = (value: number) => Math.round(value * 100) / 100;
const day = (value: unknown) => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : '';
const daysBetween = (from: string, to: string) => from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) : 0;
const agingBucket = (days: number) => days <= 0 ? 'Not due yet' : days <= 30 ? '1-30 days' : days <= 60 ? '31-60 days' : days <= 90 ? '61-90 days' : 'Over 90 days';
const METHODS: Record<string, string> = { credit_card: 'Credit card', check: 'Check', cash: 'Cash', e_transfer: 'E-transfer', wire: 'Wire', vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'Other', ach: 'ACH', saved_card: 'Credit card' };
const method = (value: unknown) => METHODS[String(value || '')] || String(value || '');
/** A pledge's tags as a clean list (they are saved as a list; old data may have a comma text). */
const tagList = (value: unknown): string[] => [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).map(tag => String(tag || '').trim()).filter(Boolean))];
const STATUS: Record<string, string> = { approved: 'Approved', pending: 'Pending', declined: 'Declined' };

export const REPORT_SOURCES = ['payments', 'pledges', 'donors', 'bills', 'vendors', 'schedules', 'expected', 'transfers', 'bank', 'accounts', 'campaigns', 'projects', 'tasks', 'receipts', 'employees', 'messages'] as const;

const all = async (db: any, type: string) => ((await db.prepare('SELECT id,data FROM sync_records WHERE type=? AND is_deleted=0').bind(type).all()).results || []).map((row: any) => ({ ...parse(row.data), id: String(row.id) }));

/** Builds the rows for one source. `today` is passed in so tests can fix the date. */
export const buildReportRows = async (db: any, source: string, today = torontoToday()) => {
  const need = new Set<string>(['donors', 'accounts']);
  const uses: Record<string, string[]> = {
    payments: ['transactions', 'pledges', 'campaigns', 'projects', 'receipts'], pledges: ['pledges', 'transactions', 'recurringPayments', 'campaigns'],
    donors: ['pledges', 'transactions', 'recurringPayments'], bills: ['bills', 'vendors', 'projects', 'employees'], vendors: ['bills', 'vendors'],
    schedules: ['recurringPayments'], expected: ['paymentExpectations'], transfers: ['accountTransfers'], bank: ['bankFeedTransactions'], accounts: [],
    campaigns: ['campaigns', 'pledges', 'transactions', 'recurringPayments'], projects: ['projects', 'bills', 'transactions'], tasks: ['tasks'], receipts: ['receipts'], employees: ['employees', 'bills'], messages: ['messages'],
  };
  if (!uses[source]) throw new Error('Unknown report.');
  uses[source].forEach(type => need.add(type));
  const data: Record<string, any[]> = {};
  await Promise.all([...need].map(async type => { data[type] = await all(db, type); }));
  const list = (type: string) => data[type] || [];
  const byId = (type: string) => new Map(list(type).map(item => [String(item.id), item]));
  const donors = byId('donors'); const accounts = byId('accounts');
  const donorName = (id: unknown) => { const donor = donors.get(String(id || '')); return donor ? String(donor.name || '') : ''; };
  const donorHebrew = (id: unknown) => { const donor = donors.get(String(id || '')); const name = donor ? donorDisplayName(donor) : ''; return name && name !== donor?.name ? name : ''; };
  // The name in separate parts (so a report can sort by any of them) and the donor's title (e.g. מו"ץ).
  // Pledge tags (like DonorFuse) are a list on each pledge; reports show them joined with ", ".
  const nameParts = (donor: any) => {
    if (!donor) return { firstName: '', lastName: '', hebFirstName: '', hebLastName: '', title: '' };
    const words = String(donor.name || '').trim().split(/\s+/).filter(Boolean);
    return { firstName: String(donor.firstName || '').trim() || words[0] || '', lastName: String(donor.lastName || '').trim() || (words.length > 1 ? words[words.length - 1] : ''), hebFirstName: String(donor.hebFirstName || '').trim(), hebLastName: String(donor.hebLastName || '').trim(), title: String(donor.title || '').trim() };
  };
  const partsOf = (id: unknown) => nameParts(donors.get(String(id || '')));
  const accountName = (id: unknown) => { const key = String(id || ''); if (!key) return ''; const account = accounts.get(key); return account ? String(account.name || key) : key === 'sys-undeposited-funds' ? 'Undeposited funds' : key; };
  const year = today.slice(0, 4); const lastYear = String(Number(year) - 1);
  const payments = list('transactions').filter(item => !item.isBatch);
  const approved = payments.filter(item => item.type === 'approved');
  const cad = (item: any) => num(item.amountCAD ?? item.amount);

  // Pledge balances, worked out per donor the same way as the donor page.
  const pledgeFinancials = () => {
    const pledgesByDonor = new Map<string, any[]>(); const paymentsByDonor = new Map<string, any[]>(); const schedulesByDonor = new Map<string, any[]>();
    const add = (map: Map<string, any[]>, item: any) => { const key = String(item.donorId || ''); map.set(key, [...(map.get(key) || []), item]); };
    list('pledges').forEach(item => add(pledgesByDonor, item)); list('transactions').forEach(item => add(paymentsByDonor, item)); list('recurringPayments').forEach(item => add(schedulesByDonor, item));
    const result: any[] = [];
    for (const [donorId, pledges] of pledgesByDonor) result.push(...calculatePledgeFinancials(pledges, paymentsByDonor.get(donorId) || [], schedulesByDonor.get(donorId) || []));
    return result;
  };
  const campaigns = byId('campaigns');

  if (source === 'payments') {
    const pledges = byId('pledges');
    // A payment gets the tags of the pledge(s) it pays.
    const pledgeTagsOf = (item: any) => [...new Set((Array.isArray(item.pledgeAllocations) && item.pledgeAllocations.length ? item.pledgeAllocations.map((entry: any) => entry.pledgeId) : [item.pledgeId]).flatMap((id: any) => tagList(pledges.get(String(id || ''))?.tags)))]; const projects = byId('projects'); const receipts = new Map(list('receipts').map(item => [String(item.paymentId || ''), item]));
    return payments.map(item => {
      const pledge = pledges.get(String(item.pledgeId || '')); const receipt = receipts.get(String(item.id));
      return { id: item.id, donorId: String(item.donorId || ''), date: day(item.date), donor: donorName(item.donorId), hebrewName: donorHebrew(item.donorId), ...partsOf(item.donorId), donorNumber: donors.get(String(item.donorId))?.displayId || '', amount: num(item.amount), currency: item.currency || 'CAD', amountCAD: cad(item), method: method(item.method), status: STATUS[item.type] || item.type || '', checkNumber: item.checkNumber || item.referenceNumber || '', deposit: item.depositStatus === 'deposited' ? 'Deposited' : item.depositStatus === 'undeposited' ? 'Not deposited' : item.depositStatus || '', depositAccount: accountName(item.sourceAccountId), incomeAccount: accountName(item.offsetAccountId), category: item.category || pledge?.category || '', campaign: campaigns.get(String(pledge?.campaignId || ''))?.name || '', pledgeDate: pledge ? day(pledge.date) : '', project: projects.get(String(item.projectId || ''))?.name || '', sponsor: item.sponsor || '', pledgeTags: pledgeTagsOf(item).join(', '), recurring: item.scheduleId ? 'Yes' : 'No', receiptNumber: receipt?.receiptNumber || '', receiptStatus: receipt ? (receipt.status === 'sent' ? 'Sent' : receipt.status === 'void' ? 'Void' : 'Made') : '', declineReason: item.declineReason || '', notes: item.notes || '', month: day(item.date).slice(0, 7), year: day(item.date).slice(0, 4) };
    });
  }
  if (source === 'pledges') {
    const pledgeTagById = new Map(list('pledges').map(item => [String(item.id), item.tags]));
    return pledgeFinancials().map(item => {
      const balance = round(num(item.balance)); const periodEnd = day(item.periodEnd); const overdue = balance > 0.005 ? daysBetween(periodEnd, today) : 0;
      return { id: item.id, donorId: String(item.donorId || ''), date: day(item.date), donor: donorName(item.donorId), hebrewName: donorHebrew(item.donorId), ...partsOf(item.donorId), donorNumber: donors.get(String(item.donorId))?.displayId || '', phone: donors.get(String(item.donorId))?.phone || '', amount: num(item.amount), currency: item.currency || 'CAD', amountCAD: num(item.amountCAD ?? item.amount), paid: round(num(item.paid)), pending: round(num(item.pending)), scheduled: round(num(item.scheduled)), balance, open: balance > 0.005 ? 'Open' : 'Paid up', tags: tagList(pledgeTagById.get(String(item.id))).join(', '), periodEnd, daysPastPeriod: Math.max(0, overdue), aging: balance > 0.005 ? agingBucket(overdue) : '', category: item.category || '', campaign: campaigns.get(String(item.campaignId || ''))?.name || '', sponsor: item.sponsor || '', notes: item.notes || '', month: day(item.date).slice(0, 7), year: day(item.date).slice(0, 4) };
    });
  }
  if (source === 'donors') {
    const financials = pledgeFinancials(); const owed = new Map<string, number>(); const pledged = new Map<string, number>();
    const pledgeCount = new Map<string, number>(); const openCount = new Map<string, number>();
    financials.forEach(item => { const key = String(item.donorId || ''); owed.set(key, num(owed.get(key)) + Math.max(0, num(item.balance))); pledged.set(key, num(pledged.get(key)) + num(item.amountCAD ?? item.amount)); pledgeCount.set(key, num(pledgeCount.get(key)) + 1); if (num(item.balance) > 0.005) openCount.set(key, num(openCount.get(key)) + 1); });
    const gifts = new Map<string, any[]>(); approved.forEach(item => { const key = String(item.donorId || ''); gifts.set(key, [...(gifts.get(key) || []), item]); });
    const schedules = new Map<string, number>(); list('recurringPayments').filter(item => item.active).forEach(item => schedules.set(String(item.donorId || ''), num(schedules.get(String(item.donorId || ''))) + 1));
    return list('donors').map(donor => {
      const mine = gifts.get(String(donor.id)) || []; const dates = mine.map(item => day(item.date)).filter(Boolean).sort();
      const sum = (filter: (item: any) => boolean) => round(mine.filter(filter).reduce((total, item) => total + cad(item), 0));
      return { id: donor.id, donorNumber: donor.displayId || '', name: donor.name || '', hebrewName: donorDisplayName(donor) !== donor.name ? donorDisplayName(donor) : '', ...nameParts(donor), phone: donor.phone || '', mobilePhone: donor.mobilePhone || '', homePhone: donor.homePhone || '', email: donor.email || '', address: donor.address || '', postalCode: donor.addrPostalCode || '', totalGiven: sum(() => true), givenThisYear: sum(item => day(item.date).startsWith(year)), givenLastYear: sum(item => day(item.date).startsWith(lastYear)), gifts: mine.length, firstGift: dates[0] || '', lastGift: dates[dates.length - 1] || '', daysSinceLastGift: dates.length ? daysBetween(dates[dates.length - 1], today) : '', totalPledged: round(num(pledged.get(String(donor.id)))), pledges: num(pledgeCount.get(String(donor.id))), openPledges: num(openCount.get(String(donor.id))), balanceOwed: round(num(owed.get(String(donor.id)))), activeSchedules: num(schedules.get(String(donor.id))), notes: donor.notes || '' };
    });
  }
  if (source === 'bills') {
    const projects = byId('projects'); const employees = byId('employees');
    return list('bills').map(item => {
      const rate = item.currency === 'USD' ? num(item.exchangeRate || 1.35) : 1; const paid = item.status === 'paid'; const due = day(item.dueDate); const late = paid ? 0 : daysBetween(due, today);
      return { id: item.id, dueDate: due, paidDate: day(item.paidDate), vendor: item.vendor || '', amount: num(item.amount), currency: item.currency || 'CAD', amountCAD: round(num(item.amount) * rate), status: paid ? 'Paid' : item.status === 'void' ? 'Void' : 'Unpaid', daysOverdue: paid ? 0 : Math.max(0, late), aging: paid ? '' : agingBucket(late), expenseAccount: accountName(item.offsetAccountId || item.category), paidFrom: accountName(item.sourceAccountId), internalCategory: item.internalCategory || '', project: projects.get(String(item.projectId || ''))?.name || '', employee: employees.get(String(item.employeeId || ''))?.name || '', payroll: item.isPayrollExpense || item.isPayroll ? 'Yes' : 'No', taxable: item.taxable ? 'Yes' : 'No', t4a: item.t4aEligible ? 'Yes' : 'No', recurring: item.isRecurring ? (item.recurringFrequency || 'Yes') : 'No', refund: item.refundOfBillId ? 'Yes' : 'No', memo: item.memo || '', month: (day(item.paidDate) || due).slice(0, 7), year: (day(item.paidDate) || due).slice(0, 4) };
    });
  }
  if (source === 'vendors') {
    const bills = list('bills'); const names = new Set([...list('vendors').map(item => String(item.name || '')), ...bills.map(item => String(item.vendor || ''))].filter(Boolean));
    return [...names].map(name => {
      const mine = bills.filter(item => String(item.vendor || '') === name && item.status !== 'void'); const amount = (item: any) => num(item.amount) * (item.currency === 'USD' ? num(item.exchangeRate || 1.35) : 1);
      const unpaid = mine.filter(item => item.status !== 'paid'); const dates = mine.map(item => day(item.paidDate) || day(item.dueDate)).filter(Boolean).sort();
      return { id: name, vendor: name, bills: mine.length, totalBilled: round(mine.reduce((t, item) => t + amount(item), 0)), paid: round(mine.filter(item => item.status === 'paid').reduce((t, item) => t + amount(item), 0)), unpaid: round(unpaid.reduce((t, item) => t + amount(item), 0)), unpaidBills: unpaid.length, billedThisYear: round(mine.filter(item => (day(item.paidDate) || day(item.dueDate)).startsWith(year)).reduce((t, item) => t + amount(item), 0)), firstBill: dates[0] || '', lastBill: dates[dates.length - 1] || '', fund: list('vendors').find(item => item.name === name)?.fund || '' };
    });
  }
  if (source === 'schedules') return list('recurringPayments').map(item => ({ id: item.id, donor: donorName(item.donorId), hebrewName: donorHebrew(item.donorId), ...partsOf(item.donorId), amount: num(item.amount), currency: item.currency || 'CAD', frequency: item.frequency || '', method: method(item.method), nextDate: day(item.nextDate), endDate: day(item.endDate), active: item.active ? 'Active' : 'Stopped', paymentsMade: num(item.paymentsProcessed), notes: item.notes || '' }));
  if (source === 'expected') return list('paymentExpectations').map(item => ({ id: item.id, expectedDate: day(item.expectedDate), donor: donorName(item.donorId), amount: num(item.amount), currency: item.currency || 'CAD', method: method(item.method), status: String(item.status || '').replace(/^./, ch => ch.toUpperCase()), reason: item.declineReason || '', month: day(item.expectedDate).slice(0, 7) }));
  if (source === 'transfers') return list('accountTransfers').map(item => ({ id: item.id, date: day(item.date), from: accountName(item.fromAccountId), to: accountName(item.toAccountId), amount: num(item.amount), notes: item.notes || '', month: day(item.date).slice(0, 7), year: day(item.date).slice(0, 4) }));
  if (source === 'bank') return list('bankFeedTransactions').map(item => ({ id: item.id, date: day(item.date), account: accountName(item.accountId), description: item.description || item.merchantName || '', amount: num(item.amount), direction: num(item.amount) >= 0 ? 'Money in' : 'Money out', pending: item.pending ? 'Yes' : 'No', month: day(item.date).slice(0, 7), year: day(item.date).slice(0, 4) }));
  if (source === 'accounts') return list('accounts').map(item => ({ id: item.id, name: item.name || '', type: item.type || '', subType: item.subType || '', currency: item.currency || 'CAD', startingBalance: num(item.startingBalance), number: item.number || item.code || '' }));
  if (source === 'campaigns') {
    const financials = pledgeFinancials();
    return list('campaigns').map(item => { const mine = financials.filter(pledge => String(pledge.campaignId || '') === String(item.id)); return { id: item.id, campaign: item.name || '', year: item.year || '', startDate: day(item.startDate), endDate: day(item.endDate), status: item.status || '', pledges: mine.length, pledged: round(mine.reduce((t, p) => t + num(p.amountCAD ?? p.amount), 0)), paid: round(mine.reduce((t, p) => t + num(p.paid), 0)), balance: round(mine.reduce((t, p) => t + Math.max(0, num(p.balance)), 0)) }; });
  }
  if (source === 'projects') {
    const projects = list('projects'); const bills = list('bills'); const names = new Map(projects.map(item => [String(item.id), String(item.name || '')]));
    return projects.map(item => ({ id: item.id, project: item.name || '', underProject: names.get(String(item.parentId || '')) || '', income: round(approved.filter(p => String(p.projectId || '') === String(item.id)).reduce((t, p) => t + cad(p), 0)), costs: round(bills.filter(b => String(b.projectId || '') === String(item.id) && b.status !== 'void').reduce((t, b) => t + num(b.amount) * (b.currency === 'USD' ? num(b.exchangeRate || 1.35) : 1), 0)) })).map(item => ({ ...item, net: round(item.income - item.costs) }));
  }
  if (source === 'tasks') return list('tasks').map(item => ({ id: item.id, dueDate: day(item.dueDate), title: item.title || '', donor: donorName(item.donorId), priority: item.priority || '', kind: String(item.type || '').replace(/_/g, ' '), done: item.completed ? 'Done' : 'Open', doneOn: day(item.completedAt), notes: item.notes || '' }));
  if (source === 'receipts') return list('receipts').map(item => ({ id: item.id, receiptNumber: item.receiptNumber || '', issueDate: day(item.issueDate), giftDate: day(item.giftDate), donor: item.donorName || donorName(item.donorId), amount: num(item.amount), method: method(item.method), status: item.status === 'sent' ? 'Sent' : item.status === 'void' ? 'Void' : item.status === 'failed' ? 'Failed' : 'Made', sentTo: item.sentTo || '', sentAt: day(item.sentAt), year: day(item.giftDate).slice(0, 4) }));
  if (source === 'employees') { const bills = list('bills'); return list('employees').map(item => { const mine = bills.filter(b => String(b.employeeId || '') === String(item.id) && b.status !== 'void'); return { id: item.id, name: item.name || '', role: item.role || '', email: item.email || '', paidThisYear: round(mine.filter(b => (day(b.paidDate) || day(b.dueDate)).startsWith(year)).reduce((t, b) => t + num(b.amount), 0)), paidAllTime: round(mine.reduce((t, b) => t + num(b.amount), 0)), owed: num(item.balanceOwed) }; }); }
  if (source === 'messages') return list('messages').map(item => ({ id: item.id, date: day(item.sentAt), channel: item.channel === 'sms' ? 'Text' : 'Email', direction: item.direction === 'in' ? 'In' : 'Out', to: item.to || '', kind: item.kind || '', status: item.status || '', message: String(item.body || '').slice(0, 300) }));
  return [];
};

export const registerReportDataRoutes = (app: any) => {
  const allowed = (c: any) => ((c.get('userRoles') || []) as string[]).includes('administrator');
  // Every tag already used on a pledge, for the pledge window.
  app.get('/v3/pledge-tags', async (c: any) => {
    const result = await c.env.DB.prepare("SELECT DISTINCT t.value AS tag FROM sync_records r, json_each(CASE WHEN json_type(r.data,'$.tags')='array' THEN json_extract(r.data,'$.tags') ELSE '[]' END) t WHERE r.type='pledges' AND r.is_deleted=0").all();
    const tags = [...new Set(((result.results || []) as any[]).map(row => String(row.tag || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return c.json({ success: true, tags });
  });
  // The monthly sponsor list: the day and month sponsors of one Hebrew month, with the donor's titles.
  app.get('/v3/sponsor-sheet', async (c: any) => {
    const hebYear = Number(c.req.query('hebYear') || 0); const hebMonth = Number(c.req.query('hebMonth') || 0);
    if (!hebYear || !hebMonth) return c.json({ success: false, error: 'Choose the month.' }, 400);
    const rows = await c.env.DB.prepare("SELECT r.id, r.data, d.data AS donor FROM sync_records r LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(r.data,'$.donorId') WHERE r.type='dedications' AND r.is_deleted=0 AND json_extract(r.data,'$.hebYear')=? AND json_extract(r.data,'$.hebMonth')=?").bind(hebYear, hebMonth).all();
    const parse = (raw: unknown) => { try { return JSON.parse(String(raw || '{}')); } catch { return {}; } };
    const items = ((rows.results || []) as any[]).map(row => {
      const item = parse(row.data); const donor = parse(row.donor);
      return { id: String(row.id), kind: item.kind, day: Number(item.hebDay || 0), donorId: String(item.donorId || ''), honoree: String(item.honoree || ''), notes: String(item.notes || ''), donorName: String(donor.name || ''), preTitle: String(donor.preTitle || ''), hebFirstName: String(donor.hebFirstName || ''), hebLastName: String(donor.hebLastName || ''), title: String(donor.title || ''), postTitle: String(donor.postTitle || '') };
    });
    const layoutRow: any = await c.env.DB.prepare('SELECT value FROM sync_metadata WHERE key=?').bind(`sponsor_sheet_layout_${hebYear}_${hebMonth}`).first();
    return c.json({ success: true, items, layout: layoutRow ? parse(layoutRow.value) : null });
  });
  // How the month's boxes are arranged (merged boxes, order, changed day labels, month title). Saved per month for everyone.
  app.put('/v3/sponsor-sheet/layout', async (c: any) => {
    const hebYear = Number(c.req.query('hebYear') || 0); const hebMonth = Number(c.req.query('hebMonth') || 0);
    if (!hebYear || !hebMonth) return c.json({ success: false, error: 'Choose the month.' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const boxes = (Array.isArray(body.boxes) ? body.boxes : []).slice(0, 40).map((box: any) => (Array.isArray(box) ? box : []).map(Number).filter((day: number) => Number.isInteger(day) && day >= 1 && day <= 30).slice(0, 7));
    const labels: Record<string, string> = {}; for (const [key, value] of Object.entries(body.labels || {})) { const text = String(value || '').trim().slice(0, 12); if (text && Number(key) >= 1 && Number(key) <= 30) labels[key] = text; }
    // Text typed by hand over the system text (per box and for the month patron).
    const cleanText = (raw: any) => { if (!raw || typeof raw !== 'object') return undefined; const out: Record<string, string> = {}; for (const field of ['title', 'first', 'last', 'end', 'honoree', 'notes']) if (typeof raw[field] === 'string') out[field] = raw[field].slice(0, field === 'honoree' ? 400 : 120); return Object.keys(out).length ? out : undefined; };
    const texts: Record<string, any> = {}; for (const [key, value] of Object.entries(body.texts || {})) { const text = cleanText(value); if (text && Number(key) >= 1 && Number(key) <= 30) texts[key] = text; }
    const layout = { boxes, labels, monthTitle: String(body.monthTitle || '').trim().slice(0, 40), bandMonth: String(body.bandMonth || '').trim().slice(0, 40), texts, patronText: cleanText(body.patronText) };
    if (body.reset) { await c.env.DB.prepare('DELETE FROM sync_metadata WHERE key=?').bind(`sponsor_sheet_layout_${hebYear}_${hebMonth}`).run(); return c.json({ success: true, layout: null }); }
    await c.env.DB.prepare('INSERT INTO sync_metadata(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`sponsor_sheet_layout_${hebYear}_${hebMonth}`, JSON.stringify(layout), Date.now()).run();
    return c.json({ success: true, layout });
  });
  app.get('/v3/report-data', async (c: any) => {
    if (!allowed(c)) return c.json({ success: false, error: 'Forbidden: Missing permission reports.read' }, 403);
    const source = String(c.req.query('source') || '');
    if (!(REPORT_SOURCES as readonly string[]).includes(source)) return c.json({ success: false, error: 'Unknown report.' }, 400);
    const rows = await buildReportRows(c.env.DB, source);
    return c.json({ success: true, source, rows, today: torontoToday() });
  });
  app.get('/v3/saved-reports', async (c: any) => {
    if (!allowed(c)) return c.json({ success: false, error: 'Forbidden' }, 403);
    const row: any = await c.env.DB.prepare("SELECT value FROM sync_metadata WHERE key='saved_reports'").first();
    return c.json({ success: true, reports: parse(row?.value, []) });
  });
  app.put('/v3/saved-reports', async (c: any) => {
    if (!allowed(c)) return c.json({ success: false, error: 'Forbidden' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const reports = Array.isArray(body.reports) ? body.reports.slice(0, 200) : null;
    if (!reports || JSON.stringify(reports).length > 200000) return c.json({ success: false, error: 'Could not save the reports.' }, 400);
    await c.env.DB.prepare("INSERT INTO sync_metadata(key,value,updated_at) VALUES('saved_reports',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(reports), Date.now()).run();
    return c.json({ success: true, reports });
  });
};
