import { create } from 'zustand';

export interface Donor {
  id: string;
  displayId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  totalGiven: number;
  balanceOwed: number;
  fundraiserId?: string;
  notes?: string;
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
  bankAccountId?: string;
  fundraiserId?: string;
  category?: string;
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
  internalAccountBalance?: number; // expenses charged to fundraiser account
}

export interface BankAccount {
  id: string;
  name: string;
  currency: 'CAD' | 'USD';
  balance: number;
  type: 'checking' | 'savings' | 'internal';
  isInternal?: boolean; // hidden internal accounts for fundraiser tracking
  linkedFundraiserId?: string;
}

export interface Bill {
  id: string;
  vendor: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'urgent' | 'paid' | 'scheduled';
  category: string;
  bankAccountId?: string;
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

interface AppState {
  isRtl: boolean;
  currency: 'CAD' | 'USD';
  exchangeRate: number;
  donors: Donor[];
  transactions: Transaction[];
  recurringPayments: RecurringPayment[];
  fundraisers: Fundraiser[];
  bankAccounts: BankAccount[];
  bills: Bill[];
  tasks: Task[];
  accountTransfers: AccountTransfer[];

  toggleRtl: () => void;
  setCurrency: (currency: 'CAD' | 'USD') => void;
  setExchangeRate: (rate: number) => void;

  // Donor actions
  addDonor: (donor: Omit<Donor, 'id' | 'displayId' | 'name' | 'totalGiven' | 'balanceOwed'>) => void;
  updateDonorNotes: (donorId: string, notes: string) => void;
  addSponsorshipDay: (donorId: string, day: Omit<SponsorshipDay, 'id'>) => void;
  removeSponsorshipDay: (donorId: string, dayId: string) => void;

  // Transaction actions
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;

  // Recurring actions
  addRecurring: (rec: Omit<RecurringPayment, 'id'>) => void;
  toggleRecurring: (id: string) => void;

  // Fundraiser actions
  addFundraiser: (f: Omit<Fundraiser, 'id' | 'balanceOwed'>) => void;
  payOutFundraiser: (id: string) => void;
  chargeToFundraiser: (id: string, amount: number) => void;

  // Bank account actions
  addBankAccount: (acc: Omit<BankAccount, 'id'>) => void;
  transferBetweenAccounts: (transfer: Omit<AccountTransfer, 'id'>) => void;

  // Bill actions
  addBill: (bill: Omit<Bill, 'id'>) => void;
  markBillPaid: (id: string, bankAccountId?: string) => void;

