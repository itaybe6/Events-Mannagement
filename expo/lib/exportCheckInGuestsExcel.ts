import * as XLSX from 'xlsx';

export type CheckInExportGuest = {
  id?: string;
  name: string;
  phone?: string | null;
  status?: string | null;
  category_id?: string | null;
  tableId?: string | null;
  numberOfPeople?: number | null;
  checkedIn?: boolean;
  checkedInAt?: Date | string | null;
  checkedInCount?: number | null;
};

export type CheckInExportCategory = {
  id: string;
  name: string;
  side?: 'groom' | 'bride' | null;
};

export type CheckInExportTable = {
  id: string;
  number?: number | null;
  name?: string | null;
  capacity?: number | null;
};

const GUESTS_HEADERS = [
  'מספר שולחן',
  'שם',
  'מספר שהגיעו',
  'מספר שהוזמנו',
  'קבוצה',
  'צד',
  'טלפון',
  "שעת צ'ק-אין",
];

const NO_TABLE_LABEL = 'ללא שולחן';

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

function invitedPeople(guest: CheckInExportGuest): number {
  return Math.max(1, Number(guest.numberOfPeople) || 1);
}

function arrivedPeople(guest: CheckInExportGuest): number {
  if (!guest.checkedIn) return 0;
  const invited = invitedPeople(guest);
  const actual =
    guest.checkedInCount === null || guest.checkedInCount === undefined
      ? null
      : Number(guest.checkedInCount);
  const n = actual !== null && Number.isFinite(actual) ? actual : invited;
  return Math.max(0, n);
}

function formatCheckedInAt(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString('he-IL');
  }
}

function buildCategoryLookup(categories: CheckInExportCategory[]) {
  const map = new Map<string, CheckInExportCategory>();
  for (const category of categories) {
    const id = String(category.id ?? '').trim();
    if (id) map.set(id, category);
  }
  return map;
}

function buildTableLookup(tables: CheckInExportTable[]) {
  const map = new Map<string, CheckInExportTable>();
  for (const table of tables) {
    const id = String(table.id ?? '').trim();
    if (id) map.set(id, table);
  }
  return map;
}

function tableSortKey(table?: CheckInExportTable | null): number {
  const n = table?.number;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  return Number.POSITIVE_INFINITY;
}

function tableNumberCell(table?: CheckInExportTable | null): number | string {
  const n = table?.number;
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  const name = String(table?.name ?? '').trim();
  if (name) return name;
  return NO_TABLE_LABEL;
}

function tableHeading(table?: CheckInExportTable | null): string {
  const n = table?.number;
  if (typeof n === 'number' && Number.isFinite(n)) return `שולחן ${n}`;
  const name = String(table?.name ?? '').trim();
  if (name) return `שולחן ${name}`;
  return NO_TABLE_LABEL;
}

function guestName(guest: CheckInExportGuest) {
  return String(guest.name ?? '').trim();
}

function sortArrivedGuests(
  guests: CheckInExportGuest[],
  tables: Map<string, CheckInExportTable>
) {
  return [...guests].sort((a, b) => {
    const tableA = a.tableId ? tables.get(String(a.tableId).trim()) : undefined;
    const tableB = b.tableId ? tables.get(String(b.tableId).trim()) : undefined;
    const byTable = tableSortKey(tableA) - tableSortKey(tableB);
    if (byTable !== 0) return byTable;
    const labelA = String(tableNumberCell(tableA));
    const labelB = String(tableNumberCell(tableB));
    const byLabel = labelA.localeCompare(labelB, 'he');
    if (byLabel !== 0) return byLabel;
    return guestName(a).localeCompare(guestName(b), 'he');
  });
}

type CheckInExportOpts = {
  eventTitle?: string;
  categories?: CheckInExportCategory[];
  tables?: CheckInExportTable[];
};

type PreparedCheckInExport = {
  arrivedGuests: CheckInExportGuest[];
  guestRows: (string | number)[][];
  byTableRows: (string | number)[][];
  totalArrivedPeople: number;
  fileName: string;
};

