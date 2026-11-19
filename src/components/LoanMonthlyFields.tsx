import React from 'react';

/** The loan account's pay-back plan: on dates (each borrowing has its own pay-back date) or a fixed amount every month. */
export const LoanMonthlyFields: React.FC<{ monthly: string; day: string; onChange: (field: 'loanMonthlyPayment' | 'loanPaymentDay', value: string) => void }> = ({ monthly, day, onChange }) => {
  const isMonthly = Number(monthly) > 0 || monthly === ' ';
  return <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: 10, borderRadius: 8, background: 'var(--bg-input)' }}>
    <label className="form-group" style={{ margin: 0 }}><span>How is it paid back?</span>
      <select value={isMonthly ? 'monthly' : 'dates'} onChange={event => { if (event.target.value === 'monthly') { onChange('loanMonthlyPayment', ' '); if (!day) onChange('loanPaymentDay', '1'); } else onChange('loanMonthlyPayment', ''); }}>
        <option value="dates">On a pay-back date</option>
        <option value="monthly">Every month</option>
      </select>
    </label>
    {isMonthly && <>
      <label className="form-group" style={{ margin: 0 }}><span>Each month *</span><input type="number" min="0" step="0.01" value={monthly.trim()} onChange={event => onChange('loanMonthlyPayment', event.target.value || ' ')} placeholder="Amount" /></label>
      <label className="form-group" style={{ margin: 0 }}><span>Due on day *</span><input type="number" min="1" max="31" value={day} onChange={event => onChange('loanPaymentDay', event.target.value)} /></label>
    </>}
    <small style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>{isMonthly ? 'The Dashboard shows this month\'s payment with this month\'s due date. When it is paid, next month\'s shows.' : 'Every time money comes from this loan, you choose the date it has to be paid back.'}</small>
  </div>;
};

/** What to save: a positive monthly amount and a day 1–31, or 0 for "on a pay-back date". Returns an error message when incomplete. */
export const loanMonthlyData = (monthly: string, day: string): { data: { loanMonthlyPayment: number; loanPaymentDay?: number }; error: string } => {
  const isMonthly = Number(monthly) > 0 || monthly === ' ';
  if (!isMonthly) return { data: { loanMonthlyPayment: 0 }, error: '' };
  const amount = Number(monthly); const dayNumber = Math.floor(Number(day));
  if (!(amount > 0) || !(dayNumber >= 1 && dayNumber <= 31)) return { data: { loanMonthlyPayment: 0 }, error: 'Enter the monthly amount and the day of the month it is due (1–31).' };
  return { data: { loanMonthlyPayment: Math.round(amount * 100) / 100, loanPaymentDay: dayNumber }, error: '' };
};
