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

/**
 * Single blue ramp for the events UI. The old cards mixed brand navy with the
 * gold accent on every interactive element, which read as two competing themes.
 */
export const EVENT_BLUE = {
  ink: '#06173E',
  deep: '#0B2560',
  mid: '#1E4FD8',
  bright: '#3B82F6',
  sky: '#0EA5E9',
  muted: '#61708F',
  tint: 'rgba(30, 79, 216, 0.08)',
  tintStrong: 'rgba(30, 79, 216, 0.14)',
  line: 'rgba(11, 37, 96, 0.08)',
  lineStrong: 'rgba(11, 37, 96, 0.14)',
  surfaceSoft: '#F4F7FF',
} as const;

export const EVENT_TYPES = ['חתונה', 'חינה', 'בר מצווה', 'בת מצווה', 'ברית', 'אירוע חברה'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const GENERIC_EVENT_LABEL = 'אירוע';

const EVENT_TYPE_PREFIXES: { prefix: string; type: EventType }[] = [
  ...EVENT_TYPES.map((type) => ({ prefix: type, type })),
  { prefix: 'בריתה', type: 'ברית' },
].sort((a, b) => b.prefix.length - a.prefix.length);

function isTypeBoundary(title: string, prefixLength: number) {
  if (title.length === prefixLength) return true;
  return /[\s\-–—:|·•]/.test(title.charAt(prefixLength));
}

export const EVENT_BADGE_META: Record<
  EventType,
  { icon: keyof typeof Ionicons.glyphMap; tint: string }
> = {
  חתונה: { icon: 'heart', tint: 'rgba(204, 160, 0, 0.85)' },
  חינה: { icon: 'color-palette', tint: 'rgba(180, 83, 9, 0.85)' },
  'בר מצווה': { icon: 'book', tint: 'rgba(6, 23, 62, 0.85)' },
  'בת מצווה': { icon: 'book', tint: 'rgba(6, 23, 62, 0.85)' },
  ברית: { icon: 'balloon', tint: 'rgba(240, 203, 70, 0.9)' },
  'אירוע חברה': { icon: 'briefcase', tint: 'rgba(0, 53, 102, 0.85)' },
};

export const EVENT_IMAGE_BY_TYPE: Record<EventType, number> = {
  חתונה: require('../../assets/images/wedding.jpg'),
  חינה: require('../../assets/images/bride and groom.jpg'),
  'בר מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  'בת מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  ברית: require('../../assets/images/baby.jpg'),
  'אירוע חברה': require('../../assets/images/wedding.jpg'),
};

export function inferEventType(title: string): EventType | null {
  const t = String(title || '').trim();
  if (!t) return null;

  for (const { prefix, type } of EVENT_TYPE_PREFIXES) {
    if (t === prefix || (t.startsWith(prefix) && isTypeBoundary(t, prefix.length))) {
      return type;
    }
  }

  for (const { prefix, type } of EVENT_TYPE_PREFIXES) {
    if (t.includes(prefix)) return type;
  }

  return null;
}

export function resolveEventTypeLabel(title: string): string {
  return inferEventType(title) ?? GENERIC_EVENT_LABEL;
}

function stripKnownTypePrefix(title: string): string {
  const t = title.trim();
  for (const { prefix } of EVENT_TYPE_PREFIXES) {
    if (t === prefix) return t;
    if (t.startsWith(prefix) && isTypeBoundary(t, prefix.length)) {
      return t.slice(prefix.length).replace(/^[\s\-–—:|·•]+/, '').trim() || t;
    }
  }
  return t;
}

export function getEventDisplayTitle(rawTitle: string): string {
  const title = String(rawTitle || '').trim();
  if (!title) return '';
  return stripKnownTypePrefix(title);
}

export function getEventHeading(event: {
  title?: string | null;
  groomName?: string | null;
  brideName?: string | null;
  location?: string | null;
  userName?: string | null;
}): { eventType: string; heading: string } {
  const title = String(event.title ?? '');
  const eventType = resolveEventTypeLabel(title);
  const stripped = getEventDisplayTitle(title);
  const couple = [event.groomName, event.brideName]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' & ');
  const owner = String(event.userName ?? '').trim();
  const venue = String(event.location ?? '').trim();

  const heading =
    (stripped && stripped !== eventType ? stripped : '') || couple || owner || venue || eventType;

  return { eventType, heading };
}

export function getEventBadgeMeta(eventType: string): {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
} {
  return (
    EVENT_BADGE_META[eventType as EventType] ?? {
      icon: 'calendar-outline',
      tint: 'rgba(0, 53, 102, 0.85)',
    }
  );
}

export function getEventImageByType(eventType: string): number {
  return EVENT_IMAGE_BY_TYPE[eventType as EventType] ?? EVENT_IMAGE_BY_TYPE['אירוע חברה'];
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
  return getEventDisplayTitle(rawTitle);
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

