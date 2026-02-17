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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useUserStore } from '@/store/userStore';
import type { Table } from '@/types';

type GuestRow = {
  id: string;
  name: string;
  status?: string | null;
  table_id?: string | null;
  category_id?: string | null;
  number_of_people?: number | null;
  numberOfPeople?: number | null;
  guest_categories?: { name?: string | null } | null;
};

type TableFilterKey = 'all' | 'full' | 'not_full' | 'empty';

export default function TablesListWebScreen() {
  const router = useRouter();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const { setTabBarVisible } = useLayoutStore();

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isNarrow = windowWidth < 980;

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState<Table[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);

  const [tableQuery, setTableQuery] = useState('');
  const [tableFilter, setTableFilter] = useState<TableFilterKey>('all');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [selectedGuestIdsToRemove, setSelectedGuestIdsToRemove] = useState<Set<string>>(new Set());

  // Move guests (edit mode)
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTargetTableId, setMoveTargetTableId] = useState<string | null>(null);
  const [moveTableSearch, setMoveTableSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addSelectedGuestIds, setAddSelectedGuestIds] = useState<Set<string>>(new Set());
  const [addSearch, setAddSearch] = useState('');
  const [addCategoryFilter, setAddCategoryFilter] = useState('הכל');
  const [addCategories, setAddCategories] = useState<string[]>([]);

  // Edit guest people count (per guest at table)
  const [editPeopleOpen, setEditPeopleOpen] = useState(false);
  const [editingPeopleGuest, setEditingPeopleGuest] = useState<GuestRow | null>(null);
  const [editPeopleCount, setEditPeopleCount] = useState('1');
  const [editPeopleSaving, setEditPeopleSaving] = useState(false);

  const fetchTables = async () => {
    if (!resolvedEventId) return;
    const { data, error } = await supabase.from('tables').select('*').eq('event_id', resolvedEventId).order('number');
    if (error) {
      console.error('Fetch tables error:', error);
      return;
    }
    setTables((data || []) as any);
  };

  const fetchGuests = async () => {
    if (!resolvedEventId) return;
    try {
      // Avoid PostgREST relationship joins (PGRST200) by fetching separately and joining client-side.
      const [
        { data: guestsData, error: guestsError },
        { data: categoriesData, error: categoriesError },
      ] = await Promise.all([
        // Fetch ALL guests so seated counts match the seating map (which includes every seated guest).
        supabase.from('guests').select('*').eq('event_id', resolvedEventId),
        supabase.from('guest_categories').select('id,name').eq('event_id', resolvedEventId),
      ]);

      if (guestsError) throw guestsError;
      if (categoriesError) throw categoriesError;

      const categoryNameById = new Map<string, string>((categoriesData || []).map((c: any) => [String(c.id), String(c.name)]));
      const mappedGuests: GuestRow[] = (guestsData || []).map((g: any) => ({
        ...g,
        id: String(g.id),
        name: String(g.name || ''),
        numberOfPeople: Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1,
        guest_categories: g.category_id ? { name: categoryNameById.get(String(g.category_id)) } : null,
      }));

      setGuests(mappedGuests);
    } catch (e) {
      console.error('Fetch guests error:', e);
    }
  };

  const load = async () => {
    if (!resolvedEventId) {
      setTables([]);
      setGuests([]);
      setLoading(false);
      return;
    }

    if (userData?.id) setActiveEvent(userData.id, resolvedEventId);
    setLoading(true);
    try {
      await Promise.all([fetchTables(), fetchGuests()]);
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

  // Derived data
  const guestsByTableId = useMemo(() => {
    const m = new Map<string, GuestRow[]>();
    for (const g of guests) {
      const tid = String(g.table_id || '').trim();
      if (!tid) continue;
      const list = m.get(tid) || [];
      list.push(g);
      m.set(tid, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he', { sensitivity: 'base' }));
    }
    return m;
  }, [guests]);

  const peopleCountAtTable = (tableId: string) => {
    const list = guestsByTableId.get(tableId) || [];
    return list.reduce((sum, g) => sum + (Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1), 0);
  };

  // Guests not seated (ALL statuses) - used for the "add guests" modal list.
  const unseatedGuestsAll = useMemo(
    () => guests.filter((g) => !String(g.table_id || '').trim()),
    [guests]
  );

  // Guests not seated AND arriving - used for the "available to seat" metric in the top bar.
  const unseatedGuestsArriving = useMemo(
    () => guests.filter((g) => String(g.status || '').trim() === 'מגיע' && !String(g.table_id || '').trim()),
    [guests]
  );

  const fullTablesCount = useMemo(() => {
    return tables.filter((t) => {
      const cap = Number(t.capacity || 0) || 0;
      const seated = peopleCountAtTable(String(t.id));
      return cap > 0 && seated >= cap;
    }).length;
  }, [tables, guestsByTableId]);

  const selectedTable = useMemo(() => {
    if (!selectedTableId) return null;
    return tables.find((t) => String(t.id) === String(selectedTableId)) || null;
  }, [tables, selectedTableId]);

  // Auto-select first table when data loads
  useEffect(() => {
    if (selectedTableId) return;
    if (tables.length === 0) return;
    setSelectedTableId(String(tables[0].id));
  }, [tables, selectedTableId]);

  const filteredTables = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    const list = [...tables].sort((a: any, b: any) => (Number(a.number || 0) || 0) - (Number(b.number || 0) || 0));
    return list.filter((t) => {
      const name = String(t.name || '').toLowerCase();
      const num = String((t as any).number ?? t.number ?? '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || num.includes(q);

      const cap = Number(t.capacity || 0) || 0;
      const seated = peopleCountAtTable(String(t.id));
      const isFull = cap > 0 && seated >= cap;
      const isEmpty = seated <= 0;

      const matchesFilter =
        tableFilter === 'all'
          ? true
          : tableFilter === 'full'
            ? isFull
            : tableFilter === 'empty'
              ? isEmpty
              : !isFull;

      return matchesSearch && matchesFilter;
    });
  }, [tables, tableQuery, tableFilter, guestsByTableId]);

  const selectTable = (tableId: string) => {
    setSelectedTableId(tableId);
    setEditMode(false);
    setSelectedGuestIdsToRemove(new Set());
  };

  const toggleRemoveSelection = (guestId: string) => {
    setSelectedGuestIdsToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const openMoveModal = () => {
    if (!selectedTable) return;
    if (selectedGuestIdsToRemove.size === 0) return;
    setMoveTargetTableId(null);
    setMoveTableSearch('');
    setMoveOpen(true);
    setTabBarVisible(false);
  };

  const closeMoveModal = () => {
    setMoveOpen(false);
    setMoveTargetTableId(null);
    setMoveTableSearch('');
    setTabBarVisible(true);
  };

  const openAddModal = (tableId?: string) => {
    const tid = tableId ? String(tableId) : selectedTable ? String(selectedTable.id) : null;
    if (!tid) return;
    setSelectedTableId(tid);

    const categories = ['הכל', ...Array.from(new Set(unseatedGuestsAll.map((g) => g.guest_categories?.name || 'ללא קטגוריה')))];
    setAddCategories(categories);
    setAddCategoryFilter('הכל');
    setAddSearch('');
    setAddSelectedGuestIds(new Set());

    setAddOpen(true);
    setTabBarVisible(false);
  };

  const closeAddModal = () => {
    setAddOpen(false);
    setTabBarVisible(true);
  };

  const openEditPeopleModal = (g: GuestRow) => {
    setEditingPeopleGuest(g);
    const ppl = Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1;
    setEditPeopleCount(String(Math.max(1, ppl)));
    setEditPeopleSaving(false);
    setEditPeopleOpen(true);
    setTabBarVisible(false);
  };

  const closeEditPeopleModal = () => {
    setEditPeopleOpen(false);
    setEditingPeopleGuest(null);
    setEditPeopleCount('1');
    setEditPeopleSaving(false);
    setTabBarVisible(true);
  };

  const handleSaveEditPeople = async () => {
    if (!editingPeopleGuest) return;
    if (editPeopleSaving) return;
    const nextPeople = Math.max(1, Number.parseInt(String(editPeopleCount || '1'), 10) || 1);
    setEditPeopleSaving(true);
    try {
      const { error } = await supabase.from('guests').update({ number_of_people: nextPeople } as any).eq('id', editingPeopleGuest.id);
      if (error) throw error;

      const tid = String(editingPeopleGuest.table_id || '').trim();
      const nextGuests = guests.map((x) =>
        String(x.id) === String(editingPeopleGuest.id) ? ({ ...x, number_of_people: nextPeople, numberOfPeople: nextPeople } as any) : x
      );

      // Keep legacy count in sync (non-fatal if it fails).
      if (tid) {
        const totalPeopleAtTable = nextGuests
          .filter((x) => String(x.table_id || '') === tid)
          .reduce((sum, x) => sum + (Number(x.numberOfPeople ?? x.number_of_people ?? 1) || 1), 0);
        const { error: tableUpdateError } = await supabase.from('tables').update({ seated_guests: totalPeopleAtTable }).eq('id', tid);
        if (tableUpdateError) console.error('Error updating table count:', tableUpdateError);
      }

      setGuests(nextGuests);
      await fetchTables();
      closeEditPeopleModal();
    } catch (e) {
      console.error('Save guest people count error:', e);
      Alert.alert('שגיאה', 'לא ניתן לעדכן את כמות האנשים למוזמן.');
    } finally {
      setEditPeopleSaving(false);
    }
  };

  const toggleAddSelection = (guestId: string) => {
    setAddSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const filteredUnseatedGuests = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return unseatedGuestsAll.filter((g) => {
      const cat = g.guest_categories?.name || 'ללא קטגוריה';
      const matchesCategory = addCategoryFilter === 'הכל' || cat === addCategoryFilter;
      const matchesSearch = !q || String(g.name || '').toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [unseatedGuestsAll, addSearch, addCategoryFilter]);

  const addSelectedPeopleCount = useMemo(() => {
    const ids = addSelectedGuestIds;
    if (ids.size === 0) return 0;
    return unseatedGuestsAll
      .filter((g) => ids.has(String(g.id)))
      .reduce((sum, g) => sum + (Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1), 0);
  }, [addSelectedGuestIds, unseatedGuestsAll]);

  const handleAddGuestsToTable = async () => {
    const tid = selectedTable ? String(selectedTable.id) : null;
    if (!tid) return;
    if (addSelectedGuestIds.size === 0) return;

    const ids = Array.from(addSelectedGuestIds);
    const { error: guestUpdateError } = await supabase.from('guests').update({ table_id: tid }).in('id', ids);
    if (guestUpdateError) {
      console.error('Error updating guests:', guestUpdateError);
      Alert.alert('שגיאה', 'לא ניתן להושיב את המוזמנים שנבחרו.');
      return;
    }

    // Recompute total seated people at that table and update tables.seated_guests (legacy field).
    const updatedGuests = guests.map((g) => (ids.includes(String(g.id)) ? { ...g, table_id: tid } : g));
    const totalPeopleAtTable = updatedGuests
      .filter((g) => String(g.table_id || '') === tid)
      .reduce((sum, g) => sum + (Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1), 0);

    const { error: tableUpdateError } = await supabase.from('tables').update({ seated_guests: totalPeopleAtTable }).eq('id', tid);
    if (tableUpdateError) {
      console.error('Error updating table count:', tableUpdateError);
      // Non-fatal, proceed with UI refresh.
    }

    await Promise.all([fetchGuests(), fetchTables()]);
    closeAddModal();
  };

  const handleUnseatGuestFromTable = async (guestId: string) => {
    if (!selectedTable) return;
    const tid = String(selectedTable.id);
    const g = guests.find((x) => String(x.id) === String(guestId));
    const guestName = String(g?.name || '').trim() || 'המוזמן';

    const unseat = async () => {
      const { error: guestUpdateError } = await supabase.from('guests').update({ table_id: null }).eq('id', guestId);
      if (guestUpdateError) {
        console.error('Error unseating guest:', guestUpdateError);
        Alert.alert('שגיאה', 'לא ניתן להסיר את המוזמן מהשולחן.');
        return;
      }

      const nextGuests = guests.map((x) => (String(x.id) === String(guestId) ? { ...x, table_id: null } : x));
      const totalPeopleAtSource = nextGuests
        .filter((x) => String(x.table_id || '') === tid)
        .reduce((sum, x) => sum + (Number(x.numberOfPeople ?? x.number_of_people ?? 1) || 1), 0);

      const { error: tableUpdateError } = await supabase.from('tables').update({ seated_guests: totalPeopleAtSource }).eq('id', tid);
      if (tableUpdateError) console.error('Error updating source table count:', tableUpdateError);

      setGuests(nextGuests);
      await Promise.all([fetchGuests(), fetchTables()]);
    };

    // On web, Alert.alert is unreliable (often doesn't show), so use a native confirm.
    if (Platform.OS === 'web') {
      const ok = Boolean((globalThis as any)?.confirm?.(`להסיר את ${guestName} מהשולחן?`));
      if (!ok) return;
      await unseat();
      return;
    }

    Alert.alert('הסרה מהשולחן', `להסיר את ${guestName} מהשולחן?`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'הסר', style: 'destructive', onPress: () => void unseat() },
    ]);
  };

  const handleMoveSelectedGuests = async () => {
    if (!selectedTable) return;
    const sourceId = String(selectedTable.id);
    const targetId = String(moveTargetTableId || '').trim();
    if (!targetId) return;
    if (selectedGuestIdsToRemove.size === 0) return;

    const ids = Array.from(selectedGuestIdsToRemove);
    const { error: guestUpdateError } = await supabase.from('guests').update({ table_id: targetId }).in('id', ids);
    if (guestUpdateError) {
      console.error('Error moving guests:', guestUpdateError);
      Alert.alert('שגיאה', 'לא ניתן להעביר את המוזמנים לשולחן אחר.');
      return;
    }

    const nextGuests = guests.map((x) => (ids.includes(String(x.id)) ? { ...x, table_id: targetId } : x));

    const totalPeopleAtSource = nextGuests
      .filter((x) => String(x.table_id || '') === sourceId)
      .reduce((sum, x) => sum + (Number(x.numberOfPeople ?? x.number_of_people ?? 1) || 1), 0);
    const totalPeopleAtTarget = nextGuests
      .filter((x) => String(x.table_id || '') === targetId)
      .reduce((sum, x) => sum + (Number(x.numberOfPeople ?? x.number_of_people ?? 1) || 1), 0);

    await Promise.all([
      supabase.from('tables').update({ seated_guests: totalPeopleAtSource }).eq('id', sourceId),
      supabase.from('tables').update({ seated_guests: totalPeopleAtTarget }).eq('id', targetId),
    ]).catch((e) => console.error('Error updating table counts:', e));

    setGuests(nextGuests);
    await Promise.all([fetchGuests(), fetchTables()]);

    setEditMode(false);
    setSelectedGuestIdsToRemove(new Set());
    closeMoveModal();
  };

  const goToSeatingMap = () => {
    router.push({ pathname: '/(couple)/BrideGroomSeating', params: resolvedEventId ? { eventId: resolvedEventId } : {} });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerSub}>טוען שולחנות...</Text>
      </View>
    );
  }

  if (!resolvedEventId) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>אין אירוע זמין</Text>
      </View>
    );
  }

  const contentMaxWidth =
    windowWidth >= 1900 ? 1720 : windowWidth >= 1600 ? 1520 : windowWidth >= 1400 ? 1320 : undefined;
  const contentPaddingH = windowWidth >= 1100 ? 20 : 16;

  const selectedGuestsAtTable = selectedTable ? guestsByTableId.get(String(selectedTable.id)) || [] : [];
  const selectedTableSeated = selectedTable ? peopleCountAtTable(String(selectedTable.id)) : 0;
  const selectedTableCapacity = selectedTable ? Number(selectedTable.capacity || 0) || 0 : 0;
  const selectedTableRemaining = Math.max(0, selectedTableCapacity - selectedTableSeated);
  const selectedTableWillExceed = selectedTableCapacity > 0 && selectedTableSeated + addSelectedPeopleCount > selectedTableCapacity;

  // NOTE: These are plain computed values (no hooks) because this section runs after early-returns.
  const selectedMovePeopleCount =
    !selectedTable || selectedGuestIdsToRemove.size === 0
      ? 0
      : selectedGuestsAtTable
          .filter((g) => selectedGuestIdsToRemove.has(String(g.id)))
          .reduce((sum, g) => sum + (Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1), 0);

  const moveCandidates = (() => {
    const q = moveTableSearch.trim().toLowerCase();
    const sourceId = selectedTable ? String(selectedTable.id) : '';
    const list = tables.filter((t) => String(t.id) !== sourceId);
    return list
      .filter((t) => {
        if (!q) return true;
        const num = String((t as any).number ?? t.number ?? '').toLowerCase();
        const name = String(t.name || '').toLowerCase();
        return num.includes(q) || name.includes(q);
      })
      .sort((a: any, b: any) => (Number(a.number || 0) || 0) - (Number(b.number || 0) || 0));
  })();

  const moveTargetTable = moveTargetTableId
    ? tables.find((t) => String(t.id) === String(moveTargetTableId)) || null
    : null;

  const moveTargetSeated = moveTargetTable ? peopleCountAtTable(String(moveTargetTable.id)) : 0;
  const moveTargetCapacity = moveTargetTable ? Number(moveTargetTable.capacity || 0) || 0 : 0;
  const moveWillExceed =
    Boolean(moveTargetTable) && moveTargetCapacity > 0 && moveTargetSeated + selectedMovePeopleCount > moveTargetCapacity;

  const tableChips: Array<{ key: TableFilterKey; label: string; count: number; tone: 'primary' | 'success' | 'warning' | 'danger' }> =
    [
      { key: 'all', label: 'הכל', count: tables.length, tone: 'primary' },
      { key: 'full', label: 'מלאים', count: fullTablesCount, tone: 'success' },
      { key: 'not_full', label: 'לא מלאים', count: Math.max(0, tables.length - fullTablesCount), tone: 'warning' },
      { key: 'empty', label: 'ריקים', count: tables.filter((t) => peopleCountAtTable(String(t.id)) <= 0).length, tone: 'danger' },
    ];

  const sideWidth = windowWidth < 1240 ? 420 : 480;
  const guestCardWidth = isNarrow ? '100%' : windowWidth < 1320 ? '48%' : windowWidth < 1600 ? '31.5%' : 290;

  return (
    <View style={styles.page}>
      <View pointerEvents="none" style={styles.bgShapes}>
        <View style={styles.shapeTopRight} />
        <View style={styles.shapeBottomLeft} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          { paddingHorizontal: contentPaddingH, ...(contentMaxWidth ? { maxWidth: contentMaxWidth } : null) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainRow, isNarrow ? styles.mainRowNarrow : null]}>
          {isNarrow ? (
            <>
              {/* On narrow screens, show list first (top), then details */}
              <View style={[styles.sideCol, !isNarrow ? { width: sideWidth } : null]}>{/* Tables list */}
                <View style={styles.card}>
                  <View style={styles.searchWrap}>
                    <View style={styles.searchIconRight}>
                      <Ionicons name="search" size={18} color={colors.gray[500]} />
                    </View>
                    <TextInput
                      value={tableQuery}
                      onChangeText={setTableQuery}
                      placeholder="חיפוש לפי מספר / שם שולחן..."
                      placeholderTextColor={colors.gray[500]}
                      style={styles.searchInput}
                    />
                  </View>

                  <View style={styles.chipsRow}>
                    {tableChips.map((c) => (
                      <Chip
                        key={c.key}
                        active={tableFilter === c.key}
                        label={c.label}
                        count={c.count}
                        tone={c.tone}
                        compact={c.label === 'הכל'}
                        onPress={() => setTableFilter(c.key)}
                      />
                    ))}
                  </View>

                  <View style={{ height: 8 }} />

                  {filteredTables.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="grid-outline" size={26} color={colors.gray[400]} />
                      <Text style={styles.emptyTitle}>אין שולחנות להצגה</Text>
                      <Text style={styles.emptySubtitle}>נסה לשנות חיפוש/פילטר, או עבור למפת ההושבה.</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="מעבר למפת הושבה"
                        onPress={goToSeatingMap}
                        style={({ hovered, pressed }: any) => [
                          styles.secondaryBtn,
                          Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                          pressed ? styles.btnPressed : null,
                        ]}
                      >
                        <Ionicons name="map-outline" size={18} color={colors.gray[800]} />
                        <Text style={styles.secondaryBtnText}>מפת הושבה</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={[styles.tableList, { maxHeight: Math.min(520, windowHeight * 0.55) }]}>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={styles.tableListInner}>
                          {filteredTables.map((t) => {
                            const tid = String(t.id);
                            const seated = peopleCountAtTable(tid);
                            const cap = Number(t.capacity || 0) || 0;
                            const isFull = cap > 0 && seated >= cap;
                            const selected = selectedTableId === tid;
                            const pct = cap > 0 ? Math.min(1, seated / cap) : 0;

                            return (
                              <Pressable
                                key={tid}
                                accessibilityRole="button"
                                accessibilityLabel={`שולחן ${(t as any).number ?? t.number ?? ''}`}
                                onPress={() => selectTable(tid)}
                                style={({ hovered, pressed }: any) => [
                                  styles.tableRow,
                                  selected ? styles.tableRowSelected : null,
                                  isFull ? styles.tableRowFull : null,
                                  Platform.OS === 'web' && hovered && !selected ? styles.tableRowHover : null,
                                  pressed ? styles.btnPressed : null,
                                ]}
                              >
                                <View style={styles.tableRowTop}>
                                  {/* Physical layout: status left, text right */}
                                  <View style={[styles.badge, isFull ? styles.badgeFull : styles.badgeSoft]}>
                                    <Text style={[styles.badgeText, isFull ? styles.badgeTextFull : styles.badgeTextSoft]}>
                                      {isFull ? 'מלא' : seated > 0 ? 'פעיל' : 'ריק'}
                                    </Text>
                                  </View>

                                  <View style={styles.tableRowTitleWrap}>
                                    <Text style={styles.tableRowTitle} numberOfLines={1}>
                                      שולחן {String((t as any).number ?? t.number ?? '—')}
                                      {t.name ? ` · ${t.name}` : ''}
                                    </Text>
                                    <Text style={styles.tableRowSub} numberOfLines={1}>
                                      {seated} / {cap || '—'} יושבים
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.progressTrack}>
                                  <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }, isFull ? styles.progressFillFull : null]} />
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.detailCol}>{/* Details */}
                <View style={styles.card}>
                  {!selectedTable ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="information-circle-outline" size={26} color={colors.gray[400]} />
                      <Text style={styles.emptyTitle}>בחר שולחן</Text>
                      <Text style={styles.emptySubtitle}>בחר שולחן מהרשימה כדי לראות מי יושב בו ולבצע פעולות.</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.detailHeader}>
                        <View style={styles.detailTitleWrap}>
                          <Text style={styles.detailTitle} numberOfLines={1}>
                            שולחן {String((selectedTable as any).number ?? selectedTable.number ?? '—')}
                            {selectedTable.name ? ` · ${selectedTable.name}` : ''}
                          </Text>
                          <View style={styles.detailStatsRow}>
                            <InfoPill icon="people-outline" label="יושבים" value={selectedTableSeated} tone="primary" />
                            <InfoPill icon="albums-outline" label="קיבולת" value={selectedTableCapacity || '—'} tone="success" />
                            <InfoPill icon="sparkles-outline" label="פנויים" value={selectedTableCapacity ? selectedTableRemaining : '—'} tone="warning" />
                          </View>
                        </View>

                        <View style={styles.detailActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="הוסף מוזמנים"
                            onPress={() => openAddModal(String(selectedTable.id))}
                            style={({ hovered, pressed }: any) => [
                              styles.primaryBtn,
                              Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <Ionicons name="add" size={18} color={colors.white} />
                            <Text style={styles.primaryBtnText}>הוסף</Text>
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={editMode ? 'צא מעריכה' : 'עריכה'}
                            onPress={() => {
                              setEditMode((prev) => !prev);
                              setSelectedGuestIdsToRemove(new Set());
                            }}
                            style={({ hovered, pressed }: any) => [
                              styles.secondaryBtn,
                              editMode ? styles.secondaryBtnActive : null,
                              Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <Ionicons name={editMode ? 'close' : 'create-outline'} size={18} color={colors.gray[800]} />
                            <Text style={styles.secondaryBtnText}>{editMode ? 'סגור' : 'עריכה'}</Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.detailBody}>
                        {selectedGuestsAtTable.length === 0 ? (
                          <View style={styles.emptyTableBox}>
                            <Ionicons name="people-outline" size={28} color={colors.gray[400]} />
                            <Text style={styles.emptyTitle}>אין מוזמנים בשולחן הזה</Text>
                            <Text style={styles.emptySubtitle}>התחל להושיב מוזמנים באמצעות הכפתור “הוסף”.</Text>
                          </View>
                        ) : (
                          <View style={styles.guestsGrid}>
                            {selectedGuestsAtTable.map((g) => {
                              const gid = String(g.id);
                              const selected = selectedGuestIdsToRemove.has(gid);
                              const ppl = Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1;
                              const cat = g.guest_categories?.name || 'ללא קטגוריה';
                              // On web, nested Pressables can swallow clicks.
                              // Render a plain View when not in edit mode so trash/edit buttons are always clickable.
                              if (!editMode) {
                                return (
                                  <View key={gid} style={[styles.guestCard, { width: guestCardWidth }]}>
                                    <View style={styles.peopleBadge}>
                                      <Ionicons name="person" size={12} color={colors.gray[700]} />
                                      <Text style={styles.peopleBadgeText}>{ppl}</Text>
                                    </View>

                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel="הסר מהשולחן"
                                      onPress={() => handleUnseatGuestFromTable(gid)}
                                      style={({ hovered, pressed }: any) => [
                                        styles.guestTrashBtn,
                                        Platform.OS === 'web' && hovered ? styles.guestTrashBtnHover : null,
                                        pressed ? styles.btnPressed : null,
                                      ]}
                                    >
                                      <Ionicons name="trash-outline" size={16} color={colors.gray[700]} />
                                    </Pressable>

                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel="עריכת כמות אנשים"
                                      onPress={() => openEditPeopleModal(g)}
                                      style={({ hovered, pressed }: any) => [
                                        styles.guestEditBtn,
                                        Platform.OS === 'web' && hovered ? styles.guestEditBtnHover : null,
                                        pressed ? styles.btnPressed : null,
                                      ]}
                                    >
                                      <Ionicons name="create-outline" size={16} color={colors.gray[700]} />
                                    </Pressable>

                                    <Text style={styles.guestName} numberOfLines={1}>
                                      {String(g.name || '').trim()}
                                    </Text>
                                    <Text style={styles.guestMeta} numberOfLines={1}>
                                      {ppl} אנשים · {cat}
                                    </Text>
                                  </View>
                                );
                              }

                              return (
                                <Pressable
                                  key={gid}
                                  accessibilityRole="button"
                                  accessibilityLabel="בחירת מוזמן להעברה"
                                  onPress={() => toggleRemoveSelection(gid)}
                                  style={({ hovered, pressed }: any) => [
                                    styles.guestCard,
                                    { width: guestCardWidth },
                                    styles.guestCardEditable,
                                    selected ? styles.guestCardSelected : null,
                                    Platform.OS === 'web' && hovered ? styles.guestCardHover : null,
                                    pressed ? styles.btnPressed : null,
                                  ]}
                                >
                                  <View style={[styles.checkbox, selected ? styles.checkboxChecked : null]}>
                                    {selected ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                                  </View>

                                  <Text style={styles.guestName} numberOfLines={1}>
                                    {String(g.name || '').trim()}
                                  </Text>
                                  <Text style={styles.guestMeta} numberOfLines={1}>
                                    {ppl} אנשים · {cat}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        )}

                        {editMode ? (
                          <View style={styles.editBar}>
                            <Text style={styles.editBarText}>
                              {selectedGuestIdsToRemove.size > 0
                                ? `${selectedGuestIdsToRemove.size} נבחרו להעברה`
                                : 'בחר מוזמנים להעברה לשולחן אחר'}
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="העבר לשולחן אחר"
                              onPress={openMoveModal}
                              disabled={selectedGuestIdsToRemove.size === 0}
                              style={({ hovered, pressed }: any) => [
                                styles.primaryBtn,
                                selectedGuestIdsToRemove.size === 0 ? styles.btnDisabled : null,
                                Platform.OS === 'web' && hovered && selectedGuestIdsToRemove.size > 0 ? styles.primaryBtnHover : null,
                                pressed && selectedGuestIdsToRemove.size > 0 ? styles.btnPressed : null,
                              ]}
                            >
                              <Ionicons name="swap-horizontal-outline" size={18} color={colors.white} />
                              <Text style={styles.primaryBtnText}>העבר</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </>
                  )}
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Desktop/Wide: details on the left, list on the right */}
              <View style={styles.detailCol}>
                <View style={styles.card}>
                  {!selectedTable ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="information-circle-outline" size={26} color={colors.gray[400]} />
                      <Text style={styles.emptyTitle}>בחר שולחן</Text>
                      <Text style={styles.emptySubtitle}>בחר שולחן מהרשימה כדי לראות מי יושב בו ולבצע פעולות.</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.detailHeader}>
                        <View style={styles.detailTitleWrap}>
                          <Text style={styles.detailTitle} numberOfLines={1}>
                            שולחן {String((selectedTable as any).number ?? selectedTable.number ?? '—')}
                            {selectedTable.name ? ` · ${selectedTable.name}` : ''}
                          </Text>
                          <View style={styles.detailStatsRow}>
                            <InfoPill icon="people-outline" label="יושבים" value={selectedTableSeated} tone="primary" />
                            <InfoPill icon="albums-outline" label="קיבולת" value={selectedTableCapacity || '—'} tone="success" />
                            <InfoPill icon="sparkles-outline" label="פנויים" value={selectedTableCapacity ? selectedTableRemaining : '—'} tone="warning" />
                          </View>
                        </View>

                        <View style={styles.detailActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="הוסף מוזמנים"
                            onPress={() => openAddModal(String(selectedTable.id))}
                            style={({ hovered, pressed }: any) => [
                              styles.primaryBtn,
                              Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <Ionicons name="add" size={18} color={colors.white} />
                            <Text style={styles.primaryBtnText}>הוסף</Text>
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={editMode ? 'צא מעריכה' : 'עריכה'}
                            onPress={() => {
                              setEditMode((prev) => !prev);
                              setSelectedGuestIdsToRemove(new Set());
                            }}
                            style={({ hovered, pressed }: any) => [
                              styles.secondaryBtn,
                              editMode ? styles.secondaryBtnActive : null,
                              Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <Ionicons name={editMode ? 'close' : 'create-outline'} size={18} color={colors.gray[800]} />
                            <Text style={styles.secondaryBtnText}>{editMode ? 'סגור' : 'עריכה'}</Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.detailBody}>
                        {selectedGuestsAtTable.length === 0 ? (
                          <View style={styles.emptyTableBox}>
                            <Ionicons name="people-outline" size={28} color={colors.gray[400]} />
                            <Text style={styles.emptyTitle}>אין מוזמנים בשולחן הזה</Text>
                            <Text style={styles.emptySubtitle}>התחל להושיב מוזמנים באמצעות הכפתור “הוסף”.</Text>
                          </View>
                        ) : (
                          <View style={styles.guestsGrid}>
                            {selectedGuestsAtTable.map((g) => {
                              const gid = String(g.id);
                              const selected = selectedGuestIdsToRemove.has(gid);
                              const ppl = Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1;
                              const cat = g.guest_categories?.name || 'ללא קטגוריה';
                              // On web, nested Pressables can swallow clicks.
                              // Render a plain View when not in edit mode so trash/edit buttons are always clickable.
                              if (!editMode) {
                                return (
                                  <View key={gid} style={[styles.guestCard, { width: guestCardWidth }]}>
                                    <View style={styles.peopleBadge}>
                                      <Ionicons name="person" size={12} color={colors.gray[700]} />
                                      <Text style={styles.peopleBadgeText}>{ppl}</Text>
                                    </View>

                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel="הסר מהשולחן"
                                      onPress={() => handleUnseatGuestFromTable(gid)}
                                      style={({ hovered, pressed }: any) => [
                                        styles.guestTrashBtn,
                                        Platform.OS === 'web' && hovered ? styles.guestTrashBtnHover : null,
                                        pressed ? styles.btnPressed : null,
                                      ]}
                                    >
                                      <Ionicons name="trash-outline" size={16} color={colors.gray[700]} />
                                    </Pressable>

                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel="עריכת כמות אנשים"
                                      onPress={() => openEditPeopleModal(g)}
                                      style={({ hovered, pressed }: any) => [
                                        styles.guestEditBtn,
                                        Platform.OS === 'web' && hovered ? styles.guestEditBtnHover : null,
                                        pressed ? styles.btnPressed : null,
                                      ]}
                                    >
                                      <Ionicons name="create-outline" size={16} color={colors.gray[700]} />
                                    </Pressable>

                                    <Text style={styles.guestName} numberOfLines={1}>
                                      {String(g.name || '').trim()}
                                    </Text>
                                    <Text style={styles.guestMeta} numberOfLines={1}>
                                      {ppl} אנשים · {cat}
                                    </Text>
                                  </View>
                                );
                              }

                              return (
                                <Pressable
                                  key={gid}
                                  accessibilityRole="button"
                                  accessibilityLabel="בחירת מוזמן להעברה"
                                  onPress={() => toggleRemoveSelection(gid)}
                                  style={({ hovered, pressed }: any) => [
                                    styles.guestCard,
                                    { width: guestCardWidth },
                                    styles.guestCardEditable,
                                    selected ? styles.guestCardSelected : null,
                                    Platform.OS === 'web' && hovered ? styles.guestCardHover : null,
                                    pressed ? styles.btnPressed : null,
                                  ]}
                                >
                                  <View style={[styles.checkbox, selected ? styles.checkboxChecked : null]}>
                                    {selected ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                                  </View>

                                  <Text style={styles.guestName} numberOfLines={1}>
                                    {String(g.name || '').trim()}
                                  </Text>
                                  <Text style={styles.guestMeta} numberOfLines={1}>
                                    {ppl} אנשים · {cat}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        )}

                        {editMode ? (
                          <View style={styles.editBar}>
                            <Text style={styles.editBarText}>
                              {selectedGuestIdsToRemove.size > 0
                                ? `${selectedGuestIdsToRemove.size} נבחרו להעברה`
                                : 'בחר מוזמנים להעברה לשולחן אחר'}
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="העבר לשולחן אחר"
                              onPress={openMoveModal}
                              disabled={selectedGuestIdsToRemove.size === 0}
                              style={({ hovered, pressed }: any) => [
                                styles.primaryBtn,
                                selectedGuestIdsToRemove.size === 0 ? styles.btnDisabled : null,
                                Platform.OS === 'web' && hovered && selectedGuestIdsToRemove.size > 0 ? styles.primaryBtnHover : null,
                                pressed && selectedGuestIdsToRemove.size > 0 ? styles.btnPressed : null,
                              ]}
                            >
                              <Ionicons name="swap-horizontal-outline" size={18} color={colors.white} />
                              <Text style={styles.primaryBtnText}>העבר</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </>
                  )}
                </View>
              </View>

              <View style={[styles.sideCol, { width: sideWidth }]}>
                <View style={styles.card}>
                  <View style={styles.searchWrap}>
                    <View style={styles.searchIconRight}>
                      <Ionicons name="search" size={18} color={colors.gray[500]} />
                    </View>
                    <TextInput
                      value={tableQuery}
                      onChangeText={setTableQuery}
                      placeholder="חיפוש לפי מספר / שם שולחן..."
                      placeholderTextColor={colors.gray[500]}
                      style={styles.searchInput}
                    />
                  </View>

                  <View style={styles.chipsRow}>
                    {tableChips.map((c) => (
                      <Chip
                        key={c.key}
                        active={tableFilter === c.key}
                        label={c.label}
                        count={c.count}
                        tone={c.tone}
                        compact={c.label === 'הכל'}
                        onPress={() => setTableFilter(c.key)}
                      />
                    ))}
                  </View>

                  <View style={{ height: 8 }} />

                  {filteredTables.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="grid-outline" size={26} color={colors.gray[400]} />
                      <Text style={styles.emptyTitle}>אין שולחנות להצגה</Text>
                      <Text style={styles.emptySubtitle}>נסה לשנות חיפוש/פילטר, או עבור למפת ההושבה.</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="מעבר למפת הושבה"
                        onPress={goToSeatingMap}
                        style={({ hovered, pressed }: any) => [
                          styles.secondaryBtn,
                          Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                          pressed ? styles.btnPressed : null,
                        ]}
                      >
                        <Ionicons name="map-outline" size={18} color={colors.gray[800]} />
                        <Text style={styles.secondaryBtnText}>מפת הושבה</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={[styles.tableList, { maxHeight: Math.min(720, windowHeight * 0.72) }]}>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={styles.tableListInner}>
                          {filteredTables.map((t) => {
                            const tid = String(t.id);
                            const seated = peopleCountAtTable(tid);
                            const cap = Number(t.capacity || 0) || 0;
                            const isFull = cap > 0 && seated >= cap;
                            const selected = selectedTableId === tid;
                            const pct = cap > 0 ? Math.min(1, seated / cap) : 0;

                            return (
                              <Pressable
                                key={tid}
                                accessibilityRole="button"
                                accessibilityLabel={`שולחן ${(t as any).number ?? t.number ?? ''}`}
                                onPress={() => selectTable(tid)}
                                style={({ hovered, pressed }: any) => [
                                  styles.tableRow,
                                  selected ? styles.tableRowSelected : null,
                                  isFull ? styles.tableRowFull : null,
                                  Platform.OS === 'web' && hovered && !selected ? styles.tableRowHover : null,
                                  pressed ? styles.btnPressed : null,
                                ]}
                              >
                                <View style={styles.tableRowTop}>
                                  {/* Physical layout: status left, text right */}
                                  <View style={[styles.badge, isFull ? styles.badgeFull : styles.badgeSoft]}>
                                    <Text style={[styles.badgeText, isFull ? styles.badgeTextFull : styles.badgeTextSoft]}>
                                      {isFull ? 'מלא' : seated > 0 ? 'פעיל' : 'ריק'}
                                    </Text>
                                  </View>

                                  <View style={styles.tableRowTitleWrap}>
                                    <Text style={styles.tableRowTitle} numberOfLines={1}>
                                      שולחן {String((t as any).number ?? t.number ?? '—')}
                                      {t.name ? ` · ${t.name}` : ''}
                                    </Text>
                                    <Text style={styles.tableRowSub} numberOfLines={1}>
                                      {seated} / {cap || '—'} יושבים
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.progressTrack}>
                                  <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }, isFull ? styles.progressFillFull : null]} />
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Add guests modal */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAddModal}>
        <Pressable style={styles.modalOverlay} onPress={closeAddModal}>
          <Pressable
            style={[styles.modalCard, { maxHeight: Math.min(windowHeight * 0.92, 760), width: '100%', maxWidth: 860 }]}
            onPress={() => {
              /* swallow */
            }}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  הוספת מוזמנים · שולחן {String((selectedTable as any)?.number ?? selectedTable?.number ?? '—')}
                  {(selectedTable as any)?.name ? ` · ${(selectedTable as any).name}` : ''}
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  פנויים: {selectedTableCapacity ? selectedTableRemaining : '—'} · נבחרו: {addSelectedGuestIds.size} ({addSelectedPeopleCount} אנשים)
                </Text>
                {selectedTableWillExceed ? (
                  <Text style={styles.modalWarning} numberOfLines={2}>
                    שים לב: הבחירה חורגת מהקיבולת של השולחן.
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeAddModal}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.modalFilters}>
                <View style={styles.searchWrap}>
                  <View style={styles.searchIconRight}>
                    <Ionicons name="search" size={18} color={colors.gray[500]} />
                  </View>
                  <TextInput
                    value={addSearch}
                    onChangeText={setAddSearch}
                    placeholder="חיפוש מוזמנים לפי שם..."
                    placeholderTextColor={colors.gray[500]}
                    style={styles.searchInput}
                  />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                  {addCategories.map((c) => (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={`סינון קטגוריה: ${c}`}
                      onPress={() => setAddCategoryFilter(c)}
                      style={({ hovered, pressed }: any) => [
                        styles.categoryChip,
                        c === 'הכל' ? styles.categoryChipCompact : null,
                        addCategoryFilter === c ? styles.categoryChipActive : null,
                        Platform.OS === 'web' && hovered && addCategoryFilter !== c ? styles.categoryChipHover : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          c === 'הכל' ? styles.categoryChipTextCompact : null,
                          addCategoryFilter === c ? styles.categoryChipTextActive : null,
                        ]}
                        numberOfLines={1}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={[styles.modalList, { maxHeight: Math.min(windowHeight * 0.55, 420) }]}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {filteredUnseatedGuests.length === 0 ? (
                    <View style={styles.modalEmpty}>
                      <Ionicons name="checkmark-done-outline" size={26} color={colors.gray[400]} />
                      <Text style={styles.emptyTitle}>אין מוזמנים זמינים</Text>
                      <Text style={styles.emptySubtitle}>כל המוזמנים שהגיעו כבר הושבו, או שאין התאמה לחיפוש/פילטר.</Text>
                    </View>
                  ) : (
                    <View style={styles.modalGrid}>
                      {filteredUnseatedGuests.map((g) => {
                        const id = String(g.id);
                        const selected = addSelectedGuestIds.has(id);
                        const ppl = Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1;
                        const cat = g.guest_categories?.name || 'ללא קטגוריה';
                        return (
                          <Pressable
                            key={id}
                            accessibilityRole="button"
                            accessibilityLabel={selected ? 'בטל בחירה' : 'בחר מוזמן'}
                            onPress={() => toggleAddSelection(id)}
                            style={({ hovered, pressed }: any) => [
                              styles.modalGuestCard,
                              selected ? styles.modalGuestCardSelected : null,
                              Platform.OS === 'web' && hovered ? styles.modalGuestCardHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            {/* Checkbox pinned (prevents overlap with the people badge) */}
                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: selected }}
                              accessibilityLabel={selected ? 'בטל בחירה' : 'בחר מוזמן'}
                              onPress={() => toggleAddSelection(id)}
                              style={({ hovered, pressed }: any) => [
                                styles.modalGuestCheckAbs,
                                selected ? styles.modalGuestCheckAbsChecked : null,
                                Platform.OS === 'web' && hovered ? styles.modalGuestCheckAbsHover : null,
                                pressed ? styles.btnPressed : null,
                              ]}
                            >
                              {selected ? (
                                <Ionicons name="checkmark" size={16} color={colors.white} />
                              ) : (
                                <Ionicons name="add" size={16} color={colors.gray[500]} />
                              )}
                            </Pressable>

                            <View style={styles.modalGuestTop}>
                              <View style={styles.modalGuestNameWrap}>
                                <Text style={styles.modalGuestName} numberOfLines={1}>
                                  {String(g.name || '').trim()}
                                </Text>
                                <Text style={styles.modalGuestMeta} numberOfLines={1}>
                                  {ppl} אנשים · {cat}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.modalGuestBadge}>
                              <Ionicons name="person" size={12} color={colors.gray[700]} />
                              <Text style={styles.modalGuestBadgeText}>{ppl}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="נקה בחירה"
                onPress={() => setAddSelectedGuestIds(new Set())}
                disabled={addSelectedGuestIds.size === 0}
                style={({ hovered, pressed }: any) => [
                  styles.secondaryBtn,
                  addSelectedGuestIds.size === 0 ? styles.btnDisabled : null,
                  Platform.OS === 'web' && hovered && addSelectedGuestIds.size > 0 ? styles.secondaryBtnHover : null,
                  pressed && addSelectedGuestIds.size > 0 ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[800]} />
                <Text style={styles.secondaryBtnText}>נקה</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="הוסף לשולחן"
                onPress={handleAddGuestsToTable}
                disabled={addSelectedGuestIds.size === 0}
                style={({ hovered, pressed }: any) => [
                  styles.primaryBtn,
                  addSelectedGuestIds.size === 0 ? styles.btnDisabled : null,
                  Platform.OS === 'web' && hovered && addSelectedGuestIds.size > 0 ? styles.primaryBtnHover : null,
                  pressed && addSelectedGuestIds.size > 0 ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="checkmark" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>
                  {addSelectedGuestIds.size > 0 ? `הוסף (${addSelectedGuestIds.size})` : 'בחר מוזמנים'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit people count modal */}
      <Modal visible={editPeopleOpen} transparent animationType="fade" onRequestClose={closeEditPeopleModal}>
        <Pressable style={styles.modalOverlay} onPress={closeEditPeopleModal}>
          <Pressable
            style={[styles.modalCard, { maxHeight: Math.min(windowHeight * 0.92, 520), width: '100%', maxWidth: 520 }]}
            onPress={() => {
              /* swallow */
            }}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  עריכת כמות אנשים
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={2}>
                  {editingPeopleGuest ? String(editingPeopleGuest.name || '').trim() : ''}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeEditPeopleModal}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.editPeopleField}>
                <Text style={styles.editPeopleLabel}>כמות</Text>
                <TextInput
                  value={editPeopleCount}
                  onChangeText={setEditPeopleCount}
                  placeholder="1"
                  placeholderTextColor={colors.gray[500]}
                  keyboardType="numeric"
                  style={styles.editPeopleInput}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={closeEditPeopleModal}
                disabled={editPeopleSaving}
                style={({ hovered, pressed }: any) => [
                  styles.secondaryBtn,
                  editPeopleSaving ? styles.btnDisabled : null,
                  Platform.OS === 'web' && hovered && !editPeopleSaving ? styles.secondaryBtnHover : null,
                  pressed && !editPeopleSaving ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[800]} />
                <Text style={styles.secondaryBtnText}>ביטול</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור"
                onPress={handleSaveEditPeople}
                disabled={editPeopleSaving}
                style={({ hovered, pressed }: any) => [
                  styles.primaryBtn,
                  editPeopleSaving ? styles.btnDisabled : null,
                  Platform.OS === 'web' && hovered && !editPeopleSaving ? styles.primaryBtnHover : null,
                  pressed && !editPeopleSaving ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="checkmark" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>{editPeopleSaving ? 'שומר...' : 'שמור'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Move guests modal */}
      <Modal visible={moveOpen} transparent animationType="fade" onRequestClose={closeMoveModal}>
        <Pressable style={styles.modalOverlay} onPress={closeMoveModal}>
          <Pressable
            style={[
              styles.modalCard,
              styles.moveModalCard,
              { maxHeight: Math.min(windowHeight * 0.92, 720), width: '100%', maxWidth: 760 },
            ]}
            onPress={() => {
              /* swallow */
            }}
          >
            <View style={[styles.modalHeader, styles.moveHeader]}>
              <View style={styles.modalTitleWrap}>
                <View style={styles.moveHeaderRow}>
                  <View style={styles.moveHeaderIcon}>
                    <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.moveHeaderTextWrap}>
                    <Text style={styles.modalTitle} numberOfLines={1}>
                      העברת מוזמנים לשולחן אחר
                    </Text>
                    <Text style={styles.modalSubtitle} numberOfLines={2}>
                      בחר שולחן יעד להעברת המוזמנים שסימנת
                    </Text>
                  </View>
                </View>

                <View style={styles.moveMetaRow}>
                  <View style={styles.moveMetaPill}>
                    <Text style={styles.moveMetaPillLabel}>מקור</Text>
                    <Text style={styles.moveMetaPillValue} numberOfLines={1}>
                      שולחן {String((selectedTable as any)?.number ?? selectedTable?.number ?? '—')}
                    </Text>
                  </View>
                  <View style={styles.moveMetaPill}>
                    <Text style={styles.moveMetaPillLabel}>נבחרו</Text>
                    <Text style={styles.moveMetaPillValue} numberOfLines={1}>
                      {selectedGuestIdsToRemove.size} · {selectedMovePeopleCount} אנשים
                    </Text>
                  </View>
                  <View style={[styles.moveMetaPill, moveTargetTableId ? null : styles.moveMetaPillMuted]}>
                    <Text style={styles.moveMetaPillLabel}>יעד</Text>
                    <Text style={styles.moveMetaPillValue} numberOfLines={1}>
                      {moveTargetTableId
                        ? `שולחן ${String((moveTargetTable as any)?.number ?? moveTargetTable?.number ?? '—')}`
                        : 'לא נבחר'}
                    </Text>
                  </View>
                </View>

                {moveWillExceed ? (
                  <View style={styles.moveWarningBox}>
                    <Ionicons name="warning-outline" size={16} color="#92400E" />
                    <Text style={styles.moveWarningText} numberOfLines={2}>
                      שים לב: ההעברה חורגת מהקיבולת של שולחן היעד.
                    </Text>
                  </View>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeMoveModal}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.modalFilters}>
                <View style={styles.searchWrap}>
                  <View style={styles.searchIconRight}>
                    <Ionicons name="search" size={18} color={colors.gray[500]} />
                  </View>
                  <TextInput
                    value={moveTableSearch}
                    onChangeText={setMoveTableSearch}
                    placeholder="חיפוש שולחן יעד לפי מספר / שם..."
                    placeholderTextColor={colors.gray[500]}
                    style={styles.searchInput}
                  />
                </View>
              </View>

              <View style={[styles.modalList, { maxHeight: Math.min(windowHeight * 0.55, 420) }]}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {moveCandidates.length === 0 ? (
                    <View style={styles.modalEmpty}>
                      <Ionicons name="grid-outline" size={26} color={colors.gray[400]} />
                      <Text style={styles.emptyTitle}>אין שולחנות יעד</Text>
                      <Text style={styles.emptySubtitle}>נסה לשנות את החיפוש.</Text>
                    </View>
                  ) : (
                    <View style={styles.moveList}>
                      {moveCandidates.map((t) => {
                        const tid = String(t.id);
                        const active = tid === String(moveTargetTableId || '');
                        const seated = peopleCountAtTable(tid);
                        const cap = Number(t.capacity || 0) || 0;
                        const after = seated + selectedMovePeopleCount;
                        const willExceed = cap > 0 && after > cap;
                        const pctNow = cap > 0 ? Math.min(1, seated / cap) : 0;
                        const pctAfter = cap > 0 ? Math.min(1, after / cap) : 0;
                        return (
                          <Pressable
                            key={tid}
                            accessibilityRole="button"
                            accessibilityLabel={`בחירת שולחן יעד ${(t as any).number ?? t.number ?? ''}`}
                            onPress={() => setMoveTargetTableId(tid)}
                            style={({ hovered, pressed }: any) => [
                              styles.moveTableItem,
                              active ? styles.moveTableItemActive : null,
                              willExceed ? styles.moveTableItemWarn : null,
                              Platform.OS === 'web' && hovered ? styles.moveTableItemHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <View style={styles.moveTableTop}>
                              <View style={[styles.moveRadio, active ? styles.moveRadioActive : null]}>
                                {active ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
                              </View>
                              <View style={styles.moveTableTitleWrap}>
                                <Text style={styles.moveTableTitle} numberOfLines={1}>
                                  שולחן {String((t as any).number ?? t.number ?? '—')}
                                  {t.name ? ` · ${t.name}` : ''}
                                </Text>
                                <Text style={styles.moveTableSub} numberOfLines={1}>
                                  קיבולת {cap || '—'} · כרגע {seated} · אחרי {after}
                                </Text>
                              </View>
                            </View>

                            {cap > 0 ? (
                              <View style={styles.moveProgressTrack}>
                                <View style={[styles.moveProgressFillNow, { width: `${Math.round(pctNow * 100)}%` }]} />
                                <View
                                  style={[
                                    styles.moveProgressFillAfter,
                                    { width: `${Math.round(pctAfter * 100)}%` },
                                    willExceed ? styles.moveProgressFillWarn : null,
                                  ]}
                                />
                              </View>
                            ) : null}

                            <View style={styles.movePillsRow}>
                              <View style={styles.moveMiniPill}>
                                <Text style={styles.moveMiniPillLabel}>כרגע</Text>
                                <Text style={styles.moveMiniPillValue}>
                                  {seated}/{cap || '—'}
                                </Text>
                              </View>
                              <Ionicons name="arrow-back-outline" size={16} color={colors.gray[500]} />
                              <View style={[styles.moveMiniPill, willExceed ? styles.moveMiniPillWarn : styles.moveMiniPillOk]}>
                                <Text style={styles.moveMiniPillLabel}>אחרי</Text>
                                <Text style={styles.moveMiniPillValue}>
                                  {after}/{cap || '—'}
                                </Text>
                              </View>
                              {cap > 0 ? (
                                <View style={styles.moveMiniPill}>
                                  <Text style={styles.moveMiniPillLabel}>פנויים</Text>
                                  <Text style={styles.moveMiniPillValue}>{Math.max(0, cap - seated)}</Text>
                                </View>
                              ) : null}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>

            <View style={[styles.modalActions, styles.moveFooter]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={closeMoveModal}
                style={({ hovered, pressed }: any) => [
                  styles.secondaryBtn,
                  Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[800]} />
                <Text style={styles.secondaryBtnText}>ביטול</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="בצע העברה"
                onPress={handleMoveSelectedGuests}
                disabled={!moveTargetTableId}
                style={({ hovered, pressed }: any) => [
                  styles.primaryBtn,
                  !moveTargetTableId ? styles.btnDisabled : null,
                  Platform.OS === 'web' && hovered && moveTargetTableId ? styles.primaryBtnHover : null,
                  pressed && moveTargetTableId ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>{moveTargetTableId ? 'העבר לשולחן שנבחר' : 'בחר שולחן יעד'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function toneColor(tone: 'primary' | 'success' | 'warning' | 'danger') {
  if (tone === 'success') return { main: '#10B981', soft: 'rgba(16,185,129,0.12)', text: '#065F46' };
  if (tone === 'warning') return { main: '#F59E0B', soft: 'rgba(245,158,11,0.12)', text: '#92400E' };
  if (tone === 'danger') return { main: '#F43F5E', soft: 'rgba(244,63,94,0.12)', text: '#9F1239' };
  return { main: colors.primary, soft: 'rgba(6,23,62,0.10)', text: colors.primary };
}

function Chip({
  label,
  count,
  active,
  tone,
  compact,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  compact?: boolean;
  onPress: () => void;
}) {
  const c = toneColor(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`פילטר: ${label}`}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.chip,
        compact ? styles.chipCompact : null,
        active ? { backgroundColor: c.main, borderColor: c.main } : null,
        Platform.OS === 'web' && hovered && !active ? styles.chipHover : null,
        pressed ? styles.btnPressed : null,
      ]}
    >
      <Text style={[styles.chipText, compact ? styles.chipTextCompact : null, active ? { color: colors.white } : null]}>
        {label}
      </Text>
      <View
        style={[
          styles.chipCount,
          compact ? styles.chipCountCompact : null,
          active ? { backgroundColor: 'rgba(255,255,255,0.20)' } : { backgroundColor: c.soft },
        ]}
      >
        <Text
          style={[
            styles.chipCountText,
            compact ? styles.chipCountTextCompact : null,
            active ? { color: colors.white } : { color: c.text },
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function StatPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: number;
  tone: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const c = toneColor(tone);
  return (
    <View style={[styles.statPill, { borderColor: 'rgba(15,23,42,0.08)' }]}>
      <View style={[styles.statDot, { backgroundColor: c.main }]} />
      <Ionicons name={icon as any} size={15} color={c.main} />
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.statValuePill, { backgroundColor: c.soft }]}>
        <Text style={[styles.statValueText, { color: c.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function InfoPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: any;
  tone: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const c = toneColor(tone);
  return (
    <View style={[styles.infoPill, { backgroundColor: c.soft, borderColor: 'rgba(15,23,42,0.06)' }]}>
      <Ionicons name={icon as any} size={15} color={c.main} />
      <Text style={styles.infoPillLabel}>{label}</Text>
      <Text style={[styles.infoPillValue, { color: c.text }]}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.gray[50],
    direction: 'rtl',
  },
  scroll: { flex: 1 },
  container: {
    paddingTop: 16,
    paddingBottom: 28,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
    direction: 'rtl',
  },

  bgShapes: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  shapeTopRight: {
    position: 'absolute',
    top: -140,
    right: -140,
    width: 380,
    height: 380,
    borderRadius: 9999,
    backgroundColor: 'rgba(240,203,70,0.12)',
  },
  shapeBottomLeft: {
    position: 'absolute',
    bottom: -180,
    left: -160,
    width: 460,
    height: 460,
    borderRadius: 9999,
    backgroundColor: 'rgba(6,23,62,0.08)',
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  centerSub: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  topBarLeftRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  topBarRightRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },

  heroRow: { flexDirection: 'row-reverse', alignItems: 'stretch', justifyContent: 'space-between' },
  heroCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 14,
    boxShadow: '0 12px 34px rgba(11,48,65,0.06)',
  },
  heroCardTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  heroTitleWrap: { alignItems: 'flex-end', gap: 2, flex: 1, minWidth: 240 },
  heroTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  heroSubtitle: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  // Physical layout:
  // In RTL, browsers may place the first flex child on the right even with `row`.
  // For web we control placement with `order` on the columns.
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  mainRowNarrow: { flexDirection: 'column', alignItems: 'stretch' },
  sideCol: {
    width: '100%',
    ...(Platform.OS === 'web' ? ({ order: 0 } as any) : null),
  },
  detailCol: {
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ order: 1 } as any) : null),
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    padding: 14,
    overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 18px 36px rgba(16,24,40,0.06)',
  },

  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  cardTitleWrap: { alignItems: 'flex-end', gap: 2, flex: 1, minWidth: 240 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  cardHint: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  searchWrap: { position: 'relative', width: '100%', marginTop: 12 },
  searchIconRight: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', pointerEvents: 'none' },
  searchInput: {
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    paddingRight: 40,
    paddingLeft: 12,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },

  chipsRow: { marginTop: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  chipHover: { backgroundColor: colors.gray[50] },
  chipText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  chipCount: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, minWidth: 26, alignItems: 'center' },
  chipCountText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
  chipCompact: { paddingHorizontal: 10, paddingVertical: 7 },
  chipTextCompact: { fontSize: 11 },
  chipCountCompact: { paddingHorizontal: 7, paddingVertical: 2, minWidth: 22 },
  chipCountTextCompact: { fontSize: 10 },

  tableList: { marginTop: 6, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', backgroundColor: 'rgba(248,250,252,0.70)' },
  tableListInner: { padding: 10, gap: 10 },
  tableRow: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: colors.white,
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableRowHover: {
    borderColor: 'rgba(6,23,62,0.20)',
    boxShadow: '0 0 0 1px rgba(6,23,62,0.06), 0 14px 26px rgba(16,24,40,0.08)',
    transform: [{ translateY: -1 }],
  },
  tableRowSelected: { borderColor: 'rgba(6,23,62,0.35)', backgroundColor: 'rgba(6,23,62,0.04)' },
  tableRowFull: { borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.06)' },
  // Physical layout: status badge on the left, text on the right.
  // We force LTR on web for stable left/right placement, while the text block keeps RTL.
  tableRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  tableRowTitleWrap: {
    flex: 1,
    minWidth: 0,
    // In RTL, `flex-start` maps to the physical right edge.
    // `flex-end` would align to the left when `direction: 'rtl'` is applied on web.
    alignItems: 'flex-start',
    gap: 2,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  tableRowTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  tableRowSub: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: 'rgba(6,23,62,0.35)' },
  progressFillFull: { backgroundColor: 'rgba(16,185,129,0.85)' },

  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  badgeSoft: { backgroundColor: 'rgba(6,23,62,0.06)', borderColor: 'rgba(6,23,62,0.10)' },
  badgeFull: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.22)' },
  badgeText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
  badgeTextSoft: { color: colors.primary },
  badgeTextFull: { color: '#065F46' },

  detailHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  detailTitleWrap: { flex: 1, minWidth: 280, alignItems: 'flex-end', gap: 10 },
  detailTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  detailStatsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  detailActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },

  infoPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  infoPillLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  infoPillValue: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },

  detailBody: { marginTop: 14, gap: 14 },

  guestsGrid: {
    // In RTL, a plain 'row' starts at the physical right edge.
    // Using 'row-reverse' together with `direction: 'rtl'` can flip the start edge back to the left on web.
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'stretch',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestCard: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    // Reserve space for the top-right badge/checkbox so it won't overlap the guest name.
    paddingTop: 40,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(248,250,252,0.92)',
    gap: 6,
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null),
  },
  guestCardEditable: { ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  guestCardHover: {
    borderColor: 'rgba(6,23,62,0.18)',
    backgroundColor: colors.white,
    transform: [{ translateY: -1 }],
    boxShadow: '0 18px 40px rgba(16,24,40,0.12)',
  },
  guestCardSelected: { borderColor: 'rgba(6,23,62,0.35)', backgroundColor: 'rgba(6,23,62,0.06)' },
  guestName: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestMeta: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  guestTrashBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  guestTrashBtnHover: { backgroundColor: colors.gray[100], borderColor: 'rgba(6,23,62,0.18)' },

  guestEditBtn: {
    position: 'absolute',
    top: 10,
    left: 46,
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  guestEditBtnHover: { backgroundColor: colors.gray[100], borderColor: 'rgba(6,23,62,0.18)' },

  checkbox: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.18)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  peopleBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  peopleBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  editBar: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  editBarText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },

  emptyBox: { padding: 20, alignItems: 'flex-end', justifyContent: 'center', gap: 10 },
  emptyTableBox: { padding: 22, alignItems: 'flex-end', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(248,250,252,0.85)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  emptySubtitle: { fontSize: 13, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl', maxWidth: 560 },

  primaryBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  primaryBtnHover: {
    opacity: 0.96,
    transform: [{ translateY: -1 }],
    boxShadow: '0 14px 30px rgba(6,23,62,0.22)',
  },
  primaryBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right', writingDirection: 'rtl' },
  secondaryBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  secondaryBtnActive: { backgroundColor: 'rgba(6,23,62,0.06)', borderColor: 'rgba(6,23,62,0.18)' },
  secondaryBtnHover: {
    backgroundColor: colors.gray[200],
    borderColor: 'rgba(6,23,62,0.16)',
    transform: [{ translateY: -1 }],
    boxShadow: '0 14px 26px rgba(16,24,40,0.10)',
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },

  dangerBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F43F5E',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  dangerBtnHover: {
    opacity: 0.96,
    transform: [{ translateY: -1 }],
    boxShadow: '0 14px 30px rgba(244,63,94,0.22)',
  },
  dangerBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right', writingDirection: 'rtl' },

  btnDisabled: { opacity: 0.6 },
  btnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },

  statPill: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  statDot: { width: 8, height: 8, borderRadius: 999 },
  statLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  statValuePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, minWidth: 26, alignItems: 'center' },
  statValueText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,0.20)',
  },
  // The move modal is rendered in a portal on web; explicitly force RTL so content
  // aligns to the right like the rest of the app.
  moveModalCard: {
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitleWrap: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  modalSubtitle: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  modalWarning: { fontSize: 12, fontWeight: '900', color: '#9F1239', textAlign: 'right', writingDirection: 'rtl' },
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
  modalFilters: { gap: 10 },
  categoryRow: { flexDirection: 'row-reverse', gap: 8, paddingVertical: 2 },

  editPeopleField: { gap: 8 },
  editPeopleLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  editPeopleInput: {
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'left',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  categoryChip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  categoryChipCompact: { height: 32, paddingHorizontal: 10 },
  categoryChipHover: { backgroundColor: colors.gray[200], borderColor: 'rgba(6,23,62,0.16)', transform: [{ translateY: -1 }] },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl', maxWidth: 220 },
  categoryChipTextCompact: { fontSize: 11 },
  categoryChipTextActive: { color: colors.white },

  modalList: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', backgroundColor: 'rgba(248,250,252,0.70)' },
  modalGrid: { padding: 10, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  modalEmpty: { padding: 20, alignItems: 'flex-end', justifyContent: 'center', gap: 10 },
  modalGuestCard: {
    width: '48%',
    minWidth: 260,
    flexGrow: 1,
    padding: 12,
    // Reserve space for pinned controls (checkbox + people badge)
    paddingTop: 44,
    paddingBottom: 42,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: colors.white,
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalGuestCardHover: {
    borderColor: 'rgba(6,23,62,0.18)',
    transform: [{ translateY: -1 }],
    boxShadow: '0 18px 40px rgba(16,24,40,0.12)',
  },
  modalGuestCardSelected: { borderColor: 'rgba(6,23,62,0.35)', backgroundColor: 'rgba(6,23,62,0.06)' },
  modalGuestTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modalGuestNameWrap: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 3 },
  modalGuestName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  modalGuestMeta: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  modalGuestBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  modalGuestBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modalGuestCheckAbs: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalGuestCheckAbsHover: { backgroundColor: colors.gray[50], borderColor: 'rgba(6,23,62,0.18)' },
  modalGuestCheckAbsChecked: { backgroundColor: colors.primary, borderColor: colors.primary },

  modalActions: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  // Move modal polish
  moveHeader: {
    backgroundColor: 'rgba(248,250,252,0.95)',
  },
  moveHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    width: '100%',
  },
  moveHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveHeaderTextWrap: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  moveMetaRow: { marginTop: 6, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  moveMetaPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  moveMetaPillMuted: { opacity: 0.75 },
  moveMetaPillLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  moveMetaPillValue: { fontSize: 11, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  moveWarningBox: {
    marginTop: 8,
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.18)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  moveWarningText: { fontSize: 12, fontWeight: '900', color: '#92400E', textAlign: 'right', writingDirection: 'rtl', flex: 1, minWidth: 0 },
  moveFooter: {
    backgroundColor: 'rgba(255,255,255,0.96)',
  },

  moveList: {
    padding: 10,
    gap: 10,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  moveTableItem: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: colors.white,
    gap: 6,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  moveTableItemHover: {
    borderColor: 'rgba(6,23,62,0.18)',
    backgroundColor: 'rgba(248,250,252,0.98)',
    transform: [{ translateY: -1 }],
    boxShadow: '0 18px 40px rgba(16,24,40,0.12)',
  },
  moveTableItemActive: { borderColor: 'rgba(6,23,62,0.35)', backgroundColor: 'rgba(6,23,62,0.06)' },
  moveTableItemWarn: { borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.06)' },
  // Stable physical layout on web: keep radio on the right and text close to it.
  moveTableTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  moveTableTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 2,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  moveTableTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  moveTableSub: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  moveRadio: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  moveRadioActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  moveProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    position: 'relative',
  },
  moveProgressFillNow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.22)',
  },
  moveProgressFillAfter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.75)',
  },
  moveProgressFillWarn: { backgroundColor: 'rgba(245,158,11,0.85)' },
  movePillsRow: { marginTop: 6, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  moveMiniPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  moveMiniPillOk: { borderColor: 'rgba(16,185,129,0.22)', backgroundColor: 'rgba(16,185,129,0.08)' },
  moveMiniPillWarn: { borderColor: 'rgba(245,158,11,0.22)', backgroundColor: 'rgba(245,158,11,0.10)' },
  moveMiniPillLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  moveMiniPillValue: { fontSize: 11, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
});

