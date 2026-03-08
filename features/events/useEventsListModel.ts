import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Event } from '@/types';

export type SortOrder = 'asc' | 'desc';

export type EventsListModel = {
  events: Event[];
  loading: boolean;
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
  refresh: () => Promise<void>;
  filteredEvents: Event[];
};

export function useEventsListModel(loadEvents: () => Promise<Event[]>, opts?: { errorTitle?: string; errorMessage?: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadEvents();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Events list refresh error:', e);
      Alert.alert(opts?.errorTitle ?? 'שגיאה', opts?.errorMessage ?? 'לא ניתן לטעון אירועים כרגע');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [loadEvents, opts?.errorMessage, opts?.errorTitle]);

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
      const q = query.trim().toLowerCase();
      out = out.filter((e) => {
        const hay = [e.title, e.location, e.city, (e as any).userName || '']
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // Keep ended events at the bottom. Upcoming events are ordered by nearest date first.
    out.sort((a, b) => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const da = new Date(a.date);
      const db = new Date(b.date);
      const ta = da.getTime();
      const tb = db.getTime();

      const aValid = Number.isFinite(ta);
      const bValid = Number.isFinite(tb);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;

      const aIsPast = ta < now.getTime();
      const bIsPast = tb < now.getTime();

      if (aIsPast !== bIsPast) {
        return aIsPast ? 1 : -1;
      }

      if (!aIsPast && !bIsPast) {
        return ta - tb;
      }

      return tb - ta;
    });

    return out;
  }, [events, filterDate, filterStartDate, filterEndDate, filterMonth, query, sortOrder]);

  return {
    events,
    loading,
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

