import React, { useEffect, useRef, useState } from 'react';
import { Download, Send, Sparkles, Trash2, X } from 'lucide-react';
import { buildWorkbook, type ExcelColumn } from '../utils/excel';

type ExcelOffer = { title: string; path: string; query: Record<string, string>; columns: ExcelColumn[] };
type Turn = { role: 'user' | 'assistant'; text: string; lookups?: string[]; error?: boolean; steps?: string[]; status?: string; working?: boolean; downloads?: ExcelOffer[] };

// The Excel button: reads every page of the list the AI chose (with your login) and saves the file.
const pick = (row: any, key: string) => key.split('.').reduce((value, part) => value == null ? value : value[part], row);
const DownloadButton: React.FC<{ offer: ExcelOffer }> = ({ offer }) => {
  const [state, setState] = useState('');
  const download = async () => {
    setState('Reading…');
    try {
      const rows: any[] = [];
      if (offer.path === '/v3/report-data') {
        const response = await fetch(`/api${offer.path}?${new URLSearchParams(offer.query)}`); const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not read the list.'); rows.push(...(data.rows || []));
      } else {
        for (let page = 1; page <= 200; page++) {
          const params = new URLSearchParams({ ...offer.query, page: String(page), limit: '100' });
          const response = await fetch(`/api${offer.path}?${params}`); const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.error || 'Could not read the list.');
          rows.push(...(data.items || [])); setState(`Reading… ${rows.length}${data.total ? ` of ${data.total}` : ''}`);
          if (page >= Number(data.totalPages || 1)) break;
        }
      }
      const columns = offer.columns.map(column => ({ ...column, key: column.key.replace(/\./g, '_') }));
      const flat = rows.map(row => Object.fromEntries(offer.columns.map(column => { let value = pick(row, column.key); if (Array.isArray(value)) value = value.join(', '); else if (value && typeof value === 'object') value = JSON.stringify(value); return [column.key.replace(/\./g, '_'), value ?? '']; })));
      const totals = Object.fromEntries(columns.filter(column => column.type === 'money').map(column => [column.key, flat.reduce((sum, row) => sum + Number(row[column.key] || 0), 0)]));
      const blob = buildWorkbook([{ name: offer.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), title: offer.title, columns, rows: flat, totals: Object.keys(totals).length ? { [columns[0].key]: `Total (${flat.length})`, ...totals } : null }]);
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${offer.title.replace(/[^\w\- ]+/g, '').trim() || 'CharityPro'}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      setState(`Saved (${flat.length} rows)`);
    } catch (reason: any) { setState(reason.message || 'Could not make the file.'); }
  };
  return <button type="button" className="btn btn-secondary btn-sm" onClick={() => void download()} disabled={state.startsWith('Reading')} style={{ marginTop: 6, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Download size={14} /> {state || `Download Excel: ${offer.title}`}</button>;
};

const EXAMPLES = [
  'How much did we receive this month, by method?',
  'Which donors pledged for Campaign 2026 and still owe more than $500?',
  'Show me the declined card payments from last week.',
  'What money is expected to come in until the end of the month?',
];

// A small, safe reader for the AI's answers: **bold**, lists, simple tables, line breaks. No HTML from the answer is used.
const inline = (text: string) => text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <React.Fragment key={index}>{part}</React.Fragment>);
const Answer: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n'); const out: React.ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[index])) rows.push(lines[index].trim().slice(1, -1).split('|').map(cell => cell.trim())); index++; }
      index--;
      out.push(<div key={index} style={{ overflowX: 'auto', margin: '6px 0' }}><table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}><tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, k) => <td key={k} style={{ border: '1px solid var(--border)', padding: '3px 6px', fontWeight: r === 0 ? 700 : 400, whiteSpace: 'nowrap' }} dir="auto">{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
    } else if (/^\s*[-*]\s+/.test(line)) out.push(<div key={index} style={{ paddingLeft: 14, textIndent: -10 }} dir="auto">• {inline(line.replace(/^\s*[-*]\s+/, ''))}</div>);
    else if (/^#{1,4}\s+/.test(line)) out.push(<div key={index} style={{ fontWeight: 700, marginTop: 6 }} dir="auto">{inline(line.replace(/^#{1,4}\s+/, ''))}</div>);
    else if (!line.trim()) out.push(<div key={index} style={{ height: 6 }} />);
    else out.push(<div key={index} dir="auto">{inline(line)}</div>);
  }
  return <>{out}</>;
};

const PULSE = '@keyframes askAiPulse { 0%, 100% { opacity: .25 } 50% { opacity: 1 } } .ask-ai-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block; animation: askAiPulse 1s ease-in-out infinite; }';

