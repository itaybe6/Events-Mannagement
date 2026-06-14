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

const DEFAULT_PUBLIC_SITE_BASE_URL = 'https://events-mannagement.vercel.app';const SITE_BASE_URL_PLACEHOLDER = 'https://rork.com';

function getOriginFromUrl(raw: unknown): string {
  const value = normalizeBaseUrl(String(raw ?? ''));
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    const match = value.match(/^(https?:\/\/[^/]+)/i);
    return match?.[1] ?? '';
  }
}

function isLocalHostUrl(value: string) {
  return /localhost|127\.0\.0\.1/i.test(String(value || ''));
}

function getConfiguredSiteBaseUrl(): string {
  const configured = normalizeBaseUrl(process.env.EXPO_PUBLIC_SITE_BASE_URL);
  if (!configured || configured === SITE_BASE_URL_PLACEHOLDER) return '';
  return configured;
}

export function resolveGuestInvitationBaseUrl(opts?: { baseUrl?: string; eventRsvpLink?: string }) {
  const explicit = normalizeBaseUrl(opts?.baseUrl);
  if (explicit && !isLocalHostUrl(explicit)) return explicit;

  const fromEvent = getOriginFromUrl(opts?.eventRsvpLink);
  if (fromEvent && !isLocalHostUrl(fromEvent)) return fromEvent;

  const configured = getConfiguredSiteBaseUrl();
  if (configured) return configured;

  const origin = typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '';
  if (origin && !isLocalHostUrl(origin)) return normalizeBaseUrl(origin);

  return DEFAULT_PUBLIC_SITE_BASE_URL;
}

export function buildGuestInvitationUrl(guest: Pick<PendingGuestExportRow, 'invitationCode' | 'invitationToken'>, baseUrl?: string) {
  const token = String(guest.invitationCode ?? guest.invitationToken ?? '').trim();
  if (!token) return '';
  const base = normalizeBaseUrl(baseUrl || resolveGuestInvitationBaseUrl());
  return `${base}/i/${token}`;
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
  opts?: { eventTitle?: string; baseUrl?: string; eventRsvpLink?: string }
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('ייצוא לאקסל זמין רק בדפדפן');
  }

  const filtered = guests.filter((guest) => String(guest.status ?? 'ממתין').trim() === 'ממתין');

  const baseUrl = resolveGuestInvitationBaseUrl({
    baseUrl: opts?.baseUrl,
    eventRsvpLink: opts?.eventRsvpLink,
  });
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
