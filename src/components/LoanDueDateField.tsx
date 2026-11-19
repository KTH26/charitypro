import React from 'react';

type LoanAccountLike = { type?: string; subType?: string; name?: string; currency?: string; loanMonthlyPayment?: number | string; loanPaymentDay?: number | string };

/** A loan account is a liability account whose subtype is "loan" (not a credit card). */
export const isLoanAccount = (account?: LoanAccountLike | null) =>
  account?.type === 'liability' && account?.subType === 'loan';

/** A loan paid back every month (set on the loan account) has no pay-back date per payment. */
export const isMonthlyLoan = (account?: LoanAccountLike | null) => isLoanAccount(account) && Number(account?.loanMonthlyPayment || 0) > 0;

/** Money from this account needs a pay-back date: a loan that is not paid monthly. */
export const needsLoanDueDate = (account?: LoanAccountLike | null) => isLoanAccount(account) && !isMonthlyLoan(account);

/**
 * Shown on every form where money leaves an account. It appears only when the
 * chosen account is a loan. A loan paid on a date asks for the date; a monthly
 * loan shows its monthly plan instead (that is set on the loan account).
 */
export const LoanDueDateField: React.FC<{ account?: LoanAccountLike | null; value: string; onChange: (value: string) => void }> = ({ account, value, onChange }) => {
  if (!isLoanAccount(account)) return null;
  const name = account?.name ? ` “${account.name}”` : '';
  if (isMonthlyLoan(account)) {
    const amount = Number(account?.loanMonthlyPayment || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (
      <div className="form-group loan-due-date-field" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--navy-bg)', fontSize: 13 }}>
        <strong>Paid back every month</strong>
        <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>
          The loan{name} is paid back {account?.currency || 'CAD'} ${amount} every month, due on day {Number(account?.loanPaymentDay || 1)}. No pay-back date is needed. To change it, edit the loan account in Chart of Accounts.
        </div>
      </div>
    );
  }
  return (
    <label className="form-group loan-due-date-field">
      <span>Pay back by *</span>
      <input type="date" required value={value} onChange={event => onChange(event.target.value)} />
      <small style={{ color: 'var(--text-muted)' }}>
        This money comes from the loan account{name}. Choose the date it has to be paid back. It will show on the Dashboard until it is paid. Paid back every month instead? Set that on the loan account (Chart of Accounts → Edit → How is it paid back?).
      </small>
    </label>
  );
};
