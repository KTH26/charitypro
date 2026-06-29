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
  type: 'approved' | 'pending' | 'recording' | 'declined';
  method: 'credit_card' | 'check' | 'cash' | 'e_transfer' | 'vouchers' | 'eizer' | 'bnei_leivy' | 'other';
  currency: 'CAD' | 'USD';
  sourceAccountId?: string; // e.g. Bank Account (Asset)
  offsetAccountId?: string; // e.g. Category/Fundraiser Payroll (Revenue/Expense)
  fundraiserId?: string;
  category?: string; // Keeping for legacy string tags
  sponsor?: string;
  notes?: string;
  invoiceSaved?: boolean;
}

export interface RecurringPayment {
  id: string;
  donorId: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextDate: string;
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
  subType?: 'checking' | 'savings' | 'credit_card' | 'loan' | 'payroll' | 'general' | 'internal';
  linkedFundraiserId?: string;
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
}

export type DonorSortKey = 'lastName' | 'firstName' | 'hebLastName' | 'hebFirstName';

interface AppState {
  clientId: string;
  lastEventId: number;
  isRtl: boolean;
  currency: 'CAD' | 'USD';
  exchangeRate: number;
  donorSortBy: DonorSortKey;
  donors: Donor[];
  transactions: Transaction[];
  recurringPayments: RecurringPayment[];
  fundraisers: Fundraiser[];
  accounts: Account[];
  bills: Bill[];
  tasks: Task[];
  accountTransfers: AccountTransfer[];
  matchedBankTransactions: string[];
  googleSheetSyncUrl: string;
  solaApiKey: string;
  lastSolaSyncDate: string;
  bankFeeds: Record<string, any[]>;
  employees: Employee[];
  t4aSlips: T4A[];
  vendors: Vendor[];

  toggleRtl: () => void;
  setCurrency: (currency: 'CAD' | 'USD') => void;
  setExchangeRate: (rate: number) => void;
  setGoogleSheetSyncUrl: (url: string) => void;
  setSolaApiKey: (key: string) => void;
  setLastSolaSyncDate: (date: string) => void;
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
  deleteTransactions: (ids: string[]) => void;
  deleteAllTransactions: () => void;

  addRecurring: (rec: Omit<RecurringPayment, 'id'>) => void;
  toggleRecurring: (id: string) => void;

  addFundraiser: (f: Omit<Fundraiser, 'id' | 'balanceOwed'>) => void;
  payOutFundraiser: (id: string) => void;
  chargeToFundraiser: (id: string, amount: number) => void;

  addEmployee: (emp: Omit<Employee, 'id' | 'balanceOwed'>) => void;
  payPayrollEntity: (entityId: string, type: 'employee' | 'fundraiser', amount: number) => void;
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

  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;

  matchBankTransaction: (id: string) => void;
}

const mockDonors: Donor[] = [
  { id: '1', displayId: 'D-1001', firstName: 'Yitzchok', lastName: 'Cohen', name: 'Yitzchok Cohen', phone: '514-555-0101', email: 'yitzchok@example.com', address: '123 Outremont Ave, Montreal, QC', totalGiven: 12500, balanceOwed: 0, 
    notes: 'Prefers to be contacted on Sundays.',
    cards: [{ id: 'c1', last4: '4242', brand: 'Visa', expiry: '12/26', isDefault: true }]
  },
  { id: '2', displayId: 'D-1002', firstName: 'Avraham', lastName: 'Schwartz', name: 'Avraham Schwartz', phone: '514-555-0202', email: 'avraham.s@example.com', address: '456 Parc Ave, Montreal, QC', totalGiven: 3200, balanceOwed: 500, notes: '', fundraiserId: 'f1',
    cards: [{ id: 'c2', last4: '1111', brand: 'Mastercard', expiry: '09/25', isDefault: true }]
  },
  { id: '3', displayId: 'D-1003', firstName: 'Chaim', lastName: 'Levy', name: 'Chaim Levy', phone: '514-555-0303', email: 'clevy@example.com', address: '789 Bernard St, Montreal, QC', totalGiven: 850, balanceOwed: 0, notes: 'Met at the 2025 Gala.' },
  { id: '4', displayId: 'D-1004', firstName: 'David', lastName: 'Rosen', name: 'David Rosen', phone: '514-555-0404', email: 'drosen@example.com', address: '321 Van Horne Ave, Montreal, QC', totalGiven: 15000, balanceOwed: 2500, notes: '', fundraiserId: 'f2' },
  { id: '5', displayId: 'D-1005', firstName: 'Eli', lastName: 'Friedman', name: 'Eli Friedman', phone: '514-555-0505', email: 'eli@example.com', address: '654 Vimy Ave, Montreal, QC', totalGiven: 450, balanceOwed: 0, notes: '' },
];

