import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';

type GuestStatus = 'ממתין' | 'מגיע' | 'לא מגיע';
type GuestRow = {
  id: string;
  name: string;
  phone: string;
  status: GuestStatus;
  category_id?: string | null;
  numberOfPeople?: number | null;
};
type GuestCategoryRow = { id: string; name: string; side?: 'groom' | 'bride' };

export default function CoupleGuestsWebScreen() {
  const router = useRouter();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { isLoggedIn, userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isNarrow = windowWidth < 720;

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<GuestCategoryRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<GuestStatus | null>(null);

  const [expandedByCategoryId, setExpandedByCategoryId] = useState<Record<string, boolean>>({});
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());

  const [editOpen, setEditOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<GuestStatus>('ממתין');
  const [editPeopleCount, setEditPeopleCount] = useState('1');

  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<'category' | 'guest'>('category');
  const [addSelectedCategoryId, setAddSelectedCategoryId] = useState<string>('__uncategorized__');
  const [addNewCategoryName, setAddNewCategoryName] = useState('');
  const [addGuestName, setAddGuestName] = useState('');
  const [addGuestPhone, setAddGuestPhone] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn, router]);

  const load = async () => {
    if (!resolvedEventId) {
      setCategories([]);
      setGuests([]);
      return;
    }

    if (userData?.id) setActiveEvent(userData.id, resolvedEventId);
    setLoading(true);
    try {
      const [evt, cats, g] = await Promise.all([
        eventService.getEvent(resolvedEventId),
        guestService.getGuestCategories(resolvedEventId),
        guestService.getGuests(resolvedEventId),
      ]);
      void evt;
      setCategories(cats as any);
      setGuests(g as any);
      setExpandedByCategoryId((prev) => {
        const next = { ...prev };
        for (const c of cats as any) if (next[c.id] === undefined) next[c.id] = true;
        return next;
      });
    } catch (e) {
      console.error('Guests web load error:', e);
      Alert.alert('שגיאה', 'לא ניתן לטעון את רשימת המוזמנים כרגע.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId]);

  useFocusEffect(
    React.useCallback(() => {
      load();
      return () => {};
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedEventId])
  );

  const guestCounts = useMemo(() => {
    const total = guests.reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    const coming = guests
      .filter((g) => g.status === 'מגיע')
      .reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    const pending = guests
      .filter((g) => g.status === 'ממתין')
      .reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    const notComing = guests
      .filter((g) => g.status === 'לא מגיע')
      .reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    return { total, coming, pending, notComing };
  }, [guests]);

  const filteredGuests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return guests.filter((g) => {
      const matchesSearch =
        !q || g.name.toLowerCase().includes(q) || String(g.phone || '').replace(/\s+/g, '').includes(q.replace(/\s+/g, ''));
      const matchesStatus = statusFilter ? g.status === statusFilter : true;
      return matchesSearch && matchesStatus;
    });
  }, [guests, searchQuery, statusFilter]);

  const guestsByCategory = useMemo(() => {
    const by: Record<string, GuestRow[]> = {};
    for (const g of filteredGuests) {
      const cid = String(g.category_id || '').trim();
      if (!cid) continue;
      if (!by[cid]) by[cid] = [];
      by[cid].push(g);
    }
    return by;
  }, [filteredGuests]);

  const groupItems = useMemo(() => {
    const catIds = new Set(categories.map((c) => String(c.id)));
    const uncategorized = filteredGuests.filter((g) => {
      const cid = String(g.category_id || '').trim();
      return !cid || !catIds.has(cid);
    });

    const items: Array<{ id: string; name: string; list: GuestRow[] }> = [];
    if (uncategorized.length) items.push({ id: '__uncategorized__', name: 'ללא קטגוריה', list: uncategorized });
    for (const c of categories) items.push({ id: String(c.id), name: c.name, list: guestsByCategory[String(c.id)] || [] });
    return items;
  }, [categories, filteredGuests, guestsByCategory]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(String(c.id), c.name);
    return m;
  }, [categories]);

  const openEdit = (g: GuestRow) => {
    setEditingGuest(g);
    setEditName(g.name || '');
    setEditPhone(g.phone || '');
    setEditStatus((g.status || 'ממתין') as GuestStatus);
    setEditPeopleCount(String(g.numberOfPeople || 1));
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingGuest(null);
    setEditName('');
    setEditPhone('');
    setEditStatus('ממתין');
    setEditPeopleCount('1');
  };

  const handleSaveEdit = async () => {
    if (!editingGuest) return;
    const name = editName.trim();
    if (!name) return;
    const peopleCount = Math.max(1, Number.parseInt(editPeopleCount || '1', 10) || 1);
    try {
      await guestService.updateGuest(editingGuest.id, {
        name,
        phone: editPhone.trim(),
        status: editStatus,
        numberOfPeople: peopleCount,
      } as any);
      setGuests((prev) =>
        prev.map((g) =>
          g.id === editingGuest.id
            ? { ...g, name, phone: editPhone.trim(), status: editStatus, numberOfPeople: peopleCount }
            : g
        )
      );
      closeEdit();
    } catch (e) {
      console.error('Save guest error:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את השינויים.');
    }
  };

  const handleDeleteGuest = async (guestId: string) => {
    const g = guests.find((x) => x.id === guestId);
    Alert.alert('מחיקת אורח', `האם למחוק את ${g?.name || 'האורח'}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            await guestService.deleteGuest(guestId);
            setGuests((prev) => prev.filter((x) => x.id !== guestId));
            setSelectedGuestIds((prev) => {
              const next = new Set(prev);
              next.delete(guestId);
              return next;
            });
            if (editingGuest?.id === guestId) closeEdit();
          } catch (e) {
            console.error('Delete guest error:', e);
            Alert.alert('שגיאה', 'לא ניתן למחוק את האורח.');
          }
        },
      },
    ]);
  };

  const toggleSelectGuest = (guestId: string) => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const clearSelection = () => setSelectedGuestIds(new Set());

  const bulkDeleteSelected = () => {
    const ids = Array.from(selectedGuestIds);
    if (ids.length === 0) return;
    Alert.alert('מחיקת אורחים', `למחוק ${ids.length} אורחים שנבחרו?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            await Promise.all(ids.map((id) => guestService.deleteGuest(id)));
            setGuests((prev) => prev.filter((g) => !selectedGuestIds.has(g.id)));
            clearSelection();
          } catch (e) {
            console.error('Bulk delete error:', e);
            Alert.alert('שגיאה', 'לא ניתן למחוק את האורחים שנבחרו.');
          }
        },
      },
    ]);
  };

  const importContacts = async () => {
    if (!resolvedEventId) return;
    router.push({ pathname: '/contacts-list', params: { eventId: resolvedEventId, autoOpenCategory: '1' } });
  };

  const openAdd = () => {
    if (!resolvedEventId) {
      Alert.alert('שגיאה', 'לא נמצא אירוע פעיל.');
      return;
    }
    setAddOpen(true);
    setAddStep('category');
    setAddNewCategoryName('');
    setAddGuestName('');
    setAddGuestPhone('');
    setAddSaving(false);
    const firstCatId = String(categories?.[0]?.id || '').trim();
    setAddSelectedCategoryId(firstCatId || '__uncategorized__');
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddStep('category');
    setAddSaving(false);
    setAddNewCategoryName('');
    setAddGuestName('');
    setAddGuestPhone('');
  };

  const handleAddCategoryInline = async () => {
    if (!resolvedEventId) return;
    const name = (addNewCategoryName || '').trim();
    if (!name) {
      Alert.alert('שגיאה', 'יש להזין שם קטגוריה');
      return;
    }
    if (addSaving) return;
    setAddSaving(true);
    try {
      const created = (await guestService.addGuestCategory(resolvedEventId, name, 'groom')) as any;
      setCategories((prev) => [...prev, created]);
      setExpandedByCategoryId((prev) => ({ ...prev, [String(created.id)]: true }));
      setAddSelectedCategoryId(String(created.id));
      setAddNewCategoryName('');
      setAddStep('guest');
    } catch (e: any) {
      console.error('Add category inline error:', e);
      const msg =
        e?.message ||
        e?.details ||
        e?.hint ||
        (typeof e === 'string' ? e : '') ||
        'לא ניתן להוסיף קטגוריה';
      Alert.alert('שגיאה', msg);
    } finally {
      setAddSaving(false);
    }
  };

  const handleAddGuestInline = async () => {
    if (!resolvedEventId) return;
    const name = (addGuestName || '').trim();
    const phone = (addGuestPhone || '').trim();
    if (!name) {
      Alert.alert('שגיאה', 'יש להזין שם מוזמן');
      return;
    }
    if (!phone) {
      Alert.alert('שגיאה', 'יש להזין מספר פלאפון');
      return;
    }
    if (addSaving) return;
    setAddSaving(true);
    try {
      const categoryId =
        addSelectedCategoryId === '__uncategorized__' ? null : String(addSelectedCategoryId || '').trim() || null;
      const created = await guestService.addGuest(resolvedEventId, {
        name,
        phone,
        status: 'ממתין' as any,
        tableId: null,
        gift: 0,
        message: '',
        category_id: categoryId,
        numberOfPeople: 1,
      } as any);

      setGuests((prev) => {
        const next: GuestRow[] = [
          ...prev,
          {
            id: String(created.id),
            name: String(created.name || ''),
            phone: String(created.phone || ''),
            status: (created.status || 'ממתין') as GuestStatus,
            category_id: (created as any).category_id ?? null,
            numberOfPeople: (created as any).numberOfPeople ?? 1,
          },
        ];
        next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he', { sensitivity: 'base' }));
        return next;
      });

      setAddGuestName('');
      setAddGuestPhone('');
      Alert.alert('נוסף', 'המוזמן נוסף בהצלחה');
    } catch (e) {
      console.error('Add guest inline error:', e);
      Alert.alert('שגיאה', 'לא ניתן להוסיף את המוזמן.');
    } finally {
      setAddSaving(false);
    }
  };

  void categoryNameById;

  const statusChipOptions: Array<{ key: GuestStatus | null; label: string; count: number; tone: 'primary' | 'success' | 'warning' | 'danger' }> =
    [
      { key: null, label: 'הכל', count: guestCounts.total, tone: 'primary' },
      { key: 'מגיע', label: 'אישרו', count: guestCounts.coming, tone: 'success' },
      { key: 'ממתין', label: 'ממתינים', count: guestCounts.pending, tone: 'warning' },
      { key: 'לא מגיע', label: 'לא מגיעים', count: guestCounts.notComing, tone: 'danger' },
    ];

  const cardWidth = useMemo(() => {
    if (windowWidth < 640) return '100%';
    if (windowWidth < 980) return '48%';
    return '23.5%';
  }, [windowWidth]);

  const guestItemWidth = useMemo(() => {
    // Responsive:
    // - narrow: 1 col
    // - laptop: 2 cols
    // - desktop+: compact fixed widths (cleaner, narrower cards)
    if (windowWidth < 720) return '100%';
    if (windowWidth < 1100) return '48%';
    if (windowWidth < 1480) return 260;
    if (windowWidth < 1720) return 240;
    return 220;
  }, [windowWidth]);

  // Compact cards look cleaner than large square tiles for guests lists.
  const useSquareGuestCards = false;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Metrics */}
        <View style={styles.metricsRow}>
          <MetricCard
            title='סה״כ מוזמנים'
            value={guestCounts.total}
            tone="primary"
            width={cardWidth}
          />
          <MetricCard title="אישרו הגעה" value={guestCounts.coming} hint={pct(guestCounts.coming, guestCounts.total)} tone="success" width={cardWidth} />
          <MetricCard title="ממתינים לתשובה" value={guestCounts.pending} hint={pct(guestCounts.pending, guestCounts.total)} tone="warning" width={cardWidth} />
          <MetricCard title="לא מגיעים" value={guestCounts.notComing} hint={pct(guestCounts.notComing, guestCounts.total)} tone="danger" width={cardWidth} />
        </View>

        {/* Filter Bar */}
        <View style={[styles.filterBar, isNarrow ? styles.filterBarNarrow : styles.filterBarWide]}>
          <View style={[styles.searchWrap, isNarrow ? { width: '100%' } : { width: 420 }]}>
            <View style={styles.searchIconRight}>
              <Ionicons name="search" size={18} color={colors.gray[500]} />
            </View>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="חיפוש מוזמנים לפי שם או טלפון..."
              placeholderTextColor={colors.gray[500]}
              style={styles.searchInput}
            />
          </View>

          <View style={styles.chipsRow}>
            {statusChipOptions.map((opt) => (
              <StatusChip
                key={String(opt.key)}
                active={statusFilter === opt.key}
                label={opt.label}
                count={opt.count}
                tone={opt.tone}
                onPress={() => setStatusFilter(opt.key)}
              />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הוסף מוזמנים"
            onPress={openAdd}
            style={({ hovered, pressed }: any) => [
              styles.addGuestsBtn,
              isNarrow ? styles.addGuestsBtnNarrow : null,
              Platform.OS === 'web' && hovered ? styles.addGuestsBtnHover : null,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.addGuestsBtnText}>הוסף מוזמנים</Text>
          </Pressable>

          {selectedGuestIds.size > 0 ? (
            <View style={styles.bulkRow}>
              <Text style={styles.bulkText}>{selectedGuestIds.size} נבחרו</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="נקה בחירה"
                onPress={clearSelection}
                style={({ hovered, pressed }: any) => [
                  styles.bulkBtn,
                  Platform.OS === 'web' && hovered ? styles.bulkBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={16} color={colors.gray[700]} />
                <Text style={styles.bulkBtnText}>נקה</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="מחק נבחרים"
                onPress={bulkDeleteSelected}
                style={({ hovered, pressed }: any) => [
                  styles.bulkDangerBtn,
                  Platform.OS === 'web' && hovered ? styles.bulkDangerBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="trash-outline" size={16} color={colors.white} />
                <Text style={styles.bulkDangerBtnText}>מחק</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Groups */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>טוען מוזמנים...</Text>
          </View>
        ) : (
          <View style={styles.groups}>
            {groupItems.length === 0 ? (
              <EmptyState onAdd={openAdd} />
            ) : (
              groupItems.map((cat) => {
                const list = cat.list;
                const isExpanded = expandedByCategoryId[String(cat.id)] ?? true;
                const counts = groupCounts(list);
                return (
                  <View key={String(cat.id)} style={styles.groupCard}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`פתיחה/סגירה של ${cat.name}`}
                      onPress={() =>
                        setExpandedByCategoryId((prev) => ({ ...prev, [String(cat.id)]: !(prev[String(cat.id)] ?? true) }))
                      }
                      style={({ hovered, pressed }: any) => [
                        styles.groupHeader,
                        Platform.OS === 'web' && hovered ? styles.groupHeaderHover : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <View style={styles.groupHeaderLeft}>
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color={colors.gray[500]}
                          style={isExpanded ? undefined : (styles.chevronCollapsed as any)}
                        />
                        <Text style={styles.groupTitle} numberOfLines={1}>
                          {cat.name}
                        </Text>
                        <View style={styles.groupPill}>
                          <Text style={styles.groupPillText}>{list.length} מוזמנים</Text>
                        </View>
                      </View>

                      <View style={styles.groupHeaderRight}>
                        <MiniStatDot label={`${counts.coming} אישרו`} tone="success" />
                        <MiniStatDot label={`${counts.pending} ממתינים`} tone="warning" />
                        <MiniStatDot label={`${counts.notComing} לא מגיעים`} tone="danger" />
                      </View>
                    </Pressable>

                    {isExpanded ? (
                      <View style={styles.groupBody}>
                        {list.length === 0 ? (
                          <Text style={styles.groupEmpty}>אין תוצאות בקבוצה הזו</Text>
                        ) : (
                          list.map((g) => (
                            <GuestListRow
                              key={g.id}
                              guest={g}
                              width={guestItemWidth}
                              square={useSquareGuestCards}
                              checked={selectedGuestIds.has(g.id)}
                              onToggleCheck={() => toggleSelectGuest(g.id)}
                              onEdit={() => openEdit(g)}
                              onDelete={() => handleDeleteGuest(g.id)}
                            />
                          ))
                        )}
                      </View>
                    ) : (
                      <View style={styles.groupCollapsedBar} />
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Add guest modal */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <Pressable style={styles.modalOverlay} onPress={closeAdd}>
          <Pressable style={[styles.modalCard, { maxHeight: Math.min(0.92 * windowHeight, 720) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{addStep === 'category' ? 'הוספת מוזמן' : 'פרטי מוזמן'}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeAdd}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {addStep === 'category' ? (
                <>
                  <Text style={styles.addHint}>בחר קטגוריה כדי לתייג את המוזמן, או הוסף קטגוריה חדשה.</Text>

                  <View style={styles.categoryPickList}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="ללא קטגוריה"
                      onPress={() => setAddSelectedCategoryId('__uncategorized__')}
                      style={({ hovered, pressed }: any) => [
                        styles.categoryPickItem,
                        addSelectedCategoryId === '__uncategorized__' ? styles.categoryPickItemActive : null,
                        Platform.OS === 'web' && hovered && addSelectedCategoryId !== '__uncategorized__'
                          ? styles.categoryPickItemHover
                          : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryPickText,
                          addSelectedCategoryId === '__uncategorized__' ? styles.categoryPickTextActive : null,
                        ]}
                        numberOfLines={1}
                      >
                        ללא קטגוריה
                      </Text>
                      {addSelectedCategoryId === '__uncategorized__' ? (
                        <Ionicons name="checkmark" size={18} color={colors.white} />
                      ) : null}
                    </Pressable>

                    {categories.map((c) => {
                      const id = String(c.id);
                      const active = addSelectedCategoryId === id;
                      return (
                        <Pressable
                          key={id}
                          accessibilityRole="button"
                          accessibilityLabel={`קטגוריה ${c.name}`}
                          onPress={() => setAddSelectedCategoryId(id)}
                          style={({ hovered, pressed }: any) => [
                            styles.categoryPickItem,
                            active ? styles.categoryPickItemActive : null,
                            Platform.OS === 'web' && hovered && !active ? styles.categoryPickItemHover : null,
                            pressed ? styles.btnPressed : null,
                          ]}
                        >
                          <Text style={[styles.categoryPickText, active ? styles.categoryPickTextActive : null]} numberOfLines={1}>
                            {c.name}
                          </Text>
                          {active ? <Ionicons name="checkmark" size={18} color={colors.white} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={{ height: 6 }} />

                  <Field label="קטגוריה חדשה">
                    <View style={styles.inlineRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="הוסף קטגוריה"
                        onPress={handleAddCategoryInline}
                        style={({ hovered, pressed }: any) => [
                          styles.inlineAddBtn,
                          Platform.OS === 'web' && hovered ? styles.inlineAddBtnHover : null,
                          pressed ? styles.btnPressed : null,
                          addSaving ? styles.inlineAddBtnDisabled : null,
                        ]}
                        disabled={addSaving}
                      >
                        <Ionicons name="add" size={18} color={colors.white} />
                        <Text style={styles.inlineAddBtnText}>{addSaving ? 'מוסיף...' : 'הוסף'}</Text>
                      </Pressable>
                      <TextInput
                        value={addNewCategoryName}
                        onChangeText={setAddNewCategoryName}
                        placeholder="למשל: משפחה / חברים"
                        placeholderTextColor={colors.gray[500]}
                        style={[styles.modalInput, { flex: 1 }]}
                      />
                    </View>
                  </Field>
                </>
              ) : (
                <>
                  <View style={styles.selectedCategoryLine}>
                    <Text style={styles.selectedCategoryLabel}>קטגוריה:</Text>
                    <Text style={styles.selectedCategoryValue} numberOfLines={1}>
                      {addSelectedCategoryId === '__uncategorized__'
                        ? 'ללא קטגוריה'
                        : String(categories.find((c) => String(c.id) === String(addSelectedCategoryId))?.name || '—')}
                    </Text>
                  </View>

                  <Field label="שם">
                    <TextInput
                      value={addGuestName}
                      onChangeText={setAddGuestName}
                      placeholder="שם מלא"
                      placeholderTextColor={colors.gray[500]}
                      style={styles.modalInput}
                    />
                  </Field>

                  <Field label="מספר פלאפון">
                    <TextInput
                      value={addGuestPhone}
                      onChangeText={setAddGuestPhone}
                      placeholder="050-0000000"
                      placeholderTextColor={colors.gray[500]}
                      style={[styles.modalInput, styles.inputLtr]}
                      keyboardType="phone-pad"
                    />
                  </Field>
                </>
              )}

              <View style={{ height: 10 }} />
            </ScrollView>

            <View style={styles.modalActions}>
              {addStep === 'guest' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חזרה"
                  onPress={() => setAddStep('category')}
                  style={({ hovered, pressed }: any) => [
                    styles.modalSecondaryBtn,
                    Platform.OS === 'web' && hovered ? styles.modalSecondaryBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={18} color={colors.gray[800]} />
                  <Text style={styles.modalSecondaryBtnText}>חזרה</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ייבוא מאנשי קשר"
                  onPress={() => {
                    closeAdd();
                    importContacts();
                  }}
                  style={({ hovered, pressed }: any) => [
                    styles.modalSecondaryBtn,
                    Platform.OS === 'web' && hovered ? styles.modalSecondaryBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="people-outline" size={18} color={colors.gray[800]} />
                  <Text style={styles.modalSecondaryBtnText}>ייבוא מאנשי קשר</Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={addStep === 'category' ? 'המשך' : 'הוסף'}
                onPress={() => {
                  if (addStep === 'category') setAddStep('guest');
                  else void handleAddGuestInline();
                }}
                style={({ hovered, pressed }: any) => [
                  styles.modalPrimaryBtn,
                  Platform.OS === 'web' && hovered ? styles.modalPrimaryBtnHover : null,
                  pressed ? styles.btnPressed : null,
                  addSaving ? styles.modalPrimaryBtnDisabled : null,
                ]}
                disabled={addSaving}
              >
                <Ionicons name={addStep === 'category' ? 'arrow-back' : 'person-add'} size={18} color={colors.white} />
                <Text style={styles.modalPrimaryBtnText}>
                  {addSaving ? (addStep === 'category' ? 'טוען...' : 'מוסיף...') : addStep === 'category' ? 'המשך' : 'הוסף מוזמן'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit modal */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <Pressable style={styles.modalOverlay} onPress={closeEdit}>
          <Pressable style={[styles.modalCard, { maxHeight: Math.min(0.92 * windowHeight, 680) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>עריכת אורח</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeEdit}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Field label="שם">
                <TextInput value={editName} onChangeText={setEditName} placeholder="שם מלא" placeholderTextColor={colors.gray[500]} style={styles.modalInput} />
              </Field>
              <Field label="טלפון">
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="050-0000000"
                  placeholderTextColor={colors.gray[500]}
                  style={[styles.modalInput, styles.inputLtr]}
                />
              </Field>
              <Field label="סטטוס">
                <View style={styles.statusRow}>
                  <StatusPill active={editStatus === 'מגיע'} tone="success" label="מגיע" onPress={() => setEditStatus('מגיע')} />
                  <StatusPill active={editStatus === 'ממתין'} tone="warning" label="ממתין" onPress={() => setEditStatus('ממתין')} />
                  <StatusPill active={editStatus === 'לא מגיע'} tone="danger" label="לא מגיע" onPress={() => setEditStatus('לא מגיע')} />
                </View>
              </Field>
              <Field label="מספר אנשים">
                <TextInput
                  value={editPeopleCount}
                  onChangeText={setEditPeopleCount}
                  placeholder="1"
                  placeholderTextColor={colors.gray[500]}
                  style={[styles.modalInput, styles.inputLtr]}
                  keyboardType="numeric"
                />
              </Field>
              <View style={{ height: 14 }} />
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="מחק"
                onPress={() => (editingGuest ? handleDeleteGuest(editingGuest.id) : null)}
                style={({ hovered, pressed }: any) => [
                  styles.modalDangerBtn,
                  Platform.OS === 'web' && hovered ? styles.modalDangerBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="trash-outline" size={18} color={colors.white} />
                <Text style={styles.modalDangerBtnText}>מחק</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור"
                onPress={handleSaveEdit}
                style={({ hovered, pressed }: any) => [
                  styles.modalPrimaryBtn,
                  Platform.OS === 'web' && hovered ? styles.modalPrimaryBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="checkmark" size={18} color={colors.white} />
                <Text style={styles.modalPrimaryBtnText}>שמור</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function pct(n: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function groupCounts(list: GuestRow[]) {
  const coming = list.filter((g) => g.status === 'מגיע').length;
  const pending = list.filter((g) => g.status === 'ממתין').length;
  const notComing = list.filter((g) => g.status === 'לא מגיע').length;
  return { coming, pending, notComing };
}

function toneColor(tone: 'primary' | 'success' | 'warning' | 'danger') {
  if (tone === 'success') return { main: '#10B981', soft: 'rgba(16,185,129,0.12)', text: '#065F46' };
  if (tone === 'warning') return { main: '#F59E0B', soft: 'rgba(245,158,11,0.12)', text: '#92400E' };
  if (tone === 'danger') return { main: '#F43F5E', soft: 'rgba(244,63,94,0.12)', text: '#9F1239' };
  return { main: colors.primary, soft: 'rgba(6,23,62,0.10)', text: colors.primary };
}

function MetricCard({
  title,
  value,
  hint,
  tone,
  width,
}: {
  title: string;
  value: number;
  hint?: string;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  width: any;
}) {
  const c = toneColor(tone);
  return (
    <View style={[styles.metricCard, { width }, { borderRightColor: c.main }]}>
      <Text style={styles.metricLabel}>{title}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {hint ? (
          <View style={[styles.metricHintPill, { backgroundColor: c.soft }]}>
            <Text style={[styles.metricHintText, { color: c.text }]}>{hint}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function StatusChip({
  label,
  count,
  active,
  tone,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  onPress: () => void;
}) {
  const c = toneColor(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`סינון: ${label}`}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.chip,
        active ? { backgroundColor: c.main, borderColor: c.main } : null,
        Platform.OS === 'web' && hovered && !active ? styles.chipHover : null,
        pressed ? styles.btnPressed : null,
      ]}
    >
      <Text style={[styles.chipText, active ? { color: colors.white } : null]}>{label}</Text>
      <View style={[styles.chipCount, active ? { backgroundColor: 'rgba(255,255,255,0.20)' } : { backgroundColor: c.soft }]}>
        <Text style={[styles.chipCountText, active ? { color: colors.white } : { color: c.text }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

function MiniStatDot({ label, tone }: { label: string; tone: 'success' | 'warning' | 'danger' }) {
  const c = toneColor(tone);
  return (
    <View style={styles.miniStat}>
      <View style={[styles.miniDot, { backgroundColor: c.main }]} />
      <Text style={styles.miniStatText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function GuestListRow({
  guest,
  width,
  square,
  checked,
  onToggleCheck,
  onEdit,
  onDelete,
}: {
  guest: GuestRow;
  width?: any;
  square?: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusTone = guest.status === 'מגיע' ? 'success' : guest.status === 'לא מגיע' ? 'danger' : 'warning';
  const sc = toneColor(statusTone);

  return (
    <Pressable
      style={({ hovered }: any) => [
        styles.guestCard,
        width ? { width } : null,
        square ? styles.guestCardSquare : null,
        Platform.OS === 'web' && hovered ? styles.guestRowHover : null,
      ]}
    >
      {() => (
        <>
          {/* Checkbox (top-left), like the provided design */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={checked ? 'הסר בחירה' : 'בחר אורח'}
            onPress={onToggleCheck}
            style={({ hovered, pressed }: any) => [
              styles.checkbox,
              styles.guestCheckboxAbs,
              checked ? styles.checkboxChecked : null,
              Platform.OS === 'web' && hovered ? styles.checkboxHover : null,
              pressed ? styles.btnPressed : null,
            ]}
          >
            {checked ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
          </Pressable>

          <View style={styles.guestCardHeader}>
            {/* Left side: name + phone (left-aligned) */}
            <View style={styles.guestHeaderLeft}>
              <View style={styles.guestCardTitleWrap}>
                <Text style={styles.guestCardName} numberOfLines={1}>
                  {guest.name}
                </Text>
                <Text style={styles.guestCardPhone} numberOfLines={1}>
                  {guest.phone}
                </Text>
              </View>
            </View>
          </View>

          {/* Bottom-left: qty + actions, then status under them */}
          <View style={styles.guestBottom}>
            <View style={styles.guestBottomTopRow}>
              <View style={styles.guestCardMetaPill}>
                <Ionicons name="people-outline" size={14} color={colors.gray[600]} />
                <Text style={styles.guestCardMetaText}>כמות: {guest.numberOfPeople || 1}</Text>
              </View>
            </View>

            <View
              style={[
                styles.statusPill,
                styles.statusPillBottom,
                { backgroundColor: sc.soft, borderColor: 'rgba(0,0,0,0.06)' },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: sc.main }]} />
              <Text style={[styles.statusText, { color: sc.text }]}>{guest.status}</Text>
            </View>
          </View>

          {/* Actions pinned to the bottom-left of the card */}
          <View style={styles.guestCardActionsAbs}>
            <IconCircleBtn icon="create-outline" label="עריכה" onPress={onEdit} />
            <IconCircleBtn icon="trash-outline" label="מחק" danger onPress={onDelete} />
          </View>
        </>
      )}
    </Pressable>
  );
}

function IconCircleBtn({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const hoverStyle = danger ? styles.iconBtnDangerHover : styles.iconBtnHover;
  const baseColor = danger ? '#F43F5E' : colors.gray[500];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.iconBtn,
        Platform.OS === 'web' && hovered ? hoverStyle : null,
        pressed ? styles.btnPressed : null,
      ]}
    >
      <Ionicons name={icon} size={16} color={Platform.OS === 'web' ? (danger ? '#BE123C' : colors.primary) : baseColor} />
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function StatusPill({
  active,
  tone,
  label,
  onPress,
}: {
  active: boolean;
  tone: 'success' | 'warning' | 'danger';
  label: string;
  onPress: () => void;
}) {
  const c = toneColor(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.statusSelectPill,
        active ? { backgroundColor: c.main, borderColor: c.main } : null,
        Platform.OS === 'web' && hovered && !active ? styles.statusSelectPillHover : null,
        pressed ? styles.btnPressed : null,
      ]}
    >
      <Text style={[styles.statusSelectText, active ? { color: colors.white } : { color: colors.gray[700] }]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>אין קטגוריות עדיין</Text>
      <Text style={styles.emptySubtitle}>כדי להתחיל, הוסף מוזמנים מתוך אנשי הקשר ובחר קטגוריה.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="הוסף מוזמנים"
        onPress={onAdd}
        style={({ hovered, pressed }: any) => [
          styles.emptyPrimaryBtn,
          Platform.OS === 'web' && hovered ? styles.emptyPrimaryBtnHover : null,
          pressed ? styles.btnPressed : null,
        ]}
      >
        <Ionicons name="add" size={18} color={colors.white} />
        <Text style={styles.emptyPrimaryBtnText}>הוסף מוזמנים</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.gray[50],
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },

  content: {
    padding: 16,
    paddingBottom: 28,
    width: '100%',
    // wider maxWidth for desktop screens
    maxWidth: 1600,
    alignSelf: 'center',
    gap: 16,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },

  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 12,
  },
  metricCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRightWidth: 4,
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 0 0 1px rgba(11,48,65,0.02), 0 10px 30px rgba(11,48,65,0.05)',
  },
  metricLabel: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  metricValueRow: { marginTop: 10, flexDirection: 'row-reverse', alignItems: 'baseline', gap: 10 },
  metricValue: { fontSize: 28, fontWeight: '900', color: colors.text, textAlign: 'right' },
  metricHintPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  metricHintText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },

  filterBar: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 10,
    gap: 10,
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 8px 26px rgba(11,48,65,0.05)',
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 12,
          zIndex: 50,
        } as any)
      : null),
  },
  filterBarNarrow: {
    padding: 12,
  },
  filterBarWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'nowrap',
  },
  searchWrap: {
    position: 'relative',
    alignSelf: 'auto',
  },
  searchIconRight: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  searchInput: {
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    paddingRight: 40,
    paddingLeft: 12,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    flex: 1,
    minWidth: 0,
  },
  addGuestsBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
    flexShrink: 0,
  },
  addGuestsBtnNarrow: { width: '100%' },
  addGuestsBtnHover: { opacity: 0.95 },
  addGuestsBtnText: { fontSize: 13, fontWeight: '900', color: colors.white, textAlign: 'right' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  chipHover: {
    backgroundColor: colors.gray[50],
  },
  chipText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  chipCount: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, minWidth: 26, alignItems: 'center' },
  chipCountText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },

  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 4,
    paddingTop: 2,
    flexShrink: 0,
  },
  bulkText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  bulkBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  bulkBtnHover: { backgroundColor: colors.gray[200] },
  bulkBtnText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  bulkDangerBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F43F5E',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  bulkDangerBtnHover: { opacity: 0.95 },
  bulkDangerBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },

  loadingBox: { paddingVertical: 30, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  groups: { gap: 14 },
  groupCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    overflow: 'hidden',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 14px 28px rgba(16,24,40,0.06)',
  },
  groupHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.white,
  },
  groupHeaderHover: { backgroundColor: 'rgba(15,23,42,0.02)' },
  groupHeaderLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  groupToggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  chevronCollapsed: {
    transform: [{ rotate: '-90deg' }],
  },
  groupTitle: { fontSize: 18, fontWeight: '900', color: colors.primary, textAlign: 'right', flex: 1, minWidth: 0 },
  groupPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  groupPillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  groupHeaderRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  miniStat: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  miniDot: { width: 8, height: 8, borderRadius: 999 },
  miniStatText: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  groupBody: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    // In RTL, a plain 'row' starts at the physical right edge.
    // Using 'row-reverse' together with `direction: 'rtl'` can flip the start edge back to the left on web.
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'stretch',
    backgroundColor: 'rgba(248,250,252,0.92)',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  groupEmpty: {
    width: '100%',
    padding: 14,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  groupCollapsedBar: { height: 6, backgroundColor: colors.gray[50] },

  guestRow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    // Ensure RTL layout inside the guest card on web
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,0.88)',
    minHeight: 44,
  },
  guestRowHover: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: 'rgba(30,58,138,0.18)',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 0 0 1px rgba(30,58,138,0.06), 0 14px 26px rgba(16,24,40,0.08)',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.18)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  checkboxHover: { borderColor: 'rgba(6,23,62,0.35)' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  guestCard: {
    padding: 10,
    paddingBottom: 92,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 18,
    backgroundColor: colors.white,
    gap: 8,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 0 0 1px rgba(11,48,65,0.02), 0 10px 22px rgba(16,24,40,0.06)',
    minHeight: 86,
    position: 'relative',
  },
  guestCardSquare: {
    aspectRatio: 1,
  },
  guestCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  // Left side cluster: checkbox + name/phone, pinned to the left edge.
  guestHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  guestCardTitleWrap: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 3, paddingLeft: 22 },
  guestCardName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'left' },
  guestCardPhone: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[600],
    // Keep phone numbers readable (LTR) but anchor them to the RTL layout.
    // @ts-expect-error - react-native-web supports direction
    direction: 'ltr',
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  // Quantity row pinned to the left.
  guestCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  guestCardMetaPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(243,244,246,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignSelf: 'flex-end',
    // Push to the physical right edge (stable in RTL/LTR).
    marginLeft: 'auto',
  },
  guestCardMetaText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'left' },
  guestBottom: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    left: 10,
    // Anchor the info cluster to the physical right edge.
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 8,
    maxWidth: '100%',
  },
  guestBottomTopRow: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  guestBottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  guestCardActionsAbs: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 3,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  guestCardFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    marginTop: 'auto',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  statusPillBottom: {
    alignSelf: 'flex-end',
    // Push to the physical right edge (stable in RTL/LTR).
    marginLeft: 'auto',
  },
  statusDot: { width: 6, height: 6, borderRadius: 999 },
  statusText: { fontSize: 10.5, fontWeight: '900', textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
    opacity: 0.95,
  },
  guestCheckboxAbs: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2,
  },
  iconBtnHover: { borderColor: 'rgba(6,23,62,0.20)', backgroundColor: 'rgba(6,23,62,0.03)' },
  iconBtnDangerHover: { borderColor: 'rgba(244,63,94,0.22)', backgroundColor: 'rgba(244,63,94,0.06)' },

  btnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    overflow: 'hidden',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 30px 80px rgba(0,0,0,0.20)',
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalCloseBtnHover: { backgroundColor: colors.gray[200] },
  modalBody: { padding: 16, gap: 12 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  modalInput: {
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  inputLtr: {
    // @ts-expect-error - react-native-web supports direction
    direction: 'ltr',
    textAlign: 'left',
  },
  statusRow: { flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  statusSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  statusSelectPillHover: { backgroundColor: colors.gray[50] },
  statusSelectText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  modalActions: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    gap: 10,
  },
  modalDangerBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F43F5E',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalDangerBtnHover: { opacity: 0.95 },
  modalDangerBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  modalPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalPrimaryBtnHover: { opacity: 0.95 },
  modalPrimaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  modalPrimaryBtnDisabled: { opacity: 0.75 },

  modalSecondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalSecondaryBtnHover: { backgroundColor: colors.gray[200] },
  modalSecondaryBtnText: { color: colors.gray[800], fontSize: 13, fontWeight: '900', textAlign: 'right' },

  addHint: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  categoryPickList: { gap: 10, marginTop: 10 },
  categoryPickItem: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  categoryPickItemHover: { backgroundColor: colors.gray[100] },
  categoryPickItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryPickText: { fontSize: 13, fontWeight: '900', color: colors.gray[800], textAlign: 'right', flex: 1, minWidth: 0 },
  categoryPickTextActive: { color: colors.white },

  inlineRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  inlineAddBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  inlineAddBtnHover: { opacity: 0.95 },
  inlineAddBtnDisabled: { opacity: 0.75 },
  inlineAddBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },

  selectedCategoryLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  selectedCategoryLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  selectedCategoryValue: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right', flex: 1, minWidth: 0 },

  empty: {
    padding: 26,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  emptySubtitle: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl', maxWidth: 520 },
  emptyPrimaryBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  emptyPrimaryBtnHover: { opacity: 0.95 },
  emptyPrimaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },
});

