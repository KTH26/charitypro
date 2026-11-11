/**
 * types.ts — All shared TypeScript interfaces and utility helpers.
 *
 * Extracted from the monolithic store.ts so the Zustand implementation
 * stays lean while these types remain importable from both store.ts and
 * any other module that only needs the shapes.
 *
 * Usage:
 *   import type { Donor, Transaction } from './types';
 *   import { uid, UNDEPOSITED_FUNDS_ID } from './types';
 *
 * Everything here is also re-exported from store.ts for backward
 * compatibility — existing `import { Donor } from '../store'` calls
 * continue to work without changes.
 */

export interface Donor {
  id: string;
  displayId: string;
  
  // Basic Info
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;

  // Hebrew / Yiddish Names
  preTitle?: string;   // from "title" column — shown BEFORE first Yiddish name
  hebFirstName?: string;
  hebLastName?: string;
  title?: string;      // from "טיטל" column — shown AFTER last Yiddish name
  postTitle?: string;
  doubleNames?: string;
  
  // Family Info
  hisFather?: string;
  herFather?: string;
  householdFullName?: string;
  allMaiden?: string;
  
  // Additional Contact Info
  homePhone?: string;
  mobilePhone?: string;
  mobilePhone2?: string;
  phone3?: string;
  confidentialMobile?: string;
  confidentialMobile2?: string;
  
  // Address Breakdown
  addrBuildingNum?: string;
  addrStreet?: string;
  addrApt?: string;
  addrType?: string;
  addrNo?: string;
  addrPostalCode?: string;
  addrLandlord?: string;
  
  // Metrics
  totalGiven: number;
  balanceOwed: number;
  fundraiserId?: string;
  cards?: PaymentCard[];
  sponsorshipDays?: SponsorshipDay[];
  aliases?: string[];
}

export interface PaymentCard {
  id: string;
  last4: string;
  brand: string;
  expiry: string;
  isDefault: boolean;
}

export interface SponsorshipDay {
  id: string;
  date: string; // MM-DD format
  note: string;
  year: number;
}

export interface Transaction {
  id: string;
  donorId: string;
  amount: number;
  amountCAD?: number; // for USD transactions, the CAD equivalent
  date: string;
  type: 'approved' | 'pending' | 'declined';
  method: 'credit_card' | 'check' | 'cash' | 'e_transfer' | 'vouchers' | 'eizer' | 'bnei_leivy' | 'other';
  currency: 'CAD' | 'USD';
  // 'direct'      = cash, hits bank account immediately
  // 'undeposited' = all other methods, waits for bank feed batch match
  // 'deposited'   = has been matched in bank feed, balance already applied
  depositStatus?: 'direct' | 'undeposited' | 'deposited';
  sourceAccountId?: string; // e.g. Bank Account (Asset)
  offsetAccountId?: string; // e.g. Category/Fundraiser Payroll (Revenue/Expense)
  fundraiserId?: string;
  category?: string;
  sponsor?: string;
  notes?: string;
  invoiceSaved?: boolean;
  bankTransactionId?: string;
  solaBatchId?: string;
  batchTransactionId?: string; // Links individual tx to a master batch tx
  isBatch?: boolean; // True if this is the master batch tx
  projectId?: string;
  pledgeId?: string;
  taxable?: boolean;
}

export interface Pledge {
  id: string;
  donorId: string;
  amount: number;
  amountCAD?: number;
  date: string;
  currency: 'CAD' | 'USD';
  category?: string;
  sponsor?: string;
  notes?: string;
  fundraiserId?: string;
  projectId?: string;
}

export interface RecurringPayment {
  id: string;
  donorId: string;
  pledgeId?: string;
  amount: number;
  amountCAD?: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextDate: string;
  endDate?: string;
  method: 'credit_card' | 'check' | 'cash' | 'e_transfer' | 'vouchers' | 'eizer' | 'bnei_leivy' | 'other';
  currency: 'CAD' | 'USD';
  active: boolean;
}

export interface Fundraiser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  percentage: number;
  balanceOwed: number;
  internalAccountBalance?: number; // legacy tracking, mostly handled by accounts now
}

export interface Account {
  id: string;
  name: string;
  currency: 'CAD' | 'USD';
  balance: number;
  startingBalance?: number;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentId?: string;
  subType?: 'checking' | 'savings' | 'credit_card' | 'loan' | 'payroll' | 'general' | 'internal';
  linkedFundraiserId?: string;
  routingNumber?: string;
  accountNumber?: string;
  plaidConnected?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  balanceOwed: number;
}

