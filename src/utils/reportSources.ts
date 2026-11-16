/** What each kind of report contains: its columns and its main date. Matches functions/api/report-data.ts. */
export type ColumnType = 'text' | 'money' | 'number' | 'date';
export type ReportColumn = { key: string; label: string; type: ColumnType; show?: boolean };
export type ReportSource = { key: string; label: string; group: string; dateField?: string; columns: ReportColumn[] };

const t = (key: string, label: string, show = false): ReportColumn => ({ key, label, type: 'text', show });
const m = (key: string, label: string, show = false): ReportColumn => ({ key, label, type: 'money', show });
const n = (key: string, label: string, show = false): ReportColumn => ({ key, label, type: 'number', show });
const d = (key: string, label: string, show = false): ReportColumn => ({ key, label, type: 'date', show });

export const REPORT_SOURCES: ReportSource[] = [
  { key: 'payments', label: 'Payments / donations', group: 'Income', dateField: 'date', columns: [d('date', 'Date', true), t('donorNumber', 'Donor #'), t('donor', 'Donor', true), t('hebrewName', 'Hebrew name'), m('amount', 'Amount', true), t('currency', 'Currency', true), m('amountCAD', 'Amount CAD', true), t('method', 'Method', true), t('status', 'Status', true), t('checkNumber', 'Check / ref #'), t('deposit', 'Deposited?'), t('depositAccount', 'Deposit account'), t('incomeAccount', 'Income account'), t('category', 'Category'), t('campaign', 'Campaign'), d('pledgeDate', 'Pledge date'), t('project', 'Project'), t('sponsor', 'Sponsor'), t('recurring', 'From a schedule'), t('receiptNumber', 'Receipt #'), t('receiptStatus', 'Receipt'), t('declineReason', 'Decline reason'), t('notes', 'Notes'), t('month', 'Month'), t('year', 'Year')] },
  { key: 'pledges', label: 'Pledges (money owed to us)', group: 'Income', dateField: 'date', columns: [d('date', 'Pledge date', true), t('donorNumber', 'Donor #'), t('donor', 'Donor', true), t('hebrewName', 'Hebrew name'), t('phone', 'Phone'), m('amount', 'Pledged', true), t('currency', 'Currency'), m('amountCAD', 'Pledged CAD'), m('paid', 'Paid', true), m('pending', 'Pending'), m('scheduled', 'Scheduled'), m('balance', 'Balance', true), t('open', 'Open / paid up', true), d('periodEnd', 'Pledge year ends'), n('daysPastPeriod', 'Days past'), t('aging', 'Aging'), t('category', 'Category'), t('campaign', 'Campaign', true), t('sponsor', 'Sponsor'), t('notes', 'Notes'), t('month', 'Month'), t('year', 'Year')] },
  { key: 'donors', label: 'Donors', group: 'People', dateField: 'lastGift', columns: [t('donorNumber', 'Donor #', true), t('name', 'Name', true), t('hebrewName', 'Hebrew name'), t('firstName', 'First name'), t('lastName', 'Last name'), t('hebFirstName', 'Hebrew first name'), t('hebLastName', 'Hebrew last name'), t('phone', 'Phone', true), t('mobilePhone', 'Cell'), t('homePhone', 'Home phone'), t('email', 'Email'), t('address', 'Address'), t('postalCode', 'Postal code'), m('totalGiven', 'Total given', true), m('givenThisYear', 'Given this year', true), m('givenLastYear', 'Given last year'), n('gifts', 'Number of gifts'), d('firstGift', 'First gift'), d('lastGift', 'Last gift', true), n('daysSinceLastGift', 'Days since last gift'), m('totalPledged', 'Total pledged'), m('balanceOwed', 'Balance owed', true), n('activeSchedules', 'Active schedules'), t('notes', 'Notes')] },
  { key: 'bills', label: 'Bills & expenses (money we owe)', group: 'Expenses', dateField: 'dueDate', columns: [d('dueDate', 'Due date', true), d('paidDate', 'Paid date', true), t('vendor', 'Vendor', true), m('amount', 'Amount', true), t('currency', 'Currency'), m('amountCAD', 'Amount CAD', true), t('status', 'Status', true), n('daysOverdue', 'Days overdue'), t('aging', 'Aging'), t('expenseAccount', 'Expense account', true), t('paidFrom', 'Paid from'), t('internalCategory', 'Internal category'), t('project', 'Project'), t('employee', 'Employee'), t('payroll', 'Payroll'), t('taxable', 'Taxable'), t('t4a', 'T4A'), t('recurring', 'Recurring'), t('refund', 'Refund'), t('memo', 'Memo'), t('month', 'Month'), t('year', 'Year')] },
  { key: 'vendors', label: 'Vendors', group: 'Expenses', dateField: 'lastBill', columns: [t('vendor', 'Vendor', true), n('bills', 'Bills', true), m('totalBilled', 'Total billed', true), m('paid', 'Paid', true), m('unpaid', 'Unpaid', true), n('unpaidBills', 'Unpaid bills'), m('billedThisYear', 'Billed this year'), d('firstBill', 'First bill'), d('lastBill', 'Last bill'), t('fund', 'Fund')] },
  { key: 'employees', label: 'Employees / payroll', group: 'Expenses', columns: [t('name', 'Name', true), t('role', 'Role', true), t('email', 'Email'), m('paidThisYear', 'Paid this year', true), m('paidAllTime', 'Paid all time', true), m('owed', 'Owed', true)] },
  { key: 'schedules', label: 'Recurring schedules', group: 'Income', dateField: 'nextDate', columns: [t('donor', 'Donor', true), t('hebrewName', 'Hebrew name'), m('amount', 'Amount', true), t('currency', 'Currency', true), t('frequency', 'How often', true), t('method', 'Method', true), d('nextDate', 'Next date', true), d('endDate', 'End date'), t('active', 'Active?', true), n('paymentsMade', 'Payments made', true), t('notes', 'Notes')] },
  { key: 'expected', label: 'Expected schedule payments', group: 'Income', dateField: 'expectedDate', columns: [d('expectedDate', 'Expected date', true), t('donor', 'Donor', true), m('amount', 'Amount', true), t('currency', 'Currency'), t('method', 'Method', true), t('status', 'Status', true), t('reason', 'Decline reason'), t('month', 'Month')] },
  { key: 'receipts', label: 'Official receipts', group: 'Income', dateField: 'giftDate', columns: [t('receiptNumber', 'Receipt #', true), d('issueDate', 'Issued', true), d('giftDate', 'Gift date', true), t('donor', 'Donor', true), m('amount', 'Amount', true), t('method', 'Method'), t('status', 'Status', true), t('sentTo', 'Sent to'), d('sentAt', 'Sent on'), t('year', 'Year')] },
  { key: 'campaigns', label: 'Campaigns', group: 'Income', dateField: 'startDate', columns: [t('campaign', 'Campaign', true), t('year', 'Year', true), d('startDate', 'Start', true), d('endDate', 'End', true), t('status', 'Status'), n('pledges', 'Pledges', true), m('pledged', 'Pledged', true), m('paid', 'Paid', true), m('balance', 'Still owed', true)] },
  { key: 'projects', label: 'Projects', group: 'Other', columns: [t('project', 'Project', true), t('underProject', 'Under project', true), m('income', 'Income', true), m('costs', 'Costs', true), m('net', 'Net', true)] },
  { key: 'bank', label: 'Bank lines', group: 'Bank & accounts', dateField: 'date', columns: [d('date', 'Date', true), t('account', 'Account', true), t('description', 'Description', true), m('amount', 'Amount', true), t('direction', 'In / out', true), t('pending', 'Pending'), t('month', 'Month'), t('year', 'Year')] },
  { key: 'transfers', label: 'Transfers between accounts', group: 'Bank & accounts', dateField: 'date', columns: [d('date', 'Date', true), t('from', 'From', true), t('to', 'To', true), m('amount', 'Amount', true), t('notes', 'Notes', true), t('month', 'Month'), t('year', 'Year')] },
  { key: 'accounts', label: 'Chart of accounts', group: 'Bank & accounts', columns: [t('name', 'Account', true), t('type', 'Type', true), t('subType', 'Sub-type', true), t('currency', 'Currency', true), m('startingBalance', 'Starting balance', true), t('number', 'Number')] },
  { key: 'tasks', label: 'Tasks', group: 'Other', dateField: 'dueDate', columns: [d('dueDate', 'Due', true), t('title', 'Task', true), t('donor', 'Donor', true), t('priority', 'Priority'), t('kind', 'Kind'), t('done', 'Done?', true), d('doneOn', 'Done on'), t('notes', 'Notes')] },
  { key: 'messages', label: 'Emails & texts sent', group: 'Other', dateField: 'date', columns: [d('date', 'Date', true), t('channel', 'Email / text', true), t('direction', 'In / out'), t('to', 'To', true), t('kind', 'Kind', true), t('status', 'Status', true), t('message', 'Message')] },
];
export const sourceByKey = (key: string) => REPORT_SOURCES.find(source => source.key === key) || REPORT_SOURCES[0];

