import { Ionicons } from '@expo/vector-icons';
import { Event } from '@/types';

export const MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const;

export const EVENT_TYPES = ['חתונה', 'בר מצווה', 'בת מצווה', 'ברית', 'אירוע חברה'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_BADGE_META: Record<
  EventType,
  { icon: keyof typeof Ionicons.glyphMap; tint: string }
> = {
  חתונה: { icon: 'heart', tint: 'rgba(204, 160, 0, 0.85)' },
  'בר מצווה': { icon: 'book', tint: 'rgba(6, 23, 62, 0.85)' },
  'בת מצווה': { icon: 'book', tint: 'rgba(6, 23, 62, 0.85)' },
  ברית: { icon: 'balloon', tint: 'rgba(240, 203, 70, 0.9)' },
  'אירוע חברה': { icon: 'briefcase', tint: 'rgba(0, 53, 102, 0.85)' },
};

export const EVENT_IMAGE_BY_TYPE: Record<EventType, number> = {
  חתונה: require('../../assets/images/wedding.jpg'),
  'בר מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  'בת מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  ברית: require('../../assets/images/baby.jpg'),
  'אירוע חברה': require('../../assets/images/wedding.jpg'),
};

export function inferEventType(title: string): EventType | null {
  const t = (title || '').trim();
  const match = EVENT_TYPES.find((et) => t.startsWith(et) || t.includes(et));
  return match || null;
}

export type EventTimeFilter = 'future' | 'completed';

export function isPastEventDate(date: Date | string) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return false;
  const diff = Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  return diff < 0;
}

export function isFutureEventDate(date: Date | string) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return true;
  return !isPastEventDate(date);
}

function normalizeSearchText(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getEventDisplayTitleForSearch(rawTitle: string) {
  const title = String(rawTitle || '').trim();
  if (!title) return '';
  const eventType = inferEventType(title);
  if (!eventType) return title;
  const withoutTypePrefix = title.replace(new RegExp(`^${eventType}\\s*[–—-]\\s*`), '').trim();
  return withoutTypePrefix || title;
}

export function buildEventSearchHaystack(event: Event): string {
  const dateObj = new Date(event.date);
  const dateParts: string[] = [];

  if (Number.isFinite(dateObj.getTime())) {
    dateParts.push(
      dateObj.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' }),
      dateObj.toLocaleDateString('he-IL', { weekday: 'long' }),
      MONTHS[dateObj.getMonth()] ?? '',
      String(dateObj.getDate()),
      String(dateObj.getFullYear())
    );
  }

  const eventType = inferEventType(event.title) ?? '';

  return [
    event.title,
    getEventDisplayTitleForSearch(event.title),
    event.location,
    event.city,
    event.userName,
    event.groomName,
    event.brideName,
    event.story,
    eventType,
    ...dateParts,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function matchesEventSearch(event: Event, rawQuery: string): boolean {
  const query = normalizeSearchText(rawQuery);
  if (!query) return true;

  const haystack = buildEventSearchHaystack(event);
  const tokens = query.split(' ').filter(Boolean);

  return tokens.every((token) => haystack.includes(token));
}

