import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { Event } from '@/types';
import { matchesEventSearch } from '@/features/events/eventsConstants';
import { supabase } from '@/lib/supabase';

export type SortOrder = 'asc' | 'desc';

export type EventsListModel = {
  events: Event[];
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (value: string) => void;
  filterDate: Date | null;
  setFilterDate: (d: Date | null) => void;
  filterStartDate: Date | null;
  setFilterStartDate: (d: Date | null) => void;
  filterEndDate: Date | null;
  setFilterEndDate: (d: Date | null) => void;
  filterMonth: string;
  setFilterMonth: (m: string) => void;
  sortOrder: SortOrder;
  setSortOrder: (s: SortOrder) => void;
  refresh: (options?: { force?: boolean }) => Promise<void>;
  filteredEvents: Event[];
};

export function useEventsListModel(
  loadEvents: (options?: { force?: boolean }) => Promise<Event[]>,
  opts?: { errorTitle?: string; errorMessage?: string; initialEvents?: Event[] }
) {
  const initialEvents = opts?.initialEvents;
  const [events, setEvents] = useState<Event[]>(initialEvents ?? []);
  // With a cached list to show we revalidate in the background rather than
  // replacing the screen with a spinner the user has already waited through.
  const [loading, setLoading] = useState(!initialEvents?.length);
  const [error, setError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [query, setQuery] = useState('');

  const hasEventsRef = useRef((initialEvents?.length ?? 0) > 0);

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      if (!hasEventsRef.current) setLoading(true);
      try {
        const data = await loadEvents(options);
        const next = Array.isArray(data) ? data : [];
        hasEventsRef.current = next.length > 0;
        setError(null);
        setEvents(next);
      } catch (e) {
        console.error('Events list refresh error:', e);
        // A failed read is not an empty list. Blanking `events` here rendered
        // the "no events" state for what is really a session/network problem,
        // and `Alert` is a no-op on react-native-web, so web users saw nothing
        // at all. Keep whatever is on screen and report the failure instead.
        const message = opts?.errorMessage ?? 'לא ניתן לטעון אירועים כרגע';
        setError(message);
        if (Platform.OS !== 'web') {
          Alert.alert(opts?.errorTitle ?? 'שגיאה', message);
        }
      } finally {
        setLoading(false);
      }
    },
    [loadEvents, opts?.errorMessage, opts?.errorTitle]
  );

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // The web build routes an already-persisted user straight to their events
  // screen, so this list can mount and fetch before Supabase has restored or
  // refreshed the session. When the session does land, recover the screen
  // rather than leaving it on a stale empty/error state until a page reload.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED') return;
      // Nothing to recover while real events are already showing.
      if (hasEventsRef.current) return;
      void refreshRef.current({ force: true });
    });

    return () => subscription.unsubscribe();
  }, []);

  const filteredEvents = useMemo(() => {
    // Filtering
    let out: Event[] = [...events];

    if (filterDate) {
      out = out.filter((e) => {
        const d = new Date(e.date);
        return d.toDateString() === filterDate.toDateString();
      });
    } else if (filterStartDate || filterEndDate) {
      const start = filterStartDate ? new Date(filterStartDate) : null;
      const end = filterEndDate ? new Date(filterEndDate) : null;

      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);

      out = out.filter((e) => {
        const d = new Date(e.date);
        const time = d.getTime();
        if (!Number.isFinite(time)) return false;
        if (start && time < start.getTime()) return false;
        if (end && time > end.getTime()) return false;
        return true;
      });
    } else if (filterMonth) {
      out = out.filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === parseInt(filterMonth);
      });
    }

    if (query.trim()) {
      out = out.filter((e) => matchesEventSearch(e, query));
    }

    out.sort((a, b) => {
      const da = new Date(a.date);
      const db = new Date(b.date);
      const ta = da.getTime();
      const tb = db.getTime();

      const aValid = Number.isFinite(ta);
      const bValid = Number.isFinite(tb);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;

      return sortOrder === 'desc' ? tb - ta : ta - tb;
    });

    return out;
  }, [events, filterDate, filterStartDate, filterEndDate, filterMonth, query, sortOrder]);

  return {
    events,
    loading,
    error,
    query,
    setQuery,
    filterDate,
    setFilterDate,
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    filterMonth,
    setFilterMonth,
    sortOrder,
    setSortOrder,
    refresh,
    filteredEvents,
  } satisfies EventsListModel;
}