const mockAccounts: Account[] = [
  { id: 'a1', name: 'BMO Canadian Account', currency: 'CAD', balance: 124500, type: 'asset', subType: 'checking' },
  { id: 'a2', name: 'Chase USD Account', currency: 'USD', balance: 45200, type: 'asset', subType: 'checking' },
  { id: 'a3', name: 'Fundraiser Payroll – Moshe Weiss', currency: 'CAD', balance: 1200, type: 'expense', subType: 'payroll', linkedFundraiserId: 'f1' },
  { id: 'a4', name: 'Fundraiser Payroll – David Klein', currency: 'CAD', balance: 500, type: 'expense', subType: 'payroll', linkedFundraiserId: 'f2' },
  { id: 'a5', name: 'General Donations', currency: 'CAD', balance: 250000, type: 'revenue', subType: 'general' },
  { id: 'a6', name: 'Building Fund', currency: 'CAD', balance: 150000, type: 'revenue', subType: 'general' },
  { id: 'a7', name: 'Ambulance Operations Expense', currency: 'CAD', balance: 45000, type: 'expense', subType: 'general' },
  { id: 'a8', name: 'Office Rent Expense', currency: 'CAD', balance: 24000, type: 'expense', subType: 'general' },
];

const mockTransactions: Transaction[] = [
  { id: 't1', donorId: '1', amount: 1000, date: '2025-06-20', type: 'approved', method: 'credit_card', currency: 'CAD', sourceAccountId: 'a1', offsetAccountId: 'a5', fundraiserId: 'f1', category: 'General' },
  { id: 't2', donorId: '2', amount: 500, date: '2025-06-21', type: 'pending', method: 'check', currency: 'CAD', sourceAccountId: 'a1', offsetAccountId: 'a5', fundraiserId: 'f2', category: 'General' },
  { id: 't3', donorId: '3', amount: 100, date: '2025-06-22', type: 'recording', method: 'credit_card', currency: 'USD', amountCAD: 135, sourceAccountId: 'a2', offsetAccountId: 'a6', category: 'Campaign' },
  { id: 't4', donorId: '1', amount: 500, date: '2025-05-20', type: 'approved', method: 'credit_card', currency: 'CAD', sourceAccountId: 'a1', offsetAccountId: 'a5', category: 'General' },
  { id: 't6', donorId: '4', amount: 2000, date: '2025-04-05', type: 'approved', method: 'e_transfer', currency: 'CAD', sourceAccountId: 'a1', offsetAccountId: 'a6', category: 'Building Fund' },
];

const mockRecurring: RecurringPayment[] = [
  { id: 'r1', donorId: '1', amount: 500, frequency: 'monthly', nextDate: '2025-07-20', method: 'credit_card', currency: 'CAD', active: true },
  { id: 'r2', donorId: '3', amount: 100, frequency: 'monthly', nextDate: '2025-07-22', method: 'credit_card', currency: 'USD', active: true },
];

const mockFundraisers: Fundraiser[] = [
  { id: 'f1', name: 'Moshe Weiss', email: 'moshe@example.com', phone: '416-555-0300', percentage: 10, balanceOwed: 450, internalAccountBalance: 1200 },
  { id: 'f2', name: 'David Klein', email: 'david@example.com', phone: '416-555-0301', percentage: 15, balanceOwed: 1200, internalAccountBalance: 500 },
];

const mockBills: Bill[] = [
  { id: 'b1', vendor: 'Hatzolah Maintenance', amount: 1250.00, dueDate: '2025-07-01', status: 'pending', category: 'Ambulance Operations', sourceAccountId: 'a1', offsetAccountId: 'a7' },
  { id: 'b2', vendor: 'Fuel Supplier', amount: 3400.00, dueDate: '2025-06-25', status: 'urgent', category: 'Ambulance Operations', sourceAccountId: 'a1', offsetAccountId: 'a7' },
  { id: 'b3', vendor: 'Office Rent', amount: 2000.00, dueDate: '2025-07-05', status: 'pending', category: 'Administration', sourceAccountId: 'a1', offsetAccountId: 'a8' },
];

