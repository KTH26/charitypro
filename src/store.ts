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
  batchTransactionId?: string; // Links individual tx to a master batch tx
  isBatch?: boolean; // True if this is the master batch tx
  projectId?: string;
  pledgeId?: string;
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
}

export interface RecurringPayment {
  id: string;
  donorId: string;
  pledgeId?: string;
  amount: number;
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
  bankTransactionId?: string;
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

interface AppState {
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
  dismissedSolaRefs: string[];

  toggleRtl: () => void;
  setCurrency: (currency: 'CAD' | 'USD') => void;
  setExchangeRate: (rate: number) => void;
  setGoogleSheetSyncUrl: (url: string) => void;
  setSolaApiKey: (key: string) => void;
  setLastSolaSyncDate: (date: string) => void;
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
  recalculateDonorBalances: () => void;
  
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  bulkAddTransactions: (txs: Omit<Transaction, 'id'>[]) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  editTransaction: (id: string, updates: Partial<Omit<Transaction, 'id'>>) => void;
  bulkEditTransactions: (ids: string[], updates: Partial<Omit<Transaction, 'id'>>) => void;
  deleteTransactions: (ids: string[]) => void;
  deleteAllTransactions: () => void;
  removeDuplicateTransactions: () => { count: number };

  addPledge: (pledge: Omit<Pledge, 'id'>) => void;
  bulkAddPledges: (pledges: Omit<Pledge, 'id'>[]) => void;
  editPledge: (id: string, updates: Partial<Omit<Pledge, 'id'>>) => void;
  deletePledges: (ids: string[]) => void;
  deleteAllPledges: () => void;

  addRecurring: (rec: Omit<RecurringPayment, 'id'>) => void;
  bulkAddRecurring: (recs: Omit<RecurringPayment, 'id'>[]) => void;
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
  accruePayroll: (entityId: string, type: 'employee' | 'fundraiser', amount: number, earningType?: string, t4aEligible?: boolean) => void;
  addT4A: (t4a: Omit<T4A, 'id' | 'issuedDate'>) => void;

  addAccount: (acc: Omit<Account, 'id'> | Account) => void;
  editAccount: (id: string, updates: Partial<Omit<Account, 'id'>>) => void;
  deleteAccount: (id: string) => void;
  transferBetweenAccounts: (transfer: Omit<AccountTransfer, 'id'>) => void;

  addBill: (bill: Omit<Bill, 'id'>) => string;
  editBill: (id: string, updates: Partial<Omit<Bill, 'id'>>) => void;
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
  markBankTransactionForReview: (id: string) => void;
  unmarkBankTransactionForReview: (id: string) => void;
  addBatchDeposit: (bankFeedId: string, internalTxIds: string[], accountId: string, totalAmount: number, date: string, desc: string) => void;
}

const mockTasks: Task[] = [
  { id: 'task1', donorId: '2', title: 'Follow up on pending check', notes: 'Check #1042 from Yitzchok Cohen has not cleared yet.', dueDate: '2025-06-28', priority: 'high', type: 'call', completed: false, createdAt: '2025-06-22' },
  { id: 'task2', donorId: '3', title: 'Collect outstanding balance $1,200', notes: 'Chaim has an open balance from March pledge.', dueDate: '2025-07-05', priority: 'high', type: 'call', completed: false, createdAt: '2025-06-20' },
  { id: 'task3', donorId: '1', title: 'Send thank you for $1,000 donation', dueDate: '2025-06-25', priority: 'low', type: 'email', completed: false, createdAt: '2025-06-21' },
];

let nextId = 200;
export const uid = () => String(++nextId);

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

