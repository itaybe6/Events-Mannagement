import { Ionicons } from '@expo/vector-icons';
import type { UserType } from '@/store/userStore';

export type WebAppNavItem = {
  key: string;
  href: string;
  params?: Record<string, string>;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Route leaves that should mark this item as active. */
  matchLeaves: string[];
};

export type WebAppNavSection = {
  key: string;
  title: string;
  items: WebAppNavItem[];
};

const ADMIN_EVENT_LEAVES = new Set([
  'admin-event-details',
  'admin-guest-checkin',
  'seating-map',
  'live-seating',
  'BrideGroomSeating',
  'TablesList',
  'guests',
  'admin-rsvp-approvals',
  'admin-invitation-links',
  'admin-event-messages',
  'automatic-notifications',
  'notification-editor',
  'seating-templates',
]);

const EMPLOYEE_EVENT_LEAVES = new Set([
  'employee-event-details',
  'employee-guest-checkin',
  'employee-seating-map',
  'employee-live-seating',
  'employee-rsvp-approvals',
]);

export function normalizeWebPath(path: string) {
  return String(path || '')
    .replace(/\/\([^/]+\)/g, '')
    .replace(/\/+$/, '') || '/';
}

export function getWebPathLeaf(path: string) {
  const normalized = normalizeWebPath(path);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function eventParams(eventId: string, paramName: 'eventId' | 'id' = 'eventId'): Record<string, string> {
  return { [paramName]: eventId };
}

export function getWebAppNav(args: {
  userType: UserType | null | undefined;
  pathname: string;
  eventId?: string | null;
}): { inEvent: boolean; sections: WebAppNavSection[] } {
  const userType = args.userType ?? null;
  const leaf = getWebPathLeaf(args.pathname);
  const eventId = String(args.eventId || '').trim();
  const isEmployeePath = /employee-/i.test(normalizeWebPath(args.pathname));

  if (userType === 'event_owner') {
    return {
      inEvent: true,
      sections: [
        {
          key: 'couple',
          title: 'האירוע',
          items: [
            {
              key: 'home',
              href: '/(couple)',
              label: 'בית',
              icon: 'home-outline',
              matchLeaves: ['', 'index'],
              params: eventId ? eventParams(eventId) : undefined,
            },
            {
              key: 'guests',
              href: '/(couple)/guests',
              label: 'אישורי הגעה',
              icon: 'checkbox-outline',
              matchLeaves: ['guests'],
              params: eventId ? eventParams(eventId) : undefined,
            },
            {
              key: 'seating',
              href: '/(couple)/BrideGroomSeating',
              label: 'מפת הושבה',
              icon: 'grid-outline',
              matchLeaves: ['BrideGroomSeating'],
              params: eventId ? eventParams(eventId) : undefined,
            },
            {
              key: 'tables',
              href: '/(couple)/TablesList',
              label: 'רשימת שולחנות',
              icon: 'list-outline',
              matchLeaves: ['TablesList'],
              params: eventId ? eventParams(eventId) : undefined,
            },
            {
              key: 'messages',
              href: '/(couple)/automatic-notifications',
              label: 'עריכת הודעות',
              icon: 'chatbox-ellipses-outline',
              matchLeaves: ['automatic-notifications', 'notification-editor'],
              params: eventId ? eventParams(eventId) : undefined,
            },
          ],
        },
      ],
    };
  }

  const inEvent =
    Boolean(eventId) && (ADMIN_EVENT_LEAVES.has(leaf) || EMPLOYEE_EVENT_LEAVES.has(leaf));

  const globalSection: WebAppNavSection =
    userType === 'employee'
      ? {
          key: 'app',
          title: 'ניווט',
          items: [
            { key: 'events', href: '/(admin)/admin-events-list', label: 'אירועים', icon: 'calendar-outline', matchLeaves: ['admin-events-list', 'admin-events', 'employee-events'] },
          ],
        }
      : {
          key: 'app',
          title: 'ניווט',
          items: [
            { key: 'dashboard', href: '/(admin)/admin-events', label: 'לוח בקרה', icon: 'speedometer-outline', matchLeaves: ['admin-events'] },
            { key: 'events', href: '/(admin)/admin-events-list', label: 'אירועים', icon: 'calendar-outline', matchLeaves: ['admin-events-list'] },
            { key: 'whatsapp', href: '/(admin)/whatsapp-templates', label: 'וואטסאפ', icon: 'logo-whatsapp', matchLeaves: ['whatsapp-templates'] },
            { key: 'reports', href: '/(admin)/reports', label: 'דוחות', icon: 'bar-chart-outline', matchLeaves: ['reports'] },
            { key: 'users', href: '/(admin)/users', label: 'משתמשים', icon: 'people-outline', matchLeaves: ['users', 'add-user-v2'] },
          ],
        };

  if (!inEvent) {
    return { inEvent: false, sections: [globalSection] };
  }

  const checkinHref = isEmployeePath
    ? '/(employee)/employee-guest-checkin'
    : '/(admin)/admin-guest-checkin';
  const seatingHref = isEmployeePath
    ? '/(employee)/employee-seating-map'
    : '/(admin)/BrideGroomSeating';
  const liveSeatingHref = isEmployeePath
    ? '/(employee)/employee-live-seating'
    : '/(admin)/live-seating';
  const detailsHref = isEmployeePath
    ? '/(employee)/employee-event-details'
    : '/(admin)/admin-event-details';
  const detailsParamName: 'id' | 'eventId' = 'id';

  const eventItems: WebAppNavItem[] = [
    {
      key: 'event-home',
      href: detailsHref,
      params: eventParams(eventId, detailsParamName),
      label: 'סקירת האירוע',
      icon: 'albums-outline',
      matchLeaves: ['admin-event-details', 'employee-event-details'],
    },
  ];

  if (userType !== 'employee') {
    eventItems.push(
      {
        key: 'sketch',
        href: '/(admin)/seating-map',
        params: eventParams(eventId),
        label: 'עריכת סקיצה',
        icon: 'create-outline',
        matchLeaves: ['seating-map'],
      },
      {
        key: 'invite',
        href: '/(admin)/admin-invitation-links',
        params: eventParams(eventId),
        label: 'לינק להזמנה',
        icon: 'link-outline',
        matchLeaves: ['admin-invitation-links'],
      },
      {
        key: 'messages',
        href: '/(admin)/automatic-notifications',
        params: eventParams(eventId),
        label: 'עריכת הודעות',
        icon: 'chatbubble-ellipses-outline',
        matchLeaves: ['automatic-notifications', 'admin-event-messages', 'notification-editor'],
      }
    );
  }

  eventItems.push(
    {
      key: 'tables',
      href: '/(admin)/TablesList',
      params: eventParams(eventId),
      label: 'רשימת שולחנות',
      icon: 'list-outline',
      matchLeaves: ['TablesList'],
    },
    {
      key: 'rsvp',
      href: '/(admin)/guests',
      params: eventParams(eventId),
      label: 'אישורי הגעה',
      icon: 'people-outline',
      matchLeaves: ['guests', 'admin-rsvp-approvals', 'employee-rsvp-approvals'],
    },
    {
      key: 'checkin',
      href: checkinHref,
      params: {
        eventId,
        returnTo: `${detailsHref}?id=${encodeURIComponent(eventId)}`,
      },
      label: 'צ׳ק אין אורחים',
      icon: 'checkbox-outline',
      matchLeaves: ['admin-guest-checkin', 'employee-guest-checkin'],
    },
    {
      key: 'seating',
      href: seatingHref,
      params: eventParams(eventId),
      label: 'מפת הושבה',
      icon: 'grid-outline',
      matchLeaves: ['BrideGroomSeating', 'employee-seating-map'],
    },
    {
      key: 'live-seating',
      href: liveSeatingHref,
      params: {
        eventId,
        returnTo: `${detailsHref}?id=${encodeURIComponent(eventId)}`,
      },
      label: 'מפת לייב',
      icon: 'pulse-outline',
      matchLeaves: ['live-seating', 'employee-live-seating'],
    },
    {
      key: 'all-events',
      href: '/(admin)/admin-events-list',
      label: 'כל האירועים',
      icon: 'calendar-outline',
      matchLeaves: [],
    }
  );

  return {
    inEvent: true,
    sections: [
      { key: 'event', title: 'האירוע', items: eventItems },
      globalSection,
    ],
  };
}
