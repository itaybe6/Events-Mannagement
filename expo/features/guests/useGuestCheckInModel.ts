import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { guestService, mapGuestRowFromDb } from '@/lib/services/guestService';
import type { Guest, GuestCategory } from '@/types';

export type GuestCheckInFilter = 'all' | 'checked_in' | 'not_checked_in';
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

export function useGuestCheckInModel(params: {
  eventId: string | null;
  errorTitle?: string;
  errorMessage?: string;
  /** Subscribe to live guest updates (check-in, count, table moves). Defaults to true. */
  enableRealtime?: boolean;
  /** Called after a guest is successfully marked as checked-in (toggle ON). Use to e.g. send table SMS. */
  onCheckInSuccess?: (guest: Guest) => void;
}) {
  const {
    eventId,
    errorTitle = 'שגיאה',
    errorMessage = 'לא ניתן לטעון את רשימת האורחים',
    enableRealtime = true,
    onCheckInSuccess,
  } = params;

  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [categories, setCategories] = useState<GuestCategory[]>([]);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingCountId, setSavingCountId] = useState<string | null>(null);
  const [savingMoveId, setSavingMoveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<GuestCheckInFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<GuestCheckInCategoryKey>>(new Set());

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => {
      const norm = normalizeCategoryId(c?.id);
      if (!norm) return;
      m.set(norm, String(c.name || '').trim() || 'ללא קטגוריה');
    });
    return m;
  }, [categories]);

  const refresh = useCallback(async () => {
    if (!eventId) {
      setGuests([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [data, cats] = await Promise.all([
        guestService.getGuests(eventId),
        guestService.getGuestCategories(eventId),
      ]);

      const nextGuests = Array.isArray(data) ? (data as Guest[]) : [];
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

      setGuests(nextGuests);
      setCategories(nextCats);
    } catch (e) {
      console.error('Guest check-in load error:', e);
      Alert.alert(errorTitle, errorMessage);
      setGuests([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [errorMessage, errorTitle, eventId]);

  useEffect(() => {
    if (!eventId || !enableRealtime) return;

    const channel = supabase
      .channel(`guest-checkin:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guests',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Record<string, unknown>;
            if (!row?.id) return;
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
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Guest check-in realtime subscription error:', status, err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enableRealtime, eventId]);

  const filteredGuests = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = guests.filter((g) => {
      if (filter === 'checked_in') return Boolean(g.checkedIn);
      if (filter === 'not_checked_in') return !Boolean(g.checkedIn);
      return true;
    });
    if (!q) return base;
    return base.filter((g) => `${g.name} ${g.phone} ${g.status}`.toLowerCase().includes(q));
  }, [guests, query, filter]);

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
  };
}

