import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

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
  method: 'credit_card' | 'check' | 'cash' | 'e_transfer';
  currency: 'CAD' | 'USD';
  sourceAccountId?: string; // e.g. Bank Account (Asset)
  offsetAccountId?: string; // e.g. Category/Fundraiser Payroll (Revenue/Expense)
  fundraiserId?: string;
  category?: string; // Keeping for legacy string tags
  sponsor?: string;
  notes?: string;
}

export interface RecurringPayment {
  id: string;
  donorId: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextDate: string;
  method: 'credit_card' | 'check' | 'cash' | 'e_transfer';
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
}

export interface Bill {
  id: string;
  vendor: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'urgent' | 'paid' | 'scheduled';
  category: string;
  sourceAccountId?: string; // Where it's paid from
  offsetAccountId?: string; // What expense it's allocated to
  isScheduled?: boolean;
  paidDate?: string;
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

  toggleRtl: () => void;
  setCurrency: (currency: 'CAD' | 'USD') => void;
  setExchangeRate: (rate: number) => void;
  setGoogleSheetSyncUrl: (url: string) => void;
  setSolaApiKey: (key: string) => void;
  setLastSolaSyncDate: (date: string) => void;
  setDonorSortBy: (key: DonorSortKey) => void;

  addDonor: (donor: Omit<Donor, 'id' | 'name' | 'totalGiven' | 'balanceOwed'> | Omit<Donor, 'id' | 'displayId' | 'name' | 'totalGiven' | 'balanceOwed'>) => void;
  editDonor: (id: string, updates: Partial<Omit<Donor, 'id' | 'name' | 'totalGiven' | 'balanceOwed'>>) => void;
  updateDonorNotes: (donorId: string, notes: string) => void;
  addSponsorshipDay: (donorId: string, day: Omit<SponsorshipDay, 'id'>) => void;
  removeSponsorshipDay: (donorId: string, dayId: string) => void;

  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  editTransaction: (id: string, updates: Partial<Omit<Transaction, 'id'>>) => void;

  addRecurring: (rec: Omit<RecurringPayment, 'id'>) => void;
  toggleRecurring: (id: string) => void;

  addFundraiser: (f: Omit<Fundraiser, 'id' | 'balanceOwed'>) => void;
  payOutFundraiser: (id: string) => void;
  chargeToFundraiser: (id: string, amount: number) => void;

  addAccount: (acc: Omit<Account, 'id'>) => void;
  transferBetweenAccounts: (transfer: Omit<AccountTransfer, 'id'>) => void;

  addBill: (bill: Omit<Bill, 'id'>) => void;
  editBill: (id: string, updates: Partial<Omit<Bill, 'id'>>) => void;
  markBillPaid: (id: string, sourceAccountId?: string, offsetAccountId?: string) => void;

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
const dualStorage: StateStorage = {
  getItem: async (name): Promise<string | null> => {
    // 1. Try localStorage first — instant, synchronous-like
    const local = localStorage.getItem(name);
    if (local) return local;

    // 2. No local data → first-ever load → pull from cloud
    try {
      const res = await fetch('/api/sync');
      if (!res.ok) return null;
      const data = await res.json();
      if (data.value) {
        // Seed localStorage so the next reload is instant
        localStorage.setItem(name, data.value);
      }
      return data.value ?? null;
    } catch (e) {
      return null;
    }
  },

  setItem: async (name, value): Promise<void> => {
    // Always write to localStorage immediately (synchronous, never fails)
    localStorage.setItem(name, value);

    // Also push to cloud in the background (don't await — never block the UI)
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }).catch(e => console.error('Cloud sync failed (local data is safe):', e));
  },

  removeItem: async (name): Promise<void> => {
    localStorage.removeItem(name);
  },
};

export const useStore = create<AppState>()(
  persist(
    (set) => ({
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

      toggleRtl: () => set((state) => ({ isRtl: !state.isRtl })),
      setCurrency: (currency) => set({ currency }),
      setExchangeRate: (rate) => set({ exchangeRate: rate }),
      setGoogleSheetSyncUrl: (url) => set({ googleSheetSyncUrl: url }),
      setSolaApiKey: (key) => set({ solaApiKey: key }),
      setLastSolaSyncDate: (date) => set({ lastSolaSyncDate: date }),
      setDonorSortBy: (key) => set({ donorSortBy: key }),

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

      updateTransaction: (id, updates) => set((state) => ({
        transactions: state.transactions.map(t => t.id === id ? { ...t, ...updates } : t)
      })),

      editTransaction: (id, updates) => set((state) => ({
        transactions: state.transactions.map(t => t.id === id ? { ...t, ...updates } : t)
      })),

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
        accounts: [...state.accounts, { ...acc, id: uid() }]
      })),

      transferBetweenAccounts: (transfer) => set((state) => {
      const newTransfer = { ...transfer, id: uid() };
        const updatedAccounts = state.accounts.map(a => {
          if (a.id === transfer.fromAccountId) return { ...a, balance: a.balance - transfer.amount };
          if (a.id === transfer.toAccountId) return { ...a, balance: a.balance + transfer.amount };
          return a;
        });
        return { accounts: updatedAccounts, accountTransfers: [newTransfer, ...state.accountTransfers] };
      }),

      addBill: (bill) => set((state) => ({
        bills: [...state.bills, { ...bill, id: uid() }]
      })),

      editBill: (id, updates) => set((state) => ({
        bills: state.bills.map(b => b.id === id ? { ...b, ...updates } : b)
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
        const offsetAcc = state.accounts.find(a => a.id === finalOffset);
        if (offsetAcc && offsetAcc.linkedFundraiserId) {
          updatedFundraisers = state.fundraisers.map(f => f.id === offsetAcc.linkedFundraiserId
            ? { ...f, balanceOwed: Math.max(0, f.balanceOwed - bill.amount), internalAccountBalance: (f.internalAccountBalance || 0) + bill.amount }
            : f);
        }

        return {
          bills: state.bills.map(b => b.id === id ? { ...b, status: 'paid', paidDate: new Date().toISOString().split('T')[0], sourceAccountId: finalSource, offsetAccountId: finalOffset } : b),
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
