import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { getPhoneDuplicateKeys, guestService } from '@/lib/services/guestService';
import { Event, Guest } from '@/types';

type AdminEventDetailsStats = {
  confirmed: number;
  declined: number;
  pending: number;
  maybe: number;
  seated: number;
  totalGuests: number;
  seatedPercent: number;
  invitedPeople: number;
  confirmedPeople: number;
  pendingPeople: number;
  declinedPeople: number;
  maybePeople: number;
  uniquePhoneCount: number;
  sentMessageCount: number;
};

export type AdminEventDetailsModel = {
  loading: boolean;
  error: string | null;
  event: Event | null;
  setEvent: (next: Event | null | ((prev: Event | null) => Event | null)) => void;
  guests: Guest[];
  sentGuestIds: Set<string>;
  userName: string;
  userAvatarUrl: string;
  stats: AdminEventDetailsStats;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
};

const sumPeople = (rows: Array<{ numberOfPeople?: number }>) =>
  rows.reduce((sum, r) => sum + (Number(r.numberOfPeople) || 1), 0);

const countUniquePhones = (rows: Array<{ phone?: string }>) => {
  const seenKeys = new Set<string>();
  let count = 0;

  for (const row of rows) {
    const keys = getPhoneDuplicateKeys(String(row.phone ?? ''));
    if (!keys.length) continue;

    if (!keys.some((key) => seenKeys.has(key))) {
      count += 1;
      keys.forEach((key) => seenKeys.add(key));
    }
  }

  return count;
};

export function useAdminEventDetailsModel(eventId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [sentGuestIds, setSentGuestIds] = useState<Set<string>>(new Set());
  const [userName, setUserName] = useState<string>('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>('');

  const refresh = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!eventId) {
      setError('חסר מזהה אירוע');
      setEvent(null);
      setGuests([]);
      setSentGuestIds(new Set());
      setUserName('');
      setUserAvatarUrl('');
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const [eventData, guestsData, messagedGuestIds] = await Promise.all([
        eventService.getEvent(eventId),
        guestService.getGuests(eventId),
        guestService.getMessagedGuestIds(eventId),
      ]);

      setEvent(eventData ?? null);
      setGuests(Array.isArray(guestsData) ? guestsData : []);
      setSentGuestIds(messagedGuestIds instanceof Set ? messagedGuestIds : new Set());

      if (!eventData) {
        setError('האירוע לא נמצא');
        return;
      }

      // Fetch owner user name + avatar (for admin view)
      if (eventData.user_id) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('name, avatar_url')
          .eq('id', eventData.user_id)
          .maybeSingle();

        if (!userError && userData) {
          setUserName(String(userData.name || ''));
          setUserAvatarUrl(String((userData as any).avatar_url || ''));
        } else {
          setUserName('');
          setUserAvatarUrl('');
        }
      } else {
        setUserName('');
        setUserAvatarUrl('');
      }
    } catch (e) {
      console.error('Admin event details load error:', e);
      Alert.alert('שגיאה', 'שגיאה בטעינת האירוע');
      setError('שגיאה בטעינת האירוע');
      setEvent(null);
      setGuests([]);
      setSentGuestIds(new Set());
      setUserName('');
      setUserAvatarUrl('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const stats = useMemo<AdminEventDetailsStats>(() => {
    const confirmed = guests.filter((g) => g.status === 'מגיע').length;
    const declined = guests.filter((g) => g.status === 'לא מגיע').length;
    const pending = guests.filter((g) => g.status === 'ממתין').length;
    const maybe = guests.filter((g) => g.status === 'אולי מגיע').length;
    const seated = guests.filter((g) => Boolean(g.tableId)).length;
    const totalGuests = guests.length;
    const seatedPercent = totalGuests ? Math.round((seated / totalGuests) * 100) : 0;

    const invitedPeople = sumPeople(guests);
    const confirmedPeople = sumPeople(guests.filter((g) => g.status === 'מגיע'));
    const pendingPeople = sumPeople(guests.filter((g) => g.status === 'ממתין'));
    const declinedPeople = sumPeople(guests.filter((g) => g.status === 'לא מגיע'));
    const maybePeople = sumPeople(guests.filter((g) => g.status === 'אולי מגיע'));
    const uniquePhoneCount = countUniquePhones(guests);

    return {
      confirmed,
      declined,
      pending,
      maybe,
      seated,
      totalGuests,
      seatedPercent,
      invitedPeople,
      confirmedPeople,
      pendingPeople,
      declinedPeople,
      maybePeople,
      uniquePhoneCount,
      sentMessageCount: sentGuestIds.size,
    };
  }, [guests, sentGuestIds]);

  return {
    loading,
    error,
    event,
    setEvent,
    guests,
    sentGuestIds,
    userName,
    userAvatarUrl,
    stats,
    refresh,
  } satisfies AdminEventDetailsModel;
}

