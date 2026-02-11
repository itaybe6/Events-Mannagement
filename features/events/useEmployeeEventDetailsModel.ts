import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { guestService } from '@/lib/services/guestService';
import { Event, Guest } from '@/types';

type TableRow = { id: string; capacity: number; shape: string | null };

type EmployeeEventDetailsStats = {
  counts: { coming: number; pending: number; notComing: number; total: number };
  seatedCount: number;
  seatedPercent: number;
  checkedInCount: number;
  checkedInConfirmedCount: number;
  checkedInNotConfirmedCount: number;
  notConfirmedTotal: number;
  invitedPeople: number;
  confirmedPeople: number;
  pendingPeople: number;
  declinedPeople: number;
  arrivedPeople: number;
  seatedArrivedPeople: number;
  arrivedNotSeatedPeople: number;
  freeSeats: number;
  tableStats: { totalRegular: number; fullRegular: number; notFullRegular: number; totalReserve: number; openedReserve: number };
};

export type EmployeeEventDetailsModel = {
  loading: boolean;
  event: Event | null;
  guests: Guest[];
  userAvatarUrl: string;
  totalSeats: number;
  tables: TableRow[];
  stats: EmployeeEventDetailsStats;
  refresh: () => Promise<void>;
};

const sumPeople = (rows: Array<{ numberOfPeople?: number }>) =>
  rows.reduce((sum, r) => sum + (Number(r.numberOfPeople) || 1), 0);

export function useEmployeeEventDetailsModel(eventId: string) {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>('');
  const [totalSeats, setTotalSeats] = useState<number>(0);
  const [tables, setTables] = useState<TableRow[]>([]);

  const refresh = async () => {
    if (!eventId) {
      setEvent(null);
      setGuests([]);
      setUserAvatarUrl('');
      setTotalSeats(0);
      setTables([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: evRow, error: evError }, gs, tablesRes] = await Promise.all([
        supabase
          .from('events')
          .select(
            'id,title,date,location,city,story,guests_count,budget,groom_name,bride_name,rsvp_link,user_id,user:users(name, avatar_url)'
          )
          .eq('id', eventId)
          .maybeSingle(),
        guestService.getGuests(eventId),
        supabase.from('tables').select('id,capacity,shape').eq('event_id', eventId),
      ]);

      if (evError) throw evError;
      if (tablesRes.error) throw tablesRes.error;

      const ev: Event | null = evRow
        ? {
            id: (evRow as any).id,
            title: (evRow as any).title,
            date: new Date((evRow as any).date),
            location: String((evRow as any).location ?? ''),
            city: String((evRow as any).city ?? ''),
            image: '',
            story: String((evRow as any).story ?? ''),
            guests: Number((evRow as any).guests_count ?? 0) || 0,
            budget: Number((evRow as any).budget ?? 0) || 0,
            groomName: (evRow as any).groom_name ?? undefined,
            brideName: (evRow as any).bride_name ?? undefined,
            rsvpLink: (evRow as any).rsvp_link ?? undefined,
            tasks: [],
            user_id: (evRow as any).user_id ?? undefined,
            userName: (evRow as any).user?.name ?? undefined,
          }
        : null;

      setEvent(ev);
      setGuests(Array.isArray(gs) ? gs : []);
      setUserAvatarUrl(String((evRow as any)?.user?.avatar_url ?? ''));

      const nextTables = Array.isArray(tablesRes.data) ? (tablesRes.data as any[]) : [];
      const mappedTables: TableRow[] = nextTables.map((t) => ({
        id: String(t.id),
        capacity: Number(t.capacity) || 0,
        shape: (t.shape ?? null) as any,
      }));
      setTables(mappedTables);
      setTotalSeats(mappedTables.reduce((sum, t) => sum + (Number(t?.capacity) || 0), 0));
    } catch (e) {
      console.error('Employee event details load error:', e);
      Alert.alert('שגיאה', 'לא ניתן לטעון את האירוע');
      setEvent(null);
      setGuests([]);
      setUserAvatarUrl('');
      setTotalSeats(0);
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const stats = useMemo<EmployeeEventDetailsStats>(() => {
    const coming = guests.filter((g) => g.status === 'מגיע').length;
    const pending = guests.filter((g) => g.status === 'ממתין').length;
    const notComing = guests.filter((g) => g.status === 'לא מגיע').length;
    const total = guests.length;
    const counts = { coming, pending, notComing, total };

    const seatedCount = guests.filter((g) => Boolean(g.tableId)).length;
    const seatedPercent = total ? Math.round((seatedCount / total) * 100) : 0;

    const checkedInCount = guests.filter((g) => Boolean((g as any).checkedIn)).length;
    const checkedInConfirmedCount = guests.filter((g) => g.status === 'מגיע' && Boolean((g as any).checkedIn)).length;
    const notConfirmedTotal = pending + notComing;
    const checkedInNotConfirmedCount = guests.filter((g) => g.status !== 'מגיע' && Boolean((g as any).checkedIn)).length;

    const invitedPeople = sumPeople(guests);
    const confirmedPeople = sumPeople(guests.filter((g) => g.status === 'מגיע'));
    const pendingPeople = sumPeople(guests.filter((g) => g.status === 'ממתין'));
    const declinedPeople = sumPeople(guests.filter((g) => g.status === 'לא מגיע'));

    const arrivedPeople = sumPeople(guests.filter((g) => Boolean((g as any).checkedIn)));
    const seatedArrivedPeople = sumPeople(guests.filter((g) => Boolean((g as any).checkedIn) && Boolean(g.tableId)));
    const arrivedNotSeatedPeople = Math.max(0, arrivedPeople - seatedArrivedPeople);
    const freeSeats = Math.max(0, (Number(totalSeats) || 0) - seatedArrivedPeople);

    const assignedPeopleByTableId = new Map<string, number>();
    guests.forEach((g) => {
      const tid = (g as any).tableId;
      if (!tid) return;
      const prev = assignedPeopleByTableId.get(String(tid)) || 0;
      assignedPeopleByTableId.set(String(tid), prev + (Number((g as any).numberOfPeople) || 1));
    });

    const regular = tables.filter((t) => t.shape !== 'reserve');
    const reserve = tables.filter((t) => t.shape === 'reserve');
    const isFull = (t: { id: string; capacity: number }) =>
      (assignedPeopleByTableId.get(String(t.id)) || 0) >= (Number(t.capacity) || 0);
    const isOpened = (t: { id: string }) => (assignedPeopleByTableId.get(String(t.id)) || 0) > 0;

    const totalRegular = regular.length;
    const fullRegular = regular.filter(isFull).length;
    const notFullRegular = Math.max(0, totalRegular - fullRegular);
    const totalReserve = reserve.length;
    const openedReserve = reserve.filter(isOpened).length;

    const tableStats = { totalRegular, fullRegular, notFullRegular, totalReserve, openedReserve };

    return {
      counts,
      seatedCount,
      seatedPercent,
      checkedInCount,
      checkedInConfirmedCount,
      checkedInNotConfirmedCount,
      notConfirmedTotal,
      invitedPeople,
      confirmedPeople,
      pendingPeople,
      declinedPeople,
      arrivedPeople,
      seatedArrivedPeople,
      arrivedNotSeatedPeople,
      freeSeats,
      tableStats,
    };
  }, [guests, tables, totalSeats]);

  return {
    loading,
    event,
    guests,
    userAvatarUrl,
    totalSeats,
    tables,
    stats,
    refresh,
  } satisfies EmployeeEventDetailsModel;
}