  // Task actions
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
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

const mockTransactions: Transaction[] = [
  { id: 't1', donorId: '1', amount: 1000, date: '2025-06-20', type: 'approved', method: 'credit_card', currency: 'CAD', bankAccountId: 'ba1', fundraiserId: 'f1', category: 'General' },
  { id: 't2', donorId: '2', amount: 500, date: '2025-06-21', type: 'pending', method: 'check', currency: 'CAD', bankAccountId: 'ba1', fundraiserId: 'f2', category: 'General' },
  { id: 't3', donorId: '3', amount: 100, date: '2025-06-22', type: 'recording', method: 'credit_card', currency: 'USD', amountCAD: 135, bankAccountId: 'ba2', category: 'Campaign' },
  { id: 't4', donorId: '1', amount: 500, date: '2025-05-20', type: 'approved', method: 'credit_card', currency: 'CAD', bankAccountId: 'ba1', category: 'General' },
  { id: 't5', donorId: '3', amount: 1200, date: '2025-05-10', type: 'declined', method: 'credit_card', currency: 'CAD', category: 'General', notes: 'Card expired – moved to backup' },
  { id: 't6', donorId: '4', amount: 2000, date: '2025-04-05', type: 'approved', method: 'e_transfer', currency: 'CAD', bankAccountId: 'ba1', category: 'Building Fund' },
  { id: 't7', donorId: '1', amount: 2000, date: '2024-12-01', type: 'approved', method: 'check', currency: 'CAD', bankAccountId: 'ba1', category: 'General' },
  { id: 't8', donorId: '1', amount: 10000, date: '2024-03-15', type: 'approved', method: 'credit_card', currency: 'CAD', bankAccountId: 'ba1', category: 'General' },
  { id: 't9', donorId: '2', amount: 1500, date: '2024-08-10', type: 'approved', method: 'cash', currency: 'CAD', bankAccountId: 'ba1', category: 'General' },
  { id: 't10', donorId: '3', amount: 3500, date: '2024-01-20', type: 'approved', method: 'check', currency: 'CAD', bankAccountId: 'ba1', category: 'Building Fund' },
  { id: 't11', donorId: '4', amount: 3800, date: '2024-06-01', type: 'approved', method: 'e_transfer', currency: 'CAD', bankAccountId: 'ba1', category: 'General' },
];

const mockRecurring: RecurringPayment[] = [
  { id: 'r1', donorId: '1', amount: 500, frequency: 'monthly', nextDate: '2025-07-20', method: 'credit_card', currency: 'CAD', active: true },
  { id: 'r2', donorId: '3', amount: 100, frequency: 'monthly', nextDate: '2025-07-22', method: 'credit_card', currency: 'USD', active: true },
];

const mockFundraisers: Fundraiser[] = [
  { id: 'f1', name: 'Moshe Weiss', email: 'moshe@example.com', phone: '416-555-0300', percentage: 10, balanceOwed: 450, internalAccountBalance: 1200 },
  { id: 'f2', name: 'David Klein', email: 'david@example.com', phone: '416-555-0301', percentage: 15, balanceOwed: 1200, internalAccountBalance: 500 },
];

const mockBankAccounts: BankAccount[] = [
  { id: 'ba1', name: 'BMO Canadian Account', currency: 'CAD', balance: 124500, type: 'checking' },
  { id: 'ba2', name: 'Chase USD Account', currency: 'USD', balance: 45200, type: 'checking' },
  { id: 'ba3', name: 'Internal – Moshe Weiss', currency: 'CAD', balance: 1200, type: 'internal', isInternal: true, linkedFundraiserId: 'f1' },
  { id: 'ba4', name: 'Internal – David Klein', currency: 'CAD', balance: 500, type: 'internal', isInternal: true, linkedFundraiserId: 'f2' },
];

const mockBills: Bill[] = [
  { id: 'b1', vendor: 'Hatzolah Maintenance', amount: 1250.00, dueDate: '2025-07-01', status: 'pending', category: 'Ambulance Operations', bankAccountId: 'ba1' },
  { id: 'b2', vendor: 'Fuel Supplier', amount: 3400.00, dueDate: '2025-06-25', status: 'urgent', category: 'Ambulance Operations', bankAccountId: 'ba1' },
  { id: 'b3', vendor: 'Office Rent', amount: 2000.00, dueDate: '2025-07-05', status: 'pending', category: 'Administration', bankAccountId: 'ba1' },
  { id: 'b4', vendor: 'Annual Insurance', amount: 8500.00, dueDate: '2025-08-01', status: 'scheduled', category: 'Administration', bankAccountId: 'ba1', isScheduled: true },
];

const mockTasks: Task[] = [
  { id: 'task1', donorId: '2', title: 'Follow up on pending check', notes: 'Check #1042 from Yitzchok Cohen has not cleared yet.', dueDate: '2025-06-28', priority: 'high', type: 'call', completed: false, createdAt: '2025-06-22' },
  { id: 'task2', donorId: '3', title: 'Collect outstanding balance $1,200', notes: 'Chaim has an open balance from March pledge.', dueDate: '2025-07-05', priority: 'high', type: 'call', completed: false, createdAt: '2025-06-20' },
  { id: 'task3', donorId: '1', title: 'Send thank you for $1,000 donation', dueDate: '2025-06-25', priority: 'low', type: 'email', completed: false, createdAt: '2025-06-21' },
  { id: 'task4', title: 'Pay Fuel Supplier bill', notes: 'URGENT - overdue', dueDate: '2025-06-25', priority: 'high', type: 'payment', completed: false, createdAt: '2025-06-22' },
];

let nextId = 200;
const uid = () => String(++nextId);

export const useStore = create<AppState>((set) => ({
  isRtl: false,
  currency: 'CAD',
  exchangeRate: 0.74,
  donors: mockDonors,
  transactions: mockTransactions,
  recurringPayments: mockRecurring,
  fundraisers: mockFundraisers,
  bankAccounts: mockBankAccounts,
  bills: mockBills,
  tasks: mockTasks,
  accountTransfers: [],

  toggleRtl: () => set((state) => ({ isRtl: !state.isRtl })),
  setCurrency: (currency) => set({ currency }),
  setExchangeRate: (rate) => set({ exchangeRate: rate }),

  addDonor: (donor) => set(state => {
    // Generate a new sequential Display ID like D-1006
    const nextNum = 1001 + state.donors.length;
    const displayId = `D-${nextNum}`;
    const name = `${donor.firstName} ${donor.lastName}`.trim();
    return {
      donors: [...state.donors, { ...donor, id: Math.random().toString(), displayId, name, totalGiven: 0, balanceOwed: 0, cards: [], sponsorshipDays: [] }]
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
    const updatedDonors = state.donors.map(d => {
      if (d.id !== tx.donorId) return d;
      if (tx.type === 'approved') return { ...d, totalGiven: d.totalGiven + tx.amount };
      if (tx.type === 'recording') return { ...d, balanceOwed: Math.max(0, d.balanceOwed - tx.amount) };
      return d;
    });
    // Update bank account balance
    const updatedAccounts = tx.bankAccountId && tx.type === 'approved'
      ? state.bankAccounts.map(a => a.id === tx.bankAccountId ? { ...a, balance: a.balance + tx.amount } : a)
      : state.bankAccounts;
    // Update fundraiser balance if applicable
    const updatedFundraisers = tx.fundraiserId && tx.type === 'approved'
      ? state.fundraisers.map(f => f.id === tx.fundraiserId
          ? { ...f, balanceOwed: f.balanceOwed + (tx.amount * f.percentage / 100) }
          : f)
      : state.fundraisers;
    return { transactions: [newTx, ...state.transactions], donors: updatedDonors, bankAccounts: updatedAccounts, fundraisers: updatedFundraisers };
  }),

  updateTransaction: (id, updates) => set((state) => ({
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

  addBankAccount: (acc) => set((state) => ({
    bankAccounts: [...state.bankAccounts, { ...acc, id: uid() }]
  })),

  transferBetweenAccounts: (transfer) => set((state) => {
    const newTransfer = { ...transfer, id: uid() };
    const updatedAccounts = state.bankAccounts.map(a => {
      if (a.id === transfer.fromAccountId) return { ...a, balance: a.balance - transfer.amount };
      if (a.id === transfer.toAccountId) return { ...a, balance: a.balance + transfer.amount };
      return a;
    });
    return { bankAccounts: updatedAccounts, accountTransfers: [newTransfer, ...state.accountTransfers] };
  }),

  addBill: (bill) => set((state) => ({
    bills: [...state.bills, { ...bill, id: uid() }]
  })),

  markBillPaid: (id, bankAccountId) => set((state) => {
    const bill = state.bills.find(b => b.id === id);
    const updatedAccounts = bankAccountId && bill
      ? state.bankAccounts.map(a => a.id === bankAccountId ? { ...a, balance: a.balance - bill.amount } : a)
      : state.bankAccounts;
    return {
      bills: state.bills.map(b => b.id === id ? { ...b, status: 'paid', paidDate: new Date().toISOString().split('T')[0] } : b),
      bankAccounts: updatedAccounts
    };
  }),

  addTask: (task) => set((state) => ({
    tasks: [{ ...task, id: uid(), createdAt: new Date().toISOString().split('T')[0] }, ...state.tasks]
  })),

  completeTask: (id) => set((state) => ({
    tasks: state.tasks.map(t => t.id === id ? { ...t, completed: true } : t)
  })),

  deleteTask: (id) => set((state) => ({
    tasks: state.tasks.filter(t => t.id !== id)
  })),
}));
