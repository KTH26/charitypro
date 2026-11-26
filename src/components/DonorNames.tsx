import React from 'react';

/** A donor's English name, with the Yiddish name under it (when there is one). */
export const DonorNames: React.FC<{ name?: string; yiddish?: string; bold?: boolean }> = ({ name, yiddish, bold = true }) => <>
  <span className={bold ? 'cell-main' : undefined}>{name || '—'}</span>
  {yiddish && <div dir="rtl" style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', fontWeight: 400 }}>{yiddish}</div>}
</>;
