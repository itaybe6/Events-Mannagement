import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { peekCached } from '@/lib/queryCache';
import { guestService, mapGuestRowFromDb } from '@/lib/services/guestService';
import { guestMatchesSearch, phoneSearchKey } from '@/lib/guestPhone';
import type { Guest, GuestCategory } from '@/types';

export type GuestCheckInFilter = 'all' | 'checked_in' | 'not_checked_in' | 'maybe_coming';
export type GuestCheckInCategoryKey = string; // category_id or a stable sentinel for uncategorized

export type GuestCheckInSection = {
  key: GuestCheckInCategoryKey;
  name: string;
  data: Guest[];
  /** People who arrived in this category (sum of checked_in_count). */
  checkedIn: number;
  /** Total invited people in this category (sum of number_of_people). */
  total: number;
};

const UNCATEGORIZED_KEY = '__uncategorized__' as const;

/** A guest who showed up at the venue without being on the invitation list. */
export type WalkInGuestInput = {
  name: string;
  phone?: string;
  numberOfPeople?: number;
  tableId?: string | null;
  categoryId?: string | null;
  /** Mark the guest as arrived right away. Defaults to true (they are standing at the entrance). */
  checkInImmediately?: boolean;
};

export type WalkInGuestResult = { ok: true; guest: Guest } | { ok: false; error: string };

function guestInvitedPeople(g: Guest): number {
  return Math.max(1, Number(g.numberOfPeople) || 1);
}

function guestArrivedPeople(g: Guest): number {
  if (!g.checkedIn) return 0;
  const invited = guestInvitedPeople(g);
  const actual = g.checkedInCount === null || g.checkedInCount === undefined ? null : Number(g.checkedInCount);
  const n = actual !== null && Number.isFinite(actual) ? actual : invited;
  return Math.max(0, n);
}

export { guestInvitedPeople, guestArrivedPeople };

function normalizeCategoryId(raw: unknown) {
  const s = String(raw ?? '').trim();
  return s ? s.toLowerCase() : null;
}

/** Fields the check-in screen renders, compared to skip no-op state updates. */
function checkInFieldsEqual(a: Guest, b: Guest): boolean {
  return (
    a.name === b.name &&
    a.phone === b.phone &&
    a.status === b.status &&
    a.tableId === b.tableId &&
    a.numberOfPeople === b.numberOfPeople &&
    a.category_id === b.category_id &&
    Boolean(a.checkedIn) === Boolean(b.checkedIn) &&
    a.checkedInCount === b.checkedInCount &&
    Number(a.checkedInAt ?? 0) === Number(b.checkedInAt ?? 0)
  );
}

