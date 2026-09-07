import * as XLSX from 'xlsx';

import {
  arrivedPeople,
  invitedPeople,
  isConfirmedGuest,
  rsvpBucket,
  rsvpBucketLabel,
  type CoupleReportCategory,
  type CoupleReportGuest,
  type CoupleReportTable,
  type RsvpBucket,
} from '@/lib/coupleReports';

type ReportOpts = {
  eventTitle?: string;
  categories?: CoupleReportCategory[];
  tables?: CoupleReportTable[];
};

const CHECKIN_HEADERS = ['שם', 'מספר שהוזמנו', 'מספר שהגיעו', 'שולחן', 'קבוצה', 'צד', 'טלפון', "שעת צ'ק-אין", 'סטטוס הגעה'];
const RSVP_HEADERS = ['שם', 'מספר אורחים', 'סטטוס אישור', 'קבוצה', 'צד', 'שולחן', 'טלפון'];

function assertBrowser() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('ייצוא לאקסל זמין רק בדפדפן');
  }
}

function sanitizeFilePart(value: string) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function sideLabel(side?: 'groom' | 'bride' | null) {
  if (side === 'bride') return 'כלה';
  if (side === 'groom') return 'חתן';
  return '';
}

function formatCheckedInAt(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  } catch {
    return date.toLocaleString('he-IL');
  }
}

function buildCategoryLookup(categories: CoupleReportCategory[]) {
  const map = new Map<string, CoupleReportCategory>();
  for (const category of categories) {
    const id = String(category.id ?? '').trim();
    if (id) map.set(id, category);
  }
  return map;
}

function buildTableLookup(tables: CoupleReportTable[]) {
  const map = new Map<string, CoupleReportTable>();
  for (const table of tables) {
    const id = String(table.id ?? '').trim();
    if (id) map.set(id, table);
  }
  return map;
}

function tableLabel(table?: CoupleReportTable | null): string {
  const n = table?.number;
  if (typeof n === 'number' && Number.isFinite(n)) return String(n);
  const name = String(table?.name ?? '').trim();
  return name || 'ללא שולחן';
}

function tableSortKey(table?: CoupleReportTable | null): number {
  const n = table?.number;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  return Number.POSITIVE_INFINITY;
}

function guestName(guest: CoupleReportGuest) {
  return String(guest.name ?? '').trim();
}

function sortGuests(guests: CoupleReportGuest[], tables: Map<string, CoupleReportTable>) {
  return [...guests].sort((a, b) => {
    const tableA = a.tableId ? tables.get(String(a.tableId).trim()) : undefined;
    const tableB = b.tableId ? tables.get(String(b.tableId).trim()) : undefined;
    const byTable = tableSortKey(tableA) - tableSortKey(tableB);
    if (byTable !== 0) return byTable;
    return guestName(a).localeCompare(guestName(b), 'he');
  });
}

