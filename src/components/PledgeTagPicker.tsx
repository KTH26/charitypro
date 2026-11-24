import React, { useEffect, useState } from 'react';

/** Tags on a pledge (like DonorFuse): click a tag that is already used, or type a new one. */
export const PledgeTagPicker: React.FC<{ value: string[]; onChange: (tags: string[]) => void; source?: string }> = ({ value, onChange, source = '/api/v3/pledge-tags' }) => {
  const [known, setKnown] = useState<string[]>([]); const [typed, setTyped] = useState('');
  useEffect(() => { fetch(source).then(response => response.json()).then(data => { if (data.success) setKnown(data.tags || []); }).catch(() => undefined); }, [source]);
  const add = (tag: string) => { const clean = tag.trim().slice(0, 60); if (clean && !value.some(item => item.toLowerCase() === clean.toLowerCase())) onChange([...value, clean]); setTyped(''); };
  const others = known.filter(tag => !value.some(item => item.toLowerCase() === tag.toLowerCase()));
  return <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
    <span>Tags</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {value.map(tag => <span key={tag} className="hcal-chip" style={{ background: 'var(--info-soft)', color: 'var(--info-ink)' }} dir="auto">{tag}<button type="button" title="Remove this tag" onClick={() => onChange(value.filter(item => item !== tag))}>×</button></span>)}
      <input dir="auto" value={typed} onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(typed); } }} placeholder="Type a new tag and press Enter" style={{ flex: '1 1 180px', minWidth: 160 }} />
      {typed.trim() && <button type="button" className="btn btn-secondary btn-sm" onClick={() => add(typed)}>Add</button>}
    </div>
    {others.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{others.map(tag => <button key={tag} type="button" className="btn btn-secondary btn-sm" style={{ padding: '3px 9px' }} onClick={() => add(tag)}>+ {tag}</button>)}</div>}
  </div>;
};