function applySheetView(worksheet: XLSX.WorkSheet, colWidths: number[], lastCol: string, lastRow: number) {
  worksheet['!cols'] = colWidths.map((wch) => ({ wch }));
  if (lastRow >= 1) {
    worksheet['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` };
    (worksheet as any)['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  }
}

function csvEscape(cell: string | number) {
  const value = String(cell ?? '');
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportFileName(eventTitle: string | undefined, ext: string) {
  const eventPart = sanitizeFilePart(String(eventTitle || 'אירוע'));
  const datePart = new Date().toISOString().slice(0, 10);
  return `צק-אין-${eventPart}-${datePart}.${ext}`;
}

function prepareCheckInExport(guests: CheckInExportGuest[], opts?: CheckInExportOpts): PreparedCheckInExport {
  const categoryLookup = buildCategoryLookup(opts?.categories ?? []);
  const tableLookup = buildTableLookup(opts?.tables ?? []);
  const arrivedGuests = sortArrivedGuests(
    guests.filter((guest) => Boolean(guest.checkedIn)),
    tableLookup
  );

  if (!arrivedGuests.length) {
    throw new Error('אין אורחים שהגיעו לייצוא');
  }

  const guestRows = arrivedGuests.map((guest) => {
    const category = guest.category_id ? categoryLookup.get(String(guest.category_id).trim()) : undefined;
    const table = guest.tableId ? tableLookup.get(String(guest.tableId).trim()) : undefined;
    return [
      tableNumberCell(table),
      guestName(guest),
      arrivedPeople(guest),
      invitedPeople(guest),
      String(category?.name ?? '').trim(),
      sideLabel(category?.side),
      String(guest.phone ?? '').trim(),
      formatCheckedInAt(guest.checkedInAt),
    ];
  });

  const totalArrivedPeople = arrivedGuests.reduce((sum, guest) => sum + arrivedPeople(guest), 0);
  guestRows.push([
    'סה״כ',
    `${arrivedGuests.length} מוזמנים`,
    totalArrivedPeople,
    '',
    '',
    '',
    '',
    '',
  ]);

  const grouped = new Map<string, { table?: CheckInExportTable; guests: CheckInExportGuest[] }>();
  for (const guest of arrivedGuests) {
    const tableId = String(guest.tableId ?? '').trim() || NO_TABLE_LABEL;
    const table = guest.tableId ? tableLookup.get(String(guest.tableId).trim()) : undefined;
    const existing = grouped.get(tableId);
    if (existing) existing.guests.push(guest);
    else grouped.set(tableId, { table, guests: [guest] });
  }

  const groupedEntries = [...grouped.entries()].sort((a, b) => {
    const byTable = tableSortKey(a[1].table) - tableSortKey(b[1].table);
    if (byTable !== 0) return byTable;
    return tableHeading(a[1].table).localeCompare(tableHeading(b[1].table), 'he');
  });

  const byTableRows: (string | number)[][] = [['שולחן', 'שם', 'מספר שהגיעו', 'טלפון', 'קיבולת שולחן']];
  for (const [, group] of groupedEntries) {
    const peopleAtTable = group.guests.reduce((sum, guest) => sum + arrivedPeople(guest), 0);
    const capacity = Number(group.table?.capacity) || '';
    byTableRows.push([
      tableHeading(group.table),
      `${group.guests.length} מוזמנים · ${peopleAtTable} שהגיעו`,
      peopleAtTable,
      '',
      capacity,
    ]);
    for (const guest of group.guests) {
      byTableRows.push(['', guestName(guest), arrivedPeople(guest), String(guest.phone ?? '').trim(), '']);
    }
    byTableRows.push(['', '', '', '', '']);
  }

  return {
    arrivedGuests,
    guestRows,
    byTableRows,
    totalArrivedPeople,
    fileName: exportFileName(opts?.eventTitle, 'xlsx'),
  };
}

export function buildCheckInGuestsCsv(guests: CheckInExportGuest[], opts?: CheckInExportOpts) {
  const prepared = prepareCheckInExport(guests, opts);
  const blocks = [
    [GUESTS_HEADERS, ...prepared.guestRows],
    prepared.byTableRows,
  ];
  const csv =
    '\uFEFF' +
    blocks
      .map((rows) => rows.map((row) => row.map(csvEscape).join(',')).join('\r\n'))
      .join('\r\n\r\n');

  return {
    csv,
    fileName: exportFileName(opts?.eventTitle, 'csv'),
    count: prepared.arrivedGuests.length,
    arrivedPeople: prepared.totalArrivedPeople,
  };
}

export function exportCheckInGuestsToExcel(guests: CheckInExportGuest[], opts?: CheckInExportOpts) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('ייצוא לאקסל זמין רק בדפדפן');
  }

  const prepared = prepareCheckInExport(guests, opts);
  const guestsSheet = XLSX.utils.aoa_to_sheet([GUESTS_HEADERS, ...prepared.guestRows]);
  applySheetView(guestsSheet, [14, 28, 16, 16, 18, 10, 16, 18], 'H', prepared.arrivedGuests.length + 1);

  const byTableSheet = XLSX.utils.aoa_to_sheet(prepared.byTableRows);
  byTableSheet['!cols'] = [{ wch: 18 }, { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, guestsSheet, 'אורחים שהגיעו');
  XLSX.utils.book_append_sheet(workbook, byTableSheet, 'לפי שולחן');

  XLSX.writeFile(workbook, prepared.fileName);

  return {
    fileName: prepared.fileName,
    count: prepared.arrivedGuests.length,
    arrivedPeople: prepared.totalArrivedPeople,
  };
}
