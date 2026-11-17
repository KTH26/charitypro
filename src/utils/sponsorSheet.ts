/**
 * The monthly sponsor list ("מכירת זכות יומי הצלה"): one box per sponsor over the days he took,
 * seven days to a row (right to left), like the printed sheet. Days nobody took get an empty box.
 */
import { gematriya } from '@hebcal/core';

export type SheetSponsor = {
  donorId: string; preTitle?: string; hebFirstName?: string; hebLastName?: string; title?: string; postTitle?: string;
  donorName?: string; honoree?: string; notes?: string;
};
export type SheetDay = SheetSponsor & { day: number };
export type SheetBox = { days: number[]; sponsor: SheetSponsor | null; span: number };
export type SheetRow = SheetBox[];

/** "א", "יא", "כט": the day in Hebrew letters, without ׳ ״ marks. */
export const dayLetters = (day: number) => gematriya(day).replace(/[׳״'"]/g, '');

/** The small title line above the name: ר' becomes הר"ר; הרב, הרה"ג ר' stay as they are. */
export const titleLine = (sponsor: SheetSponsor) => {
  const pre = String(sponsor.preTitle || '').trim();
  if (!pre || pre === "ר'" || pre === 'ר׳' || pre === 'ר') return 'הר"ר';
  return pre;
};
/** The name (first and last), with the donor's title (e.g. מו"ץ) if he has one. */
export const nameLine = (sponsor: SheetSponsor) => [sponsor.hebFirstName, sponsor.hebLastName, sponsor.title].map(part => String(part || '').trim()).filter(Boolean).join(' ') || String(sponsor.donorName || '');
/** הי"ו or שליט"א. Default הי"ו. */
export const endLine = (sponsor: SheetSponsor) => String(sponsor.postTitle || '').trim() || 'הי"ו';

/**
 * Builds the rows. Days of the same donor with the same dedication become one box (even when they are not
 * next to each other), placed at the place of his first day. A box wider than what is left in the row starts a new row.
 */
export const buildSheet = (daysInMonth: number, taken: SheetDay[], perRow = 7): SheetRow[] => {
  const byDay = new Map(taken.map(item => [item.day, item]));
  const groups: { key: string; days: number[]; sponsor: SheetSponsor | null }[] = [];
  const byKey = new Map<string, { key: string; days: number[]; sponsor: SheetSponsor | null }>();
  for (let day = 1; day <= daysInMonth; day++) {
    const item = byDay.get(day);
    const key = item ? `${item.donorId}|${String(item.honoree || '').trim()}` : `free-${day}`;
    let group = byKey.get(key);
    if (!group) { group = { key, days: [], sponsor: item ? { ...item } : null }; byKey.set(key, group); groups.push(group); }
    group.days.push(day);
  }
  const rows: SheetRow[] = []; let row: SheetRow = []; let used = 0;
  const push = (box: SheetBox) => { if (used + box.span > perRow) { rows.push(row); row = []; used = 0; } row.push(box); used += box.span; if (used === perRow) { rows.push(row); row = []; used = 0; } };
  for (const group of groups) for (let start = 0; start < group.days.length; start += perRow) {
    const days = group.days.slice(start, start + perRow); push({ days, sponsor: group.sponsor, span: days.length });
  }
  if (row.length) rows.push(row);
  return rows;
};
