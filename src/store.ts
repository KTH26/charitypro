import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

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
  matchedBankTransactions: { classification: 'device-local' },
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

// Methods that go to Undeposited Funds instead of hitting the bank directly
const UNDEPOSITED_METHODS = new Set(['credit_card', 'e_transfer', 'check']);

const LOCAL_KEY = 'charity-store';

/**
 * Dual-layer storage strategy:
 *
 * READ  → Always return from localStorage instantly (no async delay, no blank flash).
 *         On first ever load (no localStorage), fall back to cloud.
 *
 * WRITE → Save to localStorage immediately AND push to cloud in the background.
 *         The cloud push is fire-and-forget; a failure never loses local data.
 *
 * This prevents the race condition where the async cloud GET returns null/slow
 * and Zustand initialises with the empty default state, which then immediately
 * fires setItem and overwrites the real cloud data with an empty donors array.
 */
export let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let persistenceWrite: Promise<void> = Promise.resolve();

export const dualStorage: StateStorage = {
  getItem: async (name): Promise<string | null> => {
    // 1. Try IndexedDB first — supports gigabytes of data natively
    const local = await idbGet(name);
    if (local) return local;

    // Fallback to old localStorage for seamless migration
    const legacyLocal = localStorage.getItem(name);
    if (legacyLocal) {
      await idbSet(name, legacyLocal); // Migrate it
      return legacyLocal;
    }
    // 2. No local data -> first-ever load. Return null and let SyncEngineHardened handle the initial pull.
    return null;
  },

  setItem: async (name, value): Promise<void> => {
    // IndexedDB writes from rapid Zustand updates must finish in creation
    // order. Without this queue, a slower partial snapshot can complete after
    // the newest full snapshot and silently roll the browser back.
    persistenceWrite = persistenceWrite
      .catch(() => undefined)
      .then(() => idbSet(name, value));
    await persistenceWrite;

    // V2 Sync Engine is now responsible for pushing changes via store subscription.
  },

  removeItem: async (name): Promise<void> => {
    persistenceWrite = persistenceWrite
      .catch(() => undefined)
      .then(() => idbDel(name));
    await persistenceWrite;
    localStorage.removeItem(name); // Clean up legacy
  },
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      clientId: Math.random().toString(36).substr(2, 9),
      lastEventId: 0,
      isRtl: false,
      currency: 'CAD',
      exchangeRate: 1.35,
      donorSortBy: 'lastName',
      donors: [],
      transactions: [],
      pledges: [],
      recurringPayments: [],
      fundraisers: [],
      accounts: [
        {
          id: UNDEPOSITED_FUNDS_ID,
          name: 'Undeposited Funds',
          currency: 'CAD' as const,
          balance: 0,
          type: 'asset' as const,
          subType: 'general' as const,
        }
      ],
      bills: [],
      tasks: [],
      uploadedExpenseQueue: [],
      accountTransfers: [],
      matchedBankTransactions: [],
      needsReviewBankTransactions: [],
      googleSheetSyncUrl: '',
      solaApiKey: '',
      lastSolaSyncDate: '',
      bankFeeds: {},
      employees: [],
      t4aSlips: [],
      vendors: [],
      projects: [],
      recurringExpenses: [],
      recurringPayroll: [],
      syncConflicts: [],
      dismissedSolaRefs: [],
      cachedSolaData: [],
      cachedSolaStartDate: '',
      cachedSolaEndDate: '',
      hasSolaSynced: false,

      dismissConflict: (id) => set(state => ({ syncConflicts: state.syncConflicts.filter(c => c.id !== id) })),
      toggleRtl: () => set((state) => ({ isRtl: !state.isRtl })),
      setCurrency: (currency) => set({ currency }),
      setExchangeRate: (rate) => set({ exchangeRate: rate }),
      setGoogleSheetSyncUrl: (url) => set({ googleSheetSyncUrl: url }),
      setSolaApiKey: (key) => set({ solaApiKey: key }),
      setLastSolaSyncDate: (date) => set({ lastSolaSyncDate: date }),
      setCachedSolaData: (data) => set({ cachedSolaData: data }),
      setCachedSolaStartDate: (date) => set({ cachedSolaStartDate: date }),
      setCachedSolaEndDate: (date) => set({ cachedSolaEndDate: date }),
      setHasSolaSynced: (synced) => set({ hasSolaSynced: synced }),
      dismissSolaRef: (ref) => set((state) => ({ 
        dismissedSolaRefs: state.dismissedSolaRefs.includes(ref) 
          ? state.dismissedSolaRefs 
          : [...state.dismissedSolaRefs, ref] 
      })),
      setDonorSortBy: (key) => set({ donorSortBy: key }),
      setBankFeed: (accountId, feed) => set(state => ({ bankFeeds: { ...state.bankFeeds, [accountId]: feed } })),

      addDonor: (donor) => set(state => {
        const nextNum = 1001 + state.donors.length;
        const displayId = (donor as any).displayId || `D-${nextNum}`;
        const name = `${donor.firstName} ${donor.lastName}`.trim();
        return {
          donors: [...state.donors, { ...donor, id: Math.random().toString(), displayId, name, totalGiven: 0, balanceOwed: 0, cards: [], sponsorshipDays: [] }]
        };
      }),

      editDonor: (id, updates) => set(state => {
        return {
          donors: state.donors.map(d => {
            if (d.id !== id) return d;
            const newD = { ...d, ...updates };
            newD.name = `${newD.firstName} ${newD.lastName}`.trim();
            return newD;
          })
        };
      }),

      updateDonorNotes: (donorId, notes) => set((state) => ({
        donors: state.donors.map(d => d.id === donorId ? { ...d, notes } : d)
      })),

      addSponsorshipDay: (donorId, day) => set((state) => ({
        donors: state.donors.map(d => d.id === donorId
          ? { ...d, sponsorshipDays: [...(d.sponsorshipDays || []), { ...day, id: uid() }] }
          : d)
      })),

      removeSponsorshipDay: (donorId, dayId) => set((state) => ({
        donors: state.donors.map(d => d.id === donorId
          ? { ...d, sponsorshipDays: (d.sponsorshipDays || []).filter(s => s.id !== dayId) }
          : d)
      })),

      deleteDonors: (ids) => set(state => ({
        donors: state.donors.filter(d => !ids.includes(d.id)),
        transactions: state.transactions.filter(t => !ids.includes(t.donorId)),
        pledges: state.pledges.filter(p => !ids.includes(p.donorId)),
        recurringPayments: state.recurringPayments.filter(r => !ids.includes(r.donorId)),
      })),

      bulkUpsertDonors: (donorsArray) => set(state => {
        let updatedDonors = [...state.donors];
        let nextNum = 1001 + state.donors.length;
        
        for (const d of donorsArray) {
          const existingIndex = updatedDonors.findIndex(x => x.displayId === d.displayId);
          if (existingIndex !== -1) {
             const oldD = updatedDonors[existingIndex];
             const newD = { ...oldD, ...d };
             newD.name = `${newD.firstName} ${newD.lastName}`.trim();
             updatedDonors[existingIndex] = newD;
          } else {
             const displayId = d.displayId || `D-${nextNum++}`;
             const name = `${d.firstName} ${d.lastName}`.trim();
             updatedDonors.push({ ...d, id: Math.random().toString(), displayId, name, totalGiven: 0, balanceOwed: 0, cards: [], sponsorshipDays: [] });
          }
        }
        return { donors: updatedDonors };
      }),

      addTransaction: (tx) => {
        set((state) => {
          const isUndeposited = tx.sourceAccountId === UNDEPOSITED_FUNDS_ID || tx.depositStatus === 'undeposited';
        const depositStatus = isUndeposited ? 'undeposited' as const : 'direct' as const;
        const effectiveSourceId = isUndeposited ? UNDEPOSITED_FUNDS_ID : tx.sourceAccountId;
        const newTx = { ...tx, id: (tx as any).id || uid(), depositStatus, sourceAccountId: effectiveSourceId };
        const effectiveAmount = tx.amountCAD ?? tx.amount;

        // Donor totalGiven updates immediately for all approved transactions
        const updatedDonors = state.donors.map(d => {
          if (d.id !== tx.donorId) return d;
          if (tx.type === 'approved') return { ...d, totalGiven: d.totalGiven + effectiveAmount };
          return d;
        });

        // Always update the source account (Undeposited Funds for CC/eTransfer/check, real account for others)
        let updatedAccounts = state.accounts;
        if (tx.type === 'approved') {
          updatedAccounts = updatedAccounts.map(a => {
            let newBalance = a.balance;
            const amountToAdd = (a.currency === 'CAD' && tx.currency === 'USD') ? effectiveAmount : tx.amount;
            if (a.id === effectiveSourceId) newBalance += amountToAdd;
            if (a.id === tx.offsetAccountId) newBalance += amountToAdd;
            return { ...a, balance: newBalance };
          });
        }

        const updatedFundraisers = tx.fundraiserId && tx.type === 'approved'
          ? state.fundraisers.map(f => f.id === tx.fundraiserId
              ? { ...f, balanceOwed: f.balanceOwed + (tx.amount * f.percentage / 100) }
              : f)
          : state.fundraisers;
          
        return { transactions: [newTx, ...state.transactions], donors: updatedDonors, accounts: updatedAccounts, fundraisers: updatedFundraisers };
        });
        get().recalculateBalances();
      },

      deduplicateDonors: () => set((state) => {
        const seen = new Set();
        const deduplicated = [];
        // Keep the newest (last) version of duplicates based on displayId (e.g. D-1001) or email
        for (let i = state.donors.length - 1; i >= 0; i--) {
          const d = state.donors[i];
          const key = d.displayId || d.id;
          if (!seen.has(key)) {
            seen.add(key);
            deduplicated.unshift(d);
          }
        }
        return { donors: deduplicated };
      }),

      bulkAddTransactions: (txs) => {
        set((state) => {
          const newTxs = txs.map(tx => {
          const isUndeposited = tx.sourceAccountId === UNDEPOSITED_FUNDS_ID || tx.depositStatus === 'undeposited';
          const effectiveSourceId = isUndeposited ? UNDEPOSITED_FUNDS_ID : tx.sourceAccountId;
          return {
            ...tx,
            id: (tx as any).id || uid(),
            invoiceSaved: false,
            depositStatus: isUndeposited ? 'undeposited' as const : 'direct' as const,
            sourceAccountId: effectiveSourceId,
          };
        });
        
        let updatedDonors = [...state.donors];
        let updatedAccounts = [...state.accounts];
        let updatedFundraisers = [...state.fundraisers];
        
        // Maps to accumulate changes and apply them efficiently
        const donorUpdates = new Map<string, { totalGiven: number, balanceOwed: number }>();
        const accountUpdates = new Map<string, number>();
        const fundraiserUpdates = new Map<string, number>();

        for (const tx of newTxs) {
          const effectiveAmount = tx.amountCAD ?? tx.amount;
          
          // Accumulate donor updates
          const dUpdate = donorUpdates.get(tx.donorId) || { totalGiven: 0, balanceOwed: 0 };
          if (tx.type === 'approved') dUpdate.totalGiven += effectiveAmount;
          donorUpdates.set(tx.donorId, dUpdate);

          // Accumulate account updates
          // source account (Undeposited Funds for CC/eTransfer/check, real account for direct)
          if (tx.type === 'approved') {
            if (tx.sourceAccountId) {
              const acc = updatedAccounts.find(a => a.id === tx.sourceAccountId);
              if (acc) {
                const add = (acc.currency === 'CAD' && tx.currency === 'USD') ? effectiveAmount : tx.amount;
                accountUpdates.set(tx.sourceAccountId, (accountUpdates.get(tx.sourceAccountId) || 0) + add);
              }
            }
            // Revenue/offset account always updates immediately
            if (tx.offsetAccountId) {
              const acc = updatedAccounts.find(a => a.id === tx.offsetAccountId);
              if (acc) {
                const add = (acc.currency === 'CAD' && tx.currency === 'USD') ? effectiveAmount : tx.amount;
                accountUpdates.set(tx.offsetAccountId, (accountUpdates.get(tx.offsetAccountId) || 0) + add);
              }
            }
          }

          // Accumulate fundraiser updates
          if (tx.fundraiserId && tx.type === 'approved') {
            const f = updatedFundraisers.find(f => f.id === tx.fundraiserId);
            if (f) {
               fundraiserUpdates.set(tx.fundraiserId, (fundraiserUpdates.get(tx.fundraiserId) || 0) + (tx.amount * f.percentage / 100));
            }
          }
        }

        // Apply accumulations
        updatedDonors = updatedDonors.map(d => {
          if (!donorUpdates.has(d.id)) return d;
          const updates = donorUpdates.get(d.id)!;
          return {
            ...d,
            totalGiven: d.totalGiven + updates.totalGiven,
            balanceOwed: Math.max(0, d.balanceOwed + updates.balanceOwed) // balanceOwed updates are negative for payments
          };
        });

        updatedAccounts = updatedAccounts.map(a => {
          if (!accountUpdates.has(a.id)) return a;
          return { ...a, balance: a.balance + accountUpdates.get(a.id)! };
        });

        updatedFundraisers = updatedFundraisers.map(f => {
          if (!fundraiserUpdates.has(f.id)) return f;
          return { ...f, balanceOwed: f.balanceOwed + fundraiserUpdates.get(f.id)! };
        });

        return {
          transactions: [...newTxs, ...state.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
          donors: updatedDonors,
          accounts: updatedAccounts,
          fundraisers: updatedFundraisers
        };
        });
        get().recalculateBalances();
      },

      updateTransaction: (id, updates) => {
        set((state) => ({
          transactions: state.transactions.map(t => t.id === id ? { ...t, ...updates } : t)
        }));
        get().recalculateBalances();
      },

      editTransaction: (id, updates) => {
        set((state) => {
          const newTxs = state.transactions.map(t => t.id === id ? { ...t, ...updates } : t);
          return { transactions: newTxs };
        });
        get().recalculateBalances();
      },

      bulkEditTransactions: (ids, updates) => {
        set((state) => {
          const newTxs = state.transactions.map(t => ids.includes(t.id) ? { ...t, ...updates } : t);
          return { transactions: newTxs };
        });
        get().recalculateBalances();
      },

      deleteTransactions: (ids) => {
        set(state => {
          const newTxs = state.transactions.filter(t => !ids.includes(t.id));
          return { transactions: newTxs };
        });
        get().recalculateBalances();
      },

      deleteAllTransactions: () => set(state => {
        const resetDonors = state.donors.map(d => ({ ...d, totalGiven: 0 }));
        const resetAccounts = state.accounts.map(a => ({ ...a, balance: 0 }));
        return { transactions: [], donors: resetDonors, accounts: resetAccounts };
      }),

      forceCloudSync: async () => {
        try {
          const res = await fetch('/api/sync');
          if (!res.ok) throw new Error('Cloud sync failed to fetch data.');
          const data = await res.json();
          if (data.value) {
            const parsed = JSON.parse(data.value);
            if (parsed && parsed.state) {
              set(parsed.state);
            }
          }
        } catch (e) {
          console.error('Manual force sync failed:', e);
          throw e;
        }
      },

      addPledge: (pledge) => {
        const id = uid();
        set(state => ({
          pledges: [{ ...pledge, id }, ...state.pledges],
        }));
        get().recalculateBalances();
        return id;
      },

      bulkAddPledges: (pledgesArr) => {
        const newPledges = pledgesArr.map(p => ({ ...p, id: (p as any).id || uid() }));
        set(state => ({
          pledges: [...newPledges, ...state.pledges].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        }));
        get().recalculateBalances();
      },

      editPledge: (id, updates) => {
        set(state => ({
          pledges: state.pledges.map(p => p.id === id ? { ...p, ...updates } : p)
        }));
        get().recalculateBalances();
      },

      deletePledges: (ids) => {
        set(state => ({
          pledges: state.pledges.filter(p => !ids.includes(p.id)),
        }));
        get().recalculateBalances();
      },

      deleteAllPledges: () => set(state => ({
        pledges: [],
        donors: state.donors.map(d => ({ ...d, balanceOwed: 0 }))
      })),

      autoMatchPledges: () => set(state => {
        const newTransactions = [...state.transactions];
        
        // Group pledges by donor and sort by date ASC
        const donorPledges = new Map<string, Pledge[]>();
        for (const p of state.pledges) {
          if (!donorPledges.has(p.donorId)) donorPledges.set(p.donorId, []);
          donorPledges.get(p.donorId)!.push(p);
        }
        
        for (const [donorId, pledges] of donorPledges.entries()) {
          pledges.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          for (let i = 0; i < pledges.length; i++) {
            const p = pledges[i];
            const startDate = new Date(p.date).getTime();
            const endDate = i < pledges.length - 1 ? new Date(pledges[i+1].date).getTime() : Infinity;
            
            for (let j = 0; j < newTransactions.length; j++) {
              const tx = newTransactions[j];
              if (tx.donorId === donorId && tx.type === 'approved' && !tx.isBatch) {
                const txDate = new Date(tx.date).getTime();
                if (txDate >= startDate && txDate < endDate) {
                  newTransactions[j] = { ...tx, pledgeId: p.id };
                }
              }
            }
          }
        }
        return { transactions: newTransactions };
      }),

      transferPledgeCredit: (donorId, fromPledgeId, toPledgeId, amount) => set(state => {
        const tx1: Transaction = {
          id: uid(),
          donorId,
          amount: -amount,
          date: new Date().toISOString().split('T')[0],
          type: 'approved',
          method: 'other',
          category: 'Internal Credit Transfer',
          currency: 'CAD',
          notes: `Credit transferred to pledge ${toPledgeId}`,
          pledgeId: fromPledgeId
        };
        const tx2: Transaction = {
          id: uid(),
          donorId,
          amount: amount,
          date: new Date().toISOString().split('T')[0],
          type: 'approved',
          method: 'other',
          category: 'Internal Credit Transfer',
          currency: 'CAD',
          notes: `Credit received from pledge ${fromPledgeId}`,
          pledgeId: toPledgeId
        };
        return {
          transactions: [tx1, tx2, ...state.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        };
      }),

      removeDuplicateTransactions: () => {
        let countRemoved = 0;
        set(state => {
          const seen = new Set<string>();
          const toDelete = new Set<string>();
          
          for (const tx of state.transactions) {
            // Only remove a transaction when every persisted field except its
            // generated ID is identical. The previous short hash could erase
            // legitimate same-day payments with the same donor and amount.
            const { id: _id, ...payload } = tx;
            const hash = JSON.stringify(payload);
            if (seen.has(hash)) {
              toDelete.add(tx.id);
            } else {
              seen.add(hash);
            }
          }

          if (toDelete.size === 0) return state;

          countRemoved = toDelete.size;
          return { transactions: state.transactions.filter(t => !toDelete.has(t.id)) };
        });
        if (countRemoved > 0) get().recalculateBalances();
        return { count: countRemoved };
      },

      addRecurring: (rec) => {
        set((state) => ({ recurringPayments: [...state.recurringPayments, { ...rec, id: uid() }] }));
        get().recalculateBalances();
      },

      bulkAddRecurring: (recs) => {
        set((state) => ({ recurringPayments: [...state.recurringPayments, ...recs.map(r => ({ ...r, id: (r as any).id || uid() }))] }));
        get().recalculateBalances();
      },

      toggleRecurring: (id) => {
        set((state) => ({ recurringPayments: state.recurringPayments.map(r => r.id === id ? { ...r, active: !r.active } : r) }));
        get().recalculateBalances();
      },

      deleteRecurring: (ids) => {
        set((state) => ({ recurringPayments: state.recurringPayments.filter(r => !ids.includes(r.id)) }));
        get().recalculateBalances();
      },

      deleteAllRecurring: () => {
        set({ recurringPayments: [] });
        get().recalculateBalances();
      },

      editRecurring: (id, updates) => {
        set(state => ({ recurringPayments: state.recurringPayments.map(r => r.id === id ? { ...r, ...updates } : r) }));
        get().recalculateBalances();
      },

      addFundraiser: (f) => set((state) => ({
        fundraisers: [...state.fundraisers, { ...f, id: uid(), balanceOwed: 0, internalAccountBalance: 0 }]
      })),

      payOutFundraiser: (id) => set((state) => ({
        fundraisers: state.fundraisers.map(f => f.id === id ? { ...f, balanceOwed: 0 } : f)
      })),

      chargeToFundraiser: (id, amount) => set((state) => ({
        fundraisers: state.fundraisers.map(f => f.id === id
          ? { ...f, balanceOwed: Math.max(0, f.balanceOwed - amount), internalAccountBalance: (f.internalAccountBalance || 0) + amount }
          : f)
      })),

      addAccount: (acc) => set((state) => {
        const newAcc = { ...acc, id: (acc as any).id || uid(), startingBalance: acc.balance || 0 };
        return { accounts: [...state.accounts, newAcc] };
      }),
      editAccount: (id, updates) => set((state) => ({
        accounts: state.accounts.map(a => a.id === id ? { ...a, ...updates } : a)
      })),
      deleteAccount: (id) => set(state => ({
        accounts: state.accounts.filter(a => a.id !== id)
      })),

      checkSystemAccounts: () => set(state => {
        let changed = false;
        
        // Helper to deduplicate any array of objects with an 'id'
        const deduplicate = <T extends { id: string }>(arr: T[]): T[] => {
          const seen = new Set<string>();
          return arr.map(item => {
            if (seen.has(item.id)) {
              changed = true;
              return { ...item, id: uid() };
            }
            seen.add(item.id);
            return item;
          });
        };

        let nextAccounts = deduplicate(state.accounts);
        let nextBills = deduplicate(state.bills);
        const nextTransactions = deduplicate(state.transactions);
        const nextDonors = deduplicate(state.donors);
        const nextVendors = deduplicate(state.vendors);
        const nextPledges = deduplicate(state.pledges);

        if (!nextAccounts.some(a => a.id === UNDEPOSITED_FUNDS_ID)) {
          nextAccounts = [
            ...nextAccounts,
            {
              id: UNDEPOSITED_FUNDS_ID,
              name: 'Undeposited Funds',
              currency: 'CAD',
              balance: 0,
              startingBalance: 0,
              type: 'asset',
              subType: 'general',
            }
          ];
          changed = true;
        }

        let billsChanged = changed;

        // Migration: tag all existing Payroll: bills with isPayroll:true
        // so they are filtered from the Expenses page
        nextBills = nextBills.map(b => {
          if (b.vendor.startsWith('Payroll: ') && !b.isPayroll) {
            billsChanged = true;
            return { ...b, isPayroll: true };
          }
          return b;
        });

        // Migration: clean up bills that have an expense account as offsetAccountId
        nextBills = nextBills.map(b => {
          if (b.offsetAccountId) {
            const acc = nextAccounts.find(a => a.id === b.offsetAccountId);
            if (acc && acc.type === 'expense') {
              billsChanged = true;
              return { ...b, offsetAccountId: undefined };
            }
          }
          return b;
        });

        if (billsChanged) {
          setTimeout(() => get().recalculateBalances(), 0);
          return { accounts: nextAccounts, bills: nextBills, transactions: nextTransactions, donors: nextDonors, vendors: nextVendors, pledges: nextPledges };
        }

        if (changed) {
          return { accounts: nextAccounts, bills: nextBills, transactions: nextTransactions, donors: nextDonors, vendors: nextVendors, pledges: nextPledges };
        }
        
        return {};
      }),

      recalculateBalances: () => set(state => {
        const accountBals = new Map<string, number>();
        const donorTotals = new Map<string, number>();
        const donorBalanceOwed = new Map<string, number>();
        const fundraiserOwed = new Map<string, number>();
        const employeeAccrued = new Map<string, number>(); // pending payroll bills = still owed
        const employeePaid = new Map<string, number>();    // paid payroll bills = payments made

        // Init with starting balances
        state.accounts.forEach(a => accountBals.set(a.id, a.startingBalance || 0));

        // ── Per-pledge-period balance ──────────────────────────────────────────
        // Each pledge only counts payments received during its own date window.
        // The window starts at pledge.date and ends just before the next pledge
        // for that donor starts (or far future if this is the last pledge).
        // This way the 2026 pledge only sees 2026 payments, etc.
        {
          const todayDate = new Date();
          // Group pledges by donor, sorted ascending by date
          const byDonor = new Map<string, typeof state.pledges>();
          for (const p of state.pledges) {
            if (!byDonor.has(p.donorId)) byDonor.set(p.donorId, []);
            byDonor.get(p.donorId)!.push(p);
          }
          byDonor.forEach(pledges => pledges.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));

          for (const [donorId, pledges] of byDonor) {
            let netOwed = 0;

            for (let i = 0; i < pledges.length; i++) {
              const p = pledges[i];
              const amt = p.amountCAD ?? p.amount;
              const periodStart = new Date(p.date + 'T00:00:00Z');

              // Period ends when the next pledge starts (exclusive), or far future
              const periodEnd = i + 1 < pledges.length
                ? new Date(pledges[i + 1].date + 'T00:00:00Z')
                : new Date('2099-12-31T00:00:00Z');

              const todayStr = new Date().toISOString().split('T')[0];

              // Find the active schedule for this pledge (fallback to donor's active schedule ONLY for the most recent pledge)
              const donorPledgesSorted = pledges;
              const getPaidForPledge = (pledgeId: string) => state.transactions
                .filter(t => t.donorId === donorId && !t.isBatch && t.type === 'approved' && (t.pledgeId === pledgeId || (t.pledgeId === undefined && new Date(t.date + 'T00:00:00Z') >= periodStart && new Date(t.date + 'T00:00:00Z') < periodEnd)))
                .reduce((sum, t) => sum + (t.amountCAD ?? t.amount), 0);
              
              const donorRecurring = state.recurringPayments.filter(r => r.donorId === donorId);
              
              const schedule = state.recurringPayments.find(r => r.pledgeId === p.id && r.active)
                ?? (p.id === donorPledgesSorted[donorPledgesSorted.length - 1]?.id ? donorRecurring.find(r => r.active && !r.pledgeId) : undefined);

              let projectedFuture = 0;
              if (schedule && schedule.amount > 0) {
                let d = new Date(periodStart);
                
                const projectionEnd = new Date(periodStart);
                projectionEnd.setUTCFullYear(projectionEnd.getUTCFullYear() + 1);
                const effectiveProjectionEnd = projectionEnd < periodEnd ? projectionEnd : periodEnd;
                
                const today = new Date(todayStr + 'T00:00:00Z');

                while (d < effectiveProjectionEnd) {
                  // Count as future if the date is >= today, or if it falls anywhere in the current calendar month
                  const isFutureOrCurrentMonth = d >= today || (d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth());
                  
                  if (isFutureOrCurrentMonth) {
                    projectedFuture += schedule.amount;
                  }
                  
                  if (schedule.frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
                  else if (schedule.frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
                  else if (schedule.frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
                  else d.setUTCMonth(d.getUTCMonth() + 3);
                }
              }

              // Sum ONLY approved transactions
              const paymentsInPeriod = state.transactions
                .filter(t => {
                  if (t.donorId !== donorId || t.isBatch) return false;
                  if (t.type !== 'approved') return false;
                  
                  if (t.pledgeId) return t.pledgeId === p.id;
                  const d = new Date(t.date + 'T00:00:00Z');
                  return d >= periodStart && d < periodEnd;
                })
                .reduce((sum, t) => sum + (t.amountCAD ?? t.amount), 0);

              netOwed += (amt - paymentsInPeriod - projectedFuture);
            }

            donorBalanceOwed.set(donorId, netOwed);
          }
        }

        for (const tx of state.transactions) {
          if (tx.type !== 'approved') continue;
          const effectiveAmount = tx.amountCAD ?? tx.amount;

          // Donor totalGiven (for display — all approved txns summed across all years)
          if (tx.donorId && !tx.isBatch) {
             donorTotals.set(tx.donorId, (donorTotals.get(tx.donorId) || 0) + effectiveAmount);
          }

          // Fundraiser Owed
          if (tx.fundraiserId) {
            const f = state.fundraisers.find(f => f.id === tx.fundraiserId);
            if (f) {
              const amountOwed = tx.amount * (f.percentage / 100);
              fundraiserOwed.set(tx.fundraiserId, (fundraiserOwed.get(tx.fundraiserId) || 0) + amountOwed);
            }
          }

          // Accounts
          if (tx.sourceAccountId) {
            // If the transaction was deposited via a batch, it was moved out of Undeposited Funds.
            // Do NOT add it to the Undeposited Funds balance, as the master batch tx already accounts for it in the destination bank.
            const isDepositedFromHolding = tx.sourceAccountId === UNDEPOSITED_FUNDS_ID && tx.depositStatus === 'deposited';
            
            if (!isDepositedFromHolding) {
              const acc = state.accounts.find(a => a.id === tx.sourceAccountId);
              if (acc) {
                const add = (acc.currency === 'CAD' && tx.currency === 'USD') ? effectiveAmount : tx.amount;
                // Debit Source Account
                if (acc.type === 'liability' || acc.type === 'revenue' || acc.type === 'equity') {
                   accountBals.set(tx.sourceAccountId, (accountBals.get(tx.sourceAccountId) || 0) - add);
                } else {
                   accountBals.set(tx.sourceAccountId, (accountBals.get(tx.sourceAccountId) || 0) + add);
                }
              }
            }
          }
          if (tx.offsetAccountId) {
            const acc = state.accounts.find(a => a.id === tx.offsetAccountId);
            if (acc) {
              const add = (acc.currency === 'CAD' && tx.currency === 'USD') ? effectiveAmount : tx.amount;
              // Credit Offset Account
              if (acc.type === 'liability' || acc.type === 'revenue' || acc.type === 'equity') {
                 accountBals.set(tx.offsetAccountId, (accountBals.get(tx.offsetAccountId) || 0) + add);
              } else {
                 accountBals.set(tx.offsetAccountId, (accountBals.get(tx.offsetAccountId) || 0) - add);
              }
            }
          }
        }

        // Bills (Expenses) — also compute payroll balances from isPayroll bills
        for (const b of state.bills) {
          // Payroll tracking: pending = owed, paid = cleared
          if ((b.isPayroll || b.isPayrollExpense) && b.employeeId) {
            if (b.status === 'paid') {
              employeePaid.set(b.employeeId, (employeePaid.get(b.employeeId) || 0) + b.amount);
            } else {
              employeeAccrued.set(b.employeeId, (employeeAccrued.get(b.employeeId) || 0) + b.amount);
            }
          }

          if (b.status === 'paid') {
            if (b.sourceAccountId) {
              const acc = state.accounts.find(a => a.id === b.sourceAccountId);
              if (acc) {
                 const amountCAD = (acc.currency === 'CAD' && b.currency === 'USD') ? (b.amount * (state.exchangeRate || 1.35)) : b.amount;
                 // Credit Source Account (paying the bill)
                 if (acc.type === 'liability' || acc.type === 'revenue' || acc.type === 'equity') {
                   accountBals.set(b.sourceAccountId, (accountBals.get(b.sourceAccountId) || 0) + amountCAD);
                 } else {
                   accountBals.set(b.sourceAccountId, (accountBals.get(b.sourceAccountId) || 0) - amountCAD);
                 }
              }
            }
            if (b.creditAccountId) {
              const acc = state.accounts.find(a => a.id === b.creditAccountId);
              if (acc) {
                 const amountCAD = (acc.currency === 'CAD' && b.currency === 'USD') ? (b.amount * (state.exchangeRate || 1.35)) : b.amount;
                 // User wants creditAccountId to be an INCOMING CREDIT (adds money to the account)
                 if (acc.type === 'liability' || acc.type === 'revenue' || acc.type === 'equity') {
                   accountBals.set(b.creditAccountId, (accountBals.get(b.creditAccountId) || 0) - amountCAD);
                 } else {
                   accountBals.set(b.creditAccountId, (accountBals.get(b.creditAccountId) || 0) + amountCAD);
                 }
              }
            }
            if (b.category) {
              const catAcc = state.accounts.find(a => a.id === b.category);
              if (catAcc) {
                const amountCAD = (catAcc.currency === 'CAD' && b.currency === 'USD') ? (b.amount * (state.exchangeRate || 1.35)) : b.amount;
                // Debit Category Account (expense)
                if (catAcc.type === 'liability' || catAcc.type === 'revenue' || catAcc.type === 'equity') {
                  accountBals.set(b.category, (accountBals.get(b.category) || 0) - amountCAD);
                } else {
                  accountBals.set(b.category, (accountBals.get(b.category) || 0) + amountCAD);
                }
              }
            }
          }
        }

        // Account Transfers
        for (const t of state.accountTransfers) {
          // Credit Source (from)
          if (t.fromAccountId) {
            const acc = state.accounts.find(a => a.id === t.fromAccountId);
            if (acc) {
               if (acc.type === 'liability' || acc.type === 'revenue' || acc.type === 'equity') {
                 accountBals.set(t.fromAccountId, (accountBals.get(t.fromAccountId) || 0) + t.amount);
               } else {
                 accountBals.set(t.fromAccountId, (accountBals.get(t.fromAccountId) || 0) - t.amount);
               }
            }
          }
          // Debit Destination (to)
          if (t.toAccountId) {
            const acc = state.accounts.find(a => a.id === t.toAccountId);
            if (acc) {
               if (acc.type === 'liability' || acc.type === 'revenue' || acc.type === 'equity') {
                 accountBals.set(t.toAccountId, (accountBals.get(t.toAccountId) || 0) - t.amount);
               } else {
                 accountBals.set(t.toAccountId, (accountBals.get(t.toAccountId) || 0) + t.amount);
               }
            }
          }
        }

        // Apply internal transfers for fundraisers
        state.fundraisers.forEach(f => {
          if (f.internalAccountBalance) {
             const current = fundraiserOwed.get(f.id) || 0;
             fundraiserOwed.set(f.id, Math.max(0, current - f.internalAccountBalance));
          }
        });

        const newAccounts = state.accounts.map(a => ({ ...a, balance: accountBals.get(a.id) || 0 }));

        const newDonors = state.donors.map(d => {
           const totalGiven = donorTotals.get(d.id) || 0;
           // donorBalanceOwed is now the NET per-pledge-period balance (payments already subtracted)
           // Do NOT subtract totalGiven again — that would double-count payments
           const balanceOwed = donorBalanceOwed.has(d.id)
             ? donorBalanceOwed.get(d.id)!
             : 0;
           return { ...d, totalGiven, balanceOwed };
        });
        const newFundraisers = state.fundraisers.map(f => ({ ...f, balanceOwed: fundraiserOwed.get(f.id) || 0 }));
        // Employee balanceOwed = accrued (pending bills) - paid. Can be negative = credit.
        const newEmployees = state.employees.map(e => ({
          ...e,
          balanceOwed: (employeeAccrued.get(e.id) || 0) - (employeePaid.get(e.id) || 0)
        }));

        return { accounts: newAccounts, donors: newDonors, fundraisers: newFundraisers, employees: newEmployees };
      }),

      addEmployee: (emp) => set(state => ({ employees: [...state.employees, { ...emp, id: uid(), balanceOwed: 0 }] })),
      editEmployee: (id, updates) => set(state => ({
        employees: state.employees.map(e => e.id === id ? { ...e, ...updates } : e)
      })),
      deleteEmployee: (id) => set(state => ({
        employees: state.employees.filter(e => e.id !== id),
        // optionally clean up related tasks, recurring payroll, etc.
        recurringPayroll: state.recurringPayroll.filter(r => !(r.type === 'employee' && r.entityId === id))
      })),
      payPayrollEntity: (entityId, type, amount) => {
        // balanceOwed is now fully derived from payroll bills by recalculateBalances.
        // This is kept for API compatibility — balance updates happen via recalculate.
        setTimeout(() => get().recalculateBalances(), 0);
      },
      accruePayroll: (entityId, type, amount, earningType, t4aEligible, date) => set(state => {
        let name = '';
        let newState = { ...state };
        if (type === 'employee') {
          const emp = state.employees.find(e => e.id === entityId);
          if (emp) name = emp.name;
          // Do NOT mutate balanceOwed here — recalculateBalances derives it from pending bills
        } else {
          const fund = state.fundraisers.find(f => f.id === entityId);
          if (fund) {
            name = fund.name;
            newState.fundraisers = state.fundraisers.map(f => f.id === entityId
              ? { ...f, balanceOwed: f.balanceOwed + amount, internalAccountBalance: (f.internalAccountBalance || 0) + amount }
              : f);
          }
        }

        // Create a pending payroll bill — this drives the employee's owed balance
        if (name) {
          const newBill: Bill = {
            id: uid(),
            vendor: `Payroll: ${name}`,
            employeeId: entityId,
            amount,
            currency: 'CAD',
            dueDate: date || new Date().toISOString().split('T')[0],
            status: 'pending',
            category: 'Payroll Expense',
            isPayroll: true,
            earningType,
            t4aEligible
          };
          newState.bills = [newBill, ...state.bills];
        }

        return newState;
      }),
      addT4A: (t4a) => set(state => ({ t4aSlips: [...state.t4aSlips, { ...t4a, id: uid(), issuedDate: new Date().toISOString().split('T')[0] }] })),
      editT4A: (id, updates) => set(state => ({ t4aSlips: state.t4aSlips.map(t => t.id === id ? { ...t, ...updates } : t) })),
      deleteT4A: (id) => set(state => ({ t4aSlips: state.t4aSlips.filter(t => t.id !== id) })),

      transferBetweenAccounts: (transfer) => set((state) => {
        const newTransfer = { ...transfer, id: uid() };
        return { accountTransfers: [newTransfer, ...state.accountTransfers] };
      }),
      editAccountTransfer: (id, updates) => {
        set((state) => ({
          accountTransfers: state.accountTransfers.map(t => t.id === id ? { ...t, ...updates } : t)
        }));
        get().recalculateBalances();
      },
      deleteAccountTransfer: (id) => {
        set((state) => ({
          accountTransfers: state.accountTransfers.filter(t => t.id !== id)
        }));
        get().recalculateBalances();
      },

      addBill: (bill) => {
        const id = uid();
        set((state) => ({
          bills: [...state.bills, { ...bill, id }]
        }));
        return id;
      },



      editBill: (id, updates) => {
        set((state) => {
          const newBills = state.bills.map(b => b.id === id ? { ...b, ...updates } : b);
          return { bills: newBills };
        });
        setTimeout(() => get().recalculateBalances(), 0);
      },

      bulkEditBills: (ids, updates) => {
        set((state) => {
          const newBills = state.bills.map(b => ids.includes(b.id) ? { ...b, ...updates } : b);
          return { bills: newBills };
        });
        setTimeout(() => get().recalculateBalances(), 0);
      },

      deleteBills: (ids) => {
        set(state => ({
          bills: state.bills.filter(b => !ids.includes(b.id))
        }));
        setTimeout(() => get().recalculateBalances(), 0);
      },

      addVendor: (vendor) => set((state) => ({
        vendors: [...state.vendors, { ...vendor, id: uid() }]
      })),

      addProject: (proj) => set(state => ({ projects: [...state.projects, { ...proj, id: uid() }] })),
      editProject: (id, updates) => set(state => ({ projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p) })),
      deleteProject: (id) => set(state => ({ projects: state.projects.filter(p => p.id !== id) })),

      addRecurringExpense: (rec) => set(state => ({ recurringExpenses: [...state.recurringExpenses, { ...rec, id: uid() }] })),
      toggleRecurringExpense: (id) => set(state => ({ recurringExpenses: state.recurringExpenses.map(r => r.id === id ? { ...r, active: !r.active } : r) })),
      processRecurringExpenses: () => set(state => {
        const today = new Date().toISOString().split('T')[0];
        let updatedExpenses = [...state.recurringExpenses];
        let newBills = [...state.bills];
        const existingBillIds = new Set(newBills.map(bill => bill.id));
        let hasChanges = false;

        updatedExpenses = updatedExpenses.map(rec => {
          if (!rec.active) return rec;
          let currentNextDate = rec.nextDate;
          let generatedCount = 0;

          while (currentNextDate <= today && generatedCount < 12) {
            const occurrenceId = scheduledOccurrenceId('expense', rec.id, currentNextDate);
            if (!existingBillIds.has(occurrenceId)) {
              newBills.push({
                id: occurrenceId,
                vendor: rec.vendor,
                amount: rec.amount,
                currency: rec.currency || 'CAD',
                dueDate: currentNextDate,
                status: 'pending',
                category: rec.category,
                projectId: rec.projectId,
                creditAccountId: rec.creditAccountId
              });
              existingBillIds.add(occurrenceId);
            }

            const d = new Date(currentNextDate);
            if (rec.frequency === 'weekly') d.setDate(d.getDate() + 7);
            else if (rec.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
            else if (rec.frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
            currentNextDate = d.toISOString().split('T')[0];
            generatedCount++;
            hasChanges = true;
          }

          return { ...rec, nextDate: currentNextDate };
        });

        if (hasChanges) return { bills: newBills, recurringExpenses: updatedExpenses };
        return state;
      }),

      processRecurringPayments: () => set(state => {
        const today = new Date().toISOString().split('T')[0];
        let newTransactions = [...state.transactions];
        const existingTransactionIds = new Set(newTransactions.map(transaction => transaction.id));
        let updatedSchedules = [...state.recurringPayments];
        let hasChanges = false;

        updatedSchedules = updatedSchedules.map(rec => {
          if (!rec.active) return rec;
          
          let currentNextDate = rec.nextDate;
          let generatedCount = 0;
          
          while (currentNextDate <= today && generatedCount < 12) {
            const occurrenceId = scheduledOccurrenceId('payment', rec.id, currentNextDate);
            if (!existingTransactionIds.has(occurrenceId)) {
              newTransactions.push({
                id: occurrenceId,
                donorId: rec.donorId,
                pledgeId: rec.pledgeId,
                amount: rec.amount,
                amountCAD: rec.amount,
                date: currentNextDate,
                type: 'pending',
                method: rec.method,
                currency: rec.currency,
                notes: 'Auto-generated from schedule'
              });
              existingTransactionIds.add(occurrenceId);
            }
            
            const d = new Date(currentNextDate);
            if (rec.frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
            else if (rec.frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
            else if (rec.frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
            else d.setUTCMonth(d.getUTCMonth() + 3);
            
            currentNextDate = d.toISOString().split('T')[0];
            generatedCount++;
          }
          
          let active: boolean = rec.active;
          if (rec.endDate && currentNextDate > rec.endDate) {
            active = false;
          }

          if (currentNextDate !== rec.nextDate || active !== rec.active) {
            hasChanges = true;
            return { ...rec, nextDate: currentNextDate, active };
          }
          return rec;
        });

        if (hasChanges) {
          return { transactions: newTransactions, recurringPayments: updatedSchedules };
        }
        return {};
      }),

      addRecurringPayroll: (payroll) => set(state => ({ recurringPayroll: [{ ...payroll, id: uid() }, ...state.recurringPayroll] })),
      deleteRecurringPayroll: (id) => set(state => ({ recurringPayroll: state.recurringPayroll.filter(p => p.id !== id) })),
      toggleRecurringPayroll: (id) => set(state => ({ recurringPayroll: state.recurringPayroll.map(r => r.id === id ? { ...r, active: !r.active } : r) })),
      processRecurringPayroll: () => {
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        
        const duePayroll = state.recurringPayroll.filter(p => p.active && p.nextDate <= today && p.startDate <= today);
        if (duePayroll.length > 0) {
          set(draft => {
            const newState = { ...draft };
            duePayroll.forEach(p => {
              const occurrenceDate = p.nextDate;
              const occurrenceId = scheduledOccurrenceId('payroll', p.id, occurrenceDate);
              const occurrenceExists = newState.bills.some(bill => bill.id === occurrenceId);
              let name = '';
              if (p.type === 'employee') {
                const emp = newState.employees.find(e => e.id === p.entityId);
                if (emp) name = emp.name;
              } else {
                const fund = newState.fundraisers.find(f => f.id === p.entityId);
                if (fund && !occurrenceExists) {
                  name = fund.name;
                  newState.fundraisers = newState.fundraisers.map(f => f.id === p.entityId
                    ? { ...f, balanceOwed: f.balanceOwed + p.amount, internalAccountBalance: (f.internalAccountBalance || 0) + p.amount }
                    : f);
                }
              }

              // Create a payroll-only bill (visible on Payroll tab, hidden from Expenses page)
              if (name && !occurrenceExists) {
                const newBill: Bill = {
                  id: occurrenceId,
                  vendor: `Payroll: ${name}`,
                  employeeId: p.entityId,
                  amount: p.amount,
                  currency: 'CAD',
                  dueDate: occurrenceDate,
                  status: 'pending',
                  category: 'Payroll Expense',
                  isPayroll: true,
                  earningType: p.earningType,
                  t4aEligible: p.t4aEligible
                };
                newState.bills = [newBill, ...newState.bills];
              }

              const d = new Date(p.nextDate);
              if (p.frequency === 'weekly') d.setDate(d.getDate() + 7);
              else if (p.frequency === 'biweekly') d.setDate(d.getDate() + 14);
              else if (p.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
              
              const updatedP = { ...p, nextDate: d.toISOString().split('T')[0] };
              newState.recurringPayroll = newState.recurringPayroll.map(r => r.id === p.id ? updatedP : r);
            });
            return newState;
          });
        }
      },

      markBillPaid: (id, sourceAccountId, offsetAccountId) => {
        set((state) => {
          const bill = state.bills.find(b => b.id === id);
          if (!bill) return state;

          const finalSource = sourceAccountId || bill.sourceAccountId;
          const finalOffset = offsetAccountId || bill.offsetAccountId;

          // NOTE: account balances are now computed by recalculateBalances
          // We only need to flip the bill to 'paid' status here
          return {
            bills: state.bills.map(b => b.id === id ? { 
              ...b, 
              status: 'paid', 
              paidDate: new Date().toISOString().split('T')[0], 
              sourceAccountId: finalSource, 
              offsetAccountId: finalOffset 
            } : b),
          };
        });
        // Let recalculate derive all balances from scratch
        setTimeout(() => get().recalculateBalances(), 0);
      },

      addTask: (task) => set((state) => ({
        tasks: [{ ...task, id: uid(), createdAt: new Date().toISOString().split('T')[0] }, ...state.tasks]
      })),

      completeTask: (id) => set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? { ...t, completed: true } : t)
      })),

      deleteTask: (id) => set(state => ({
        tasks: state.tasks.filter(t => t.id !== id)
      })),

      matchBankTransaction: (id) => set((state) => ({
        matchedBankTransactions: [...new Set([...state.matchedBankTransactions, id])]
      })),

      autoMatchBankTransactions: () => set(state => {
        let newState = { ...state };
        let newMatched = new Set(newState.matchedBankTransactions);
        
        const currentBankIds = new Set<string>();
        Object.values(newState.bankFeeds).forEach(feed => feed.forEach((t: any) => currentBankIds.add(t.id)));

        // Clean orphaned IDs
        newState.bills = newState.bills.map(b => (b.bankTransactionId && !currentBankIds.has(b.bankTransactionId) ? { ...b, bankTransactionId: undefined } : b));
        newState.accountTransfers = newState.accountTransfers.map(tr => (tr.bankTransactionId && !currentBankIds.has(tr.bankTransactionId) ? { ...tr, bankTransactionId: undefined } : tr));
        newState.transactions = newState.transactions.map(tx => (tx.bankTransactionId && !currentBankIds.has(tx.bankTransactionId) ? { ...tx, bankTransactionId: undefined } : tx));

        Object.keys(newState.bankFeeds).forEach(accountId => {
          newState.bankFeeds[accountId].forEach((t: any) => {
            if (!newMatched.has(t.id)) {
              if (t.amount < 0) {
                const matchingBill = newState.bills.find(b => 
                  b.status === 'paid' && 
                  b.sourceAccountId === accountId && 
                  b.amount === Math.abs(t.amount) &&
                  (b.dueDate === t.date || b.paidDate === t.date) &&
                  !b.bankTransactionId
                );
                if (matchingBill) {
                  matchingBill.bankTransactionId = t.id;
                  newMatched.add(t.id);
                  return;
                }
                const matchingTransfer = newState.accountTransfers.find(tr =>
                  tr.fromAccountId === accountId &&
                  tr.amount === Math.abs(t.amount) &&
                  tr.date === t.date &&
                  !tr.bankTransactionId
                );
                if (matchingTransfer) {
                  matchingTransfer.bankTransactionId = t.id;
                  newMatched.add(t.id);
                  return;
                }
              } else {
                const matchingTx = newState.transactions.find(tx =>
                  tx.type === 'approved' &&
                  tx.sourceAccountId === accountId &&
                  tx.amount === Math.abs(t.amount) &&
                  tx.date === t.date &&
                  !tx.bankTransactionId &&
                  !tx.isBatch
                );
                if (matchingTx) {
                  matchingTx.bankTransactionId = t.id;
                  newMatched.add(t.id);
                  return;
                }
                // Batch deposit
                const matchingBatch = newState.transactions.find(tx =>
                  tx.isBatch &&
                  tx.sourceAccountId === accountId &&
                  tx.amount === Math.abs(t.amount) &&
                  tx.date === t.date &&
                  !tx.bankTransactionId
                );
                if (matchingBatch) {
                  matchingBatch.bankTransactionId = t.id;
                  newMatched.add(t.id);
                  return;
                }
              }
            }
          });
        });

        return { ...newState, matchedBankTransactions: Array.from(newMatched) };
      }),

      unmatchBankTransaction: (id) => set(state => {
        let newState = { ...state };
        
        // 1. Delete matching AccountTransfers and reverse their balance effects
        const transfersToDelete = newState.accountTransfers.filter(t => t.bankTransactionId === id);
        transfersToDelete.forEach(t => {
          newState.accounts = newState.accounts.map(a => {
            if (a.id === t.fromAccountId) return { ...a, balance: a.balance + t.amount };
            if (a.id === t.toAccountId) return { ...a, balance: a.balance - t.amount };
            return a;
          });
        });
        newState.accountTransfers = newState.accountTransfers.filter(t => t.bankTransactionId !== id);

        // 2. Delete matching Transactions and reverse their donor balance / account balance effects
        const txsToDelete = newState.transactions.filter(t => t.bankTransactionId === id);
        txsToDelete.forEach(tx => {
           if (tx.donorId !== 'unknown' && tx.donorId !== 'batch') {
              const f = tx.fundraiserId ? newState.fundraisers.find(fu => fu.id === tx.fundraiserId) : undefined;
              const fPct = f ? f.percentage / 100 : 0;
              newState.donors = newState.donors.map(d => d.id === tx.donorId ? { ...d, totalGiven: d.totalGiven - tx.amount, balanceOwed: d.balanceOwed - tx.amount } : d);
              if (f) {
                 newState.fundraisers = newState.fundraisers.map(fu => fu.id === f.id ? { ...fu, balanceOwed: fu.balanceOwed - (tx.amount * fPct) } : fu);
              }
           }
           if (tx.sourceAccountId) {
              newState.accounts = newState.accounts.map(a => a.id === tx.sourceAccountId ? { ...a, balance: a.balance - tx.amount } : a);
           }
        });
        
        // If it was a batch, we also need to UNLINK the child transactions
        txsToDelete.forEach(tx => {
          if (tx.isBatch) {
             newState.transactions = newState.transactions.map(child => child.batchTransactionId === tx.id ? { ...child, batchTransactionId: undefined } : child);
          }
        });
        newState.transactions = newState.transactions.filter(t => t.bankTransactionId !== id);

        // 3. Delete matching Bills and reverse balances
        const billsToDelete = newState.bills.filter(b => b.bankTransactionId === id);
        billsToDelete.forEach(bill => {
          if (bill.vendor.startsWith('Payroll: ')) {
            const name = bill.vendor.replace('Payroll: ', '');
            const factor = bill.status === 'paid' ? 1 : -1;
            newState.employees = newState.employees.map(e => e.name === name ? { ...e, balanceOwed: e.balanceOwed + (bill.amount * factor) } : e);
            newState.fundraisers = newState.fundraisers.map(f => f.name === name ? { ...f, balanceOwed: f.balanceOwed + (bill.amount * factor) } : f);
          }
          if (bill.status === 'paid' && bill.sourceAccountId) {
             newState.accounts = newState.accounts.map(a => a.id === bill.sourceAccountId ? { ...a, balance: a.balance + bill.amount } : a);
          }
        });
        newState.bills = newState.bills.filter(b => b.bankTransactionId !== id);

        // 4. Finally unmatch
        newState.matchedBankTransactions = newState.matchedBankTransactions.filter(tid => tid !== id);

        return newState;
      }),

      addBatchDeposit: (bankFeedId, internalTxIds, accountId, totalAmount, date, desc) => set((state) => {
        const batchId = uid();
        
        // 1. Create the master batch transaction (the real bank deposit)
        const masterTx: Transaction = {
          id: batchId,
          donorId: 'batch',
          amount: totalAmount,
          date,
          type: 'approved',
          method: 'other',
          currency: 'CAD',
          sourceAccountId: accountId,
          notes: desc,
          isBatch: true,
          bankTransactionId: bankFeedId,
          depositStatus: 'deposited',
        };

        // 2. Mark individual transactions as deposited, keep their original sourceAccountId
        const updatedTxs = state.transactions.map(tx => {
          if (internalTxIds.includes(tx.id)) {
            return { ...tx, batchTransactionId: batchId, depositStatus: 'deposited' as const };
          }
          return tx;
        });

        // 3. Move money: deduct from Undeposited Funds, add to real bank account
        const depositsTotal = internalTxIds.reduce((sum, id) => {
          const t = state.transactions.find(x => x.id === id);
          return sum + (t ? (t.amountCAD ?? t.amount) : 0);
        }, 0);

        const updatedAccounts = state.accounts.map(a => {
          if (a.id === accountId) {
            // Add deposit amount to the real bank account
            return { ...a, balance: a.balance + totalAmount };
          }
          if (a.id === UNDEPOSITED_FUNDS_ID) {
            // Deduct the matched transactions from Undeposited Funds
            return { ...a, balance: Math.max(0, a.balance - depositsTotal) };
          }
          return a;
        });

        return {
          transactions: [...updatedTxs, masterTx],
          accounts: updatedAccounts,
          matchedBankTransactions: [...new Set([...state.matchedBankTransactions, bankFeedId])]
        };
      }),

      markBankTransactionForReview: (id) => set(state => ({
        needsReviewBankTransactions: [...new Set([...state.needsReviewBankTransactions, id])]
      })),

      unmarkBankTransactionForReview: (id) => set(state => ({
        needsReviewBankTransactions: state.needsReviewBankTransactions.filter(tid => tid !== id)
      })),

      setExpenseQueue: (queue) => set({ uploadedExpenseQueue: queue }),
      removeExpenseFromQueue: (id) => set(state => ({ uploadedExpenseQueue: state.uploadedExpenseQueue.filter(x => x.id !== id) })),
    }),
    {
      name: 'charity-store',
      storage: createJSONStorage(() => dualStorage),
    }
  )
);

export const isRemote = { current: false };

const pushEvent = (action: string, args: any[]) => {
  if (isRemote.current) return;
  const state = useStore.getState();
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: state.clientId, action, payload: args })
  }).catch(() => {});
};