export interface T4A {
  id: string;
  entityId: string;
  entityType: 'employee' | 'fundraiser';
  year: number;
  box48Amount: number;
  issuedDate: string;
}

export interface Vendor {
  id: string;
  name: string;
  fund?: string;
}

export interface Bill {
  id: string;
  vendor: string;
  amount: number;
  currency?: 'CAD' | 'USD';
  exchangeRate?: number;
  dueDate: string;
  status: 'pending' | 'urgent' | 'paid' | 'scheduled';
  category: string;
  sourceAccountId?: string; // Where it's paid from
  offsetAccountId?: string; // What expense it's allocated to
  isScheduled?: boolean;
  paidDate?: string;
  invoiceSaved?: boolean;
  checkNumber?: string;
  memo?: string;
  printStatus?: 'queued' | 'printed';
  projectId?: string;
  creditAccountId?: string;
  earningType?: string;
  t4aEligible?: boolean;
  isRecurring?: boolean;
  recurringFrequency?: 'weekly' | 'monthly' | 'yearly';
  bankTransactionId?: string;
  isPayroll?: boolean;   // true = payroll-only bill, hidden from Expenses page
  isPayrollExpense?: boolean; // true = standard expense that is ALSO payroll
  employeeId?: string;   // linked employee ID for payroll tracking
  taxable?: boolean;
}

export interface Task {
  id: string;
  donorId?: string;
  title: string;
  notes?: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  type: 'call' | 'email' | 'meeting' | 'payment' | 'other';
  completed: boolean;
  createdAt: string;
}

export interface AccountTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  notes?: string;
  bankTransactionId?: string;
}

export interface UploadedExpenseRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  taxable?: boolean;
  bankTransactionId?: string;
}

export type DonorSortKey = 'lastName' | 'firstName' | 'hebLastName' | 'hebFirstName';

export interface Project {
  id: string;
  name: string;
}

export interface RecurringExpense {
  id: string;
  vendor: string;
  amount: number;
  currency?: 'CAD' | 'USD';
  category: string;
  projectId?: string;
  creditAccountId?: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  nextDate: string;
  active: boolean;
  taxable?: boolean;
}

export interface RecurringPayroll {
  id: string;
  entityId: string;
  type: 'employee' | 'fundraiser';
  amount: number;
  earningType: string;
  t4aEligible: boolean;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  nextDate: string;
  active: boolean;
}

export type PersistenceClassification =
  | 'synced-record'
  | 'synced-singleton'
  | 'derived'
  | 'device-local'
  | 'server-secret'
  | 'transient';

export type PersistedStateKey = 
  | 'clientId'
  | 'lastEventId'
  | 'isRtl'
  | 'currency'
  | 'exchangeRate'
  | 'donorSortBy'
  | 'donors'
  | 'transactions'
  | 'pledges'
  | 'recurringPayments'
  | 'fundraisers'
  | 'accounts'
  | 'bills'
  | 'tasks'
  | 'uploadedExpenseQueue'
  | 'accountTransfers'
  | 'matchedBankTransactions'
  | 'needsReviewBankTransactions'
  | 'googleSheetSyncUrl'
  | 'solaApiKey'
  | 'lastSolaSyncDate'
  | 'bankFeeds'
  | 'employees'
  | 't4aSlips'
  | 'vendors'
  | 'projects'
  | 'recurringExpenses'
  | 'recurringPayroll'
  | 'syncConflicts'
  | 'dismissedSolaRefs'
  | 'cachedSolaData'
  | 'cachedSolaStartDate'
  | 'cachedSolaEndDate'
  | 'hasSolaSynced';

export interface SyncRegistryEntry {
  classification: PersistenceClassification;
  permission?: string;
}

