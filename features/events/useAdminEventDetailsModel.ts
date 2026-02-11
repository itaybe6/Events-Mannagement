import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { Event, Guest } from '@/types';

type AdminEventDetailsStats = {
  confirmed: number;
  declined: number;
  pending: number;
  seated: number;
  totalGuests: number;
  seatedPercent: number;
  invitedPeople: number;
  confirmedPeople: number;
  pendingPeople: number;
  declinedPeople: number;
};

export type AdminEventDetailsModel = {
  loading: boolean;
  error: string | null;
  event: Event | null;
  setEvent: (next: Event | null | ((prev: Event | null) => Event | null)) => void;
  guests: Guest[];
  userName: string;
  userAvatarUrl: string;
  stats: AdminEventDetailsStats;
  refresh: () => Promise<void>;
};

const sumPeople = (rows: Array<{ numberOfPeople?: number }>) =>
  rows.reduce((sum, r) => sum + (Number(r.numberOfPeople) || 1), 0);

export function useAdminEventDetailsModel(eventId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>('');

  const refresh = async () => {
    if (!eventId) {
      setError('חסר מזהה אירוע');
      setEvent(null);
      setGuests([]);
      setUserName('');
      setUserAvatarUrl('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [eventData, guestsData] = await Promise.all([
        eventService.getEvent(eventId),
        guestService.getGuests(eventId),
      ]);

      setEvent(eventData ?? null);
      setGuests(Array.isArray(guestsData) ? guestsData : []);

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
    const seated = guests.filter((g) => Boolean(g.tableId)).length;
    const totalGuests = guests.length;
    const seatedPercent = totalGuests ? Math.round((seated / totalGuests) * 100) : 0;

    const invitedPeople = sumPeople(guests);
    const confirmedPeople = sumPeople(guests.filter((g) => g.status === 'מגיע'));
    const pendingPeople = sumPeople(guests.filter((g) => g.status === 'ממתין'));
    const declinedPeople = sumPeople(guests.filter((g) => g.status === 'לא מגיע'));

    return {
      confirmed,
      declined,
      pending,
      seated,
      totalGuests,
      seatedPercent,
      invitedPeople,
      confirmedPeople,
      pendingPeople,
      declinedPeople,
    };
  }, [guests]);

  return {
    loading,
    error,
    event,
    setEvent,
    guests,
    userName,
    userAvatarUrl,
    stats,
    refresh,
  } satisfies AdminEventDetailsModel;
}

