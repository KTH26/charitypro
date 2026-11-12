import React from 'react';

/** Statement day + payment due day inputs, shown only for credit card accounts. */
export const CreditCardDaysFields: React.FC<{ statementDay: string; paymentDueDay: string; onChange: (field: 'statementDay' | 'paymentDueDay', value: string) => void }> = ({ statementDay, paymentDueDay, onChange }) => <>
  <label className="form-group" style={{ margin: 0 }}><span>Statement day *</span><input type="number" min={1} max={31} step={1} value={statementDay} onChange={event => onChange('statementDay', event.target.value)} placeholder="e.g. 24" /><small style={{ color: 'var(--text-muted)' }}>Day of the month the statement closes.</small></label>
  <label className="form-group" style={{ margin: 0 }}><span>Payment due day *</span><input type="number" min={1} max={31} step={1} value={paymentDueDay} onChange={event => onChange('paymentDueDay', event.target.value)} placeholder="e.g. 15" /><small style={{ color: 'var(--text-muted)' }}>Day of the month the payment is due.</small></label>
  <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', fontSize: 12.5 }}>Example: statement day 24, due day 15 → everything from Oct 25 to Nov 24 is due Dec 15.</div>
</>;

/** Returns an error message, or '' when both days are valid. */
export const creditCardDaysProblem = (statementDay: string, paymentDueDay: string) => {
  const ok = (value: string) => { const day = Number(value); return value.trim() !== '' && Number.isInteger(day) && day >= 1 && day <= 31; };
  return ok(statementDay) && ok(paymentDueDay) ? '' : 'For a credit card, enter the statement day and the payment due day (1 to 31).';
};
