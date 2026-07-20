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
  vendorId: z.string().min(1),
  amount: MoneyAmountSchema,
  currency: z.enum(['CAD', 'USD']),
  date: z.string().min(1),
  status: z.enum(['pending', 'approved', 'paid', 'voided', 'declined', 'reversed']).optional()
}).passthrough();

export const validatePayload = (type: string, data: any) => {
  switch (type) {
    case 'donors':
      return DonorSchema.safeParse(data);
    case 'transactions':
      return TransactionSchema.safeParse(data);
    case 'bills':
      return BillSchema.safeParse(data);
    default:
      // If no strict schema defined yet, allow it but ensure it's an object
      return z.object({}).passthrough().safeParse(data);
  }
};
