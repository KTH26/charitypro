/**
 * Makes a real Excel file (.xlsx) in the browser, with no extra library.
 * Numbers stay numbers, dates stay dates, Hebrew/Yiddish works, the top row is bold and frozen, with filter arrows.
 */
export type ExcelColumn = { key: string; header: string; type?: 'text' | 'number' | 'money' | 'date'; width?: number };
export type ExcelSheet = { name: string; columns: ExcelColumn[]; rows: Record<string, any>[]; totals?: Record<string, any> | null; title?: string; freezeColumns?: number };

const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A plain zip file (no compression). */
export const zip = (files: { name: string; data: string }[]) => {
  const encoder = new TextEncoder(); const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name); const data = encoder.encode(file.data); const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true); head.setUint16(4, 20, true); head.setUint16(6, 20, true); head.setUint16(8, 0x0800, true); head.setUint16(10, 0, true); head.setUint16(12, 0, true); head.setUint16(14, 0x21, true);
    head.setUint32(16, crc, true); head.setUint32(20, data.length, true); head.setUint32(24, data.length, true); head.setUint16(28, name.length, true); head.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, data); central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const esc = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (index: number) => { let name = ''; let n = index + 1; while (n > 0) { const rem = (n - 1) % 26; name = String.fromCharCode(65 + rem) + name; n = Math.floor((n - 1) / 26); } return name; };
const excelDate = (value: string) => { const time = Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))); return Number.isFinite(time) ? time / 86400000 + 25569 : null; };
const sheetName = (name: string, used: Set<string>) => { let base = (name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31); let result = base; let i = 2; while (used.has(result.toLowerCase())) { const suffix = ` ${i++}`; result = base.slice(0, 31 - suffix.length) + suffix; } used.add(result.toLowerCase()); return result; };

// Styles: 0 normal · 1 bold header · 2 money with cents · 3 date · 4 bold money with cents (totals) · 5 bold text · 6 title · 7 money, whole dollars · 8 bold money, whole dollars
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="&quot;$&quot;#,##0"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

const cell = (ref: string, value: unknown, type: ExcelColumn['type'], style?: number) => {
  if (value === null || value === undefined || value === '') return '';
  if ((type === 'number' || type === 'money') && Number.isFinite(Number(value)) && typeof value !== 'boolean') {
    // Money shows cents only when there are cents: $100 or $100.67.
    const whole = type === 'money' && Number.isInteger(Math.round(Number(value) * 100) / 100);
    const shown = type === 'money' ? (style === 4 ? (whole ? 8 : 4) : style ?? (whole ? 7 : 2)) : style ?? 0;
    return `<c r="${ref}" s="${shown}"><v>${Number(value)}</v></c>`;
  }
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) { const serial = excelDate(String(value)); if (serial !== null) return `<c r="${ref}" s="${style ?? 3}"><v>${serial}</v></c>`; }
  return `<c r="${ref}" t="inlineStr"${style !== undefined ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
};

const sheetXml = (sheet: ExcelSheet) => {
  const rows: string[] = []; let r = 1;
  if (sheet.title) { rows.push(`<row r="${r}">${cell(`A${r}`, sheet.title, 'text', 6)}</row>`); r += 2; }
  const headerRow = r;
  rows.push(`<row r="${r}">${sheet.columns.map((column, i) => cell(`${colName(i)}${r}`, column.header, 'text', 1)).join('')}</row>`); r++;
  for (const row of sheet.rows) { rows.push(`<row r="${r}">${sheet.columns.map((column, i) => cell(`${colName(i)}${r}`, row[column.key], column.type)).join('')}</row>`); r++; }
  if (sheet.totals) rows.push(`<row r="${r}">${sheet.columns.map((column, i) => { const value = sheet.totals![column.key]; return value === undefined || value === '' ? `<c r="${colName(i)}${r}" s="5"/>` : cell(`${colName(i)}${r}`, value, column.type === 'money' ? 'money' : column.type === 'number' ? 'number' : 'text', column.type === 'money' ? 4 : 5); }).join('')}</row>`);
  const widths = sheet.columns.map((column, i) => { const longest = Math.max(String(column.header).length, ...sheet.rows.slice(0, 500).map(row => String(row[column.key] ?? '').length)); return `<col min="${i + 1}" max="${i + 1}" width="${column.width || Math.min(60, Math.max(9, longest + 2))}" customWidth="1"/>`; }).join('');
  const last = `${colName(Math.max(0, sheet.columns.length - 1))}${headerRow + sheet.rows.length}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0">${sheet.freezeColumns ? `<pane xSplit="${sheet.freezeColumns}" ySplit="${headerRow}" topLeftCell="${colName(sheet.freezeColumns)}${headerRow + 1}" activePane="bottomRight" state="frozen"/>` : `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>`}</sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows.join('')}</sheetData>${sheet.columns.length ? `<autoFilter ref="A${headerRow}:${last}"/>` : ''}</worksheet>`;
};

export const buildWorkbook = (sheets: ExcelSheet[]) => {
  const used = new Set<string>(); const names = sheets.map(sheet => sheetName(sheet.name, used));
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${sheets.some(sheet => sheet.columns.length) ? `<definedNames>${sheets.map((sheet, i) => sheet.columns.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i].replace(/'/g, "''"))}'!$A$${sheet.title ? 3 : 1}:$${colName(sheet.columns.length - 1)}$${(sheet.title ? 3 : 1) + sheet.rows.length}</definedName>` : '').join('')}</definedNames>` : ''}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet) })),
  ];
  return zip(files);
};

export const downloadExcel = (fileName: string, sheets: ExcelSheet[]) => {
  const blob = buildWorkbook(sheets);
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = fileName.replace(/[\\/:*?"<>|]+/g, '-').replace(/\.xlsx$/i, '') + '.xlsx';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