export function useGuestCheckInModel(params: {
  eventId: string | null;
  errorTitle?: string;
  errorMessage?: string;
  /** Subscribe to live guest updates (check-in, count, table moves). Defaults to true. */
  enableRealtime?: boolean;
  /**
   * Safety-net sync interval (ms) behind the realtime subscription, so usher
   * stations recover if a realtime message is missed. Each tick only asks for
   * guests changed since the previous one.
   */
  syncIntervalMs?: number;
  /** Called after a guest is successfully marked as checked-in (toggle ON). Use to e.g. send table SMS. */
  onCheckInSuccess?: (guest: Guest) => void;
}) {
  const {
    eventId,
    errorTitle = 'שגיאה',
    errorMessage = 'לא ניתן לטעון את רשימת האורחים',
    enableRealtime = true,
    syncIntervalMs = 15000,
    onCheckInSuccess,
  } = params;

  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [categories, setCategories] = useState<GuestCategory[]>([]);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingCountId, setSavingCountId] = useState<string | null>(null);
  const [savingMoveId, setSavingMoveId] = useState<string | null>(null);
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [filter, setFilter] = useState<GuestCheckInFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<GuestCheckInCategoryKey>>(new Set());

  /** Newest `updated_at` already applied locally; the incremental sync watermark. */
  const syncedUpToRef = useRef<string | null>(null);
  const syncInFlightRef = useRef(false);
  const knownCategoryIdsRef = useRef<Set<string>>(new Set());
  // Lets the sync read the current list without re-subscribing its interval on
  // every check-in.
  const guestsRef = useRef<Guest[]>(guests);
  guestsRef.current = guests;

  useEffect(() => {
    syncedUpToRef.current = null;
    knownCategoryIdsRef.current = new Set();
  }, [eventId]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => {
      const norm = normalizeCategoryId(c?.id);
      if (!norm) return;
      m.set(norm, String(c.name || '').trim() || 'ללא קטגוריה');
    });
    return m;
  }, [categories]);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!eventId) {
      setGuests([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    if (!silent) {
      const cached = peekCached<{ guests: Guest[]; latestUpdatedAt: string | null }>(`guests:checkin:${eventId}`);
      if (cached?.guests?.length) {
        setGuests(cached.guests);
        syncedUpToRef.current = cached.latestUpdatedAt ?? syncedUpToRef.current;
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    try {
      const [data, cats] = await Promise.all([
        guestService.getGuestsForCheckIn(eventId),
        guestService.getGuestCategories(eventId),
      ]);

      const nextGuests = Array.isArray(data?.guests) ? data.guests : [];
      syncedUpToRef.current = data?.latestUpdatedAt ?? syncedUpToRef.current;
      let nextCats = Array.isArray(cats) ? (cats as GuestCategory[]) : [];

      // Fallback: if the category list comes back empty (or isn't visible to this user),
      // try loading category names by the IDs referenced by guests.
      if (nextGuests.length > 0) {
        const idsFromGuests = Array.from(
          new Set(
            nextGuests
              .map((g) => (g as any)?.category_id)
              .filter(Boolean)
              .map((id) => String(id).trim())
              .filter(Boolean)
          )
        );

        const known = new Set(
          nextCats
            .map((c) => normalizeCategoryId(c?.id))
            .filter(Boolean) as string[]
        );
        const missing = idsFromGuests.filter((id) => {
          const norm = normalizeCategoryId(id);
          return norm ? !known.has(norm) : false;
        });

        if ((nextCats.length === 0 || missing.length > 0) && idsFromGuests.length > 0) {
          const idsToFetch = nextCats.length === 0 ? idsFromGuests : missing;
          const { data: catRows, error } = await supabase
            .from('guest_categories')
            .select('id,name,event_id,side')
            .in('id', idsToFetch);

          if (!error && Array.isArray(catRows)) {
            const fetched = catRows
              .map((c: any) => ({
                id: String(c?.id ?? ''),
                name: String(c?.name ?? '').trim() || 'ללא קטגוריה',
                event_id: String(c?.event_id ?? eventId),
                side: (c?.side ?? 'groom') as any,
              }))
              .filter((c) => Boolean(c.id));

            if (nextCats.length === 0) nextCats = fetched;
            else {
              const byNorm = new Map<string, GuestCategory>();
              nextCats.forEach((c) => {
                const norm = normalizeCategoryId(c?.id);
                if (norm) byNorm.set(norm, c);
              });
              fetched.forEach((c) => {
                const norm = normalizeCategoryId(c?.id);
                if (norm && !byNorm.has(norm)) {
                  nextCats.push(c);
                  byNorm.set(norm, c);
                }
              });
            }
          }
        }
      }

      knownCategoryIdsRef.current = new Set(
        nextCats.map((c) => normalizeCategoryId(c?.id)).filter(Boolean) as string[]
      );
      setGuests(nextGuests);
      setCategories(nextCats);
    } catch (e) {
      console.error('Guest check-in load error:', e);
      if (!silent) {
        Alert.alert(errorTitle, errorMessage);
        setGuests([]);
        setCategories([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [errorMessage, errorTitle, eventId]);

  /**
   * Pulls only the guests changed since the last sync and merges them.
   *
   * This screen used to re-download the whole guest list every 4 seconds — for a
   * 750-guest event that is ~520KB per tick, on top of the realtime channel that
   * already delivers the same changes. A delta keyed on `updated_at` sends a few
   * rows instead, and the row count catches inserts/deletes that arrive while
   * the realtime socket is down.
   */
  const syncIncremental = useCallback(async () => {
    if (!eventId || syncInFlightRef.current) return;

    const since = syncedUpToRef.current;
    if (!since) {
      await refresh({ silent: true });
      return;
    }

    syncInFlightRef.current = true;
    try {
      const [delta, serverCount] = await Promise.all([
        guestService.getGuestsUpdatedSince(eventId, since),
        guestService.getGuestCount(eventId),
      ]);

      if (delta.latestUpdatedAt) syncedUpToRef.current = delta.latestUpdatedAt;

      let localCount = guestsRef.current.length;

      if (delta.guests.length) {
        const byId = new Map(guestsRef.current.map((g) => [g.id, g]));
        // The watermark bound is inclusive, so an unchanged boundary row comes
        // back every tick. Only swap state when something really moved,
        // otherwise we would re-render the whole list on every sync.
        let changed = false;
        for (const guest of delta.guests) {
          const existing = byId.get(guest.id);
          if (existing && checkInFieldsEqual(existing, guest)) continue;
          changed = true;
          byId.set(guest.id, existing ? { ...existing, ...guest } : guest);
        }

        if (changed) {
          const next = Array.from(byId.values());
          if (next.length !== guestsRef.current.length) {
            next.sort((a, b) => a.name.localeCompare(b.name, 'he'));
          }
          localCount = next.length;
          setGuests(next);
        }

        const hasUnknownCategory = delta.guests.some((g) => {
          const norm = normalizeCategoryId((g as any)?.category_id);
          return norm ? !knownCategoryIdsRef.current.has(norm) : false;
        });
        if (hasUnknownCategory) {
          await refresh({ silent: true });
          return;
        }
      }

      // Totals disagreeing means a row was deleted, or added while we were offline.
      if (serverCount !== localCount) await refresh({ silent: true });
    } catch (e) {
      console.warn('Guest check-in incremental sync failed:', e);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [eventId, refresh]);

  useEffect(() => {
    if (!eventId || syncIntervalMs <= 0) return;

    const intervalId = setInterval(() => {
      void syncIncremental();
    }, syncIntervalMs);

    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (!document.hidden) void syncIncremental();
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
  }, [eventId, syncIncremental, syncIntervalMs]);

  useEffect(() => {
    if (!eventId || !enableRealtime) return;

    const channel = supabase
      .channel(`guest-checkin:${eventId}`, {
        config: { broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guests',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          // Keep the delta watermark in step with realtime, otherwise every
          // safety-net tick would re-download all the changes realtime already
          // applied — which by the end of an event is the whole guest list.
          const advanceWatermark = (row: Record<string, unknown> | undefined) => {
            const updatedAt = String(row?.updated_at ?? '');
            if (updatedAt && (!syncedUpToRef.current || updatedAt > syncedUpToRef.current)) {
              syncedUpToRef.current = updatedAt;
            }
          };

          if (payload.eventType === 'INSERT') {
            const row = payload.new as Record<string, unknown>;
            if (!row?.id) return;
            advanceWatermark(row);
            const newGuest = mapGuestRowFromDb(row);
            setGuests((prev) => {
              if (prev.some((g) => g.id === newGuest.id)) return prev;
              return [...prev, newGuest].sort((a, b) => a.name.localeCompare(b.name, 'he'));
            });
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const row = payload.new as Record<string, unknown>;
            if (!row?.id) return;
            advanceWatermark(row);
            const updated = mapGuestRowFromDb(row);
            setGuests((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
            return;
          }

          if (payload.eventType === 'DELETE') {
            const old = payload.old as Record<string, unknown>;
            const id = String(old?.id ?? '').trim();
            if (!id) return;
            setGuests((prev) => prev.filter((g) => g.id !== id));
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Guest check-in realtime subscription issue:', status, err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enableRealtime, eventId]);

  // Re-rendering hundreds of guest rows on every keystroke makes the search box
  // feel laggy. Deferring the term keeps typing on the high-priority render and
  // lets React interrupt the list work.
  const deferredQuery = useDeferredValue(query);

  const searchIndex = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; status: string }>();
    for (const g of guests) {
      m.set(g.id, {
        name: String(g.name || '').toLowerCase(),
        phone: phoneSearchKey(g.phone),
        status: String(g.status || '').toLowerCase(),
      });
    }
    return m;
  }, [guests]);

  const filteredGuests = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const qPhone = phoneSearchKey(deferredQuery);
    const base = guests.filter((g) => {
      if (filter === 'checked_in') return Boolean(g.checkedIn);
      if (filter === 'not_checked_in') return !Boolean(g.checkedIn);
      if (filter === 'maybe_coming') return g.status === 'אולי מגיע';
      return true;
    });
    if (!q) return base;
    return base.filter((g) => {
      const idx = searchIndex.get(g.id);
      if (!idx) return guestMatchesSearch(g, q) || String(g.status || '').toLowerCase().includes(q);
      if (idx.name.includes(q) || idx.status.includes(q)) return true;
      return qPhone ? idx.phone.includes(qPhone) : false;
    });
  }, [guests, deferredQuery, filter, searchIndex]);

  const counts = useMemo(() => {
    let totalPeople = 0;
    let arrivedPeople = 0;
    for (const g of guests) {
      totalPeople += guestInvitedPeople(g);
      arrivedPeople += guestArrivedPeople(g);
    }
    return {
      total: totalPeople,
      checkedIn: arrivedPeople,
    };
  }, [guests]);

  const sections = useMemo<GuestCheckInSection[]>(() => {
    const grouped = new Map<GuestCheckInCategoryKey, Guest[]>();
    filteredGuests.forEach((g) => {
      const rawId = (g as any)?.category_id;
      const norm = normalizeCategoryId(rawId);
      const key: GuestCheckInCategoryKey = norm ? norm : UNCATEGORIZED_KEY;
      const prev = grouped.get(key) || [];
      prev.push(g);
      grouped.set(key, prev);
    });

    const labelForKey = (key: GuestCheckInCategoryKey) => {
      if (key === UNCATEGORIZED_KEY) return 'ללא קטגוריה';
      return categoryNameById.get(String(key)) || 'קטגוריה';
    };

    const orderKeys = categories
      .map((c) => normalizeCategoryId(c?.id))
      .filter(Boolean) as string[];
    const hasUncategorized = grouped.has(UNCATEGORIZED_KEY) && !orderKeys.includes(UNCATEGORIZED_KEY);
    const finalOrderKeys = hasUncategorized ? [...orderKeys, UNCATEGORIZED_KEY] : orderKeys;

    const inOrder = new Set(finalOrderKeys);
    const extraKeys = Array.from(grouped.keys())
      .filter((k) => !inOrder.has(k))
      .sort((a, b) => labelForKey(a).localeCompare(labelForKey(b), 'he'));

    const keys = [...finalOrderKeys, ...extraKeys].filter((k) => grouped.has(k));

    return keys.map((key) => {
      const data = grouped.get(key) || [];
      const totalPeople = data.reduce((sum, g) => sum + guestInvitedPeople(g), 0);
      const checkedInPeople = data.reduce((sum, g) => sum + guestArrivedPeople(g), 0);
      return { key, name: labelForKey(key), data, checkedIn: checkedInPeople, total: totalPeople };
    });
  }, [categories, categoryNameById, filteredGuests]);

  const toggleCollapsed = useCallback((key: GuestCheckInCategoryKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleCheckIn = useCallback(async (guest: Guest) => {
    const next = !Boolean(guest.checkedIn);
    setSavingId(guest.id);
    try {
      const fallbackCount = Number(guest.numberOfPeople) || 1;
      const desiredCount =
        guest.checkedInCount === null || guest.checkedInCount === undefined ? fallbackCount : Number(guest.checkedInCount) || 0;
      const updated = await guestService.setGuestCheckedIn(guest.id, next, next ? { checkedInCount: desiredCount } : undefined);
      setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, ...updated } : g)));
      if (next && onCheckInSuccess) {
        onCheckInSuccess({ ...guest, ...updated });
      }
    } catch (e) {
      console.error('Check-in update error:', e);
      Alert.alert('שגיאה', 'לא ניתן לעדכן הגעה');
    } finally {
      setSavingId(null);
    }
  }, [onCheckInSuccess]);

  const setCheckedInCount = useCallback(async (guest: Guest, checkedInCount: number) => {
    const next = Math.max(0, Math.floor(Number(checkedInCount) || 0));
    setSavingCountId(guest.id);
    try {
      const updated = await guestService.setGuestCheckedInCount(guest.id, next);
      setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, ...updated } : g)));
    } catch (e) {
      console.error('Check-in count update error:', e);
      Alert.alert('שגיאה', 'לא ניתן לעדכן כמות הגעה');
    } finally {
      setSavingCountId(null);
    }
  }, []);

  const assignGuestToTable = useCallback(async (guest: Guest, tableId: string | null) => {
    setSavingMoveId(guest.id);
    try {
      const updated = await guestService.assignGuestToTable(guest.id, tableId);
      setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, ...updated } : g)));
      return true;
    } catch (e) {
      console.error('Assign guest to table error:', e);
      Alert.alert('שגיאה', 'לא ניתן להעביר אורח בין שולחנות');
      return false;
    } finally {
      setSavingMoveId(null);
    }
  }, []);

  const addWalkInGuest = useCallback(async (input: WalkInGuestInput): Promise<WalkInGuestResult> => {
    if (!eventId) return { ok: false, error: 'חסר מזהה אירוע' };

    const name = String(input?.name ?? '').trim();
    if (!name) return { ok: false, error: 'יש להזין שם מוזמן' };

    const phone = String(input?.phone ?? '').trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (phone && phoneDigits.length < 9) return { ok: false, error: 'מספר הטלפון אינו תקין' };

    const people = Math.max(1, Math.floor(Number(input?.numberOfPeople) || 1));
    const tableId = input?.tableId ? String(input.tableId).trim() || null : null;
    const shouldCheckIn = input?.checkInImmediately !== false;

    setAddingWalkIn(true);
    try {
      const created = await guestService.addGuest(eventId, {
        name,
        phone,
        status: 'מגיע',
        tableId,
        gift: 0,
        message: '',
        category_id: (input?.categoryId ?? null) as Guest['category_id'],
        numberOfPeople: people,
      });

      const guest = shouldCheckIn
        ? { ...created, ...(await guestService.setGuestCheckedIn(created.id, true, { checkedInCount: people })) }
        : created;

      setGuests((prev) => {
        if (prev.some((g) => g.id === guest.id)) return prev.map((g) => (g.id === guest.id ? { ...g, ...guest } : g));
        return [...prev, guest].sort((a, b) => a.name.localeCompare(b.name, 'he'));
      });

      return { ok: true, guest };
    } catch (e) {
      console.error('Add walk-in guest error:', e);
      const message = e instanceof Error ? String(e.message || '').trim() : '';
      return { ok: false, error: message || 'לא ניתן להוסיף את המוזמן. נסו שוב.' };
    } finally {
      setAddingWalkIn(false);
    }
  }, [eventId]);

  return {
    // data
    loading,
    guests,
    categories,
    filteredGuests,
    counts,
    sections,

    // filters/state
    query,
    setQuery,
    filter,
    setFilter,
    collapsed,
    toggleCollapsed,

    // actions
    refresh,
    toggleCheckIn,
    savingId,
    setCheckedInCount,
    savingCountId,
    assignGuestToTable,
    savingMoveId,
    addWalkInGuest,
    addingWalkIn,
  };
}

