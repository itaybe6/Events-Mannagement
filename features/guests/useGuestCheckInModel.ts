import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { guestService } from '@/lib/services/guestService';
import type { Guest, GuestCategory } from '@/types';

export type GuestCheckInFilter = 'all' | 'checked_in' | 'not_checked_in';
export type GuestCheckInCategoryKey = string; // category_id or a stable sentinel for uncategorized

export type GuestCheckInSection = {
  key: GuestCheckInCategoryKey;
  name: string;
  data: Guest[];
  checkedIn: number;
  total: number;
};

const UNCATEGORIZED_KEY = '__uncategorized__' as const;

function normalizeCategoryId(raw: unknown) {
  const s = String(raw ?? '').trim();
  return s ? s.toLowerCase() : null;
}

export function useGuestCheckInModel(params: {
  eventId: string | null;
  errorTitle?: string;
  errorMessage?: string;
}) {
  const { eventId, errorTitle = 'שגיאה', errorMessage = 'לא ניתן לטעון את רשימת האורחים' } = params;

  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [categories, setCategories] = useState<GuestCategory[]>([]);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
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
    const checkedInCount = guests.filter((g) => Boolean(g.checkedIn)).length;
    return {
      total: guests.length,
      checkedIn: checkedInCount,
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
      const checkedInCount = data.filter((g) => Boolean(g.checkedIn)).length;
      return { key, name: labelForKey(key), data, checkedIn: checkedInCount, total: data.length };
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
      const updated = await guestService.setGuestCheckedIn(guest.id, next);
      setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, ...updated } : g)));
    } catch (e) {
      console.error('Check-in update error:', e);
      Alert.alert('שגיאה', 'לא ניתן לעדכן הגעה');
    } finally {
      setSavingId(null);
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
  };
}