export const applyRemoteEvent = (action: string, args: any[]) => {
  isRemote.current = true;
  const store = useStore.getState() as any;
  if (typeof store[action] === 'function') {
    store[action](...(Array.isArray(args) ? args : [args]));
  }
  isRemote.current = false;
};

// Wrap methods for Event Sourcing
const methodsToWrap = [
  'addDonor', 'editDonor', 'updateDonorNotes', 'addSponsorshipDay', 'removeSponsorshipDay', 'deleteDonors', 'recalculateDonorBalances',
  'bulkUpsertDonors',
  'addTransaction', 'bulkAddTransactions', 'updateTransaction', 'editTransaction', 'bulkEditTransactions', 'deleteTransactions', 'deleteAllTransactions',
  'addPledge', 'bulkAddPledges', 'editPledge', 'deletePledges', 'deleteAllPledges',
  'addRecurring', 'bulkAddRecurring', 'toggleRecurring', 'deleteRecurring', 'deleteAllRecurring',
  'dismissSolaRef',
  'addFundraiser', 'payOutFundraiser', 'chargeToFundraiser',
  'addAccount', 'editAccount', 'deleteAccount', 'transferBetweenAccounts',
  'addBill', 'editBill', 'bulkEditBills', 'markBillPaid', 'deleteBills',
  'setBankFeed', 'matchBankTransaction', 'unmatchBankTransaction', 'markBankTransactionForReview', 'unmarkBankTransactionForReview',
  'setGoogleSheetSyncUrl', 'setSolaApiKey', 'setLastSolaSyncDate',
  'addVendor', 'payPayrollEntity', 'accruePayroll',
  'addProject', 'editProject', 'deleteProject',
  'addRecurringExpense', 'toggleRecurringExpense',
  'addTask', 'completeTask', 'deleteTask'
];

const storeState = useStore.getState() as any;
const overrides: any = {};

methodsToWrap.forEach(method => {
  if (typeof storeState[method] === 'function') {
    const original = storeState[method];
    overrides[method] = (...args: any[]) => {
      if (!isRemote.current) {
        // Auto-generate IDs for single 'add' methods if missing so the event matches the local state
        if (method.startsWith('add') && args[0] && typeof args[0] === 'object' && !args[0].id) {
            args[0].id = uid();
        }

        if (method === 'bulkAddTransactions' && Array.isArray(args[0])) {
          const txs = args[0];
          txs.forEach((tx: any) => { if (!tx.id) tx.id = uid(); });
          for (let i = 0; i < txs.length; i += 500) {
            pushEvent('bulkAddTransactions', [txs.slice(i, i + 500)]);
          }
        } else if (method === 'bulkUpsertDonors' && Array.isArray(args[0])) {
          const donorsArr = args[0];
          for (let i = 0; i < donorsArr.length; i += 500) {
            pushEvent('bulkUpsertDonors', [donorsArr.slice(i, i + 500)]);
          }
        } else {
          pushEvent(method, args);
        }
      }
      return original(...args);
    };
  }
});

useStore.setState(overrides);

