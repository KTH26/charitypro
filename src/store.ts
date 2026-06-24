import { create } from 'zustand';

export interface Donor {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  totalGiven: number;
  balanceOwed: number;
  fundraiserId?: string;
  notes?: string;
  cards?: PaymentCard[];
}

export interface PaymentCard {
  id: string;
  last4: string;
  brand: string;
  expiry: string;
  isDefault: boolean;
}

export interface Transaction {
  id: string;
  donorId: string;
  amount: number;
  date: string;
  type: 'approved' | 'pending' | 'recording' | 'declined';
  method: 'credit_card' | 'check' | 'cash' | 'e_transfer';
  currency: 'CAD' | 'USD';
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
}

export interface Bill {
  id: string;
  vendor: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'urgent' | 'paid';
  category: string;
}

interface AppState {
  isRtl: boolean;
  currency: 'CAD' | 'USD';
  donors: Donor[];
  transactions: Transaction[];
  recurringPayments: RecurringPayment[];
  fundraisers: Fundraiser[];
  bills: Bill[];

  toggleRtl: () => void;
  setCurrency: (currency: 'CAD' | 'USD') => void;

  // Donor actions
  addDonor: (donor: Omit<Donor, 'id' | 'totalGiven' | 'balanceOwed'>) => void;
  updateDonorNotes: (donorId: string, notes: string) => void;

  // Transaction actions
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;

  // Recurring actions
  addRecurring: (rec: Omit<RecurringPayment, 'id'>) => void;
  toggleRecurring: (id: string) => void;

  // Fundraiser actions
  addFundraiser: (f: Omit<Fundraiser, 'id' | 'balanceOwed'>) => void;
  payOutFundraiser: (id: string) => void;

  // Bill actions
  addBill: (bill: Omit<Bill, 'id'>) => void;
  markBillPaid: (id: string) => void;
}

const mockDonors: Donor[] = [
  {
    id: '1', name: 'Avraham Schwartz', email: 'avraham@example.com', phone: '416-555-0198',
    address: '123 Main St, Toronto, ON', totalGiven: 12500, balanceOwed: 0, fundraiserId: 'f1',
    notes: 'Long-time supporter. Prefers to be called on Sunday mornings.',
    cards: [
      { id: 'c1', last4: '4242', brand: 'Visa', expiry: '12/26', isDefault: true },
      { id: 'c2', last4: '5555', brand: 'Mastercard', expiry: '08/25', isDefault: false },
    ]
  },
  {
    id: '2', name: 'Yitzchok Cohen', email: 'yitz@example.com', phone: '416-555-0122',
    address: '456 Oak Rd, Montreal, QC', totalGiven: 3200, balanceOwed: 500, fundraiserId: 'f2',
    notes: '',
    cards: [
      { id: 'c3', last4: '1111', brand: 'Visa', expiry: '03/27', isDefault: true },
    ]
  },
  {
    id: '3', name: 'Chaim Levy', email: 'chaim@example.com', phone: '416-555-0144',
    address: '789 Pine Ln, Toronto, ON', totalGiven: 8400, balanceOwed: 1200, fundraiserId: 'f1',
    notes: 'Check bounced once in 2024. Verify before processing large amounts.',
    cards: []
  },
  {
    id: '4', name: 'Shlomo Greenberg', email: 'shlomo@example.com', phone: '514-555-0199',
    address: '22 Cedar Ave, Ottawa, ON', totalGiven: 5800, balanceOwed: 0,
    notes: '',
    cards: [
      { id: 'c4', last4: '9900', brand: 'Amex', expiry: '06/28', isDefault: true },
    ]
  },
];

const mockTransactions: Transaction[] = [
  { id: 't1', donorId: '1', amount: 1000, date: '2025-06-20', type: 'approved', method: 'credit_card', currency: 'CAD', fundraiserId: 'f1', category: 'General' },
  { id: 't2', donorId: '2', amount: 500, date: '2025-06-21', type: 'pending', method: 'check', currency: 'CAD', fundraiserId: 'f2', category: 'General' },
  { id: 't3', donorId: '3', amount: 100, date: '2025-06-22', type: 'recording', method: 'credit_card', currency: 'USD', category: 'Campaign' },
  { id: 't4', donorId: '1', amount: 500, date: '2025-05-20', type: 'approved', method: 'credit_card', currency: 'CAD', category: 'General' },
  { id: 't5', donorId: '3', amount: 1200, date: '2025-05-10', type: 'declined', method: 'credit_card', currency: 'CAD', category: 'General', notes: 'Card expired – moved to backup' },
  { id: 't6', donorId: '4', amount: 2000, date: '2025-04-05', type: 'approved', method: 'e_transfer', currency: 'CAD', category: 'Building Fund' },
];