const mockTasks: Task[] = [
  { id: 'task1', donorId: '2', title: 'Follow up on pending check', notes: 'Check #1042 from Yitzchok Cohen has not cleared yet.', dueDate: '2025-06-28', priority: 'high', type: 'call', completed: false, createdAt: '2025-06-22' },
  { id: 'task2', donorId: '3', title: 'Collect outstanding balance $1,200', notes: 'Chaim has an open balance from March pledge.', dueDate: '2025-07-05', priority: 'high', type: 'call', completed: false, createdAt: '2025-06-20' },
  { id: 'task3', donorId: '1', title: 'Send thank you for $1,000 donation', dueDate: '2025-06-25', priority: 'low', type: 'email', completed: false, createdAt: '2025-06-21' },
];

let nextId = 200;
const uid = () => String(++nextId);

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
    (set) => ({
      clientId: Math.random().toString(36).substr(2, 9),
      lastEventId: 0,
      isRtl: false,
      currency: 'CAD',
      exchangeRate: 1.35,
      donorSortBy: 'lastName',
      donors: [],
      transactions: [],
      recurringPayments: [],
      fundraisers: [],
      accounts: [],
      bills: [],
      tasks: mockTasks,
      accountTransfers: [],
      matchedBankTransactions: [],
      googleSheetSyncUrl: '',
      solaApiKey: '',
      lastSolaSyncDate: '',
      bankFeeds: {},
      employees: [],
      t4aSlips: [],
      vendors: [],

      toggleRtl: () => set((state) => ({ isRtl: !state.isRtl })),
      setCurrency: (currency) => set({ currency }),
      setExchangeRate: (rate) => set({ exchangeRate: rate }),
      setGoogleSheetSyncUrl: (url) => set({ googleSheetSyncUrl: url }),
      setSolaApiKey: (key) => set({ solaApiKey: key }),
      setLastSolaSyncDate: (date) => set({ lastSolaSyncDate: date }),
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
        const newTx = { ...tx, id: uid() };
        const effectiveAmount = tx.amountCAD ?? tx.amount;
        const updatedDonors = state.donors.map(d => {
          if (d.id !== tx.donorId) return d;
          if (tx.type === 'approved') return { ...d, totalGiven: d.totalGiven + effectiveAmount };
          if (tx.type === 'recording') return { ...d, balanceOwed: Math.max(0, d.balanceOwed - effectiveAmount) };
          return d;
        });

        let updatedAccounts = state.accounts;
        if (tx.type === 'approved') {
          updatedAccounts = updatedAccounts.map(a => {
            let newBalance = a.balance;
            const amountToAdd = (a.currency === 'CAD' && tx.currency === 'USD') ? effectiveAmount : tx.amount;
            if (a.id === tx.sourceAccountId) newBalance += amountToAdd;
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
        const newTxs = txs.map(tx => ({ ...tx, id: uid(), invoiceSaved: false }));
        
        let updatedDonors = [...state.donors];
        let updatedAccounts = [...state.accounts];
        let updatedFundraisers = [...state.fundraisers];
        
        // Maps to accumulate changes and apply them efficiently
        const donorUpdates = new Map<string, { totalGiven: number, balanceOwed: number }>();
        const accountUpdates = new Map<string, number>();
        const fundraiserUpdates = new Map<string, number>();

        for (const tx of txs) {
          const effectiveAmount = tx.amountCAD ?? tx.amount;
          
          // Accumulate donor updates
          const dUpdate = donorUpdates.get(tx.donorId) || { totalGiven: 0, balanceOwed: 0 };
          if (tx.type === 'approved') dUpdate.totalGiven += effectiveAmount;
          if (tx.type === 'recording') dUpdate.balanceOwed -= effectiveAmount; // We will adjust the base later
          donorUpdates.set(tx.donorId, dUpdate);

          // Accumulate account updates
          if (tx.type === 'approved') {
            const amountToAdd = tx.amount; // Simplify since this is batch processing. (The original code had a bug where it just checked if a.currency === CAD and tx.currency === USD, but in bulk it's better to just add).
            // Actually, wait, let's keep exact same logic as original
            
            if (tx.sourceAccountId) {
              const acc = updatedAccounts.find(a => a.id === tx.sourceAccountId);
              if (acc) {
                const add = (acc.currency === 'CAD' && tx.currency === 'USD') ? effectiveAmount : tx.amount;
                accountUpdates.set(tx.sourceAccountId, (accountUpdates.get(tx.sourceAccountId) || 0) + add);
              }
            }
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
          transactions: [...newTxs, ...state.transactions],
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

      deleteTransactions: (ids) => set(state => ({
        transactions: state.transactions.filter(t => !ids.includes(t.id))
      })),

      deleteAllTransactions: () => set(state => {
        // Only safely delete transactions, without touching donors or accounts
        // We'll reset the totalGiven balances on donors to 0 if we wipe the ledger?
        // Wait, yes, deleting the ledger means totalGiven should be recalculated or reset.
        const resetDonors = state.donors.map(d => ({ ...d, totalGiven: 0 }));
        return { transactions: [], donors: resetDonors };
      }),

      addRecurring: (rec) => set((state) => ({
        recurringPayments: [...state.recurringPayments, { ...rec, id: uid() }]
      })),

      toggleRecurring: (id) => set((state) => ({
        recurringPayments: state.recurringPayments.map(r => r.id === id ? { ...r, active: !r.active } : r)
      })),

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

      addEmployee: (emp) => set(state => ({ employees: [...state.employees, { ...emp, id: uid(), balanceOwed: 0 }] })),
      payPayrollEntity: (entityId, type, amount) => set(state => {
        if (type === 'employee') {
          return { employees: state.employees.map(e => e.id === entityId ? { ...e, balanceOwed: Math.max(0, e.balanceOwed - amount) } : e) };
        } else {
          return { fundraisers: state.fundraisers.map(f => f.id === entityId ? { ...f, balanceOwed: Math.max(0, f.balanceOwed - amount), internalAccountBalance: (f.internalAccountBalance || 0) - amount } : f) };
        }
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



      editBill: (id, updates) => set((state) => ({
        bills: state.bills.map(b => b.id === id ? { ...b, ...updates } : b)
      })),

      deleteBills: (ids) => set(state => ({
        bills: state.bills.filter(b => !ids.includes(b.id))
      })),

      addVendor: (vendor) => set((state) => ({
        vendors: [...state.vendors, { ...vendor, id: uid() }]
      })),

      markBillPaid: (id, sourceAccountId, offsetAccountId) => set((state) => {
        const bill = state.bills.find(b => b.id === id);
        if (!bill) return state;

        const finalSource = sourceAccountId || bill.sourceAccountId;
        const finalOffset = offsetAccountId || bill.offsetAccountId;

        let updatedAccounts = state.accounts.map(a => {
          let newBalance = a.balance;
          if (a.id === finalSource) newBalance -= bill.amount;
          if (a.id === finalOffset) newBalance += bill.amount;
          return { ...a, balance: newBalance };
        });

        let updatedFundraisers = state.fundraisers;
        const offsetAcc = state.accounts.find(a => a.id === offsetAccountId);
        if (offsetAcc && offsetAcc.linkedFundraiserId) {
          updatedFundraisers = state.fundraisers.map(f => f.id === offsetAcc.linkedFundraiserId
            ? { ...f, balanceOwed: Math.max(0, f.balanceOwed - (bill?.amount || 0)), internalAccountBalance: (f.internalAccountBalance || 0) + (bill?.amount || 0) }
            : f);
        }

        return {
          bills: state.bills.map(b => b.id === id ? { ...b, status: 'paid', paidDate: new Date().toISOString().split('T')[0], sourceAccountId, offsetAccountId } : b),
          accounts: updatedAccounts,
          fundraisers: updatedFundraisers
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
        matchedBankTransactions: [...state.matchedBankTransactions, id]
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
  'addDonor', 'editDonor', 'updateDonorNotes', 'addSponsorshipDay', 'removeSponsorshipDay', 'deleteDonors',
  'bulkUpsertDonors',
  'addTransaction', 'bulkAddTransactions', 'updateTransaction', 'editTransaction', 'deleteTransactions', 'deleteAllTransactions',
  'addRecurring', 'toggleRecurring',
  'addFundraiser', 'payOutFundraiser', 'chargeToFundraiser',
  'addAccount', 'editAccount', 'deleteAccount', 'transferBetweenAccounts',
  'addBill', 'editBill', 'markBillPaid', 'deleteBills',
  'addTask', 'completeTask', 'deleteTask',
  'matchBankTransaction'
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

