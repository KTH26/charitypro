/**
 * The monthly sponsor list ("מכירת זכות יומי הצלה"), drawn on top of the designer's sheet.
 * Every day starts as its own box. Boxes can be merged (one box over several days, each day keeps its tab),
 * split again, moved, and each day's label (א, ב …) can be changed. The layout is saved per month.
 */
import { gematriya } from '@hebcal/core';

export type SheetSponsor = {
  donorId: string; preTitle?: string; hebFirstName?: string; hebLastName?: string; title?: string; postTitle?: string;
  donorName?: string; honoree?: string; notes?: string;
};
export type SheetDay = SheetSponsor & { day: number };
/** The text written in a box (or in the patron box). Any part can be typed over by hand. */
export type SheetText = { title?: string; first?: string; last?: string; end?: string; honoree?: string; notes?: string };
export const TEXT_FIELDS = ['title', 'first', 'last', 'end', 'honoree', 'notes'] as const;
/**
 * boxes: the days of each box, in the order they are shown. labels: a day's text on its tab when it was changed.
 * texts: text typed by hand for a box (by the box's first day); patronText: the same for the month patron.
 */
export type SheetLayout = { boxes: number[][]; labels?: Record<string, string>; monthTitle?: string; bandMonth?: string; texts?: Record<string, SheetText>; patronText?: SheetText; pieces?: Record<string, PieceSpot> };
/** Where a piece of the patron section was moved to (points from its regular place), or hidden. */
export type PieceSpot = { dx: number; dy: number; hidden?: boolean };
/** The pieces of the patron section, at their regular place on the sheet (points). */
export const PIECES = [
  { key: 'title', label: 'Heading פטרון החודש', x: 981, y: 546.3, w: 153, h: 31 },
  { key: 'intro', label: 'Text ברוב רגשי…', x: 955.7, y: 585, w: 200.6, h: 27 },
  { key: 'name', label: 'Patron name', x: 925, y: 612, w: 265, h: 53 },
  { key: 'strip', label: 'Strip אשר זכה בכתר…', x: 957, y: 665.3, w: 201, h: 18.7 },
  { key: 'band', label: 'Red band', x: 941, y: 680.7, w: 232.7, h: 30 },
  { key: 'dedication', label: 'Dedication line', x: 932, y: 711, w: 238, h: 32 },
] as const;
export type PieceKey = typeof PIECES[number]['key'];
const PIECE_KEYS: readonly string[] = PIECES.map(piece => piece.key);
const LIMIT = 1300;
const clampMove = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? Math.round(Math.max(-LIMIT, Math.min(LIMIT, number)) * 10) / 10 : 0; };
/** Keeps only known pieces with sane numbers. */
export const cleanPieces = (raw: any): Record<string, PieceSpot> | undefined => {
  const out: Record<string, PieceSpot> = {};
  for (const [key, value] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (!PIECE_KEYS.includes(key) || !value || typeof value !== 'object') continue;
    const spot: PieceSpot = { dx: clampMove((value as any).dx), dy: clampMove((value as any).dy) }; if ((value as any).hidden === true) spot.hidden = true;
    if (spot.dx || spot.dy || spot.hidden) out[key] = spot;
  }
  return Object.keys(out).length ? out : undefined;
};
export const pieceSpot = (layout: SheetLayout, key: string): PieceSpot => layout.pieces?.[key] || { dx: 0, dy: 0 };
/** Moves a piece by (dx, dy) points, or sets it hidden / shown. */
export const changePiece = (layout: SheetLayout, key: string, change: Partial<PieceSpot>): SheetLayout => {
  const now = pieceSpot(layout, key);
  const next = { ...now, ...change, dx: change.dx !== undefined ? now.dx + change.dx : now.dx, dy: change.dy !== undefined ? now.dy + change.dy : now.dy };
  return { ...layout, pieces: cleanPieces({ ...(layout.pieces || {}), [key]: next }) };
};
export type PlacedBox = { index: number; days: number[]; row: number; col: number; span: number };

export const PER_ROW = 7;