const mockRecurring: RecurringPayment[] = [
  { id: 'r1', donorId: '1', amount: 500, frequency: 'monthly', nextDate: '2025-07-20', method: 'credit_card', currency: 'CAD', active: true },
  { id: 'r2', donorId: '3', amount: 100, frequency: 'monthly', nextDate: '2025-07-22', method: 'credit_card', currency: 'USD', active: true },
];

const mockFundraisers: Fundraiser[] = [
  { id: 'f1', name: 'Moshe Weiss', email: 'moshe@example.com', phone: '416-555-0300', percentage: 10, balanceOwed: 450 },
  { id: 'f2', name: 'David Klein', email: 'david@example.com', phone: '416-555-0301', percentage: 15, balanceOwed: 1200 },
];

const mockBills: Bill[] = [
  { id: 'b1', vendor: 'Hatzolah Maintenance', amount: 1250.00, dueDate: '2025-07-01', status: 'pending', category: 'Ambulance Operations' },
  { id: 'b2', vendor: 'Fuel Supplier', amount: 3400.00, dueDate: '2025-06-25', status: 'urgent', category: 'Ambulance Operations' },
  { id: 'b3', vendor: 'Office Rent', amount: 2000.00, dueDate: '2025-07-05', status: 'pending', category: 'Administration' },
  { id: 'b4', vendor: 'Fundraising Event Costs', amount: 800.00, dueDate: '2025-07-10', status: 'pending', category: 'Fundraising' },
];

let nextId = 100;
const uid = () => String(++nextId);

export const useStore = create<AppState>((set) => ({
  isRtl: false,
  currency: 'CAD',
  donors: mockDonors,
  transactions: mockTransactions,
  recurringPayments: mockRecurring,
  fundraisers: mockFundraisers,
  bills: mockBills,

  toggleRtl: () => set((state) => ({ isRtl: !state.isRtl })),
  setCurrency: (currency) => set({ currency }),

  addDonor: (donor) => set((state) => ({
    donors: [...state.donors, { ...donor, id: uid(), totalGiven: 0, balanceOwed: 0, cards: [] }]
  })),

  updateDonorNotes: (donorId, notes) => set((state) => ({
    donors: state.donors.map(d => d.id === donorId ? { ...d, notes } : d)
  })),

  addTransaction: (tx) => set((state) => {
    const newTx = { ...tx, id: uid() };
    const updatedDonors = state.donors.map(d => {
      if (d.id !== tx.donorId) return d;
      const newTotal = tx.type === 'approved' ? d.totalGiven + tx.amount : d.totalGiven;
      const newBalance = tx.type === 'approved' ? Math.max(0, d.balanceOwed - tx.amount) : d.balanceOwed + tx.amount;
      return { ...d, totalGiven: newTotal, balanceOwed: tx.type === 'recording' ? newBalance : d.balanceOwed };
    });
    return { transactions: [newTx, ...state.transactions], donors: updatedDonors };
  }),

  addRecurring: (rec) => set((state) => ({
    recurringPayments: [...state.recurringPayments, { ...rec, id: uid() }]
  })),

  toggleRecurring: (id) => set((state) => ({
    recurringPayments: state.recurringPayments.map(r => r.id === id ? { ...r, active: !r.active } : r)
  })),

  addFundraiser: (f) => set((state) => ({
    fundraisers: [...state.fundraisers, { ...f, id: uid(), balanceOwed: 0 }]
  })),

  payOutFundraiser: (id) => set((state) => ({
    fundraisers: state.fundraisers.map(f => f.id === id ? { ...f, balanceOwed: 0 } : f)
  })),

  addBill: (bill) => set((state) => ({
    bills: [...state.bills, { ...bill, id: uid() }]
  })),

  markBillPaid: (id) => set((state) => ({
    bills: state.bills.map(b => b.id === id ? { ...b, status: 'paid' } : b)
  })),
}));
