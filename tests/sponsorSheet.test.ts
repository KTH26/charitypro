import { describe, expect, it } from 'vitest';
import { changePiece, cleanPieces, dayLabel, pieceSpot, dayLetters, defaultLayout, endLine, hasText, mergeBoxes, moveBox, nameLine, normalizeLayout, placeBoxes, shownText, splitBox, titleLine } from '../src/utils/sponsorSheet';

const rowsOf = (layout: ReturnType<typeof defaultLayout>) => { const { placed } = placeBoxes(layout); const rows: string[][] = []; for (const box of placed) (rows[box.row] ||= []).push(box.days.map(day => dayLabel(layout, day)).join(',')); return rows; };

describe('monthly sponsor list layout', () => {
  it('starts with one box per day, 7 in a row', () => {
    const rows = rowsOf(defaultLayout(29));
    expect(rows).toHaveLength(5); expect(rows[0]).toEqual(['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז']); expect(rows[4]).toEqual(['כט']);
  });

  it('can be merged into the Elul sheet: Klein over 7 days, then the single days, 2- and 3-day boxes', () => {
    let layout = defaultLayout(29);
    const indexOf = (day: number) => layout.boxes.findIndex(box => box.includes(day));
    const mergeDays = (days: number[]) => { layout = mergeBoxes(layout, days.map(indexOf)); };
    mergeDays([1, 3, 4, 6, 7, 8, 9]); mergeDays([22, 23]); mergeDays([25, 26, 27]);
    expect(rowsOf(layout)).toEqual([
      ['א,ג,ד,ו,ז,ח,ט'],
      ['ב', 'ה', 'י', 'יא', 'יב', 'יג', 'יד'],
      ['טו', 'טז', 'יז', 'יח', 'יט', 'כ', 'כא'],
      ['כב,כג', 'כד', 'כה,כו,כז', 'כח'],
      ['כט'],
    ]);
    const { placed } = placeBoxes(layout); expect(placed[0].span).toBe(7); expect(placed.find(box => box.days[0] === 25)?.col).toBe(3);
  });

  it('splits back, moves boxes, keeps changed day labels, and never loses a day', () => {
    let layout = mergeBoxes(defaultLayout(30), [0, 1]);
    expect(layout.boxes[0]).toEqual([1, 2]);
    layout = splitBox(layout, 0); expect(layout.boxes.slice(0, 2)).toEqual([[1], [2]]);
    layout = moveBox(layout, 0, 3); expect(layout.boxes.slice(0, 4)).toEqual([[2], [3], [4], [1]]);
    layout = { ...layout, labels: { '1': 'ל' } }; expect(dayLabel(layout, 1)).toBe('ל'); expect(dayLabel(layout, 2)).toBe('ב');
    expect(() => mergeBoxes(defaultLayout(30), [0, 1, 2, 3, 4, 5, 6, 7])).toThrow();
    const fixed = normalizeLayout({ boxes: [[1, 1, 2], [40], 'x'] }, 29);
    expect(fixed.boxes.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });

  it('text typed by hand goes over the system text, and is kept when the layout is saved', () => {
    const sponsor = { donorId: 'd', preTitle: "ר'", hebFirstName: 'משה', hebLastName: 'כהן', honoree: 'לע"נ אביו' };
    expect(shownText(sponsor)).toMatchObject({ title: 'הר"ר', first: 'משה', last: 'כהן', end: 'הי"ו', honoree: 'לע"נ אביו' });
    expect(shownText(sponsor, { last: 'כהן ובניו', honoree: '' })).toMatchObject({ first: 'משה', last: 'כהן ובניו', honoree: '' });
    expect(hasText(shownText(null, { first: 'משפחת גרין' }))).toBe(true);
    expect(hasText(shownText(null))).toBe(false);
    const saved = normalizeLayout({ boxes: [[1]], texts: { '1': { first: 'אחר', bad: 'x' }, '99': { first: 'no' } }, patronText: { notes: 'יארצייט' } }, 29);
    expect(saved.texts).toEqual({ '1': { first: 'אחר' } }); expect(saved.patronText).toEqual({ notes: 'יארצייט' });
  });

  it('writes the titles like the sheet', () => {
    expect(dayLetters(15)).toBe('טו');
    expect(titleLine({ donorId: '', preTitle: "ר'" })).toBe('הר"ר');
    expect(titleLine({ donorId: '', preTitle: 'הרב' })).toBe('הרב');
    expect(nameLine({ donorId: '', hebFirstName: 'אלעזר', hebLastName: 'קליין' })).toBe('אלעזר קליין');
    expect(endLine({ donorId: '' })).toBe('הי"ו'); expect(endLine({ donorId: '', postTitle: 'שליט"א' })).toBe('שליט"א');
  });
});

describe('patron section pieces', () => {
  it('moves, hides and brings back a piece, and keeps only known pieces', () => {
    let layout = defaultLayout(30);
    layout = changePiece(layout, 'strip', { dx: 10, dy: -5 });
    layout = changePiece(layout, 'strip', { dx: 2.5 });
    expect(pieceSpot(layout, 'strip')).toEqual({ dx: 12.5, dy: -5 });
    layout = changePiece(layout, 'title', { hidden: true });
    expect(pieceSpot(layout, 'title').hidden).toBe(true);
    layout = changePiece(layout, 'title', { hidden: false });
    expect(layout.pieces?.title).toBeUndefined();
    expect(cleanPieces({ strip: { dx: 'x', dy: 99999 }, other: { dx: 5, dy: 5 }, band: { dx: 0, dy: 0 } })).toEqual({ strip: { dx: 0, dy: 1300 } });
    expect(normalizeLayout({ boxes: [], pieces: { name: { dx: 4, dy: 3, hidden: true } } }, 30).pieces).toEqual({ name: { dx: 4, dy: 3, hidden: true } });
  });
});
