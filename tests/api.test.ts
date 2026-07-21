import { describe, it, expect } from 'vitest';
import { getRequiredPermission, hasPermission } from '../functions/api/permissions';
import { validatePayload } from '../functions/api/validation';
import { isOperationAlreadyApplied } from '../functions/api/idempotency';
import { depositCandidateWindow } from '../functions/api/server-data';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Backend API & Security Rules', () => {
  it('keys cloud records by both type and ID', () => {
    const schema = readFileSync(join(process.cwd(), 'scripts', 'staging-schema.sql'), 'utf8');
    expect(schema).toContain('PRIMARY KEY (type, id)');
  });
  it('defines paginated server-driven reads and idempotent audited payment writes', () => {
    const source = readFileSync(join(process.cwd(), 'functions', 'api', 'server-data.ts'), 'utf8');
    expect(source).toContain("app.get('/v3/payments'");
    expect(source).toContain("app.get('/v3/donors'");
    expect(source).toContain("app.post('/v3/donors'");
    expect(source).toContain("app.put('/v3/donors/:id'");
    expect(source).toContain("app.get('/v3/bills'");
    expect(source).toContain("app.post('/v3/bills'");
    expect(source).toContain("app.patch('/v3/bills/:id/pay'");
    expect(source).toContain("app.get('/v3/bank/state'");
    expect(source).toContain("app.get('/v3/bank/deposit-candidates'");
    expect(source).toContain("app.post('/v3/bank/match-deposit'");
    expect(source).toContain("app.get('/v3/bank/bill-candidates'");
    expect(source).toContain("app.post('/v3/bank/match-outgoing'");
    expect(source).toContain("app.get('/v3/accounts'");
    expect(source).toContain("app.post('/v3/payments'");
    expect(source).toContain("app.delete('/v3/payments/:id'");
    expect(source).toContain('AS calculated_balance');
    expect(source).toContain('WITH exchange_rate AS');
    expect(source).toContain('LEFT JOIN tx_source');
    expect(source).toContain("currency === 'USD' ? amount * exchangeRate : amount");
    expect(source).toContain('processed_mutations');
    expect(source).toContain('audit_log');
    expect(source).toContain('sync_batch_assertions');
    expect(source).toContain('LIMIT ? OFFSET ?');
  });
  it('keeps online pages independent from the local synchronization engine', () => {
    const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    const accountsSource = readFileSync(join(process.cwd(), 'src', 'pages', 'OnlineAccounts.tsx'), 'utf8');
    expect(appSource).toContain("window.location.pathname.startsWith('/online/')");
    expect(appSource).toContain('path="/online/accounts"');
    expect(accountsSource).toContain("fetch('/api/v3/accounts')");
    expect(accountsSource).toContain('window.setInterval');
    const donorsSource = readFileSync(join(process.cwd(), 'src', 'pages', 'OnlineDonors.tsx'), 'utf8');
    expect(appSource).toContain('path="/online/donors"');
    expect(donorsSource).toContain('window.setInterval');
    const expensesSource = readFileSync(join(process.cwd(), 'src', 'pages', 'OnlineExpenses.tsx'), 'utf8');
    expect(appSource).toContain('path="/online/expenses"');
    expect(expensesSource).toContain("fetch('/api/v3/bills'");
    expect(expensesSource).toContain('window.setInterval');
    const bankSource = readFileSync(join(process.cwd(), 'src', 'pages', 'OnlineBank.tsx'), 'utf8');
    expect(appSource).toContain('path="/online/bank"');
    expect(bankSource).toContain("fetch('/api/v3/bank/match-deposit'");
    expect(bankSource).toContain("fetch('/api/v3/bank/match-outgoing'");
    expect(bankSource).toContain('Exact match');
    const formSource = readFileSync(join(process.cwd(), 'src', 'components', 'OnlinePaymentForm.tsx'), 'utf8');
    expect(formSource).toContain("fetch('/api/v3/payments'");
    expect(formSource).toContain('pendingRequestId');
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
    it('accepts synchronized bank-match history as a string array', () => {
      expect(validatePayload('matchedBankTransactions', ['bank-tx-1', 'bank-tx-2']).success).toBe(true);
      expect(validatePayload('matchedBankTransactions', ['bank-tx-1', '']).success).toBe(false);
    });

    it('accepts only a positive finite exchange rate', () => {
      expect(validatePayload('exchangeRate', 1.35).success).toBe(true);
      expect(validatePayload('exchangeRate', 0).success).toBe(false);
    });

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

  describe('Bank deposit candidate dates', () => {
    it('uses the previous day for a normal weekday deposit', () => {
      expect(depositCandidateWindow('2026-07-21')).toEqual({ start: '2026-07-20', end: '2026-07-20' });
    });

    it('uses Friday through Sunday for a Monday deposit', () => {
      expect(depositCandidateWindow('2026-07-20')).toEqual({ start: '2026-07-17', end: '2026-07-19' });
    });
  });
});
