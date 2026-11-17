import { describe, expect, it } from 'vitest';
import { buildSheet, dayLetters, endLine, nameLine, titleLine } from '../src/utils/sponsorSheet';

const d = (day: number, donorId: string, honoree = '') => ({ day, donorId, honoree, hebFirstName: donorId, hebLastName: 'x' });

describe('monthly sponsor list', () => {
  it('lays out Elul like the printed sheet: Klein\'s 7 days in one row, then the single days, 2- and 3-day boxes', () => {
    const taken = [
      ...[1, 3, 4, 6, 7, 8, 9].map(day => d(day, 'klein', 'לע"נ אביו')),
      d(2, 'rosenbaum'), d(5, 'halberstam'), ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(day => d(day, `s${day}`)),
      d(22, 'grunhut'), d(23, 'grunhut'), d(24, 'stauber'), d(25, 'tyrnauer'), d(26, 'tyrnauer'), d(27, 'tyrnauer'), d(28, 'kritzler'), d(29, 'neuman'),
    ];
    const rows = buildSheet(29, taken);
    expect(rows.map(row => row.map(box => box.days.map(dayLetters).join(',')))).toEqual([
      ['א,ג,ד,ו,ז,ח,ט'],
      ['ב', 'ה', 'י', 'יא', 'יב', 'יג', 'יד'],
      ['טו', 'טז', 'יז', 'יח', 'יט', 'כ', 'כא'],
      ['כב,כג', 'כד', 'כה,כו,כז', 'כח'],
      ['כט'],
    ]);
    expect(rows[0][0].span).toBe(7);
  });

  it('shows free days as empty boxes and splits more than 7 days into rows', () => {
    const rows = buildSheet(30, Array.from({ length: 9 }, (_, index) => d(index + 1, 'big')));
    expect(rows[0]).toHaveLength(1); expect(rows[0][0].span).toBe(7);
    expect(rows[1][0].days).toEqual([8, 9]); expect(rows[1][1].sponsor).toBeNull();
    expect(rows.flat().reduce((sum, box) => sum + box.span, 0)).toBe(30);
  });

  it('writes the titles like the sheet', () => {
    expect(titleLine({ donorId: '', preTitle: "ר'" })).toBe('הר"ר');
    expect(titleLine({ donorId: '', preTitle: 'הרב' })).toBe('הרב');
    expect(nameLine({ donorId: '', hebFirstName: 'אלעזר', hebLastName: 'קליין' })).toBe('אלעזר קליין');
    expect(endLine({ donorId: '' })).toBe('הי"ו'); expect(endLine({ donorId: '', postTitle: 'שליט"א' })).toBe('שליט"א');
  });
});
