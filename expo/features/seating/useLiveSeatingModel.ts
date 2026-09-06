import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { guestService, mapGuestRowFromDb } from '@/lib/services/guestService';
import { liveSeatingService, applyLiveSeatingRealtimeRow, type LiveSeatingTableRow } from '@/lib/services/tableService';
import { guestArrivedPeople, guestInvitedPeople } from '@/features/guests/useGuestCheckInModel';
import type { Guest } from '@/types';

/**
 * The live seating map: how many people are sitting at each table *right now*,
 * as opposed to the seating plan's "who is supposed to sit where".
 *
 * The number comes from check-in (`guests.checked_in_count`) plus a manual
 * correction per table (`tables.live_extra_seated`) for the people an usher
 * counts in the hall but who were never registered by name — an unannounced
 * plus-one, or a guest who took a chair at a different table.
 */

export type LiveTableStatus = 'empty' | 'partial' | 'near' | 'full' | 'over';

/** A table is "almost full" when this many seats or fewer remain open. */
const NEAR_CAPACITY_FREE_SEATS = 2;

export type LiveSeatingTable = {
  id: string;
  number: number | null;
  name: string | null;
  capacity: number;
  area: string;
  shape: LiveSeatingTableRow['shape'];
  x: number | null;
  y: number | null;
  /** Planned headcount: people assigned to this table in the seating plan. */
  assignedPeople: number;
  assignedGuests: number;
  /** Arrived headcount from check-in. */
  checkedInPeople: number;
  checkedInGuests: number;
  /** Signed manual correction entered on this screen. */
  manualExtra: number;
  /** `checkedInPeople + manualExtra`, floored at zero. What the hall shows. */
  livePeople: number;
  /** Seats still open. Zero once the table is full or over. */
  freeSeats: number;
  status: LiveTableStatus;
};

export type LiveSeatingTotals = {
  tables: number;
  capacity: number;
  livePeople: number;
  checkedInPeople: number;
  manualExtra: number;
  assignedPeople: number;
  freeSeats: number;
  fullTables: number;
  emptyTables: number;
  overTables: number;
  /** Tables carrying a non-zero manual correction. */
  adjustedTables: number;
  /** Arrived people with no table assigned, so they show up nowhere on the map. */
  unseatedArrivedPeople: number;
};

const EMPTY_TOTALS: LiveSeatingTotals = {
  tables: 0,
  capacity: 0,
  livePeople: 0,
  checkedInPeople: 0,
  manualExtra: 0,
  assignedPeople: 0,
  freeSeats: 0,
  fullTables: 0,
  emptyTables: 0,
  overTables: 0,
  adjustedTables: 0,
  unseatedArrivedPeople: 0,
};

/** Safety net behind realtime, so a dropped socket can't freeze the numbers. */
const SYNC_INTERVAL_MS = 20_000;

/** Upper bound when typing a headcount directly, to blunt typos. */
const MAX_MANUAL_HEADCOUNT = 999;

function tableStatus(livePeople: number, capacity: number): LiveTableStatus {
  if (capacity > 0 && livePeople > capacity) return 'over';
  if (livePeople <= 0) return 'empty';
  if (capacity > 0 && livePeople >= capacity) return 'full';
  if (capacity > 0 && capacity - livePeople <= NEAR_CAPACITY_FREE_SEATS) return 'near';
  return 'partial';
}

function sortTables(a: LiveSeatingTable, b: LiveSeatingTable) {
  const an = typeof a.number === 'number' ? a.number : Number.POSITIVE_INFINITY;
  const bn = typeof b.number === 'number' ? b.number : Number.POSITIVE_INFINITY;
  if (an !== bn) return an - bn;
  return String(a.name || '').localeCompare(String(b.name || ''), 'he');
}

/**
 * Server rows win, except for tables whose adjustment is still in flight — for
 * those the local (optimistic) number is the fresher one.
 */