export const SYNC_REGISTRY = {
  clientId: { classification: 'device-local' },
  lastEventId: { classification: 'transient' },
  isRtl: { classification: 'device-local' },
  currency: { classification: 'device-local' },
  exchangeRate: { classification: 'synced-singleton', permission: 'settings.read' },
  donorSortBy: { classification: 'device-local' },
  donors: { classification: 'synced-record', permission: 'donors.read' },
  transactions: { classification: 'synced-record', permission: 'transactions.read' },
  pledges: { classification: 'synced-record', permission: 'pledges.read' },
  recurringPayments: { classification: 'synced-record', permission: 'recurringPayments.read' },
  fundraisers: { classification: 'synced-record', permission: 'fundraisers.read' },
  accounts: { classification: 'synced-record', permission: 'accounts.read' },
  bills: { classification: 'synced-record', permission: 'bills.read' },
  tasks: { classification: 'synced-record', permission: 'tasks.read' },
  uploadedExpenseQueue: { classification: 'device-local' },
  accountTransfers: { classification: 'synced-record', permission: 'accountTransfers.read' },
  matchedBankTransactions: { classification: 'synced-singleton', permission: 'accounts.read' },
  needsReviewBankTransactions: { classification: 'device-local' },
  googleSheetSyncUrl: { classification: 'server-secret' },
  solaApiKey: { classification: 'server-secret' },
  lastSolaSyncDate: { classification: 'device-local' },
  bankFeeds: { classification: 'device-local' },
  employees: { classification: 'synced-record', permission: 'employees.read' },
  t4aSlips: { classification: 'synced-record', permission: 't4aSlips.read' },
  vendors: { classification: 'synced-record', permission: 'vendors.read' },
  projects: { classification: 'synced-record', permission: 'projects.read' },
  recurringExpenses: { classification: 'synced-record', permission: 'recurringExpenses.read' },
  recurringPayroll: { classification: 'synced-record', permission: 'recurringPayroll.read' },
  syncConflicts: { classification: 'device-local' },
  dismissedSolaRefs: { classification: 'device-local' },
  cachedSolaData: { classification: 'transient' },
  cachedSolaStartDate: { classification: 'transient' },
  cachedSolaEndDate: { classification: 'transient' },
  hasSolaSynced: { classification: 'transient' }
} satisfies Record<PersistedStateKey, SyncRegistryEntry>;

export interface AppState {
  clientId: string;
  lastEventId: number;
  isRtl: boolean;
  currency: 'CAD' | 'USD';
  exchangeRate: number;
  donorSortBy: DonorSortKey;
  donors: Donor[];
  transactions: Transaction[];
  pledges: Pledge[];
  recurringPayments: RecurringPayment[];
  fundraisers: Fundraiser[];
  accounts: Account[];
  bills: Bill[];
  tasks: Task[];
  uploadedExpenseQueue: UploadedExpenseRow[];
  accountTransfers: AccountTransfer[];
  matchedBankTransactions: string[];
  needsReviewBankTransactions: string[];
  googleSheetSyncUrl: string;
  solaApiKey: string;
  lastSolaSyncDate: string;
  bankFeeds: Record<string, any[]>;
  employees: Employee[];
  t4aSlips: T4A[];
  vendors: Vendor[];
  projects: Project[];
  recurringExpenses: RecurringExpense[];
  recurringPayroll: RecurringPayroll[];
  syncConflicts: { id: string, type: string, localData: any, serverData: any }[];
  dismissedSolaRefs: string[];
  cachedSolaData: any[];
  cachedSolaStartDate: string;
  cachedSolaEndDate: string;
  hasSolaSynced: boolean;

  dismissConflict: (id: string) => void;
  toggleRtl: () => void;
  setCurrency: (currency: 'CAD' | 'USD') => void;
  setExchangeRate: (rate: number) => void;
  setGoogleSheetSyncUrl: (url: string) => void;
  setSolaApiKey: (key: string) => void;
  setLastSolaSyncDate: (date: string) => void;
  setCachedSolaData: (data: any[]) => void;
  setCachedSolaStartDate: (date: string) => void;
  setCachedSolaEndDate: (date: string) => void;
  setHasSolaSynced: (synced: boolean) => void;
  dismissSolaRef: (ref: string) => void;
  setDonorSortBy: (key: DonorSortKey) => void;
  setBankFeed: (accountId: string, feed: any[]) => void;

  addDonor: (donor: Omit<Donor, 'id' | 'name' | 'totalGiven' | 'balanceOwed'> | Omit<Donor, 'id' | 'displayId' | 'name' | 'totalGiven' | 'balanceOwed'>) => void;
  editDonor: (id: string, updates: Partial<Omit<Donor, 'id' | 'name' | 'totalGiven' | 'balanceOwed'>>) => void;
  updateDonorNotes: (donorId: string, notes: string) => void;
  addSponsorshipDay: (donorId: string, day: Omit<SponsorshipDay, 'id'>) => void;
  removeSponsorshipDay: (donorId: string, dayId: string) => void;
  deleteDonors: (ids: string[]) => void;
  bulkUpsertDonors: (donors: any[]) => void;
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  bulkAddTransactions: (txs: Omit<Transaction, 'id'>[]) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  editTransaction: (id: string, updates: Partial<Omit<Transaction, 'id'>>) => void;
  bulkEditTransactions: (ids: string[], updates: Partial<Omit<Transaction, 'id'>>) => void;
  deleteTransactions: (ids: string[]) => void;
  deleteAllTransactions: () => void;
  removeDuplicateTransactions: () => { count: number };
  deduplicateDonors: () => void;
  forceCloudSync: () => Promise<void>;

