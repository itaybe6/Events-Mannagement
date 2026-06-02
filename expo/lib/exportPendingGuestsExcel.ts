import * as XLSX from 'xlsx';

import { normalizeBaseUrl } from '@/lib/navigationLinks';

export type PendingGuestExportRow = {
  id: string;
  name: string;
  phone?: string;
  status?: string;
  invitationCode?: string;
  invitationToken?: string;
};

function resolveWebBaseUrl(): string {
  const origin = typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '';
  const configuredBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_SITE_BASE_URL);
  if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
    return normalizeBaseUrl(origin);
  }
  return configuredBaseUrl || origin;
}

export function buildGuestInvitationUrl(guest: Pick<PendingGuestExportRow, 'invitationCode' | 'invitationToken'>, baseUrl?: string) {
  const token = String(guest.invitationCode ?? guest.invitationToken ?? '').trim();
  if (!token) return '';
  const base = normalizeBaseUrl(baseUrl || resolveWebBaseUrl());
  return base ? `${base}/i/${token}` : `/i/${token}`;
}

function sanitizeFilePart(value: string) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export function exportPendingGuestsToExcel(
  guests: PendingGuestExportRow[],
  opts?: { eventTitle?: string; baseUrl?: string }
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('ייצוא לאקסל זמין רק בדפדפן');
  }

  const filtered = guests.filter((guest) => String(guest.status ?? 'ממתין').trim() === 'ממתין');

  const baseUrl = opts?.baseUrl || resolveWebBaseUrl();
  const rows = filtered.map((guest) => ({
    שם: String(guest.name ?? '').trim(),
    'מספר טלפון': guest.phone ? String(guest.phone).trim() : '',
    'קישור להזמנה': buildGuestInvitationUrl(guest, baseUrl),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ['שם', 'מספר טלפון', 'קישור להזמנה'],
  });
  worksheet['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 52 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ממתינים');

  const eventPart = sanitizeFilePart(String(opts?.eventTitle || 'אירוע'));
  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `מוזמנים-ממתינים-${eventPart}-${datePart}.xlsx`;

  XLSX.writeFile(workbook, fileName);

  return {
    fileName,
    count: filtered.length,
  };
}