/** "א", "יא", "כט": the day in Hebrew letters, without ׳ ״ marks. */
export const dayLetters = (day: number) => gematriya(day).replace(/[׳״'"]/g, '');
export const dayLabel = (layout: SheetLayout, day: number) => String(layout.labels?.[String(day)] ?? '').trim() || dayLetters(day);

/** The small title line above the name: ר' becomes הר"ר; הרב, הרה"ג ר' stay as they are. */
export const titleLine = (sponsor: SheetSponsor) => {
  const pre = String(sponsor.preTitle || '').trim();
  if (!pre || pre === "ר'" || pre === 'ר׳' || pre === 'ר') return 'הר"ר';
  return pre;
};
export const firstLine = (sponsor: SheetSponsor) => String(sponsor.hebFirstName || '').trim();
export const lastLine = (sponsor: SheetSponsor) => [sponsor.hebLastName, sponsor.title].map(part => String(part || '').trim()).filter(Boolean).join(' ');
export const nameLine = (sponsor: SheetSponsor) => [firstLine(sponsor), lastLine(sponsor)].filter(Boolean).join(' ') || String(sponsor.donorName || '');
/** הי"ו or שליט"א. Default הי"ו. */
export const endLine = (sponsor: SheetSponsor) => String(sponsor.postTitle || '').trim() || 'הי"ו';

/** The text the system fills in from the booking and the donor. */
export const systemText = (sponsor: SheetSponsor | null): SheetText => sponsor ? { title: titleLine(sponsor), first: firstLine(sponsor), last: lastLine(sponsor) || (firstLine(sponsor) ? '' : String(sponsor.donorName || '')), end: endLine(sponsor), honoree: String(sponsor.honoree || ''), notes: String(sponsor.notes || '') } : {};
/** Keeps only the parts typed by hand (an empty part means "leave it empty"). */
export const cleanText = (raw: any): SheetText | undefined => {
  if (!raw || typeof raw !== 'object') return undefined; const out: SheetText = {};
  for (const field of TEXT_FIELDS) if (typeof raw[field] === 'string') out[field] = raw[field].slice(0, field === 'honoree' ? 400 : 120);
  return Object.keys(out).length ? out : undefined;
};
/** What is shown: the system text with the hand-typed parts on top. */
export const shownText = (sponsor: SheetSponsor | null, typed?: SheetText): SheetText => ({ ...systemText(sponsor), ...(cleanText(typed) || {}) });
export const hasText = (text: SheetText) => TEXT_FIELDS.some(field => String(text[field] || '').trim());

export const defaultLayout = (daysInMonth: number): SheetLayout => ({ boxes: Array.from({ length: daysInMonth }, (_, index) => [index + 1]) });

/** Makes a saved layout safe: every day once, boxes of at most 7 days, missing days added at the end. */
export const normalizeLayout = (raw: any, daysInMonth: number): SheetLayout => {
  const seen = new Set<number>(); const boxes: number[][] = [];
  for (const box of Array.isArray(raw?.boxes) ? raw.boxes : []) {
    const days: number[] = [];
    for (const value of Array.isArray(box) ? box : []) { const day = Number(value); if (Number.isInteger(day) && day >= 1 && day <= daysInMonth && !seen.has(day)) { seen.add(day); days.push(day); } }
    for (let start = 0; start < days.length; start += PER_ROW) boxes.push(days.slice(start, start + PER_ROW));
  }
  for (let day = 1; day <= daysInMonth; day++) if (!seen.has(day)) boxes.push([day]);
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw?.labels || {})) { const text = String(value || '').trim().slice(0, 12); if (text && Number(key) >= 1 && Number(key) <= daysInMonth) labels[key] = text; }
  const texts: Record<string, SheetText> = {};
  for (const [key, value] of Object.entries(raw?.texts || {})) { const text = cleanText(value); if (text && Number(key) >= 1 && Number(key) <= daysInMonth) texts[key] = text; }
  return { boxes, labels, monthTitle: String(raw?.monthTitle || '').trim().slice(0, 40) || undefined, bandMonth: String(raw?.bandMonth || '').trim().slice(0, 40) || undefined, texts, patronText: cleanText(raw?.patronText), pieces: cleanPieces(raw?.pieces) };
};

/** One box over all the chosen boxes' days, at the place of the first one. At most 7 days in a box. */
export const mergeBoxes = (layout: SheetLayout, indexes: number[]): SheetLayout => {
  const chosen = [...new Set(indexes)].filter(index => index >= 0 && index < layout.boxes.length).sort((a, b) => a - b);
  if (chosen.length < 2) return layout;
  const days = chosen.flatMap(index => layout.boxes[index]);
  if (days.length > PER_ROW) throw new Error(`A box can have at most ${PER_ROW} days (one row).`);
  const boxes = layout.boxes.flatMap((box, index) => index === chosen[0] ? [days] : chosen.includes(index) ? [] : [box]);
  return { ...layout, boxes };
};
/** Back to one box per day, in the same place. */
export const splitBox = (layout: SheetLayout, index: number): SheetLayout => ({ ...layout, boxes: layout.boxes.flatMap((box, at) => at === index ? box.map(day => [day]) : [box]) });
/** Moves a box to another place in the order. */
export const moveBox = (layout: SheetLayout, from: number, to: number): SheetLayout => {
  if (from === to || from < 0 || from >= layout.boxes.length) return layout;
  const boxes = [...layout.boxes]; const [box] = boxes.splice(from, 1); boxes.splice(Math.max(0, Math.min(to, boxes.length)), 0, box);
  return { ...layout, boxes };
};

/** Puts the boxes in rows of 7 (right to left). A box that does not fit in the rest of the row starts a new row. */
export const placeBoxes = (layout: SheetLayout): { placed: PlacedBox[]; rows: number } => {
  const placed: PlacedBox[] = []; let row = 0; let col = 0;
  layout.boxes.forEach((days, index) => {
    const span = Math.min(PER_ROW, Math.max(1, days.length));
    if (col + span > PER_ROW) { row++; col = 0; }
    placed.push({ index, days, row, col, span }); col += span;
    if (col === PER_ROW) { row++; col = 0; }
  });
  return { placed, rows: col === 0 ? row : row + 1 };
};