function applySheetView(worksheet: XLSX.WorkSheet, colWidths: number[], lastCol: string, lastRow: number) {
  worksheet['!cols'] = colWidths.map((wch) => ({ wch }));
  if (lastRow >= 1) {
    worksheet['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` };
    (worksheet as any)['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  }
}

function appendSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: (string | number)[][],
  widths: number[],
  lastCol: string
) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  applySheetView(sheet, widths, lastCol, rows.length);
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function appendSummarySheet(workbook: XLSX.WorkBook, title: string, rows: (string | number)[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([['שדה', 'ערך'], ...rows]);
  sheet['!cols'] = [{ wch: 22 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(workbook, sheet, title);
}

function lookupMeta(
  guest: CoupleReportGuest,
  categories: Map<string, CoupleReportCategory>,
  tables: Map<string, CoupleReportTable>
) {
  const category = guest.category_id ? categories.get(String(guest.category_id).trim()) : undefined;
  const table = guest.tableId ? tables.get(String(guest.tableId).trim()) : undefined;
  return {
    categoryName: String(category?.name ?? '').trim(),
    side: sideLabel(category?.side),
    table: tableLabel(table),
    phone: String(guest.phone ?? '').trim(),
  };
}

function checkInRow(
  guest: CoupleReportGuest,
  categories: Map<string, CoupleReportCategory>,
  tables: Map<string, CoupleReportTable>
) {
  const meta = lookupMeta(guest, categories, tables);
  const arrived = Boolean(guest.checkedIn);
  return [
    guestName(guest),
    invitedPeople(guest),
    arrived ? arrivedPeople(guest) : 0,
    meta.table,
    meta.categoryName,
    meta.side,
    meta.phone,
    arrived ? formatCheckedInAt(guest.checkedInAt) : '',
    arrived ? 'הגיע' : 'לא הגיע',
  ];
}

function rsvpRow(
  guest: CoupleReportGuest,
  categories: Map<string, CoupleReportCategory>,
  tables: Map<string, CoupleReportTable>
) {
  const meta = lookupMeta(guest, categories, tables);
  return [
    guestName(guest),
    invitedPeople(guest),
    rsvpBucketLabel(guest.status),
    meta.categoryName,
    meta.side,
    meta.table,
    meta.phone,
  ];
}

function fileName(prefix: string, eventTitle?: string) {
  const eventPart = sanitizeFilePart(String(eventTitle || 'אירוע'));
  const datePart = new Date().toISOString().slice(0, 10);
  return `${prefix}-${eventPart}-${datePart}.xlsx`;
}

function sumPeople(guests: CoupleReportGuest[], arrivedOnly = false) {
  return guests.reduce((sum, guest) => sum + (arrivedOnly ? arrivedPeople(guest) : invitedPeople(guest)), 0);
}

export function exportCheckInReportToExcel(guests: CoupleReportGuest[], opts?: ReportOpts) {
  assertBrowser();

  const categories = buildCategoryLookup(opts?.categories ?? []);
  const tables = buildTableLookup(opts?.tables ?? []);
  const confirmers = sortGuests(guests.filter(isConfirmedGuest), tables);
  const arrived = confirmers.filter((guest) => Boolean(guest.checkedIn));
  const missing = confirmers.filter((guest) => !guest.checkedIn);

  if (!confirmers.length) {
    throw new Error('אין מאשרים לייצוא');
  }

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };

  appendSummarySheet(workbook, 'סיכום', [
    ['דוח', 'צ׳ק אין — מאשרים'],
    ['אירוע', String(opts?.eventTitle || 'אירוע')],
    ['הופק ב', formatCheckedInAt(new Date())],
    ['מאשרים (הזמנות)', confirmers.length],
    ['מאשרים (אורחים)', sumPeople(confirmers)],
    ['הגיעו (הזמנות)', arrived.length],
    ['הגיעו (אורחים)', sumPeople(arrived, true)],
    ['לא הגיעו (הזמנות)', missing.length],
    ['לא הגיעו (אורחים)', sumPeople(missing)],
  ]);

  const widths = [28, 16, 16, 14, 18, 10, 16, 18, 14];
  appendSheet(workbook, 'הגיעו', CHECKIN_HEADERS, arrived.map((g) => checkInRow(g, categories, tables)), widths, 'I');
  appendSheet(workbook, 'לא הגיעו', CHECKIN_HEADERS, missing.map((g) => checkInRow(g, categories, tables)), widths, 'I');

  const name = fileName('דוח-צק-אין', opts?.eventTitle);
  XLSX.writeFile(workbook, name);
  return { fileName: name, arrived: arrived.length, missing: missing.length, confirmers: confirmers.length };
}

export function exportRsvpReportToExcel(guests: CoupleReportGuest[], opts?: ReportOpts) {
  assertBrowser();

  const categories = buildCategoryLookup(opts?.categories ?? []);
  const tables = buildTableLookup(opts?.tables ?? []);
  const all = sortGuests(guests, tables);
  if (!all.length) {
    throw new Error('אין מוזמנים לייצוא');
  }

  const byBucket: Record<RsvpBucket, CoupleReportGuest[]> = {
    confirmed: [],
    declined: [],
    pending: [],
    maybe: [],
  };
  for (const guest of all) {
    byBucket[rsvpBucket(guest.status)].push(guest);
  }

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };

  appendSummarySheet(workbook, 'סיכום', [
    ['דוח', 'אישורי הגעה'],
    ['אירוע', String(opts?.eventTitle || 'אירוע')],
    ['הופק ב', formatCheckedInAt(new Date())],
    ['סה״כ הזמנות', all.length],
    ['סה״כ אורחים', sumPeople(all)],
    ['אישרו הגעה (הזמנות)', byBucket.confirmed.length],
    ['אישרו הגעה (אורחים)', sumPeople(byBucket.confirmed)],
    ['לא אישרו (הזמנות)', byBucket.declined.length],
    ['לא אישרו (אורחים)', sumPeople(byBucket.declined)],
    ['ממתינים (הזמנות)', byBucket.pending.length],
    ['ממתינים (אורחים)', sumPeople(byBucket.pending)],
    ['אולי (הזמנות)', byBucket.maybe.length],
    ['אולי (אורחים)', sumPeople(byBucket.maybe)],
  ]);

  const widths = [28, 16, 16, 18, 10, 14, 16];
  const sheets: { name: string; rows: CoupleReportGuest[] }[] = [
    { name: 'הכל', rows: all },
    { name: 'אישרו הגעה', rows: byBucket.confirmed },
    { name: 'לא אישרו', rows: byBucket.declined },
    { name: 'ממתינים', rows: byBucket.pending },
    { name: 'אולי', rows: byBucket.maybe },
  ];

  for (const sheet of sheets) {
    appendSheet(workbook, sheet.name, RSVP_HEADERS, sheet.rows.map((g) => rsvpRow(g, categories, tables)), widths, 'G');
  }

  const name = fileName('דוח-אישורי-הגעה', opts?.eventTitle);
  XLSX.writeFile(workbook, name);
  return { fileName: name, total: all.length };
}