/** "Ask AI": ask questions about donors, pledges, payments and reports in plain words. Read only. */
export const AskAiButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(() => { try { return (JSON.parse(sessionStorage.getItem('ask-ai-turns') || '[]') as Turn[]).filter(turn => !turn.working); } catch { return []; } });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { try { sessionStorage.setItem('ask-ai-turns', JSON.stringify(turns.slice(-30))); } catch { /* not kept */ } bottom.current?.scrollIntoView({ block: 'end' }); }, [turns, open]);

  const ask = async (question: string) => {
    const text = question.trim(); if (!text || busy) return;
    const history: Turn[] = [...turns, { role: 'user', text }];
    // The answer bubble is filled live: what it is doing now, each look-up, then the answer as it is written.
    setTurns([...history, { role: 'assistant', text: '', steps: [], status: 'Starting…', working: true }]); setInput(''); setBusy(true);
    const update = (change: (turn: Turn) => Turn) => setTurns(current => { const next = [...current]; next[next.length - 1] = change(next[next.length - 1]); return next; });
    try {
      const response = await fetch('/api/v3/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.filter(turn => !turn.error).map(turn => ({ role: turn.role, text: turn.text })) }) });
      if (!response.ok || !response.body) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `The AI could not answer (${response.status}).`); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let finished = false;
      while (!finished) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1); if (!line) continue;
          let event: any; try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'status') update(turn => ({ ...turn, status: event.text }));
          else if (event.type === 'step') update(turn => ({ ...turn, steps: [...(turn.steps || []), event.text] }));
          else if (event.type === 'text') update(turn => ({ ...turn, text: turn.text + event.delta }));
          else if (event.type === 'reset') update(turn => ({ ...turn, text: '' }));
          else if (event.type === 'download') update(turn => ({ ...turn, downloads: [...(turn.downloads || []), { title: event.title, path: event.path, query: event.query || {}, columns: event.columns || [] }] }));
          else if (event.type === 'done') { update(turn => ({ ...turn, text: event.reply, lookups: event.lookups || [], working: false, status: '' })); finished = true; }
          else if (event.type === 'error') throw new Error(event.error);
        }
      }
      if (!finished) throw new Error('The answer stopped before it was finished. Please try again.');
    } catch (reason: any) {
      const message = String(reason?.message || '');
      const cut = reason instanceof TypeError || /network|failed to fetch|load failed/i.test(message);
      update(turn => ({ ...turn, text: cut ? 'The connection was cut before the answer was finished. Please try again (a narrower question is faster).' : message || 'The AI could not answer.', error: true, working: false, status: '' }));
    } finally { setBusy(false); }
  };

  return <>
    <button type="button" className="btn btn-secondary" onClick={() => setOpen(value => !value)} title="Ask the AI about donors, pledges, payments and reports" style={{ height: 42, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={16} /> Ask AI</button>
    <style>{PULSE}</style>
    {open && <section role="dialog" aria-label="Ask AI" className="card" style={{ position: 'fixed', right: 16, bottom: 16, top: 70, width: 'min(520px, calc(100vw - 32px))', zIndex: 3000, padding: 0, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(15,23,42,.3)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div><strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={16} /> Ask AI</strong><small style={{ color: 'var(--text-muted)' }}>Reads your data to answer. It can't change anything.</small></div>
        <span style={{ display: 'flex', gap: 4 }}>
          {turns.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTurns([])} title="Start a new conversation"><Trash2 size={15} /></button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gap: 10, alignContent: 'start' }}>
        {!turns.length && <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ask in plain words, for example:</span>
          {EXAMPLES.map(example => <button key={example} type="button" className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }} onClick={() => void ask(example)}>{example}</button>)}
        </div>}
        {turns.map((turn, index) => <div key={index} style={{ justifySelf: turn.role === 'user' ? 'end' : 'stretch', maxWidth: turn.role === 'user' ? '85%' : '100%', background: turn.role === 'user' ? 'var(--navy)' : turn.error ? 'var(--red-bg)' : 'var(--bg-input)', color: turn.role === 'user' ? '#fff' : turn.error ? 'var(--red)' : 'inherit', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.45 }}>
          {turn.role === 'assistant' && (turn.steps?.length || turn.working) ? <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'grid', gap: 2, marginBottom: turn.text ? 6 : 0 }}>{(turn.steps || []).map((step, k) => <div key={k} dir="auto">✓ {step}</div>)}{turn.working && turn.status && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--navy)', fontWeight: 600 }}><span className="ask-ai-dot" />{turn.status}</div>}</div> : null}{turn.role === 'user' ? <div dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{turn.text}</div> : turn.text ? <Answer text={turn.text} /> : null}
          {(turn.downloads || []).map((offer, k) => <div key={k}><DownloadButton offer={offer} /></div>)}{turn.lookups && turn.lookups.length > 0 && <details style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}><summary style={{ cursor: 'pointer' }}>What it looked at ({turn.lookups.length})</summary>{turn.lookups.map((item, k) => <div key={k} style={{ wordBreak: 'break-all' }}>{item}</div>)}</details>}
        </div>)}
        <div ref={bottom} />
      </div>
      <form onSubmit={event => { event.preventDefault(); void ask(input); }} style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8 }}>
        <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(input); } }} placeholder="Ask a question…" rows={2} dir="auto" style={{ flex: 1, resize: 'none' }} disabled={busy} />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()} aria-label="Send"><Send size={16} /></button>
      </form>
    </section>}
  </>;
};
