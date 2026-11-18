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
/** boxes: the days of each box, in the order they are shown. labels: a day's text on its tab when it was changed. */
export type SheetLayout = { boxes: number[][]; labels?: Record<string, string>; monthTitle?: string; bandMonth?: string };
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
  return { boxes, labels, monthTitle: String(raw?.monthTitle || '').trim().slice(0, 40) || undefined, bandMonth: String(raw?.bandMonth || '').trim().slice(0, 40) || undefined };
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
