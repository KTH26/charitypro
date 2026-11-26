/**
 * Every table in the program: drag the right edge of a column heading to make that column wider or narrower.
 * Text that does not fit ends with "…" – point at it to see all of it. Double-click an edge to put the whole table back to normal.
 * Widths are remembered on this computer, per page and per column name.
 */
const STORE = 'charitypro-column-widths';
const EDGE = 7; // pixels from the heading's right edge where dragging starts

type Widths = Record<string, Record<string, number>>;
const load = (): Widths => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; } };
const save = (widths: Widths) => { try { localStorage.setItem(STORE, JSON.stringify(widths)); } catch { /* private window: widths last until reload */ } };
let widths: Widths = load();

const headingName = (th: Element) => (th.textContent || '').replace(/[▲▼]/g, '').trim() || `#${Array.from(th.parentElement?.children || []).indexOf(th)}`;
const tableKey = (table: HTMLTableElement) => {
  const names = Array.from(table.tHead?.rows[0]?.cells || []).map(headingName);
  return `${location.pathname}|${names.slice(0, 3).join('|')}`;
};

let styleTag: HTMLStyleElement | null = null;
let tableCount = 0;
/** Writes one CSS rule per resized column, so rows that appear later (next page, live updates) get the same width. */
const apply = () => {
  const rules: string[] = [];
  document.querySelectorAll<HTMLTableElement>('table').forEach(table => {
    const head = table.tHead?.rows[0]; if (!head) return;
    const saved = widths[tableKey(table)]; if (!saved) { delete table.dataset.rz; return; }
    if (!table.dataset.rz) table.dataset.rz = String(++tableCount);
    // Once a column in a table is resized, every column keeps an exact width (like Excel), so a column can get narrower.
    // A column with no saved width (for example one just added) keeps the width it has now.
    let total = 0;
    Array.from(head.cells).forEach((th, index) => {
      const width = saved[headingName(th)] || Math.round(th.getBoundingClientRect().width) || 120;
      total += width;
      const pick = `table[data-rz="${table.dataset.rz}"] tr > :nth-child(${index + 1})`;
      rules.push(`${pick}{width:${width}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`);
      rules.push(`${pick} *{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`);
    });
    rules.push(`table[data-rz="${table.dataset.rz}"]{table-layout:fixed;width:${total}px;min-width:0}`);
  });
  if (!styleTag) { styleTag = document.createElement('style'); styleTag.dataset.columnWidths = ''; document.head.appendChild(styleTag); }
  const css = rules.join('\n'); if (styleTag.textContent !== css) styleTag.textContent = css;
};

let scheduled = false;
const applySoon = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; apply(); }); };

const edgeHeading = (event: MouseEvent) => {
  const th = (event.target as HTMLElement)?.closest?.('thead th') as HTMLTableCellElement | null;
  if (!th) return null;
  const rect = th.getBoundingClientRect();
  return rect.right - event.clientX <= EDGE && event.clientX <= rect.right + 1 ? th : null;
};

export const installColumnResize = () => {
  if ((window as any).__columnResize) return; (window as any).__columnResize = true;
  const style = document.createElement('style');
  style.textContent = 'thead th::after{content:"";position:absolute;top:20%;bottom:20%;right:0;width:1px;background:var(--border,#ddd);opacity:.7}body.col-resizing,body.col-resizing *{cursor:col-resize!important;user-select:none!important}.col-resize-edge{cursor:col-resize!important}';
  document.head.appendChild(style);

  let hover: HTMLElement | null = null;
  document.addEventListener('mousemove', event => {
    if (document.body.classList.contains('col-resizing')) return;
    const th = edgeHeading(event);
    if (th !== hover) { hover?.classList.remove('col-resize-edge'); th?.classList.add('col-resize-edge'); hover = th; }
  });

  let blockClick = false;
  document.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    const th = edgeHeading(event); if (!th) return;
    const table = th.closest('table') as HTMLTableElement | null; if (!table) return;
    event.preventDefault(); event.stopPropagation();
    const key = tableKey(table); const name = headingName(th);
    const startX = event.clientX; const startWidth = th.getBoundingClientRect().width;
    // First resize in this table: keep every other column exactly as wide as it is now.
    if (!widths[key]) widths = { ...widths, [key]: Object.fromEntries(Array.from(table.tHead?.rows[0]?.cells || []).map(cell => [headingName(cell), Math.round(cell.getBoundingClientRect().width)])) };
    document.body.classList.add('col-resizing');
    const move = (moveEvent: MouseEvent) => {
      const width = Math.max(40, Math.round(startWidth + moveEvent.clientX - startX));
      widths = { ...widths, [key]: { ...(widths[key] || {}), [name]: width } };
      apply();
    };
    const up = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.body.classList.remove('col-resizing');
      if (Math.abs(upEvent.clientX - startX) > 2) { blockClick = true; setTimeout(() => { blockClick = false; }, 0); }
      save(widths);
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }, true);
  // A drag must not also sort the column.
  document.addEventListener('click', event => { if (blockClick) { event.preventDefault(); event.stopPropagation(); blockClick = false; } }, true);
  // Double-click an edge: the whole table goes back to normal widths.
  document.addEventListener('dblclick', event => {
    const th = edgeHeading(event); if (!th) return;
    const table = th.closest('table') as HTMLTableElement | null; if (!table) return;
    event.preventDefault(); event.stopPropagation();
    const next = { ...widths }; delete next[tableKey(table)]; widths = next;
    save(widths); apply();
  }, true);
  // Text cut short with "…": point at it to see all of it.
  document.addEventListener('mouseover', event => {
    const cell = (event.target as HTMLElement)?.closest?.('table[data-rz] td') as HTMLElement | null;
    if (cell && !cell.title && cell.scrollWidth > cell.clientWidth + 1) cell.title = (cell.textContent || '').trim();
  });
  // Tables come and go as pages change: put the saved widths back on them.
  new MutationObserver(applySoon).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', applySoon);
  applySoon();
};