  addPledge: (pledge: Omit<Pledge, 'id'>) => string;
  bulkAddPledges: (pledges: Omit<Pledge, 'id'>[]) => void;
  editPledge: (id: string, updates: Partial<Omit<Pledge, 'id'>>) => void;
  deletePledges: (ids: string[]) => void;
  deleteAllPledges: () => void;
  autoMatchPledges: () => void;
  transferPledgeCredit: (donorId: string, fromPledgeId: string, toPledgeId: string, amount: number) => void;

  addRecurring: (rec: Omit<RecurringPayment, 'id'>) => void;
  bulkAddRecurring: (recs: Omit<RecurringPayment, 'id'>[]) => void;
  editRecurring: (id: string, updates: Partial<Omit<RecurringPayment, 'id'>>) => void;
  toggleRecurring: (id: string) => void;
  deleteRecurring: (ids: string[]) => void;
  deleteAllRecurring: () => void;

  addFundraiser: (f: Omit<Fundraiser, 'id' | 'balanceOwed'>) => void;
  payOutFundraiser: (id: string) => void;
  chargeToFundraiser: (id: string, amount: number) => void;

  addEmployee: (emp: Omit<Employee, 'id' | 'balanceOwed'>) => void;
  editEmployee: (id: string, updates: Partial<Omit<Employee, 'id' | 'balanceOwed'>>) => void;
  deleteEmployee: (id: string) => void;
  payPayrollEntity: (entityId: string, type: 'employee' | 'fundraiser', amount: number) => void;
  accruePayroll: (entityId: string, type: 'employee' | 'fundraiser', amount: number, earningType?: string, t4aEligible?: boolean, date?: string) => void;
  addT4A: (t4a: Omit<T4A, 'id' | 'issuedDate'>) => void;
  editT4A: (id: string, updates: Partial<Omit<T4A, 'id'>>) => void;
  deleteT4A: (id: string) => void;

  addAccount: (acc: Omit<Account, 'id'> & { id?: string }) => void;
  editAccount: (id: string, updates: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  recalculateBalances: () => void;
  transferBetweenAccounts: (transfer: Omit<AccountTransfer, 'id'>) => void;
  editAccountTransfer: (id: string, updates: Partial<AccountTransfer>) => void;
  deleteAccountTransfer: (id: string) => void;

  addBill: (bill: Omit<Bill, 'id'>) => string;
  editBill: (id: string, updates: Partial<Omit<Bill, 'id'>>) => void;
  bulkEditBills: (ids: string[], updates: Partial<Omit<Bill, 'id'>>) => void;
  markBillPaid: (id: string, sourceAccountId?: string, offsetAccountId?: string) => void;
  deleteBills: (ids: string[]) => void;
  addVendor: (vendor: Omit<Vendor, 'id'>) => void;

  addProject: (proj: Omit<Project, 'id'>) => void;
  editProject: (id: string, updates: Partial<Omit<Project, 'id'>>) => void;
  deleteProject: (id: string) => void;

  addRecurringExpense: (expense: Omit<RecurringExpense, 'id'>) => void;
  toggleRecurringExpense: (id: string) => void;
  processRecurringExpenses: () => void;
  processRecurringPayments: () => void;
  checkSystemAccounts: () => void;

  addRecurringPayroll: (payroll: Omit<RecurringPayroll, 'id'>) => void;
  deleteRecurringPayroll: (id: string) => void;
  toggleRecurringPayroll: (id: string) => void;
  processRecurringPayroll: () => void;

  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;

  matchBankTransaction: (id: string) => void;
  unmatchBankTransaction: (id: string) => void;
  autoMatchBankTransactions: () => void;
  markBankTransactionForReview: (id: string) => void;
  unmarkBankTransactionForReview: (id: string) => void;
  addBatchDeposit: (bankFeedId: string, internalTxIds: string[], accountId: string, totalAmount: number, date: string, desc: string) => void;

  setExpenseQueue: (queue: UploadedExpenseRow[]) => void;
  removeExpenseFromQueue: (id: string) => void;
}

export const uid = () => {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

export const scheduledOccurrenceId = (
  kind: 'payment' | 'expense' | 'payroll',
  scheduleId: string,
  occurrenceDate: string
) => `scheduled-${kind}-${scheduleId}-${occurrenceDate}`;

// System-reserved account ID for Undeposited Funds
export const UNDEPOSITED_FUNDS_ID = 'sys-undeposited-funds';
