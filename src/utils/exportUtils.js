function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const cellValue = (v) => {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

export function toCsv(rows, columns) {
  const header = columns.map(c => escapeCsv(c)).join(',');
  const body = rows.map(row => columns.map(c => escapeCsv(row[c])).join(','));
  return [header, ...body].join('\n');
}

export function downloadCsv({ filename, rows, columns }) {
  downloadFile(filename, toCsv(rows, columns), 'text/csv;charset=utf-8');
}

export function downloadJson(filename, data) {
  downloadFile(filename, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}

/**
 * Export data as an .xlsx workbook with one or more sheets.
 * Each sheet: { name, rows } where rows is an array of plain objects.
 */
export async function downloadExcel({ filename, sheets }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = s.rows && s.rows.length
      ? XLSX.utils.json_to_sheet(s.rows)
      : XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  });
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadFile(filename, data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/**
 * Export tabular data as a PDF report (jsPDF + autoTable).
 * columns: [{ key, label }] — key indexes row entries, label is the header.
 */
export async function downloadPdf({ filename, title, subtitle, columns, rows, orientation = 'landscape' }) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(116, 100, 220);
  doc.text(title, 40, 46);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  let y = subtitle ? 62 : 60;
  if (subtitle) doc.text(subtitle, 40, y);
  y += 12;
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, y);

  autoTable(doc, {
    startY: y + 12,
    head: [columns.map(c => c.label)],
    body: rows.map(r => columns.map(c => cellValue(r[c.key]))),
    theme: 'grid',
    margin: { left: 40, right: 40, top: 40, bottom: 40 },
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: [226, 232, 240],
      fillColor: [18, 21, 44],
      lineColor: [45, 55, 72],
      lineWidth: 0.5,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [116, 100, 220],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [24, 28, 52] },
  });

  doc.save(filename);
}

const MAX_EXCEL_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_EXCEL_SHEETS = 10;
const MAX_EXCEL_ROWS = 10000;
const MAX_EXCEL_COLUMNS = 200;
const EXCEL_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

/**
 * Parse an Excel (.xlsx / .xls) File into a list of sheets.
 * Each sheet: { name, rows } where rows is an array of plain objects.
 *
 * This helper is not currently wired to any admin upload flow. It still treats
 * the file as untrusted: extension/MIME/size are checked before reading, the
 * parser is told not to evaluate formulas or macros, and workbook dimensions
 * are capped before rows are materialised.
 */
export async function parseExcelFile(file) {
  if (!file) {
    throw new Error('No file provided.');
  }
  const name = (file.name || '').toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    throw new Error('Only .xlsx or .xls files are allowed.');
  }
  if (file.type && !EXCEL_MIME_TYPES.has(String(file.type).toLowerCase())) {
    throw new Error('The selected file is not an Excel workbook.');
  }
  if (!file.size) {
    throw new Error('The selected file is empty.');
  }
  if (file.size > MAX_EXCEL_BYTES) {
    throw new Error('File is too large. Maximum size is 5 MB.');
  }
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isXlsx = name.endsWith('.xlsx');
  const zipMagic = bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
    && (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
  const oleMagic = bytes.length >= 8
    && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11
    && bytes[3] === 0xe0 && bytes[4] === 0xa1 && bytes[5] === 0xb1
    && bytes[6] === 0x1a && bytes[7] === 0xe1;
  if ((isXlsx && !zipMagic) || (!isXlsx && !oleMagic)) {
    throw new Error('Unable to parse Excel file. The file may be corrupted.');
  }
  let wb;
  try {
    wb = XLSX.read(buf, {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      sheetRows: MAX_EXCEL_ROWS + 1,
    });
  } catch {
    throw new Error('Unable to parse Excel file. The file may be corrupted.');
  }
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Workbook contains no sheets.');
  }
  if (wb.SheetNames.length > MAX_EXCEL_SHEETS) {
    throw new Error('Too many sheets in workbook.');
  }
  return wb.SheetNames.slice(0, MAX_EXCEL_SHEETS).map((sheetName) => {
    const sheet = wb.Sheets[sheetName];
    let rows = [];
    try {
      const ref = sheet && sheet['!ref'];
      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        const rowCount = range.e.r - range.s.r + 1;
        const columnCount = range.e.c - range.s.c + 1;
        if (rowCount > MAX_EXCEL_ROWS) {
          throw new Error(`Sheet "${sheetName}" exceeds the maximum row limit.`);
        }
        if (columnCount > MAX_EXCEL_COLUMNS) {
          throw new Error(`Sheet "${sheetName}" exceeds the maximum column limit.`);
        }
      }
      rows = XLSX.utils.sheet_to_json(sheet);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Sheet "')) {
        throw error;
      }
      throw new Error(`Unable to read sheet "${sheetName}".`);
    }
    if (Array.isArray(rows) && rows.length > MAX_EXCEL_ROWS) {
      throw new Error(`Sheet "${sheetName}" exceeds the maximum row limit.`);
    }
    return {
      name: sheetName,
      rows: Array.isArray(rows) ? rows : [],
    };
  });
}

export function todayStamp() {
  return new Date().toISOString().split('T')[0];
}