function mergeKeepingPending(
  incoming: LiveSeatingTableRow[],
  local: LiveSeatingTableRow[],
  pending: Map<string, number>
): LiveSeatingTableRow[] {
  if (!pending.size) return incoming;

  const localById = new Map(local.map((t) => [t.id, t]));
  return incoming.map((row) => {
    if (!pending.has(row.id)) return row;
    const current = localById.get(row.id);
    return current ? { ...row, liveExtraSeated: current.liveExtraSeated } : row;
  });
}

export function useLiveSeatingModel(eventId: string | null) {
  const cleanEventId = String(eventId || '').trim() || null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [tableRows, setTableRows] = useState<LiveSeatingTableRow[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [supportsManualEdit, setSupportsManualEdit] = useState(true);
  const [savingTableIds, setSavingTableIds] = useState<Set<string>>(new Set());

  /**
   * Tables with an adjustment in flight. Realtime echoes our own write back a
   * moment later; while a tap is pending the local (optimistic) value is the
   * fresher one, so incoming rows for these tables are ignored.
   */
  const pendingRef = useRef<Map<string, number>>(new Map());

  // Lets `refresh` read the current rows without depending on them, which would
  // otherwise restart the realtime channel and the sync interval on every tap.
  const tableRowsRef = useRef<LiveSeatingTableRow[]>(tableRows);
  tableRowsRef.current = tableRows;

  const markPending = useCallback((tableId: string, delta: 1 | -1) => {
    const map = pendingRef.current;
    const next = (map.get(tableId) || 0) + delta;
    if (next <= 0) map.delete(tableId);
    else map.set(tableId, next);

    setSavingTableIds(new Set(map.keys()));
  }, []);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      if (!cleanEventId) {
        setTableRows([]);
        setGuests([]);
        setEventTitle('');
        setLoading(false);
        return;
      }

      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const [eventRes, tablesRes, guestsRes] = await Promise.all([
          supabase.from('events').select('title').eq('id', cleanEventId).maybeSingle(),
          liveSeatingService.getTables(cleanEventId),
          guestService.getGuestsForCheckIn(cleanEventId, { force: silent }),
        ]);

        setEventTitle(String((eventRes.data as any)?.title || ''));
        setSupportsManualEdit(tablesRes.supportsLiveExtra);
        setTableRows(mergeKeepingPending(tablesRes.tables, tableRowsRef.current, pendingRef.current));
        setGuests(Array.isArray(guestsRes?.guests) ? guestsRes.guests : []);
        setError(null);
      } catch (e) {
        console.error('Live seating load error:', e);
        if (!silent) setError('לא ניתן לטעון את מפת הלייב');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cleanEventId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: guests (check-ins from every usher station) and tables (manual
  // corrections made by whoever else is walking the hall).
  useEffect(() => {
    if (!cleanEventId) return;

    const channel = supabase
      .channel(`live-seating:${cleanEventId}`, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guests', filter: `event_id=eq.${cleanEventId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = String((payload.old as any)?.id ?? '').trim();
            if (id) setGuests((prev) => prev.filter((g) => g.id !== id));
            return;
          }

          const row = payload.new as Record<string, unknown>;
          if (!row?.id) return;
          const guest = mapGuestRowFromDb(row);
          setGuests((prev) => {
            const idx = prev.findIndex((g) => g.id === guest.id);
            if (idx === -1) return [...prev, guest];
            const next = prev.slice();
            next[idx] = { ...next[idx], ...guest };
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tables', filter: `event_id=eq.${cleanEventId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = String((payload.old as any)?.id ?? '').trim();
            if (id) setTableRows((prev) => prev.filter((t) => t.id !== id));
            return;
          }

          const row = payload.new as Record<string, any>;
          const id = String(row?.id ?? '').trim();
          if (!id) return;
          // Our own optimistic value wins until the write settles.
          if (pendingRef.current.has(id)) return;

          setTableRows((prev) => {
            const idx = prev.findIndex((t) => t.id === id);
            const merged = applyLiveSeatingRealtimeRow(idx === -1 ? null : prev[idx], row);
            if (idx === -1) return [...prev, merged];
            const next = prev.slice();
            next[idx] = merged;
            return next;
          });
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Live seating realtime issue:', status, err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cleanEventId]);

  useEffect(() => {
    if (!cleanEventId) return;

    const intervalId = setInterval(() => {
      void refresh({ silent: true });
    }, SYNC_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (!document.hidden) void refresh({ silent: true });
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [cleanEventId, refresh]);

  const guestsByTable = useMemo(() => {
    const map = new Map<string, Guest[]>();
    for (const guest of guests) {
      const tableId = String(guest.tableId || '').trim();
      if (!tableId) continue;
      const list = map.get(tableId);
      if (list) list.push(guest);
      else map.set(tableId, [guest]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const arrived = Number(Boolean(b.checkedIn)) - Number(Boolean(a.checkedIn));
        if (arrived !== 0) return arrived;
        return String(a.name || '').localeCompare(String(b.name || ''), 'he');
      });
    }
    return map;
  }, [guests]);

  const tables = useMemo<LiveSeatingTable[]>(() => {
    return tableRows
      .map((row) => {
        const seated = guestsByTable.get(row.id) || [];

        let assignedPeople = 0;
        let checkedInPeople = 0;
        let checkedInGuests = 0;

        for (const guest of seated) {
          assignedPeople += guestInvitedPeople(guest);
          if (guest.checkedIn) {
            checkedInPeople += guestArrivedPeople(guest);
            checkedInGuests += 1;
          }
        }

        const manualExtra = Number(row.liveExtraSeated) || 0;
        const livePeople = Math.max(0, checkedInPeople + manualExtra);
        const capacity = Number(row.capacity) || 0;

        return {
          id: row.id,
          number: row.number,
          name: row.name,
          capacity,
          area: row.area,
          shape: row.shape,
          x: row.x,
          y: row.y,
          assignedPeople,
          assignedGuests: seated.length,
          checkedInPeople,
          checkedInGuests,
          manualExtra,
          livePeople,
          freeSeats: Math.max(0, capacity - livePeople),
          status: tableStatus(livePeople, capacity),
        };
      })
      .sort(sortTables);
  }, [guestsByTable, tableRows]);

  const totals = useMemo<LiveSeatingTotals>(() => {
    if (!tables.length && !guests.length) return EMPTY_TOTALS;

    const next: LiveSeatingTotals = { ...EMPTY_TOTALS, tables: tables.length };

    for (const table of tables) {
      next.capacity += table.capacity;
      next.livePeople += table.livePeople;
      next.checkedInPeople += table.checkedInPeople;
      next.manualExtra += table.manualExtra;
      next.assignedPeople += table.assignedPeople;
      next.freeSeats += table.freeSeats;
      if (table.status === 'full') next.fullTables += 1;
      if (table.status === 'empty') next.emptyTables += 1;
      if (table.status === 'over') next.overTables += 1;
      if (table.manualExtra !== 0) next.adjustedTables += 1;
    }

    for (const guest of guests) {
      if (!guest.checkedIn) continue;
      if (String(guest.tableId || '').trim()) continue;
      next.unseatedArrivedPeople += guestArrivedPeople(guest);
    }

    return next;
  }, [guests, tables]);

  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);

  /**
   * Adds or removes people at a table without naming them.
   *
   * Applies locally first so the number moves under the finger, then writes.
   * A failed write rolls the row back to the value it had before the tap.
   */
  const adjustTable = useCallback(
    async (tableId: string, delta: number): Promise<{ ok: boolean; error?: string }> => {
      const id = String(tableId || '').trim();
      const step = Math.trunc(Number(delta) || 0);
      if (!id || step === 0) return { ok: false, error: 'פעולה לא תקינה' };
      if (!supportsManualEdit) return { ok: false, error: 'עדכון ידני אינו זמין עד להרצת המיגרציה' };

      const table = tableById.get(id);
      if (!table) return { ok: false, error: 'שולחן לא נמצא' };

      // Subtracting below zero people is meaningless — the server clamps too.
      const floor = -table.checkedInPeople;
      const optimistic = Math.max(table.manualExtra + step, floor);
      if (optimistic === table.manualExtra) return { ok: true };

      const previous = table.manualExtra;
      markPending(id, 1);
      setTableRows((prev) => prev.map((t) => (t.id === id ? { ...t, liveExtraSeated: optimistic } : t)));

      try {
        const stored = await liveSeatingService.adjustLiveExtra(id, step, table.checkedInPeople);
        markPending(id, -1);
        // Taps land faster than round trips, and responses can come back out of
        // order. Only the last one still outstanding may write the number.
        if (!pendingRef.current.has(id)) {
          setTableRows((prev) => prev.map((t) => (t.id === id ? { ...t, liveExtraSeated: stored } : t)));
        }
        return { ok: true };
      } catch (e) {
        console.error('Live seating adjust error:', e);
        markPending(id, -1);
        setTableRows((prev) => prev.map((t) => (t.id === id ? { ...t, liveExtraSeated: previous } : t)));
        return { ok: false, error: 'לא ניתן לעדכן את מספר היושבים' };
      }
    },
    [markPending, supportsManualEdit, tableById]
  );

  /**
   * Sets the headcount at a table to an exact number, for when counting is
   * faster than tapping. Expressed as a delta on top of what check-in already
   * knows, so it goes through the same atomic write and stays correct when two
   * stations touch the same table.
   */
  const setLivePeople = useCallback(
    async (tableId: string, target: number): Promise<{ ok: boolean; error?: string }> => {
      const id = String(tableId || '').trim();
      const table = id ? tableById.get(id) : undefined;
      if (!table) return { ok: false, error: 'שולחן לא נמצא' };

      const wanted = Math.floor(Number(target));
      if (!Number.isFinite(wanted)) return { ok: false, error: 'יש להזין מספר' };

      // A slip of the finger shouldn't be able to record hundreds of people.
      const capped = Math.max(0, Math.min(wanted, MAX_MANUAL_HEADCOUNT));
      const delta = capped - table.livePeople;
      if (delta === 0) return { ok: true };

      return adjustTable(id, delta);
    },
    [adjustTable, tableById]
  );

  /** Drops a table's manual correction back to the pure check-in number. */
  const clearTable = useCallback(
    async (tableId: string): Promise<{ ok: boolean; error?: string }> => {
      const id = String(tableId || '').trim();
      if (!id) return { ok: false, error: 'פעולה לא תקינה' };

      const table = tableById.get(id);
      if (!table || table.manualExtra === 0) return { ok: true };

      const previous = table.manualExtra;
      markPending(id, 1);
      setTableRows((prev) => prev.map((t) => (t.id === id ? { ...t, liveExtraSeated: 0 } : t)));

      try {
        await liveSeatingService.clearLiveExtra(id);
        return { ok: true };
      } catch (e) {
        console.error('Live seating clear error:', e);
        setTableRows((prev) => prev.map((t) => (t.id === id ? { ...t, liveExtraSeated: previous } : t)));
        return { ok: false, error: 'לא ניתן לאפס את העדכון הידני' };
      } finally {
        markPending(id, -1);
      }
    },
    [markPending, tableById]
  );

  /** Drops every manual correction in the event. */
  const clearAll = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!cleanEventId) return { ok: false, error: 'חסר מזהה אירוע' };

    try {
      await liveSeatingService.clearEventLiveExtra(cleanEventId);
      setTableRows((prev) => prev.map((t) => ({ ...t, liveExtraSeated: 0 })));
      return { ok: true };
    } catch (e) {
      console.error('Live seating clear-all error:', e);
      await refresh({ silent: true });
      return { ok: false, error: 'לא ניתן לאפס את העדכונים הידניים' };
    }
  }, [cleanEventId, refresh]);

  return {
    loading,
    refreshing,
    error,
    eventTitle,
    tables,
    tableById,
    totals,
    guestsByTable,
    supportsManualEdit,
    savingTableIds,
    refresh,
    adjustTable,
    setLivePeople,
    clearTable,
    clearAll,
  };
}