    // 2. No local data → first-ever load → pull from cloud
    try {
      const res = await fetch('/api/sync');
      if (!res.ok) return null;
      const data = await res.json();
      if (data.value) {
        // Seed IndexedDB so the next reload is instant
        await idbSet(name, data.value);
      }
      return data.value ?? null;
    } catch (e) {
      return null;
    }
  },

  setItem: async (name, value): Promise<void> => {
    // 🛡️ HYDRATION LOCK: Prevent empty default states from overwriting cloud data
    try {
      const parsed = JSON.parse(value);
      if (parsed?.state?.donors?.length > 0) {
        localStorage.setItem('has_data_ever', 'true');
      }
      if (parsed?.state?.donors?.length === 0 && localStorage.getItem('has_data_ever') === 'true') {
        console.error("FATAL: Attempted to overwrite database with empty state! Blocked by Hydration Lock.");
        return; 
      }
    } catch (e) {}

    // Always write to IndexedDB immediately (supports massive data sizes)
    await idbSet(name, value);

    // Also push to cloud in the background (don't await — never block the UI)
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }).catch(e => console.error('Cloud sync failed (local data is safe):', e));
  },

  removeItem: async (name): Promise<void> => {
    await idbDel(name);
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
      tasks: mockTasks,
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
      dismissedSolaRefs: [],

      toggleRtl: () => set((state) => ({ isRtl: !state.isRtl })),
      setCurrency: (currency) => set({ currency }),
      setExchangeRate: (rate) => set({ exchangeRate: rate }),
      setGoogleSheetSyncUrl: (url) => set({ googleSheetSyncUrl: url }),
      setSolaApiKey: (key) => set({ solaApiKey: key }),
      setLastSolaSyncDate: (date) => set({ lastSolaSyncDate: date }),
      dismissSolaRef: (ref) => set((state) => ({ dismissedSolaRefs: [...state.dismissedSolaRefs, ref] })),
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

      recalculateDonorBalances: () => set(state => {
        // Build totals from actual data
        const totalGivenMap = new Map<string, number>();
        const balanceOwedMap = new Map<string, number>();

        // Sum up approved transactions → totalGiven
        for (const tx of state.transactions) {
          if (tx.type === 'approved' && !tx.isBatch) {
            const amt = tx.amountCAD ?? tx.amount;
            totalGivenMap.set(tx.donorId, (totalGivenMap.get(tx.donorId) || 0) + amt);
          }
        }

        // Sum up pledges → total pledged, then balance = pledged - paid
        for (const p of state.pledges) {
          const amt = p.amountCAD ?? p.amount;
          balanceOwedMap.set(p.donorId, (balanceOwedMap.get(p.donorId) || 0) + amt);
        }

        const updatedDonors = state.donors.map(d => {
          const totalGiven = totalGivenMap.get(d.id) || 0;
          const totalPledged = balanceOwedMap.get(d.id) || 0;
          const balanceOwed = Math.max(0, totalPledged - totalGiven);
          return { ...d, totalGiven, balanceOwed };
        });

        return { donors: updatedDonors };
      }),

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

      addTransaction: (tx) => set((state) => {
        const goesToUndeposited = UNDEPOSITED_METHODS.has(tx.method);
        const depositStatus = goesToUndeposited ? 'undeposited' as const : 'direct' as const;
        // For undeposited methods: route sourceAccount to Undeposited Funds
        const effectiveSourceId = goesToUndeposited ? UNDEPOSITED_FUNDS_ID : tx.sourceAccountId;
        const newTx = { ...tx, id: uid(), depositStatus, sourceAccountId: effectiveSourceId };
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
      }),

      bulkAddTransactions: (txs) => set((state) => {
        const newTxs = txs.map(tx => {
          const goesToUndeposited = UNDEPOSITED_METHODS.has(tx.method);
          const effectiveSourceId = goesToUndeposited ? UNDEPOSITED_FUNDS_ID : tx.sourceAccountId;
          return {
            ...tx,
            id: uid(),
            invoiceSaved: false,
            depositStatus: goesToUndeposited ? 'undeposited' as const : 'direct' as const,
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
      }),

      updateTransaction: (id, updates) => set((state) => ({
        transactions: state.transactions.map(t => t.id === id ? { ...t, ...updates } : t)
      })),

      editTransaction: (id, updates) => set((state) => ({
        transactions: state.transactions.map(t => t.id === id ? { ...t, ...updates } : t)
      })),

      bulkEditTransactions: (ids, updates) => set((state) => ({
        transactions: state.transactions.map(t => ids.includes(t.id) ? { ...t, ...updates } : t)
      })),

      deleteTransactions: (ids) => set(state => ({
        transactions: state.transactions.filter(t => !ids.includes(t.id))
      })),

      deleteAllTransactions: () => set(state => {
        const resetDonors = state.donors.map(d => ({ ...d, totalGiven: 0 }));
        return { transactions: [], donors: resetDonors };
      }),

      addPledge: (pledge) => set(state => ({
        pledges: [{ ...pledge, id: uid() }, ...state.pledges],
        donors: state.donors.map(d => d.id === pledge.donorId
          ? { ...d, balanceOwed: d.balanceOwed + (pledge.amountCAD ?? pledge.amount) }
          : d)
      })),

      bulkAddPledges: (pledgesArr) => set(state => {
        const newPledges = pledgesArr.map(p => ({ ...p, id: (p as any).id || uid() }));
        const donorUpdates = new Map<string, number>();
        for (const p of newPledges) {
          donorUpdates.set(p.donorId, (donorUpdates.get(p.donorId) || 0) + (p.amountCAD ?? p.amount));
        }
        const updatedDonors = state.donors.map(d => {
          if (!donorUpdates.has(d.id)) return d;
          return { ...d, balanceOwed: d.balanceOwed + donorUpdates.get(d.id)! };
        });
        return {
          pledges: [...newPledges, ...state.pledges].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
          donors: updatedDonors
        };
      }),

      editPledge: (id, updates) => set(state => ({
        pledges: state.pledges.map(p => p.id === id ? { ...p, ...updates } : p)
      })),

      deletePledges: (ids) => set(state => {
        const toDelete = state.pledges.filter(p => ids.includes(p.id));
        const donorUpdates = new Map<string, number>();
        for (const p of toDelete) {
          donorUpdates.set(p.donorId, (donorUpdates.get(p.donorId) || 0) + (p.amountCAD ?? p.amount));
        }
        const updatedDonors = state.donors.map(d => {
          if (!donorUpdates.has(d.id)) return d;
          return { ...d, balanceOwed: Math.max(0, d.balanceOwed - donorUpdates.get(d.id)!) };
        });
        return {
          pledges: state.pledges.filter(p => !ids.includes(p.id)),
          donors: updatedDonors
        };
      }),

      deleteAllPledges: () => set(state => ({
        pledges: [],
        donors: state.donors.map(d => ({ ...d, balanceOwed: 0 }))
      })),

      removeDuplicateTransactions: () => {
        let countRemoved = 0;
        set(state => {
          const seen = new Set<string>();
          const toDelete = new Set<string>();
          
          for (const tx of state.transactions) {
            // Include category and method to be safe
            const hash = `${tx.donorId}-${tx.amount}-${tx.date}-${tx.type}-${tx.method}-${tx.currency}-${tx.category || ''}`;
            if (seen.has(hash)) {
              toDelete.add(tx.id);
            } else {
              seen.add(hash);
            }
          }

          if (toDelete.size === 0) return state;

          const updatedTxs = state.transactions.filter(t => !toDelete.has(t.id));
          
          const donorUpdates = new Map<string, { totalGiven: number, balanceOwed: number }>();
          const accountUpdates = new Map<string, number>();

          for (const tx of state.transactions) {
            if (toDelete.has(tx.id)) {
               countRemoved++;
               const effectiveAmount = tx.amountCAD ?? tx.amount;
               const dUpdate = donorUpdates.get(tx.donorId) || { totalGiven: 0, balanceOwed: 0 };
               if (tx.type === 'approved') dUpdate.totalGiven -= effectiveAmount;
               donorUpdates.set(tx.donorId, dUpdate);

               if (tx.type === 'approved') {
                 if (tx.sourceAccountId) accountUpdates.set(tx.sourceAccountId, (accountUpdates.get(tx.sourceAccountId) || 0) - tx.amount);
                 if (tx.offsetAccountId) accountUpdates.set(tx.offsetAccountId, (accountUpdates.get(tx.offsetAccountId) || 0) - tx.amount);
               }
            }
          }

          const updatedDonors = state.donors.map(d => {
            if (!donorUpdates.has(d.id)) return d;
            const u = donorUpdates.get(d.id)!;
            return { ...d, totalGiven: d.totalGiven + u.totalGiven, balanceOwed: Math.max(0, d.balanceOwed + u.balanceOwed) };
          });
          
          const updatedAccounts = state.accounts.map(a => {
            if (!accountUpdates.has(a.id)) return a;
            return { ...a, balance: a.balance + accountUpdates.get(a.id)! };
          });

          return { transactions: updatedTxs, donors: updatedDonors, accounts: updatedAccounts };
        });
        return { count: countRemoved };
      },

      addRecurring: (rec) => set((state) => ({
        recurringPayments: [...state.recurringPayments, { ...rec, id: uid() }]
      })),

      bulkAddRecurring: (recs) => set((state) => ({
        recurringPayments: [...state.recurringPayments, ...recs.map(r => ({ ...r, id: (r as any).id || uid() }))]
      })),

      toggleRecurring: (id) => set((state) => ({
        recurringPayments: state.recurringPayments.map(r => r.id === id ? { ...r, active: !r.active } : r)
      })),

      deleteRecurring: (ids) => set((state) => ({
        recurringPayments: state.recurringPayments.filter(r => !ids.includes(r.id))
      })),

      deleteAllRecurring: () => set({ recurringPayments: [] }),

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

      addAccount: (acc) => set((state) => ({
        accounts: [...state.accounts, { ...acc, id: (acc as any).id || uid() }]
      })),
      editAccount: (id, updates) => set((state) => ({
        accounts: state.accounts.map(a => a.id === id ? { ...a, ...updates } : a)
      })),
      deleteAccount: (id) => set(state => ({
        accounts: state.accounts.filter(a => a.id !== id)
      })),

      checkSystemAccounts: () => set(state => {
        if (!state.accounts.some(a => a.id === UNDEPOSITED_FUNDS_ID)) {
          return {
            accounts: [
              ...state.accounts,
              {
                id: UNDEPOSITED_FUNDS_ID,
                name: 'Undeposited Funds',
                currency: 'CAD',
                balance: 0,
                type: 'asset',
                subType: 'general',
              }
            ]
          };
        }
        return {};
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
      payPayrollEntity: (entityId, type, amount) => set(state => {
        if (type === 'employee') {
          return { employees: state.employees.map(e => e.id === entityId ? { ...e, balanceOwed: e.balanceOwed - amount } : e) };
        } else {
          return { fundraisers: state.fundraisers.map(f => f.id === entityId ? { ...f, balanceOwed: f.balanceOwed - amount, internalAccountBalance: (f.internalAccountBalance || 0) - amount } : f) };
        }
      }),
      accruePayroll: (entityId, type, amount, earningType, t4aEligible) => set(state => {
        let name = '';
        let newState = { ...state };
        if (type === 'employee') {
          const emp = state.employees.find(e => e.id === entityId);
          if (emp) name = emp.name;
          newState.employees = state.employees.map(e => e.id === entityId ? { ...e, balanceOwed: e.balanceOwed + amount } : e);
        } else {
          const fund = state.fundraisers.find(f => f.id === entityId);
          if (fund) name = fund.name;
          newState.fundraisers = state.fundraisers.map(f => f.id === entityId ? { ...f, balanceOwed: f.balanceOwed + amount, internalAccountBalance: (f.internalAccountBalance || 0) + amount } : f);
        }

        // Create an unpaid Bill to act as the accrual for the ledger
        const newBill: Bill = {
          id: uid(),
          vendor: `Payroll: ${name}`,
          amount: amount,
          currency: 'CAD',
          dueDate: new Date().toISOString().split('T')[0],
          status: 'pending',
          category: 'Payroll Expense',
          earningType,
          t4aEligible
        };
        newState.bills = [newBill, ...state.bills];

        return newState;
      }),
      addT4A: (t4a) => set(state => ({ t4aSlips: [...state.t4aSlips, { ...t4a, id: uid(), issuedDate: new Date().toISOString().split('T')[0] }] })),

      transferBetweenAccounts: (transfer) => set((state) => {
      const newTransfer = { ...transfer, id: uid() };
        const updatedAccounts = state.accounts.map(a => {
          if (a.id === transfer.fromAccountId) return { ...a, balance: a.balance - transfer.amount };
          if (a.id === transfer.toAccountId) return { ...a, balance: a.balance + transfer.amount };
          return a;
        });
        return { accounts: updatedAccounts, accountTransfers: [newTransfer, ...state.accountTransfers] };
      }),

      addBill: (bill) => {
        const id = uid();
        set((state) => ({
          bills: [...state.bills, { ...bill, id }]
        }));
        return id;
      },



      editBill: (id, updates) => set((state) => {
        const bill = state.bills.find(b => b.id === id);
        if (!bill) return state;

        let newState = { ...state };
        let diff = (updates.amount !== undefined ? updates.amount : bill.amount) - bill.amount;

        if (diff !== 0 && bill.vendor.startsWith('Payroll: ')) {
          const name = bill.vendor.replace('Payroll: ', '');
          
          // If pending, increasing amount increases balanceOwed
          // If paid, increasing amount means we paid MORE, so we decrease balanceOwed
          const factor = bill.status === 'paid' ? -1 : 1;
          const adjustedDiff = diff * factor;

          newState.employees = newState.employees.map(e => e.name === name ? { ...e, balanceOwed: e.balanceOwed + adjustedDiff } : e);
          newState.fundraisers = newState.fundraisers.map(f => f.name === name ? { ...f, balanceOwed: f.balanceOwed + adjustedDiff } : f);
        }

        newState.bills = newState.bills.map(b => b.id === id ? { ...b, ...updates } : b);
        return newState;
      }),

      deleteBills: (ids) => set(state => {
        let newState = { ...state };
        const billsToDelete = newState.bills.filter(b => ids.includes(b.id));

        billsToDelete.forEach(bill => {
          if (bill.vendor.startsWith('Payroll: ')) {
            const name = bill.vendor.replace('Payroll: ', '');
            // Deleting pending earning = subtract from balanceOwed
            // Deleting paid payment = add back to balanceOwed
            const factor = bill.status === 'paid' ? 1 : -1;
            
            newState.employees = newState.employees.map(e => e.name === name ? { ...e, balanceOwed: e.balanceOwed + (bill.amount * factor) } : e);
            newState.fundraisers = newState.fundraisers.map(f => f.name === name ? { ...f, balanceOwed: f.balanceOwed + (bill.amount * factor) } : f);
          }
          
          // Refund bank account if it was paid
          if (bill.status === 'paid' && bill.sourceAccountId) {
             newState.accounts = newState.accounts.map(a => a.id === bill.sourceAccountId ? { ...a, balance: a.balance + bill.amount } : a);
          }
        });

        newState.bills = newState.bills.filter(b => !ids.includes(b.id));
        return newState;
      }),

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
        let hasChanges = false;

        updatedExpenses = updatedExpenses.map(rec => {
          if (!rec.active) return rec;
          let currentNextDate = rec.nextDate;
          let generatedCount = 0;

          while (currentNextDate <= today && generatedCount < 12) {
            newBills.push({
              id: uid(),
              vendor: rec.vendor,
              amount: rec.amount,
              currency: rec.currency || 'CAD',
              dueDate: currentNextDate,
              status: 'pending',
              category: rec.category,
              projectId: rec.projectId,
              creditAccountId: rec.creditAccountId
            });

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
        let updatedSchedules = [...state.recurringPayments];
        let hasChanges = false;

        updatedSchedules = updatedSchedules.map(rec => {
          if (!rec.active) return rec;
          
          let currentNextDate = rec.nextDate;
          let generatedCount = 0;
          
          while (currentNextDate <= today && generatedCount < 12) {
            newTransactions.push({
              id: uid(),
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
              let name = '';
              if (p.type === 'employee') {
                const emp = newState.employees.find(e => e.id === p.entityId);
                if (emp) {
                  name = emp.name;
                  newState.employees = newState.employees.map(e => e.id === p.entityId ? { ...e, balanceOwed: e.balanceOwed + p.amount } : e);
                }
              } else {
                const fund = newState.fundraisers.find(f => f.id === p.entityId);
                if (fund) {
                  name = fund.name;
                  newState.fundraisers = newState.fundraisers.map(f => f.id === p.entityId ? { ...f, balanceOwed: f.balanceOwed + p.amount, internalAccountBalance: (f.internalAccountBalance || 0) + p.amount } : f);
                }
              }

              if (name) {
                const newBill: Bill = {
                  id: uid(),
                  vendor: `Payroll: ${name}`,
                  amount: p.amount,
                  currency: 'CAD',
                  dueDate: today,
                  status: 'pending',
                  category: 'Payroll Expense',
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

      markBillPaid: (id, sourceAccountId, offsetAccountId) => set((state) => {
        const bill = state.bills.find(b => b.id === id);
        if (!bill) return state;

        const finalSource = sourceAccountId || bill.sourceAccountId;
        const finalOffset = offsetAccountId || bill.offsetAccountId;

        let updatedAccounts = state.accounts.map(a => {
          let newBalance = a.balance;
          if (a.id === finalSource) newBalance -= bill.amount;
          if (a.id === finalOffset) newBalance += bill.amount;
          if (a.id === bill.creditAccountId) newBalance -= bill.amount;
          return { ...a, balance: newBalance };
        });

        let updatedFundraisers = state.fundraisers;
        let updatedEmployees = state.employees;

        if (bill.vendor.startsWith('Payroll: ')) {
          const name = bill.vendor.replace('Payroll: ', '');
          updatedEmployees = state.employees.map(e => e.name === name ? { ...e, balanceOwed: e.balanceOwed - bill.amount } : e);
          updatedFundraisers = state.fundraisers.map(f => f.name === name ? { ...f, balanceOwed: f.balanceOwed - bill.amount } : f);
        }

        const offsetAcc = state.accounts.find(a => a.id === offsetAccountId);
        if (offsetAcc && offsetAcc.linkedFundraiserId) {
          updatedFundraisers = updatedFundraisers.map(f => f.id === offsetAcc.linkedFundraiserId
            ? { ...f, balanceOwed: f.balanceOwed - (bill?.amount || 0), internalAccountBalance: (f.internalAccountBalance || 0) + (bill?.amount || 0) }
            : f);
        }

        return {
          bills: state.bills.map(b => b.id === id ? { ...b, status: 'paid', paidDate: new Date().toISOString().split('T')[0], sourceAccountId: finalSource, offsetAccountId: finalOffset } : b),
          accounts: updatedAccounts,
          fundraisers: updatedFundraisers,
          employees: updatedEmployees
        };
      }),

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

      addBatchDeposit: (bankFeedId, internalTxIds, accountId, totalAmount, date, desc) => set(state => {
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
  'addBill', 'editBill', 'markBillPaid', 'deleteBills',
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
        if (method === 'bulkAddTransactions' && Array.isArray(args[0])) {
          const txs = args[0];
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

