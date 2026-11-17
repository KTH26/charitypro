/** Money for reports: cents only when there are cents. 100 → "100", 100.67 → "100.67", 1234.5 → "1,234.50". */
export const moneyNumber = (value: unknown) => {
  const amount = Math.round(Number(value || 0) * 100) / 100;
  const whole = Number.isInteger(amount);
  return amount.toLocaleString('en-CA', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
};

/** Same, with the dollar sign: "$100", "$100.67", "-$5.50". */
export const moneyText = (value: unknown) => {
  const text = moneyNumber(value);
  return text.startsWith('-') ? `-$${text.slice(1)}` : `$${text}`;
};
