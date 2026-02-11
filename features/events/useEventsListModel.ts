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

    // Sorting
    out.sort((a, b) => {
      const da = new Date(a.date);
      const db = new Date(b.date);
      return sortOrder === 'asc' ? da.getTime() - db.getTime() : db.getTime() - da.getTime();
    });

    return out;
  }, [events, filterDate, filterMonth, query, sortOrder]);

  return {
    events,
    loading,
    query,
    setQuery,
    filterDate,
    setFilterDate,
    filterMonth,
    setFilterMonth,
    sortOrder,
    setSortOrder,
    refresh,
    filteredEvents,
  } satisfies EventsListModel;
}

