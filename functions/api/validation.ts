import { z } from 'zod';

export const MoneyAmountSchema = z.number().finite().safe();

export const DonorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal(''))
}).passthrough(); // Passthrough for now to avoid breaking existing UI fields

export const TransactionSchema = z.object({
  id: z.string().min(1),
  donorId: z.string().min(1),
  amount: MoneyAmountSchema,
  currency: z.enum(['CAD', 'USD']),
  date: z.string().min(1)
}).passthrough();

export const BillSchema = z.object({
  id: z.string().min(1),
  vendor: z.string().min(1),
  amount: MoneyAmountSchema,
  currency: z.enum(['CAD', 'USD']).optional(),
  dueDate: z.string().min(1),
  status: z.enum(['pending', 'urgent', 'paid', 'scheduled']),
  category: z.string()
}).passthrough();

export const PledgeSchema = z.object({
  id: z.string().min(1),
  donorId: z.string().min(1),
  amount: MoneyAmountSchema.positive(),
  currency: z.enum(['CAD', 'USD']),
  date: z.string().min(1)
}).passthrough();

export const RecurringPaymentSchema = z.object({
  id: z.string().min(1),
  donorId: z.string().min(1),
  amount: MoneyAmountSchema.positive(),
  currency: z.enum(['CAD', 'USD']),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  nextDate: z.string().min(1),
  method: z.enum(['credit_card', 'check', 'cash', 'e_transfer', 'vouchers', 'eizer', 'bnei_leivy', 'other']),
  active: z.boolean()
}).passthrough();

export const ExpenseQueueItemSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  description: z.string().min(1),
  amount: MoneyAmountSchema.positive(),
  taxable: z.boolean().optional()
}).passthrough();

export const validatePayload = (type: string, data: any) => {
  switch (type) {
    case 'donors':
      return DonorSchema.safeParse(data);
    case 'transactions':
      return TransactionSchema.safeParse(data);
    case 'bills':
      return BillSchema.safeParse(data);
    case 'pledges':
      return PledgeSchema.safeParse(data);
    case 'recurringPayments':
      return RecurringPaymentSchema.safeParse(data);
    case 'expenseQueueItems':
      return ExpenseQueueItemSchema.safeParse(data);
    case 'exchangeRate':
      return z.number().finite().positive().safeParse(data);
    case 'matchedBankTransactions':
      return z.array(z.string().min(1)).safeParse(data);
    default:
      // If no strict schema defined yet, allow it but ensure it's an object
      return z.object({}).passthrough().safeParse(data);
  }
};
