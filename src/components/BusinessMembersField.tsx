import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

type Member = { id: string; name: string };

/**
 * A business account (one big check from a company): the donors that belong to it.
 * When the company's check comes in, it can be divided between these donors' pledges,
 * and the official receipt goes to the company for the full amount.
 */
export const BusinessMembersField: React.FC<{ isBusiness: boolean; memberIds: string[]; selfId?: string; onChange: (next: { isBusiness: boolean; memberIds: string[] }) => void }> = ({ isBusiness, memberIds, selfId, onChange }) => {
  const [names, setNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Member[]>([]);

  // Names of the donors already linked.
  useEffect(() => {
    const missing = memberIds.filter(id => !names[id]);
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(missing.map(id => fetch(`/api/v3/donors/${encodeURIComponent(id)}/profile`).then(response => response.json()).then(data => [id, String(data?.donor?.name || 'Donor')] as const).catch(() => [id, 'Donor'] as const)))
      .then(pairs => { if (!cancelled) setNames(current => ({ ...current, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  }, [memberIds, names]);

  // Search donors to add.
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/v3/donors?limit=20&search=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(response => response.json())
        .then(data => setResults((data.items || []).filter((item: any) => item.id !== selfId).map((item: any) => ({ id: String(item.id), name: String(item.name || '') }))))
        .catch(() => undefined);
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, selfId]);

  const add = (member: Member) => { setNames(current => ({ ...current, [member.id]: member.name })); if (!memberIds.includes(member.id)) onChange({ isBusiness, memberIds: [...memberIds, member.id] }); setQuery(''); setResults([]); };

  return (
    <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
        <input type="checkbox" checked={isBusiness} onChange={event => onChange({ isBusiness: event.target.checked, memberIds })} />
        Business account (a company that gives one check for several donors)
      </label>
      {isBusiness && <>
        <small style={{ color: 'var(--text-muted)' }}>Link the donors of this business. When the company's check comes in, divide it between their pledges. The official receipt goes to the company for the full amount (put the company's legal name in “Legal name for receipts”).</small>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {memberIds.map(id => <span key={id} className="badge" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: 'var(--navy-bg)', color: 'var(--navy)', padding: '4px 8px' }}>
            {names[id] || '…'}
            <button type="button" aria-label="Remove" onClick={() => onChange({ isBusiness, memberIds: memberIds.filter(item => item !== id) })} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'grid' }}><X size={12} /></button>
          </span>)}
          {!memberIds.length && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No donors linked yet.</span>}
        </div>
        <div style={{ position: 'relative' }}>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a donor to link…" />
          {results.length > 0 && <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, padding: 4, maxHeight: 220, overflow: 'auto' }}>
            {results.map(item => <button key={item.id} type="button" onClick={() => add(item)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'none', padding: '6px 8px', cursor: 'pointer' }}>{item.name}{memberIds.includes(item.id) ? ' ✓' : ''}</button>)}
          </div>}
        </div>
      </>}
    </div>
  );
};
