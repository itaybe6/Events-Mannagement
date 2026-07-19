import * as XLSX from 'xlsx';

export type ExportGuestRow = {
  id: string;
  name: string;
  phone: string;
  category_id?: string | null;
  numberOfPeople?: number | null;
};

export type ExportGuestCategory = {
  id: string;
  name: string;
  side?: 'groom' | 'bride';
};

const GROUP_HEADER_ROW = ['', '', 'שיוך', '', 'פרטי התקשרות'];

const COLUMN_HEADERS = [
  'הזמנה לכבוד',
  "מס' אורחים שהוזמנו",
  'צד',
  'קבוצה',
  'סלולרי',
];

function sanitizeFilePart(value: string) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function sideLabel(side?: 'groom' | 'bride') {
  if (side === 'bride') return 'כלה';
  if (side === 'groom') return 'חתן';
  return '';
}

function buildCategoryLookup(categories: ExportGuestCategory[]) {
  const map = new Map<string, ExportGuestCategory>();
  for (const category of categories) {
    map.set(String(category.id), category);
  }
  return map;
}

function guestToRow(guest: ExportGuestRow, categories: Map<string, ExportGuestCategory>) {
  const category = guest.category_id ? categories.get(String(guest.category_id)) : undefined;
  return [
    String(guest.name ?? '').trim(),
    Number(guest.numberOfPeople) > 0 ? Number(guest.numberOfPeople) : 1,
    sideLabel(category?.side),
    String(category?.name ?? '').trim(),
    String(guest.phone ?? '').trim(),
  ];
}

export function exportGuestsToExcel(
  guests: ExportGuestRow[],
  opts?: { eventTitle?: string; categories?: ExportGuestCategory[] }
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('ייצוא לאקסל זמין רק בדפדפן');
  }

  const categoryLookup = buildCategoryLookup(opts?.categories ?? []);
  const sortedGuests = [...guests].sort((a, b) => {
    const catA = a.category_id ? categoryLookup.get(String(a.category_id))?.name ?? '' : '';
    const catB = b.category_id ? categoryLookup.get(String(b.category_id))?.name ?? '' : '';
    const byCategory = catA.localeCompare(catB, 'he');
    if (byCategory !== 0) return byCategory;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'he');
  });

  const dataRows = sortedGuests.map((guest) => guestToRow(guest, categoryLookup));
  const worksheet = XLSX.utils.aoa_to_sheet([GROUP_HEADER_ROW, COLUMN_HEADERS, ...dataRows]);
  worksheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 16 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'הזמנות');

  const eventPart = sanitizeFilePart(String(opts?.eventTitle || 'אירוע'));
  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `מוזמנים-${eventPart}-${datePart}.xlsx`;

  XLSX.writeFile(workbook, fileName);

  return {
    fileName,
    count: sortedGuests.length,
  };
}
