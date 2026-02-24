import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Guest } from '@/types';

export type InvitationEventInfo = {
  id: string;
  title: string;
  date: Date;
  location: string;
  city: string;
  groomName?: string;
  brideName?: string;
  receptionTime?: string;
  ceremonyTime?: string;
  brideParents?: string;
  groomParents?: string;
  invitationTitle?: string;
  invitationImageUrl?: string;
};

export type InvitationGuestInfo = {
  id: string;
  name: string;
  phone?: string;
  status: Guest['status'];
  numberOfPeople: number;
  invitationToken: string;
  rsvpLocked?: boolean;
  rsvpSubmittedAt?: Date | null;
};

export type InvitationInfo = {
  guest: InvitationGuestInfo;
  event: InvitationEventInfo;
};

function getExpoExtra(): Record<string, any> | undefined {
  return (
    (Constants.expoConfig?.extra as any) ??
    ((Constants as any).manifest?.extra as any) ??
    ((Constants as any).manifest2?.extra as any)
  );
}

function normalizeSupabaseUrl(input?: string): string | undefined {
  const raw = String(input ?? '').trim();
  if (!raw) return undefined;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.includes('.supabase.co')) return `https://${raw.replace(/^\/+/, '')}`;
  if (/^[a-z0-9-]+$/i.test(raw)) return `https://${raw}.supabase.co`;
  return raw;
}

const extra = getExpoExtra();
const supabaseUrl = normalizeSupabaseUrl(
  process.env.EXPO_PUBLIC_SUPABASE_URL || extra?.EXPO_PUBLIC_SUPABASE_URL
);
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const webNoopLock = async <T,>(_name: string, _acquireTimeout: number, fn: () => Promise<T>): Promise<T> => fn();

function createPublicClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      ...(Platform.OS === 'web' ? { lock: webNoopLock } : {}),
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export const invitationService = {
  async getInvitationByToken(token: string): Promise<InvitationInfo | null> {
    const t = String(token || '').trim();
    if (!t) return null;

    const client = createPublicClient();
    const { data, error } = await client.rpc('get_invitation', { p_token: t });
    if (error) throw error;
    if (!data) return null;

    const guestRow: any = (data as any).guest;
    const eventRow: any = (data as any).event;
    if (!guestRow || !eventRow) return null;

    const date = new Date(eventRow.date);

    return {
      guest: {
        id: String(guestRow.id),
        name: String(guestRow.name ?? ''),
        phone: guestRow.phone ? String(guestRow.phone) : undefined,
        status: ((guestRow.status ?? 'ממתין') as Guest['status']) ?? 'ממתין',
        numberOfPeople: Number(guestRow.number_of_people) || 1,
        invitationToken: String(guestRow.invitation_token ?? t),
        rsvpLocked: Boolean(guestRow.rsvp_locked),
        rsvpSubmittedAt: guestRow.rsvp_submitted_at ? new Date(String(guestRow.rsvp_submitted_at)) : null,
      },
      event: {
        id: String(eventRow.id),
        title: String(eventRow.title ?? ''),
        date: Number.isFinite(date.getTime()) ? date : new Date(),
        location: String(eventRow.location ?? ''),
        city: String(eventRow.city ?? ''),
        groomName: eventRow.groom_name ? String(eventRow.groom_name) : undefined,
        brideName: eventRow.bride_name ? String(eventRow.bride_name) : undefined,
        receptionTime: eventRow.reception_time ? String(eventRow.reception_time) : undefined,
        ceremonyTime: eventRow.ceremony_time ? String(eventRow.ceremony_time) : undefined,
        brideParents: eventRow.bride_parents ? String(eventRow.bride_parents) : undefined,
        groomParents: eventRow.groom_parents ? String(eventRow.groom_parents) : undefined,
        invitationTitle: eventRow.invitation_title ? String(eventRow.invitation_title) : undefined,
        invitationImageUrl: eventRow.invitation_image_url ? String(eventRow.invitation_image_url) : undefined,
      },
    };
  },

  async updateRsvpByToken(token: string, payload: { status: Guest['status']; numberOfPeople?: number }) {
    const t = String(token || '').trim();
    if (!t) throw new Error('Missing invitation token');

    const client = createPublicClient();
    const nextStatus = payload.status;
    const nextPeopleRaw = payload.numberOfPeople;

    const people = nextStatus === 'מגיע' ? Math.max(1, Math.min(99, Number(nextPeopleRaw) || 1)) : null;
    const { data, error } = await client.rpc('update_invitation_rsvp', {
      p_token: t,
      p_status: nextStatus,
      p_people: people,
    });
    if (error) throw error;
    if (!data) throw new Error('Invitation token not found');

    return {
      id: String((data as any).id),
      name: String((data as any).name ?? ''),
      phone: (data as any).phone ? String((data as any).phone) : undefined,
      status: ((data as any).status ?? 'ממתין') as Guest['status'],
      numberOfPeople: Number((data as any).number_of_people) || 1,
      invitationToken: String((data as any).invitation_token ?? t),
      rsvpLocked: Boolean((data as any).rsvp_locked),
      rsvpSubmittedAt: (data as any).rsvp_submitted_at ? new Date(String((data as any).rsvp_submitted_at)) : null,
    } satisfies InvitationGuestInfo;
  },
};

