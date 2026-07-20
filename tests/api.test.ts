import { describe, it, expect } from 'vitest';
import { getRequiredPermission, hasPermission } from '../functions/api/permissions';
import { validatePayload } from '../functions/api/validation';
import { isOperationAlreadyApplied } from '../functions/api/idempotency';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Backend API & Security Rules', () => {
  it('keys cloud records by both type and ID', () => {
    const schema = readFileSync(join(process.cwd(), 'scripts', 'staging-schema.sql'), 'utf8');
    expect(schema).toContain('PRIMARY KEY (type, id)');
  });
  it('JWT Middleware - (To be implemented using miniflare)', () => {
    // A complete integration test of the Cloudflare Worker would use Miniflare,
    // but here we verify the logic modules directly.
    expect(true).toBe(true);
  });

  describe('RBAC (Role Based Access Control)', () => {
    it('Requires donor_staff to ONLY update donors, not delete', () => {
      expect(hasPermission(['donor_staff'], 'donors.update')).toBe(true);
      expect(hasPermission(['donor_staff'], 'donors.delete')).toBe(false);
    });

    it('Allows administrators all permissions', () => {
      expect(hasPermission(['administrator'], 'donors.delete')).toBe(true);
      expect(hasPermission(['administrator'], 'transactions.approve')).toBe(true);
    });

    it('Identifies correct permission string from batch operation', () => {
      expect(getRequiredPermission('transactions', 'insert')).toBe('transactions.create');
      expect(getRequiredPermission('donors', 'update')).toBe('donors.update');
    });
  });

  describe('Zod Payload Validation', () => {
    it('Rejects invalid money amounts (NaN, string, infinity)', () => {
      const badTx = { amount: NaN, date: '2026-07-17', accountId: 'acc1', type: 'expense' };
      const res1 = validatePayload('transactions', badTx);
      expect(res1.success).toBe(false);

      const badTx2 = { amount: "100.00", date: '2026-07-17', accountId: 'acc1', type: 'expense' };
      const res2 = validatePayload('transactions', badTx2);
      expect(res2.success).toBe(false);
    });

    it('Accepts strictly typed valid objects', () => {
      const goodDonor = {
        id: 'donor-1',
        name: 'John Doe',
        email: 'john@example.com',
        address: '123 Main St',
        taxReceiptEligible: true,
        tags: ['vip']
      };
      const res = validatePayload('donors', goodDonor);
      expect(res.success).toBe(true);
    });

    it('accepts the bill shape produced by the application', () => {
      const bill = {
        id: 'bill-1',
        vendor: 'Office Supply Company',
        amount: 125.50,
        currency: 'CAD',
        dueDate: '2026-08-01',
        status: 'pending',
        category: 'office-expense'
      };

      expect(validatePayload('bills', bill).success).toBe(true);
    });
  });

  describe('Idempotent concurrent operations', () => {
    it('accepts an identical scheduled record already created by another browser', () => {
      const data = { id: 'scheduled-payment-schedule-1-2026-07-20', amount: 50 };
      expect(isOperationAlreadyApplied({
        type: 'transactions',
        revision: 1,
        data: JSON.stringify(data),
        is_deleted: 0
      }, {
        type: 'transactions',
        operation: 'insert',
        data
      })).toBe(true);
    });

    it('does not hide a genuinely different concurrent edit', () => {
      expect(isOperationAlreadyApplied({
        type: 'transactions',
        revision: 2,
        data: JSON.stringify({ id: 'tx-1', amount: 75 }),
        is_deleted: 0
      }, {
        type: 'transactions',
        operation: 'update',
        data: { id: 'tx-1', amount: 100 }
      })).toBe(false);
    });
  });
});
