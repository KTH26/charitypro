/**
 * Makes the official receipt PDF in the Hatzolah design: the blank design pictures, with the
 * donor's details written in the same places as on the sample receipt.
 * Positions are in PDF points (612 × 792 page, 0 = bottom left).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { HEBREW_FONT_BOLD, RECEIPT_IMAGE_BOTTOM, RECEIPT_IMAGE_MIDDLE, RECEIPT_IMAGE_TOP } from './receipt-assets';

export type ReceiptFields = {
  date: string; receiptNumber: string; amount: string;
  donorName: string; addressLine1: string; addressLine2: string;
  yiddishPreTitle: string; yiddishName: string; yiddishPostTitle: string;
};

const bytes = (base64: string) => Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
const HEBREW = /[֐-׿יִ-ﭏ]/;
/** Use the Hebrew quote marks (the font shapes and turns the Hebrew letters right to left by itself). */
const visualHebrew = (word: string) => word.replace(/"/g, '״').replace(/'/g, '׳').replace(/[֑-ׇ]/g, '');
/** Only letters the standard PDF font knows (accents are fine); anything else becomes "?". */
const latin = (text: string) => String(text || '').replace(/[^\x20-\x7E -ÿ]/g, '?');

/** Write a line that ends at `right` (for Yiddish). Each word separately, because the Hebrew font has no space. */
const drawRightAligned = (page: PDFPage, text: string, right: number, y: number, size: number, hebrew: PDFFont, fallback: PDFFont) => {
  const value = String(text || '').trim(); if (!value) return;
  if (!HEBREW.test(value)) { const clean = latin(value); page.drawText(clean, { x: right - fallback.widthOfTextAtSize(clean, size), y, size, font: fallback, color: rgb(0, 0, 0) }); return; }
  const words = value.split(/\s+/).filter(Boolean).map(visualHebrew);
  const gap = size * 0.28;
  let x = right;
  for (const word of words) { // first word is the right-most
    const width = hebrew.widthOfTextAtSize(word, size); x -= width;
    page.drawText(word, { x, y, size, font: hebrew, color: rgb(0, 0, 0) });
    x -= gap;
  }
};

export const buildReceiptPdf = async (fields: ReceiptFields) => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Official receipt ${fields.receiptNumber}`);
  const page = pdf.addPage([612, 792]);
  const [top, middle, bottom] = await Promise.all([RECEIPT_IMAGE_TOP, RECEIPT_IMAGE_MIDDLE, RECEIPT_IMAGE_BOTTOM].map(image => pdf.embedJpg(bytes(image))));
  // The three pictures of the blank design, exactly where they are on the sample.
  page.drawImage(top, { x: 0, y: 395.4, width: 611.4, height: 395.76 });
  page.drawImage(middle, { x: 0, y: 197.52, width: 611.4, height: 197.88 });
  page.drawImage(bottom, { x: 0, y: -0.36, width: 611.4, height: 197.88 });
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const hebrew = await pdf.embedFont(bytes(HEBREW_FONT_BOLD), { subset: true });
  const black = rgb(0, 0, 0);
  const write = (text: string, x: number, y: number, size: number, font: PDFFont) => { const clean = latin(text).trim(); if (clean) page.drawText(clean, { x, y, size, font, color: black }); };

  // Top part (letter): the donor's Yiddish name between "כבוד ידידינו" and "ברוב תודה".
  drawRightAligned(page, fields.yiddishPreTitle, 557, 489.7, 9, hebrew, times);
  drawRightAligned(page, fields.yiddishName || fields.donorName, 557, 469.5, 19, hebrew, timesBold);
  drawRightAligned(page, fields.yiddishPostTitle, 557, 455.0, 9, hebrew, times);
  // Bottom part (official receipt).
  write(fields.date, 490, 165.2, 11, times);
  write(fields.receiptNumber, 338.4, 162.8, 7, timesBold);
  write(fields.donorName, 59.5, 127.6, 11, timesBold);
  write(fields.addressLine1, 59.5, 105.8, 11, times);
  write(fields.addressLine2, 59.5, 84.2, 11, times);
  write(fields.amount, 444.2, 83.8, 14, times);
  return pdf.save();
};

export const toBase64 = (data: Uint8Array) => { let text = ''; for (let index = 0; index < data.length; index += 0x8000) text += String.fromCharCode(...data.subarray(index, index + 0x8000)); return btoa(text); };
