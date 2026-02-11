import { Ionicons } from '@expo/vector-icons';

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
  'בר מצווה': { icon: 'sparkles', tint: 'rgba(6, 23, 62, 0.85)' },
  'בת מצווה': { icon: 'sparkles', tint: 'rgba(6, 23, 62, 0.85)' },
  ברית: { icon: 'star', tint: 'rgba(240, 203, 70, 0.9)' },
  'אירוע חברה': { icon: 'briefcase', tint: 'rgba(0, 53, 102, 0.85)' },
};

export function inferEventType(title: string): EventType | null {
  const t = (title || '').trim();
  const match = EVENT_TYPES.find((et) => t.startsWith(et) || t.includes(et));
  return match || null;
}

