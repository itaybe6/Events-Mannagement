import * as XLSX from 'xlsx';
import { normalizeGuestPhone } from './guestPhone';

export type ParsedGuestRow = {
  name: string;
  phone: string;
  category: string;
  /** How many people are invited under this phone number. Defaults to 1 when the column is empty. */
  numberOfPeople: number;
  /** 1-based row number in the source sheet (header is row 1), useful for error messages. */
  sourceRow: number;
};

type LogicalColumn = 'name' | 'phone' | 'category' | 'people';

export type ParseGuestsResult = {
  rows: ParsedGuestRow[];
  /** Rows that were skipped because they had no usable name. */
  skipped: number;
  /** Total non-empty data rows that were inspected. */
  totalRows: number;
};

/**
 * Header aliases (lower-cased, whitespace-trimmed) for each logical column.
 * Supports both Hebrew and English so couples can use whichever template
 * they're comfortable with.
 */
const HEADER_ALIASES: Record<LogicalColumn, string[]> = {
  name: ['שם', 'שם מלא', 'שם המוזמן', 'שם מוזמן', 'name', 'full name', 'guest', 'guest name'],
  phone: [
    'טלפון',
    'מספר טלפון',
    'מספר',
    'פלאפון',
    'נייד',
    'phone',
    'phone number',
    'mobile',
    'tel',
    'telephone',
  ],
  category: ['קטגוריה', 'קבוצה', 'שיוך', 'category', 'group', 'tag'],
  people: [
    'כמות אנשים',
    'כמות מוזמנים',
    'מספר אנשים',
    'מספר מוזמנים',
    'כמות',
    'אנשים',
    "מס' אורחים שהוזמנו",
    'מס אורחים שהוזמנו',
    'מספר אורחים שהוזמנו',
    'מספר אורחים',
    'people',
    'number of people',
    'guests count',
    'party size',
    'qty',
    'quantity',
    'count',
  ],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
}

function matchColumn(header: string): LogicalColumn | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  for (const key of Object.keys(HEADER_ALIASES) as LogicalColumn[]) {
    if (HEADER_ALIASES[key].some((alias) => alias === normalized)) return key;
  }
  return null;
}

function cleanPhone(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  let raw = String(value).trim();
  // Excel sometimes stores phones as numbers (e.g. 5.0e8) or strips leading zeros.
  if (typeof value === 'number') {
    raw = String(value);
  }
  return normalizeGuestPhone(raw);
}

const MAX_PEOPLE_PER_GUEST = 99;

function parsePeopleCount(value: unknown): number {
  if (value === null || value === undefined || value === '') return 1;
  const raw = typeof value === 'number' ? value : Number.parseFloat(String(value).trim().replace(/,/g, ''));
  if (!Number.isFinite(raw)) return 1;
  const n = Math.round(raw);
  if (n < 1) return 1;
  return Math.min(MAX_PEOPLE_PER_GUEST, n);
}

/**
 * Parse an uploaded Excel/CSV file (as an ArrayBuffer) into guest rows.
 * Header matching is column-name based and order-independent.
 */
export function parseGuestsArrayBuffer(buffer: ArrayBuffer): ParseGuestsResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], skipped: 0, totalRows: 0 };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });

  if (!matrix.length) {
    return { rows: [], skipped: 0, totalRows: 0 };
  }

  // Locate the header row (first row that contains at least a name column).
  let headerRowIndex = -1;
  let columnMap: Record<number, LogicalColumn> = {};
  for (let i = 0; i < Math.min(matrix.length, 5); i++) {
    const row = matrix[i] || [];
    const map: Record<number, LogicalColumn> = {};
    row.forEach((cell, colIdx) => {
      const matched = matchColumn(cell);
      if (matched && map[colIdx] === undefined) map[colIdx] = matched;
    });
    const hasName = Object.values(map).includes('name');
    if (hasName) {
      headerRowIndex = i;
      columnMap = map;
      break;
    }
  }

  // Fallback: no recognizable header -> assume column order [name, phone, category, people].
  if (headerRowIndex === -1) {
    headerRowIndex = -1; // treat all rows as data
    columnMap = { 0: 'name', 1: 'phone', 2: 'category', 3: 'people' };
  }

  const rows: ParsedGuestRow[] = [];
  let skipped = 0;
  let totalRows = 0;

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const isEmpty = row.every((c) => String(c ?? '').trim() === '');
    if (isEmpty) continue;
    totalRows++;

    let name = '';
    let phone = '';
    let category = '';
    let numberOfPeople = 1;

    Object.entries(columnMap).forEach(([colIdxStr, key]) => {
      const colIdx = Number(colIdxStr);
      const value = row[colIdx];
      if (key === 'name') name = String(value ?? '').trim();
      else if (key === 'phone') phone = cleanPhone(value);
      else if (key === 'category') category = String(value ?? '').trim();
      else if (key === 'people') numberOfPeople = parsePeopleCount(value);
    });

    if (!name) {
      skipped++;
      continue;
    }

    rows.push({
      name,
      phone,
      category,
      numberOfPeople,
      sourceRow: i + 1,
    });
  }

  return { rows, skipped, totalRows };
}

/**
 * Read a browser File and parse it into guest rows. Web-only.
 */
export function parseGuestsFile(file: File): Promise<ParseGuestsResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('לא ניתן לקרוא את הקובץ'));
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        resolve(parseGuestsArrayBuffer(buffer));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('קובץ לא תקין'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Open a native file picker (web) and resolve with the parsed rows.
 * Resolves with null if the user cancels.
 */
export function pickAndParseGuestsFile(): Promise<ParseGuestsResult | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('ייבוא מאקסל זמין רק בדפדפן'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
    input.style.display = 'none';

    let settled = false;
    const cleanup = () => {
      input.value = '';
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) {
        if (!settled) {
          settled = true;
          resolve(null);
        }
        cleanup();
        return;
      }
      parseGuestsFile(file)
        .then((result) => {
          settled = true;
          resolve(result);
        })
        .catch((e) => {
          settled = true;
          reject(e);
        })
        .finally(cleanup);
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Generate and download a ready-to-fill Excel template for guests.
 * Web-only.
 */
export function downloadGuestImportTemplate(opts?: { eventTitle?: string }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('הורדת תבנית זמינה רק בדפדפן');
  }

  const headers = ['שם', 'טלפון', 'קטגוריה', 'כמות אנשים'];
  const example = [
    ['ישראל ישראלי', '0501234567', 'משפחת החתן', 2],
    ['מאיה כהן', '0521234567', 'חברים', 1],
    ['דנה לוי', '0541234567', 'משפחת הכלה', 3],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...example]);
  worksheet['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 20 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'מוזמנים');

  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `תבנית-מוזמנים-${datePart}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  return { fileName };
}