export type Operator = 'is' | 'is_not' | 'contains' | 'more' | 'less' | 'empty' | 'not_empty';
export type ReportFilter = { column: string; op: Operator; value: string };
export type ReportSetup = { name?: string; source: string; range: string; from: string; to: string; search: string; filters: ReportFilter[]; groupBy: string; groupBy2: string; columns: string[]; sortBy: string; sortDesc: boolean; showDetails: boolean };

export const defaultSetup = (source: string): ReportSetup => ({ source, range: 'all', from: '', to: '', search: '', filters: [], groupBy: '', groupBy2: '', columns: sourceByKey(source).columns.filter(column => column.show).map(column => column.key), sortBy: sourceByKey(source).dateField || '', sortDesc: true, showDetails: false });

/** Date ranges, worked out from today's date (yyyy-mm-dd). */
export const RANGES: [string, string][] = [['all', 'All dates'], ['this_month', 'This month'], ['last_month', 'Last month'], ['this_year', 'This year'], ['last_year', 'Last year'], ['last_12', 'Last 12 months'], ['custom', 'Pick dates']];
export const rangeDates = (range: string, today: string, from = '', to = ''): [string, string] => {
  const y = Number(today.slice(0, 4)); const mo = Number(today.slice(5, 7)); const pad = (v: number) => String(v).padStart(2, '0');
  const monthEnd = (year: number, month: number) => `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
  if (range === 'this_month') return [`${y}-${pad(mo)}-01`, monthEnd(y, mo)];
  if (range === 'last_month') { const ly = mo === 1 ? y - 1 : y; const lm = mo === 1 ? 12 : mo - 1; return [`${ly}-${pad(lm)}-01`, monthEnd(ly, lm)]; }
  if (range === 'this_year') return [`${y}-01-01`, `${y}-12-31`];
  if (range === 'last_year') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (range === 'last_12') return [`${y - 1}-${today.slice(5, 10)}`, today];
  if (range === 'custom') return [from, to];
  return ['', ''];
};

const text = (value: unknown) => String(value ?? '').toLowerCase();
export const matchesFilter = (row: Record<string, any>, filter: ReportFilter, type: ColumnType) => {
  const value = row[filter.column]; const wanted = filter.value.trim();
  if (filter.op === 'empty') return value === '' || value === null || value === undefined || (type !== 'text' && type !== 'date' && Number(value) === 0);
  if (filter.op === 'not_empty') return !(value === '' || value === null || value === undefined || (type !== 'text' && type !== 'date' && Number(value) === 0));
  if (type === 'money' || type === 'number') {
    const a = Number(value || 0); const b = Number(wanted.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(b) || wanted === '') return true;
    if (filter.op === 'more') return a > b; if (filter.op === 'less') return a < b;
    if (filter.op === 'is') return Math.abs(a - b) < 0.005; if (filter.op === 'is_not') return Math.abs(a - b) >= 0.005;
  }
  if (filter.op === 'more') return text(value) > text(wanted); if (filter.op === 'less') return text(value) < text(wanted);
  if (filter.op === 'is') return text(value) === text(wanted); if (filter.op === 'is_not') return text(value) !== text(wanted);
  return text(value).includes(text(wanted));
};

/** Applies the date range, search and filters, then sorts. */
export const runReport = (rows: Record<string, any>[], setup: ReportSetup, today: string) => {
  const source = sourceByKey(setup.source); const types = new Map(source.columns.map(column => [column.key, column.type]));
  const [from, to] = rangeDates(setup.range, today, setup.from, setup.to); const dateField = source.dateField;
  const search = setup.search.trim().toLowerCase();
  const result = rows.filter(row => {
    if (dateField && (from || to)) { const value = String(row[dateField] || ''); if (!value || (from && value < from) || (to && value > to)) return false; }
    if (search && !source.columns.some(column => text(row[column.key]).includes(search))) return false;
    return setup.filters.every(filter => !filter.column || matchesFilter(row, filter, types.get(filter.column) || 'text'));
  });
  if (setup.sortBy) {
    const type = types.get(setup.sortBy); const dir = setup.sortDesc ? -1 : 1;
    result.sort((a, b) => { const x = a[setup.sortBy]; const y = b[setup.sortBy]; const cmp = type === 'money' || type === 'number' ? Number(x || 0) - Number(y || 0) : String(x ?? '').localeCompare(String(y ?? '')); return cmp * dir; });
  }
  return result;
};

export type GroupRow = { key: string; key2?: string; count: number; sums: Record<string, number>; rows: Record<string, any>[] };
/** Groups rows by one or two columns and adds up every money/number column. */
export const groupRows = (rows: Record<string, any>[], setup: ReportSetup) => {
  const source = sourceByKey(setup.source); const numeric = source.columns.filter(column => column.type === 'money' || column.type === 'number').map(column => column.key);
  const groups = new Map<string, GroupRow>();
  for (const row of rows) {
    const key = String(row[setup.groupBy] ?? '') || '(blank)'; const key2 = setup.groupBy2 ? String(row[setup.groupBy2] ?? '') || '(blank)' : undefined;
    const id = `${key}\u0000${key2 ?? ''}`; const group = groups.get(id) || { key, key2, count: 0, sums: Object.fromEntries(numeric.map(k => [k, 0])), rows: [] };
    group.count++; group.rows.push(row); numeric.forEach(k => { group.sums[k] += Number(row[k] || 0); }); groups.set(id, group);
  }
  const list = [...groups.values()]; const sortKey = setup.sortBy && numeric.includes(setup.sortBy) ? setup.sortBy : '';
  list.sort((a, b) => sortKey ? (b.sums[sortKey] - a.sums[sortKey]) * (setup.sortDesc ? 1 : -1) : a.key.localeCompare(b.key) || String(a.key2 ?? '').localeCompare(String(b.key2 ?? '')));
  return list;
};

export const totalsOf = (rows: Record<string, any>[], setup: ReportSetup) => Object.fromEntries(sourceByKey(setup.source).columns.filter(column => column.type === 'money' || column.type === 'number').map(column => [column.key, Math.round(rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0) * 100) / 100]));

type Preset = { title: string; description: string; setup: Partial<ReportSetup> & { source: string } };
const cols = (...keys: string[]) => keys;
/** Ready-made reports: one click fills in the report builder. */
export const PRESETS: { group: string; items: Preset[] }[] = [
  { group: 'Donations', items: [
    { title: 'All donations this year', description: 'Every approved payment this year', setup: { source: 'payments', range: 'this_year', filters: [{ column: 'status', op: 'is', value: 'Approved' }] } },
    { title: 'Donations by month', description: 'Total for each month', setup: { source: 'payments', range: 'last_12', filters: [{ column: 'status', op: 'is', value: 'Approved' }], groupBy: 'month', sortBy: '' } },
    { title: 'Donations by payment method', description: 'Cash, checks, cards, Eizer …', setup: { source: 'payments', range: 'this_year', filters: [{ column: 'status', op: 'is', value: 'Approved' }], groupBy: 'method', sortBy: 'amountCAD' } },
    { title: 'Donations by donor', description: 'How much each donor gave', setup: { source: 'payments', range: 'this_year', filters: [{ column: 'status', op: 'is', value: 'Approved' }], groupBy: 'donor', sortBy: 'amountCAD' } },
    { title: 'Donations by campaign', description: 'Per campaign', setup: { source: 'payments', range: 'all', filters: [{ column: 'status', op: 'is', value: 'Approved' }], groupBy: 'campaign', sortBy: 'amountCAD' } },
    { title: 'Donations by category', description: 'Per category', setup: { source: 'payments', range: 'this_year', filters: [{ column: 'status', op: 'is', value: 'Approved' }], groupBy: 'category', sortBy: 'amountCAD' } },
    { title: 'Checks not deposited', description: 'Checks still waiting for the bank', setup: { source: 'payments', filters: [{ column: 'method', op: 'is', value: 'Check' }, { column: 'deposit', op: 'is', value: 'Not deposited' }], columns: cols('date', 'donor', 'amount', 'currency', 'checkNumber', 'status', 'deposit'), sortDesc: false } },
    { title: 'Pending payments', description: 'Payments waiting to be confirmed', setup: { source: 'payments', filters: [{ column: 'status', op: 'is', value: 'Pending' }] } },
    { title: 'Declined card payments', description: 'Cards that did not go through', setup: { source: 'payments', range: 'last_12', filters: [{ column: 'status', op: 'is', value: 'Declined' }], columns: cols('date', 'donor', 'amount', 'currency', 'declineReason') } },
    { title: 'USD donations', description: 'Everything given in US dollars', setup: { source: 'payments', range: 'this_year', filters: [{ column: 'currency', op: 'is', value: 'USD' }, { column: 'status', op: 'is', value: 'Approved' }] } },
  ] },
  { group: 'Money owed to us (receivable)', items: [
    { title: 'Open pledges', description: 'Every pledge that still has a balance', setup: { source: 'pledges', filters: [{ column: 'balance', op: 'more', value: '0' }], sortBy: 'balance' } },
    { title: 'Balance owed by donor', description: 'Total still owed, per donor', setup: { source: 'pledges', filters: [{ column: 'balance', op: 'more', value: '0' }], groupBy: 'donor', sortBy: 'balance' } },
    { title: 'Receivable aging', description: 'How old the open balances are', setup: { source: 'pledges', filters: [{ column: 'balance', op: 'more', value: '0' }], groupBy: 'aging', sortBy: '' } },
    { title: 'Pledges by campaign', description: 'Pledged, paid and still owed per campaign', setup: { source: 'pledges', groupBy: 'campaign', sortBy: 'amountCAD' } },
    { title: 'Pledges this year', description: 'New pledges made this year', setup: { source: 'pledges', range: 'this_year' } },
  ] },
  { group: 'Money we owe (payable)', items: [
    { title: 'Unpaid bills', description: 'Every bill not paid yet', setup: { source: 'bills', filters: [{ column: 'status', op: 'is', value: 'Unpaid' }], sortBy: 'dueDate', sortDesc: false, columns: cols('dueDate', 'vendor', 'amount', 'currency', 'amountCAD', 'daysOverdue', 'aging', 'expenseAccount') } },
    { title: 'Payable aging', description: 'Unpaid bills by how late they are', setup: { source: 'bills', filters: [{ column: 'status', op: 'is', value: 'Unpaid' }], groupBy: 'aging', sortBy: '' } },
    { title: 'Unpaid by vendor', description: 'How much we owe each vendor', setup: { source: 'bills', filters: [{ column: 'status', op: 'is', value: 'Unpaid' }], groupBy: 'vendor', sortBy: 'amountCAD' } },
    { title: 'Expenses by account', description: 'Spending per expense account', setup: { source: 'bills', range: 'this_year', filters: [{ column: 'status', op: 'is', value: 'Paid' }], groupBy: 'expenseAccount', sortBy: 'amountCAD' } },
    { title: 'Expenses by vendor', description: 'Spending per vendor', setup: { source: 'bills', range: 'this_year', filters: [{ column: 'status', op: 'is', value: 'Paid' }], groupBy: 'vendor', sortBy: 'amountCAD' } },
    { title: 'Expenses by month', description: 'Spending each month', setup: { source: 'bills', range: 'last_12', filters: [{ column: 'status', op: 'is', value: 'Paid' }], groupBy: 'month', sortBy: '' } },
    { title: 'Expenses by project', description: 'Spending per project', setup: { source: 'bills', range: 'all', filters: [{ column: 'project', op: 'not_empty', value: '' }], groupBy: 'project', sortBy: 'amountCAD' } },
    { title: 'Payroll by employee', description: 'Payroll bills per employee', setup: { source: 'bills', range: 'this_year', filters: [{ column: 'payroll', op: 'is', value: 'Yes' }], groupBy: 'employee', sortBy: 'amountCAD' } },
    { title: 'Taxable expenses', description: 'Bills marked taxable', setup: { source: 'bills', range: 'this_year', filters: [{ column: 'taxable', op: 'is', value: 'Yes' }] } },
  ] },
  { group: 'Donors', items: [
    { title: 'Donor list', description: 'All donors with phone and totals', setup: { source: 'donors', sortBy: 'name', sortDesc: false } },
    { title: 'Top donors this year', description: 'Who gave the most this year', setup: { source: 'donors', filters: [{ column: 'givenThisYear', op: 'more', value: '0' }], sortBy: 'givenThisYear' } },
    { title: 'Gave last year, not this year', description: 'Donors to call back', setup: { source: 'donors', filters: [{ column: 'givenLastYear', op: 'more', value: '0' }, { column: 'givenThisYear', op: 'empty', value: '' }], sortBy: 'givenLastYear', columns: cols('donorNumber', 'name', 'phone', 'givenLastYear', 'lastGift', 'balanceOwed') } },
    { title: 'Donors who owe money', description: 'Donors with an open balance', setup: { source: 'donors', filters: [{ column: 'balanceOwed', op: 'more', value: '0' }], sortBy: 'balanceOwed', columns: cols('donorNumber', 'name', 'phone', 'balanceOwed', 'lastGift', 'activeSchedules') } },
    { title: 'Donors with no email', description: 'Missing email address', setup: { source: 'donors', filters: [{ column: 'email', op: 'empty', value: '' }], sortBy: 'totalGiven' } },
    { title: 'Donors with no phone', description: 'Missing phone number', setup: { source: 'donors', filters: [{ column: 'phone', op: 'empty', value: '' }], sortBy: 'totalGiven' } },
  ] },
  { group: 'Other', items: [
    { title: 'Active recurring schedules', description: 'Monthly and other repeating payments', setup: { source: 'schedules', filters: [{ column: 'active', op: 'is', value: 'Active' }], sortBy: 'nextDate', sortDesc: false } },
    { title: 'Receipts sent', description: 'Official receipts and who got them', setup: { source: 'receipts', range: 'this_year' } },
    { title: 'Campaign summary', description: 'Pledged, paid and still owed', setup: { source: 'campaigns', sortBy: 'startDate' } },
    { title: 'Project income & costs', description: 'Income, costs and net per project', setup: { source: 'projects', sortBy: 'net' } },
    { title: 'Bank money in / out by month', description: 'From the bank feed', setup: { source: 'bank', range: 'last_12', groupBy: 'month', groupBy2: 'direction', sortBy: '' } },
    { title: 'Transfers between accounts', description: 'Money moved between accounts', setup: { source: 'transfers', range: 'this_year' } },
    { title: 'Open tasks', description: 'Tasks not done yet', setup: { source: 'tasks', filters: [{ column: 'done', op: 'is', value: 'Open' }], sortBy: 'dueDate', sortDesc: false } },
  ] },
];
export const presetSetup = (preset: Preset): ReportSetup => ({ ...defaultSetup(preset.setup.source), ...preset.setup, name: preset.title, filters: preset.setup.filters || [] });
