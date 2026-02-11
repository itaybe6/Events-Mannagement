import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { guestService } from '@/lib/services/guestService';
import { Guest, GuestCategory } from '@/types';

type StatusFilter = 'all' | Guest['status'];
type GuestWithCategory = Guest & { categoryName: string };

const sanitizePhone = (raw: string) => (raw || '').replace(/[^\d+]/g, '');

export type RsvpSection = { name: string; data: GuestWithCategory[] };

export type RsvpApprovalsModel = {
  loading: boolean;
  guests: Guest[];
  categories: GuestCategory[];
  query: string;
  setQuery: (v: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  savingId: string | null;
  editingId: string | null;
  setEditingId: (v: string | null) => void;
  collapsed: Set<string>;
  toggleCollapsed: (name: string) => void;
  stats: { total: number; coming: number; pending: number; notComing: number };
  sections: RsvpSection[];
  callGuest: (phone: string) => Promise<void>;
  setStatus: (guestId: string, status: Guest['status']) => Promise<void>;
  refresh: () => Promise<void>;
};

export function useRsvpApprovalsModel(eventId: string) {
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [categories, setCategories] = useState<GuestCategory[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!eventId) {
      setGuests([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [gs, cats] = await Promise.all([
        guestService.getGuests(eventId),
        guestService.getGuestCategories(eventId),
      ]);
      setGuests(Array.isArray(gs) ? gs : []);
      setCategories(Array.isArray(cats) ? (cats as any) : []);
    } catch (e) {
      console.error('RSVP approvals load error:', e);
      Alert.alert('שגיאה', 'לא ניתן לטעון את המוזמנים');
      setGuests([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => {
      if ((c as any)?.id) m.set(String((c as any).id), String((c as any).name || '').trim() || 'ללא קטגוריה');
    });
    return m;
  }, [categories]);

  const filteredGuests = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = guests.filter((g) => (statusFilter === 'all' ? true : g.status === statusFilter));
    if (!q) return base;
    return base.filter((g) => `${g.name} ${g.phone} ${g.status}`.toLowerCase().includes(q));
  }, [guests, query, statusFilter]);

  const stats = useMemo(() => {
    const total = guests.length;
    const coming = guests.filter((g) => g.status === 'מגיע').length;
    const pending = guests.filter((g) => g.status === 'ממתין').length;
    const notComing = guests.filter((g) => g.status === 'לא מגיע').length;
    return { total, coming, pending, notComing };
  }, [guests]);

  const guestsWithCategory = useMemo<GuestWithCategory[]>(() => {
    return filteredGuests.map((g) => ({
      ...g,
      categoryName: (g as any).category_id
        ? categoryNameById.get(String((g as any).category_id)) || 'ללא קטגוריה'
        : 'ללא קטגוריה',
    }));
  }, [filteredGuests, categoryNameById]);

  const sections = useMemo<RsvpSection[]>(() => {
    const order: string[] = categories.map((c) => String((c as any).name || '').trim() || 'ללא קטגוריה');
    const grouped = new Map<string, GuestWithCategory[]>();
    guestsWithCategory.forEach((g) => {
      const key = g.categoryName || 'ללא קטגוריה';
      const prev = grouped.get(key) || [];
      prev.push(g);
      grouped.set(key, prev);
    });

    const hasUncategorized = grouped.has('ללא קטגוריה') && !order.includes('ללא קטגוריה');
    const finalOrder = hasUncategorized ? [...order, 'ללא קטגוריה'] : order;
    const inOrder = new Set(finalOrder);
    const extra = Array.from(grouped.keys())
      .filter((k) => !inOrder.has(k))
      .sort((a, b) => a.localeCompare(b, 'he'));

    const names = [...finalOrder, ...extra].filter((n) => grouped.has(n));
    return names.map((name) => ({ name, data: grouped.get(name) || [] }));
  }, [categories, guestsWithCategory]);

  const toggleCollapsed = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const callGuest = useCallback(async (phone: string) => {
    const p = sanitizePhone(phone);
    if (!p) return;
    try {
      await Linking.openURL(`tel:${p}`);
    } catch (e) {
      console.error('Call openURL error:', e);
      Alert.alert('שגיאה', 'לא ניתן לפתוח שיחה');
    }
  }, []);

  const setStatus = useCallback(async (guestId: string, status: Guest['status']) => {
    setSavingId(guestId);
    try {
      await guestService.updateGuestStatus(guestId, status);
      setGuests((prev) => prev.map((g) => (g.id === guestId ? { ...g, status } : g)));
      setEditingId(null);
    } catch (e) {
      console.error('Update RSVP status error:', e);
      Alert.alert('שגיאה', 'לא ניתן לעדכן סטטוס');
    } finally {
      setSavingId(null);
    }
  }, []);

  return {
    loading,
    guests,
    categories,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    savingId,
    editingId,
    setEditingId,
    collapsed,
    toggleCollapsed,
    stats,
    sections,
    callGuest,
    setStatus,
    refresh,
  } satisfies RsvpApprovalsModel;
}

