import React, { useEffect } from 'react';

type LoanAccountLike = { id?: string; type?: string; subType?: string; name?: string; currency?: string; loanMonthlyPayment?: number | string; loanPaymentDay?: number | string };

/** A loan account is a liability account whose subtype is "loan" (not a credit card). */
export const isLoanAccount = (account?: LoanAccountLike | null) =>
  account?.type === 'liability' && account?.subType === 'loan';

/** An older loan account set to "every month" on the whole account (new loans choose their own plan). */
export const isMonthlyLoan = (account?: LoanAccountLike | null) => isLoanAccount(account) && Number(account?.loanMonthlyPayment || 0) > 0;

/** Money from this account needs a pay-back plan (a date, or every month). */
export const needsLoanDueDate = (account?: LoanAccountLike | null) => isLoanAccount(account);

/**
 * Each loan's pay-back plan is kept in one text value on the forms:
 * a date "2026-12-31" (paid back on that date), or "monthly:500:15" ($500 every month on day 15).
 */
export const loanPlanValue = (record?: { loanDueDate?: string; loanMonthlyPayment?: number | string; loanPaymentDay?: number | string } | null) =>
  Number(record?.loanMonthlyPayment || 0) > 0 ? `monthly:${record?.loanMonthlyPayment}:${record?.loanPaymentDay || 1}` : String(record?.loanDueDate || '');
const parsePlan = (value: string) => {
  if (!String(value || '').startsWith('monthly:')) return { monthly: false, date: String(value || ''), amount: '', day: '' };
  const [, amount = '', day = ''] = value.split(':');
  return { monthly: true, date: '', amount, day };
};

/** What is missing in the plan, or '' when it is fine. */
export const loanPlanError = (account: LoanAccountLike | null | undefined, value: string) => {
  if (!isLoanAccount(account)) return '';
  const plan = parsePlan(value);
  if (plan.monthly) { const day = Number(plan.day); return Number(plan.amount) > 0 && Number.isInteger(day) && day >= 1 && day <= 31 ? '' : 'Enter the monthly amount and the day of the month it is due (1–31).'; }
  return plan.date ? '' : 'This money comes from a loan account. Choose the date it has to be paid back, or choose "Every month".';
};

/** The fields to save with the payment or transfer (nothing when the money is not from a loan). */
export const loanPlanData = (account: LoanAccountLike | null | undefined, value: string): Record<string, any> => {
  if (!isLoanAccount(account)) return {};
  const plan = parsePlan(value);
  if (plan.monthly) return { loanMonthlyPayment: Math.round(Number(plan.amount) * 100) / 100, loanPaymentDay: Math.floor(Number(plan.day)), loanDueDate: null };
  return { loanDueDate: plan.date || null, loanMonthlyPayment: null, loanPaymentDay: null };
};

/**
 * Shown on every form where money leaves an account. It appears only when the
 * chosen account is a loan, and asks how THIS loan is paid back: on one date, or every month.
 * (One loan account can have both kinds of loans.)
 */
export const LoanDueDateField: React.FC<{ account?: LoanAccountLike | null; value: string; onChange: (value: string) => void }> = ({ account, value, onChange }) => {
  const isLoan = isLoanAccount(account);
  // An older account set to "every month": start with its amount and day (it can still be changed for this loan).
  useEffect(() => {
    if (isLoan && !value && isMonthlyLoan(account)) onChange(`monthly:${account?.loanMonthlyPayment}:${account?.loanPaymentDay || 1}`);
  }, [account?.id, isLoan]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isLoan) return null;
  const name = account?.name ? ` “${account.name}”` : '';
  const plan = parsePlan(value);
  return (
    <div className="form-group loan-due-date-field" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: 10, borderRadius: 8, background: 'var(--bg-input)' }}>
      <label className="form-group" style={{ margin: 0 }}><span>How is this loan paid back? *</span>
        <select value={plan.monthly ? 'monthly' : 'date'} onChange={event => onChange(event.target.value === 'monthly' ? `monthly:${plan.amount}:${plan.day || '1'}` : '')}>
          <option value="date">On a pay-back date</option>
          <option value="monthly">Every month</option>
        </select>
      </label>
      {plan.monthly ? <>
        <label className="form-group" style={{ margin: 0 }}><span>Each month *</span><input type="number" min="0" step="0.01" value={plan.amount} placeholder="Amount" onChange={event => onChange(`monthly:${event.target.value}:${plan.day}`)} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Due on day *</span><input type="number" min="1" max="31" value={plan.day} onChange={event => onChange(`monthly:${plan.amount}:${event.target.value}`)} /></label>
      </> : <label className="form-group" style={{ margin: 0 }}><span>Pay back by *</span><input type="date" required value={plan.date} onChange={event => onChange(event.target.value)} /></label>}
      <small style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
        This money comes from the loan account{name}. {plan.monthly ? 'The Dashboard shows this loan\'s payment every month until it is paid off.' : 'Choose the date it has to be paid back. It will show on the Dashboard until it is paid.'} Each loan has its own plan.
      </small>
    </div>
  );
};
