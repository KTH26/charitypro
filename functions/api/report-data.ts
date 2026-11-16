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
    const pledges = byId('pledges'); const projects = byId('projects'); const receipts = new Map(list('receipts').map(item => [String(item.paymentId || ''), item]));
    return payments.map(item => {
      const pledge = pledges.get(String(item.pledgeId || '')); const receipt = receipts.get(String(item.id));
      return { id: item.id, donorId: String(item.donorId || ''), date: day(item.date), donor: donorName(item.donorId), hebrewName: donorHebrew(item.donorId), donorNumber: donors.get(String(item.donorId))?.displayId || '', amount: num(item.amount), currency: item.currency || 'CAD', amountCAD: cad(item), method: method(item.method), status: STATUS[item.type] || item.type || '', checkNumber: item.checkNumber || item.referenceNumber || '', deposit: item.depositStatus === 'deposited' ? 'Deposited' : item.depositStatus === 'undeposited' ? 'Not deposited' : item.depositStatus || '', depositAccount: accountName(item.sourceAccountId), incomeAccount: accountName(item.offsetAccountId), category: item.category || pledge?.category || '', campaign: campaigns.get(String(pledge?.campaignId || ''))?.name || '', pledgeDate: pledge ? day(pledge.date) : '', project: projects.get(String(item.projectId || ''))?.name || '', sponsor: item.sponsor || '', recurring: item.scheduleId ? 'Yes' : 'No', receiptNumber: receipt?.receiptNumber || '', receiptStatus: receipt ? (receipt.status === 'sent' ? 'Sent' : receipt.status === 'void' ? 'Void' : 'Made') : '', declineReason: item.declineReason || '', notes: item.notes || '', month: day(item.date).slice(0, 7), year: day(item.date).slice(0, 4) };
    });
  }
  if (source === 'pledges') {
    return pledgeFinancials().map(item => {
      const balance = round(num(item.balance)); const periodEnd = day(item.periodEnd); const overdue = balance > 0.005 ? daysBetween(periodEnd, today) : 0;
      return { id: item.id, donorId: String(item.donorId || ''), date: day(item.date), donor: donorName(item.donorId), hebrewName: donorHebrew(item.donorId), donorNumber: donors.get(String(item.donorId))?.displayId || '', phone: donors.get(String(item.donorId))?.phone || '', amount: num(item.amount), currency: item.currency || 'CAD', amountCAD: num(item.amountCAD ?? item.amount), paid: round(num(item.paid)), pending: round(num(item.pending)), scheduled: round(num(item.scheduled)), balance, open: balance > 0.005 ? 'Open' : 'Paid up', periodEnd, daysPastPeriod: Math.max(0, overdue), aging: balance > 0.005 ? agingBucket(overdue) : '', category: item.category || '', campaign: campaigns.get(String(item.campaignId || ''))?.name || '', sponsor: item.sponsor || '', notes: item.notes || '', month: day(item.date).slice(0, 7), year: day(item.date).slice(0, 4) };
    });
  }
  if (source === 'donors') {
    const financials = pledgeFinancials(); const owed = new Map<string, number>(); const pledged = new Map<string, number>();
    financials.forEach(item => { const key = String(item.donorId || ''); owed.set(key, num(owed.get(key)) + Math.max(0, num(item.balance))); pledged.set(key, num(pledged.get(key)) + num(item.amountCAD ?? item.amount)); });
    const gifts = new Map<string, any[]>(); approved.forEach(item => { const key = String(item.donorId || ''); gifts.set(key, [...(gifts.get(key) || []), item]); });
    const schedules = new Map<string, number>(); list('recurringPayments').filter(item => item.active).forEach(item => schedules.set(String(item.donorId || ''), num(schedules.get(String(item.donorId || ''))) + 1));
    return list('donors').map(donor => {
      const mine = gifts.get(String(donor.id)) || []; const dates = mine.map(item => day(item.date)).filter(Boolean).sort();
      const sum = (filter: (item: any) => boolean) => round(mine.filter(filter).reduce((total, item) => total + cad(item), 0));
      return { id: donor.id, donorNumber: donor.displayId || '', name: donor.name || '', hebrewName: donorDisplayName(donor) !== donor.name ? donorDisplayName(donor) : '', firstName: donor.firstName || '', lastName: donor.lastName || '', phone: donor.phone || '', mobilePhone: donor.mobilePhone || '', homePhone: donor.homePhone || '', email: donor.email || '', address: donor.address || '', postalCode: donor.addrPostalCode || '', totalGiven: sum(() => true), givenThisYear: sum(item => day(item.date).startsWith(year)), givenLastYear: sum(item => day(item.date).startsWith(lastYear)), gifts: mine.length, firstGift: dates[0] || '', lastGift: dates[dates.length - 1] || '', daysSinceLastGift: dates.length ? daysBetween(dates[dates.length - 1], today) : '', totalPledged: round(num(pledged.get(String(donor.id)))), balanceOwed: round(num(owed.get(String(donor.id)))), activeSchedules: num(schedules.get(String(donor.id))), notes: donor.notes || '' };
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
  if (source === 'schedules') return list('recurringPayments').map(item => ({ id: item.id, donor: donorName(item.donorId), hebrewName: donorHebrew(item.donorId), amount: num(item.amount), currency: item.currency || 'CAD', frequency: item.frequency || '', method: method(item.method), nextDate: day(item.nextDate), endDate: day(item.endDate), active: item.active ? 'Active' : 'Stopped', paymentsMade: num(item.paymentsProcessed), notes: item.notes || '' }));
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
