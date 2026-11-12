import React from 'react';

/** A loan account is a liability account whose subtype is "loan" (not a credit card). */
export const isLoanAccount = (account?: { type?: string; subType?: string } | null) =>
  account?.type === 'liability' && account?.subType === 'loan';

/**
 * Shown on every form where money leaves an account. It appears only when the
 * chosen account is a loan, and asks for the date the money has to be paid back.
 */
export const LoanDueDateField: React.FC<{ account?: { type?: string; subType?: string; name?: string } | null; value: string; onChange: (value: string) => void }> = ({ account, value, onChange }) => {
  if (!isLoanAccount(account)) return null;
  return (
    <label className="form-group loan-due-date-field">
      <span>Pay back by *</span>
      <input type="date" required value={value} onChange={event => onChange(event.target.value)} />
      <small style={{ color: 'var(--text-muted)' }}>
        This money comes from the loan account{account?.name ? ` “${account.name}”` : ''}. Choose the date it has to be paid back. It will show on the Dashboard until it is paid.
      </small>
    </label>
  );
};
