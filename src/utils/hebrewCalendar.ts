import { HDate, Locale, gematriya } from '@hebcal/core';

/** One booked or chosen place on the calendar: a single day, or a whole month. */
export type CalendarSlot = { kind: 'day' | 'month'; hebYear: number; hebMonth: number; hebDay?: number };
export type Dedication = CalendarSlot & { id: string; revision: number; date: string; label: string; donorId: string; donorName: string; donorYiddishName?: string; pledgeId?: string; honoree?: string; notes?: string };

const stripVowels = (text: string) => text.replace(/[֑-ׇ]/g, '');
export const slotId = (slot: CalendarSlot) => slot.kind === 'month' ? `ded-month-${slot.hebYear}-${slot.hebMonth}` : `ded-day-${slot.hebYear}-${slot.hebMonth}-${slot.hebDay}`;
export const todayHebrew = () => new HDate(new Date());
export const hebMonthName = (month: number, year: number) => stripVowels(Locale.gettext(new HDate(1, month, year).getMonthName(), 'he'));
export const hebMonthEnglish = (month: number, year: number) => new HDate(1, month, year).getMonthName();
export const hebYearText = (year: number) => gematriya(year);
export const hebDayText = (day: number) => gematriya(day);
/** Months of a Hebrew year in order, from Tishrei to Elul (13 in a leap year). */
export const monthsOfYear = (year: number) => {
  const order = [7, 8, 9, 10, 11, 12, ...(HDate.isLeapYear(year) ? [13] : []), 1, 2, 3, 4, 5, 6];
  return order.map(month => ({ month, he: hebMonthName(month, year), en: hebMonthEnglish(month, year), days: HDate.daysInMonth(month, year) }));
};
export const isoOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** All days of one Hebrew month with their English date and weekday (0 = Sunday). */
export const daysOfMonth = (month: number, year: number) => Array.from({ length: HDate.daysInMonth(month, year) }, (_, index) => {
  const hd = new HDate(index + 1, month, year); const greg = hd.greg();
  return { day: index + 1, he: gematriya(index + 1), greg, iso: isoOf(greg), weekday: greg.getDay() };
});
/** The next month / previous month, moving across years. */
export const stepMonth = (month: number, year: number, step: 1 | -1) => {
  const months = monthsOfYear(year).map(item => item.month); const index = months.indexOf(month) + step;
  if (index >= months.length) return { month: 7, year: year + 1 };
  if (index < 0) { const previous = monthsOfYear(year - 1); return { month: previous[previous.length - 1].month, year: year - 1 }; }
  return { month: months[index], year };
};
/** A short label like "ט״ו כסלו תשפ״ז" or "כסלו תשפ״ז (גאנצן חודש)". */
export const slotLabel = (slot: CalendarSlot) => slot.kind === 'month' ? `${hebMonthName(slot.hebMonth, slot.hebYear)} ${gematriya(slot.hebYear)} – whole month` : `${gematriya(slot.hebDay || 1)} ${hebMonthName(slot.hebMonth, slot.hebYear)} ${gematriya(slot.hebYear)}`;
/** Seven days in a row starting from a day (a "week"). */
export const weekFrom = (day: number, month: number, year: number): CalendarSlot[] => {
  const start = new HDate(day, month, year);
  return Array.from({ length: 7 }, (_, index) => { const hd = start.add(index, 'd'); return { kind: 'day' as const, hebYear: hd.getFullYear(), hebMonth: hd.getMonth(), hebDay: hd.getDate() }; });
};
export const WEEKDAYS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
