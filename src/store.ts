import { create } from 'zustand';

export interface Donor {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  totalGiven: number;
  balanceOwed: number;
}

export interface Transaction {
  id: string;
  donorId: string;
  amount: number;
  date: string;
  type: 'approved' | 'pending' | 'recording' | 'declined';
  method: 'credit_card' | 'check' | 'cash';
  currency: 'CAD' | 'USD';
  fundraiserId?: string;
  category?: string;
}

export interface Fundraiser {
  id: string;
  name: string;
  percentage: number;
  balanceOwed: number;
}

interface AppState {
  isRtl: boolean;
  currency: 'CAD' | 'USD';
  donors: Donor[];
  transactions: Transaction[];
  fundraisers: Fundraiser[];
  toggleRtl: () => void;
  setCurrency: (currency: 'CAD' | 'USD') => void;
}

const mockDonors: Donor[] = [
  { id: '1', name: 'Avraham Schwartz', email: 'avraham@example.com', phone: '416-555-0198', address: '123 Main St, Toronto', totalGiven: 12500, balanceOwed: 0 },
  { id: '2', name: 'Yitzchok Cohen', email: 'yitz@example.com', phone: '416-555-0122', address: '456 Oak Rd, Montreal', totalGiven: 3200, balanceOwed: 500 },
  { id: '3', name: 'Chaim Levy', email: 'chaim@example.com', phone: '416-555-0144', address: '789 Pine Ln, Toronto', totalGiven: 8400, balanceOwed: 1200 },
];

const mockTransactions: Transaction[] = [
  { id: 't1', donorId: '1', amount: 1000, date: '2025-06-20', type: 'approved', method: 'credit_card', currency: 'CAD' },
  { id: 't2', donorId: '2', amount: 500, date: '2025-06-21', type: 'pending', method: 'check', currency: 'CAD' },
  { id: 't3', donorId: '3', amount: 100, date: '2025-06-22', type: 'recording', method: 'credit_card', currency: 'USD' },
];

const mockFundraisers: Fundraiser[] = [
  { id: 'f1', name: 'Moshe Weiss', percentage: 10, balanceOwed: 450 },
  { id: 'f2', name: 'David Klein', percentage: 15, balanceOwed: 1200 },
];

export const useStore = create<AppState>((set) => ({
  isRtl: false,
  currency: 'CAD',
  donors: mockDonors,
  transactions: mockTransactions,
  fundraisers: mockFundraisers,
  toggleRtl: () => set((state) => ({ isRtl: !state.isRtl })),
  setCurrency: (currency) => set({ currency }),
}));
