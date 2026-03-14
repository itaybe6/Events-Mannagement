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
import { useFocusEffect, useLocalSearchParams, useRouter, useSegments } from 'expo-router';

import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
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
  const segments = useSegments();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const { setTabBarVisible } = useLayoutStore();

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isAdminContext = useMemo(() => segments.includes('(admin)'), [segments]);
  // On admin web, the screen lives beside the persistent sidebar.
  // Use available content width so the desktop layout keeps its RTL alignment.
  const sidebarWidth = Platform.OS === 'web' && isAdminContext ? 270 : 0;
  const contentWidth = Math.max(0, windowWidth - sidebarWidth);
  const isNarrow = contentWidth < 980;

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;
  const backHref = resolvedEventId
    ? isAdminContext
      ? `/(admin)/admin-event-details?id=${resolvedEventId}`
      : `/(couple)?eventId=${resolvedEventId}`
    : isAdminContext
      ? '/(admin)/admin-events'
      : '/(couple)';

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
  const emptyTablesCount = useMemo(() => tables.filter((t) => peopleCountAtTable(String(t.id)) <= 0).length, [tables, guestsByTableId]);

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
    router.push({
      pathname: isAdminContext ? ('/(admin)/seating-map' as any) : '/(couple)/BrideGroomSeating',
      params: resolvedEventId ? { eventId: resolvedEventId } : {},
    });
  };

  const normalizeTableLabel = (value: string) => value.replace(/\s+/g, ' ').trim();

  const getTableDisplayTitle = (table: Table | null) => {
    if (!table) return 'שולחן —';
    const number = normalizeTableLabel(String((table as any).number ?? table.number ?? '—')) || '—';
    const baseTitle = `שולחן ${number}`;
    const rawName = normalizeTableLabel(String(table.name || ''));
    const rawNameWithoutPrefix = rawName.replace(/^שולחן\s+/u, '').trim();
    if (!rawName || rawName === baseTitle || rawName === number || rawNameWithoutPrefix === number) return baseTitle;
    return `${baseTitle} · ${rawName}`;
  };

  const handleBack = () => {
    router.replace(backHref as any);
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
    contentWidth >= 1900 ? 1720 : contentWidth >= 1600 ? 1520 : contentWidth >= 1400 ? 1320 : undefined;
  const contentPaddingH = contentWidth >= 1100 ? 20 : 16;

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
      { key: 'empty', label: 'ריקים', count: emptyTablesCount, tone: 'danger' },
    ];

  const sideWidth = contentWidth < 1240 ? 420 : 480;
  const guestCardWidth = isNarrow ? '100%' : contentWidth < 1320 ? '48%' : contentWidth < 1600 ? '31.5%' : 290;
  const adminHeaderStats = [
    { key: 'tables', label: 'שולחנות', value: tables.length },
    { key: 'full', label: 'מלאים', value: fullTablesCount },
    { key: 'empty', label: 'ריקים', value: emptyTablesCount },
    { key: 'waiting', label: 'ממתינים לשיבוץ', value: unseatedGuestsArriving.length },
  ];
  const selectedTableSummary = selectedTable ? getTableDisplayTitle(selectedTable) : 'עדיין לא נבחר שולחן';

  const renderSelectedGuestCard = (g: GuestRow) => {
    const gid = String(g.id);
    const selected = selectedGuestIdsToRemove.has(gid);
    const ppl = Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1;
    const cat = g.guest_categories?.name || 'ללא קטגוריה';
    const guestStatus = getGuestStatusMeta(g.status);
    const guestStatusColors = toneColor(guestStatus.tone);

    const content = (
      <>
        <View style={[styles.guestCardAccent, { backgroundColor: guestStatusColors.main }]} />

        {!editMode ? (
          <>
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
          </>
        ) : (
          <View style={[styles.checkbox, selected ? styles.checkboxChecked : null]}>
            {selected ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
          </View>
        )}

        <View style={styles.guestCardBody}>
          <View style={styles.guestCardTitleWrap}>
            <Text style={styles.guestName} numberOfLines={1}>
              {String(g.name || '').trim()}
            </Text>
            <Text style={styles.guestMeta} numberOfLines={1}>
              {cat}
            </Text>
          </View>

          <View style={styles.guestCardFooter}>
            <View
              style={[
                styles.guestStatusPill,
                {
                  backgroundColor: guestStatusColors.soft,
                  borderColor: guestStatusColors.main,
                },
              ]}
            >
              <View style={[styles.guestStatusDot, { backgroundColor: guestStatusColors.main }]} />
              <Text style={[styles.guestStatusText, { color: guestStatusColors.text }]} numberOfLines={1}>
                {guestStatus.label}
              </Text>
            </View>

            <View style={styles.guestInfoPill}>
              <Ionicons name="person" size={12} color={colors.gray[700]} />
              <Text style={styles.guestInfoPillText}>{ppl} אנשים</Text>
            </View>
          </View>
        </View>
      </>
    );

    if (!editMode) {
      return (
        <View key={gid} style={[styles.guestCard, { width: guestCardWidth }]}>
          {content}
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
        {content}
      </Pressable>
    );
  };

  const renderSelectedGuestsSection = () => {
    if (!selectedTable) return null;
    if (selectedGuestsAtTable.length === 0) {
      return (
        <EmptyTableGuestsState
          capacity={selectedTableCapacity}
          remaining={selectedTableRemaining}
          onAddPress={() => openAddModal(String(selectedTable.id))}
        />
      );
    }

    return (
      <View style={[styles.guestsSection, isAdminContext ? styles.guestsSectionAdmin : null]}>
        <View style={styles.guestsSectionHeader}>
          <View style={styles.guestsSectionTitleWrap}>
            <Text style={styles.guestsSectionTitle}>מוזמנים בשולחן</Text>
            <Text style={styles.guestsSectionSubtitle}>כאן אפשר לראות סטטוס, כמות אנשים ופעולות מהירות לכל מוזמן.</Text>
          </View>
          <View style={styles.guestsSectionCountPill}>
            <Text style={styles.guestsSectionCountText}>{selectedGuestsAtTable.length} מוזמנים</Text>
          </View>
        </View>

        <View style={styles.guestsGrid}>{selectedGuestsAtTable.map((g) => renderSelectedGuestCard(g))}</View>
      </View>
    );
  };

  return (
    <View style={[styles.page, isAdminContext ? styles.pageAdmin : null]}>
      {!isAdminContext ? (
        <View pointerEvents="none" style={styles.bgShapes}>
          <View style={styles.shapeTopRight} />
          <View style={styles.shapeBottomLeft} />
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          isAdminContext ? styles.containerAdmin : null,
          {
            paddingHorizontal: contentPaddingH,
            ...(!isAdminContext && contentMaxWidth ? { maxWidth: contentMaxWidth } : null),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isAdminContext ? (
          <View style={styles.adminHeroShell}>
            <AdminWebPageHeader
              eyebrow="ניהול אירוע"
              title="רשימת שולחנות"
              subtitle="ניהול מהיר של תפוסה, מושבים ואורחים בכל שולחן מתוך מסך אחד."
              subtitleContent={
                <View style={styles.adminHeaderMetaBar}>
                  <View style={styles.adminHeaderMetaGroup}>
                    {adminHeaderStats.map((item) => (
                      <View key={item.key} style={styles.adminHeaderStatChip}>
                        <Text style={styles.adminHeaderStatValue}>{item.value}</Text>
                        <Text style={styles.adminHeaderStatLabel}>{item.label}</Text>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="מעבר למפת הושבה"
                    onPress={goToSeatingMap}
                    style={({ hovered, pressed }: any) => [
                      styles.adminHeaderActionBtn,
                      Platform.OS === 'web' && hovered ? styles.adminHeaderActionBtnHover : null,
                      pressed ? styles.btnPressed : null,
                    ]}
                  >
                    <Ionicons name="map-outline" size={16} color={colors.primary} />
                    <Text style={styles.adminHeaderActionBtnText}>מפת הושבה</Text>
                  </Pressable>
                </View>
              }
              actions={
                <View style={styles.adminHeaderSelectionBadge}>
                  <Ionicons name="albums-outline" size={15} color={colors.primary} />
                  <Text style={styles.adminHeaderSelectionText} numberOfLines={1}>
                    {selectedTableSummary}
                  </Text>
                </View>
              }
              showNav={false}
              useDefaultActions={false}
              leading={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חזרה"
                  onPress={handleBack}
                  style={({ hovered, pressed }: any) => [
                    styles.adminBackBtn,
                    Platform.OS === 'web' && hovered ? styles.adminBackBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={16} color={colors.text} />
                  <Text style={styles.adminBackBtnText}>חזרה</Text>
                </Pressable>
              }
            />
          </View>
        ) : (
          <View style={styles.pageTopBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="חזרה"
              onPress={handleBack}
              style={({ hovered, pressed }: any) => [
                styles.backBtn,
                Platform.OS === 'web' && hovered ? styles.backBtnHover : null,
                pressed ? styles.btnPressed : null,
              ]}
            >
              <Ionicons name="arrow-forward" size={18} color={colors.gray[800]} />
            </Pressable>
          </View>
        )}

        <View style={[styles.mainRow, isNarrow ? styles.mainRowNarrow : null]}>
          {isNarrow ? (
            <>
              {/* On narrow screens, show list first (top), then details */}
              <View style={[styles.sideCol, !isNarrow ? { width: sideWidth } : null]}>{/* Tables list */}
                <View style={[styles.card, isAdminContext ? styles.cardAdmin : null]}>
                  {isAdminContext ? (
                    <View style={styles.adminSectionHeader}>
                      <View style={styles.adminSectionHeaderText}>
                        <Text style={styles.adminSectionEyebrow}>רשימה וסינון</Text>
                        <Text style={styles.adminSectionTitle}>בחירת שולחן</Text>
                        <Text style={styles.adminSectionSubtitle}>חיפוש מהיר ומעבר בין כל שולחנות האירוע לפי סטטוס תפוסה.</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.searchWrap}>
                    <View style={styles.searchIconRight}>
                      <Ionicons name="search" size={18} color={colors.gray[500]} />
                    </View>
                    <TextInput
                      value={tableQuery}
                      onChangeText={setTableQuery}
                      placeholder="חיפוש לפי מספר / שם שולחן..."
                      placeholderTextColor={colors.gray[500]}
                      style={[styles.searchInput, isAdminContext ? styles.searchInputAdmin : null]}
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
                    <View style={[styles.tableList, isAdminContext ? styles.tableListAdmin : null, { maxHeight: Math.min(520, windowHeight * 0.55) }]}>
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
                                  isAdminContext ? styles.tableRowAdmin : null,
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
                                      {getTableDisplayTitle(t)}
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
                <View style={[styles.card, isAdminContext ? styles.cardAdmin : null]}>
                  {!selectedTable ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="information-circle-outline" size={26} color={colors.gray[400]} />
                      <Text style={styles.emptyTitle}>בחר שולחן</Text>
                      <Text style={styles.emptySubtitle}>בחר שולחן מהרשימה כדי לראות מי יושב בו ולבצע פעולות.</Text>
                    </View>
                  ) : (
                    <>
                      {isAdminContext ? (
                        <View style={styles.adminSectionHeader}>
                          <View style={styles.adminSectionHeaderText}>
                            <Text style={styles.adminSectionEyebrow}>פרטי שולחן</Text>
                            <Text style={styles.adminSectionTitle}>ניהול מוזמנים</Text>
                            <Text style={styles.adminSectionSubtitle}>צפייה ברשימת היושבים, עריכה מהירה והעברת מוזמנים בין שולחנות.</Text>
                          </View>
                        </View>
                      ) : null}
                      <View style={[styles.detailHeader, isAdminContext ? styles.detailHeaderAdmin : null]}>
                        <View style={styles.detailTitleWrap}>
                          <Text style={styles.detailTitle} numberOfLines={1}>
                            {getTableDisplayTitle(selectedTable)}
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
                        {renderSelectedGuestsSection()}

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
                <View style={[styles.card, isAdminContext ? styles.cardAdmin : null]}>
                  {!selectedTable ? (
                    <View style={styles.emptyBox}>
                      <Ionicons name="information-circle-outline" size={26} color={colors.gray[400]} />
                      <Text style={styles.emptyTitle}>בחר שולחן</Text>
                      <Text style={styles.emptySubtitle}>בחר שולחן מהרשימה כדי לראות מי יושב בו ולבצע פעולות.</Text>
                    </View>
                  ) : (
                    <>
                      {isAdminContext ? (
                        <View style={styles.adminSectionHeader}>
                          <View style={styles.adminSectionHeaderText}>
                            <Text style={styles.adminSectionEyebrow}>פרטי שולחן</Text>
                            <Text style={styles.adminSectionTitle}>ניהול מוזמנים</Text>
                            <Text style={styles.adminSectionSubtitle}>צפייה ברשימת היושבים, עריכה מהירה והעברת מוזמנים בין שולחנות.</Text>
                          </View>
                        </View>
                      ) : null}
                      <View style={[styles.detailHeader, isAdminContext ? styles.detailHeaderAdmin : null]}>
                        <View style={styles.detailTitleWrap}>
                          <Text style={styles.detailTitle} numberOfLines={1}>
                            {getTableDisplayTitle(selectedTable)}
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
                        {renderSelectedGuestsSection()}

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
                <View style={[styles.card, isAdminContext ? styles.cardAdmin : null]}>
                  {isAdminContext ? (
                    <View style={styles.adminSectionHeader}>
                      <View style={styles.adminSectionHeaderText}>
                        <Text style={styles.adminSectionEyebrow}>רשימה וסינון</Text>
                        <Text style={styles.adminSectionTitle}>בחירת שולחן</Text>
                        <Text style={styles.adminSectionSubtitle}>חיפוש מהיר ומעבר בין כל שולחנות האירוע לפי סטטוס תפוסה.</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.searchWrap}>
                    <View style={styles.searchIconRight}>
                      <Ionicons name="search" size={18} color={colors.gray[500]} />
                    </View>
                    <TextInput
                      value={tableQuery}
                      onChangeText={setTableQuery}
                      placeholder="חיפוש לפי מספר / שם שולחן..."
                      placeholderTextColor={colors.gray[500]}
                      style={[styles.searchInput, isAdminContext ? styles.searchInputAdmin : null]}
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
                    <View style={[styles.tableList, isAdminContext ? styles.tableListAdmin : null, { maxHeight: Math.min(720, windowHeight * 0.72) }]}>
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
                                  isAdminContext ? styles.tableRowAdmin : null,
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
                                      {getTableDisplayTitle(t)}
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
            style={[styles.modalCard, styles.addModalCard, { maxHeight: Math.min(windowHeight * 0.92, 760), width: '100%', maxWidth: 860 }]}
            onPress={() => {
              /* swallow */
            }}
          >
            <View style={[styles.modalHeader, styles.addModalHeader]}>
              <View style={styles.addModalHeaderMain}>
                <View style={styles.addModalHeaderRow}>
                  <View style={styles.addModalHeaderTextWrap}>
                    <Text style={styles.modalTitle} numberOfLines={1}>
                      הוספת מוזמנים לשולחן {String((selectedTable as any)?.number ?? selectedTable?.number ?? '—')}
                    </Text>
                    {(selectedTable as any)?.name ? (
                      <Text style={styles.modalSubtitle} numberOfLines={1}>
                        {String((selectedTable as any).name)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.addModalMetaRow}>
                  <View style={styles.addModalMetaPill}>
                    <Ionicons name="albums-outline" size={14} color={colors.gray[700]} />
                    <Text style={styles.addModalMetaText}>פנויים: {selectedTableCapacity ? selectedTableRemaining : '—'}</Text>
                  </View>
                  <View style={styles.addModalMetaPill}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.gray[700]} />
                    <Text style={styles.addModalMetaText}>נבחרו: {addSelectedGuestIds.size}</Text>
                  </View>
                  <View style={styles.addModalMetaPill}>
                    <Ionicons name="people-outline" size={14} color={colors.gray[700]} />
                    <Text style={styles.addModalMetaText}>{addSelectedPeopleCount} אנשים</Text>
                  </View>
                  {selectedTableWillExceed ? (
                    <View style={[styles.addModalMetaPill, styles.addModalMetaPillWarning]}>
                      <Ionicons name="warning-outline" size={14} color="#9F1239" />
                      <Text style={[styles.addModalMetaText, styles.addModalMetaTextWarning]}>הבחירה חורגת מהקיבולת</Text>
                    </View>
                  ) : null}
                </View>
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
              <View style={[styles.modalFilters, styles.addModalFiltersCard]}>
                <View style={styles.addModalFiltersHeader}>
                  <Text style={styles.addModalFiltersTitle}>חיפוש וסינון</Text>
                  <Text style={styles.addModalFiltersHint}>בחרו מוזמנים פנויים והוסיפו אותם לשולחן בלחיצה אחת.</Text>
                </View>
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
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalListScrollContent}>
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
                        const guestStatus = getGuestStatusMeta(g.status);
                        const guestStatusColors = toneColor(guestStatus.tone);
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
                            <View
                              style={[
                                styles.modalGuestStatus,
                                {
                                  backgroundColor: guestStatusColors.soft,
                                  borderColor: guestStatusColors.main,
                                },
                              ]}
                            >
                              <View style={[styles.modalGuestStatusDot, { backgroundColor: guestStatusColors.main }]} />
                              <Text style={[styles.modalGuestStatusText, { color: guestStatusColors.text }]} numberOfLines={1}>
                                {guestStatus.label}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>

            <View style={[styles.modalActions, styles.addModalActions]}>
              <View style={styles.addModalActionsSummary}>
                <Text style={styles.addModalActionsTitle}>סיכום בחירה</Text>
                <Text style={styles.addModalActionsSubtitle}>
                  {addSelectedGuestIds.size > 0
                    ? `${addSelectedGuestIds.size} מוזמנים נבחרו · ${addSelectedPeopleCount} אנשים`
                    : 'עדיין לא נבחרו מוזמנים'}
                </Text>
              </View>

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
            style={[styles.modalCard, styles.editPeopleModalCard, { maxHeight: Math.min(windowHeight * 0.92, 560), width: '100%', maxWidth: 540 }]}
            onPress={() => {
              /* swallow */
            }}
          >
            <View style={[styles.modalHeader, styles.editPeopleModalHeader]}>
              <View style={styles.modalTitleWrap}>
                <Text style={[styles.modalTitle, styles.editPeopleTitle]} numberOfLines={1}>
                  עריכת כמות אנשים
                </Text>
                <Text style={[styles.modalSubtitle, styles.editPeopleSubtitle]} numberOfLines={2}>
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
              <View style={styles.editPeopleHero}>
                <View style={styles.editPeopleHeroTitleWrap}>
                  <Text style={styles.editPeopleHeroTitle}>עדכון כמות ההושבה</Text>
                  <Text style={styles.editPeopleHeroText}>
                    ערכו את מספר האנשים שמשויכים למוזמן הזה בשולחן הנוכחי.
                  </Text>
                </View>

                <View style={styles.editPeopleMetaRow}>
                  <View style={styles.editPeopleMetaPill}>
                    <Ionicons name="people-outline" size={14} color={colors.primary} />
                    <Text style={styles.editPeopleMetaPillText}>
                      כרגע: {Number(editingPeopleGuest?.numberOfPeople ?? editingPeopleGuest?.number_of_people ?? 1) || 1}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.editPeopleMetaPill,
                      styles.editPeopleStatusPill,
                      editingPeopleGuest
                        ? {
                            backgroundColor: toneColor(getGuestStatusMeta(editingPeopleGuest.status).tone).soft,
                            borderColor: toneColor(getGuestStatusMeta(editingPeopleGuest.status).tone).main,
                          }
                        : null,
                    ]}
                  >
                    <View
                      style={[
                        styles.editPeopleStatusDot,
                        editingPeopleGuest
                          ? { backgroundColor: toneColor(getGuestStatusMeta(editingPeopleGuest.status).tone).main }
                          : null,
                      ]}
                    />
                    <Text
                      style={[
                        styles.editPeopleMetaPillText,
                        editingPeopleGuest
                          ? { color: toneColor(getGuestStatusMeta(editingPeopleGuest.status).tone).text }
                          : null,
                      ]}
                    >
                      {getGuestStatusMeta(editingPeopleGuest?.status).label}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.editPeopleField, styles.editPeopleFieldCard]}>
                <Text style={styles.editPeopleLabel}>כמות</Text>
                <Text style={styles.editPeopleHint}>הכניסו את מספר המקומות שהמוזמן תופס בפועל בשולחן.</Text>
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

            <View style={[styles.modalActions, styles.editPeopleFooter]}>
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
              <View style={styles.moveHeaderContent}>
                <View style={styles.moveHeaderRow}>
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
                    <View style={styles.moveMetaPillIcon}>
                      <Ionicons name="albums-outline" size={15} color={colors.primary} />
                    </View>
                    <View style={styles.moveMetaPillTextWrap}>
                      <Text style={styles.moveMetaPillLabel}>מקור</Text>
                      <Text style={styles.moveMetaPillValue} numberOfLines={1}>
                        שולחן {String((selectedTable as any)?.number ?? selectedTable?.number ?? '—')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.moveMetaPill}>
                    <View style={styles.moveMetaPillIcon}>
                      <Ionicons name="people-outline" size={15} color={colors.primary} />
                    </View>
                    <View style={styles.moveMetaPillTextWrap}>
                      <Text style={styles.moveMetaPillLabel}>נבחרו</Text>
                      <Text style={styles.moveMetaPillValue} numberOfLines={1}>
                        {selectedGuestIdsToRemove.size} · {selectedMovePeopleCount} אנשים
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.moveMetaPill, moveTargetTableId ? null : styles.moveMetaPillMuted]}>
                    <View style={styles.moveMetaPillIcon}>
                      <Ionicons name="flag-outline" size={15} color={colors.primary} />
                    </View>
                    <View style={styles.moveMetaPillTextWrap}>
                      <Text style={styles.moveMetaPillLabel}>יעד</Text>
                      <Text style={styles.moveMetaPillValue} numberOfLines={1}>
                        {moveTargetTableId
                          ? `שולחן ${String((moveTargetTable as any)?.number ?? moveTargetTable?.number ?? '—')}`
                          : 'לא נבחר'}
                      </Text>
                    </View>
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
              <View style={[styles.modalFilters, styles.moveFiltersCard]}>
                <View style={styles.moveSectionHeader}>
                  <Text style={styles.moveSectionTitle}>בחירת שולחן יעד</Text>
                  <Text style={styles.moveSectionHint}>חפש לפי מספר או שם שולחן ובחר את היעד המתאים להעברה.</Text>
                </View>
                <View style={[styles.searchWrap, styles.moveSearchWrap]}>
                  <View style={styles.searchIconRight}>
                    <Ionicons name="search" size={18} color={colors.gray[500]} />
                  </View>
                  <TextInput
                    value={moveTableSearch}
                    onChangeText={setMoveTableSearch}
                    placeholder="חיפוש שולחן יעד לפי מספר / שם..."
                    placeholderTextColor={colors.gray[500]}
                    style={[styles.searchInput, styles.moveSearchInput]}
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
                      <View style={styles.moveListIntro}>
                        <Text style={styles.moveListIntroTitle}>שולחנות זמינים להעברה</Text>
                        <Text style={styles.moveListIntroHint}>
                          בחר שולחן אחד כדי להעביר אליו {selectedGuestIdsToRemove.size} מוזמנים שסימנת.
                        </Text>
                      </View>
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
                              <View style={styles.moveTableTitleWrap}>
                                <Text style={styles.moveTableTitle} numberOfLines={1}>{getTableDisplayTitle(t)}</Text>
                                <Text style={styles.moveTableSub} numberOfLines={1}>
                                  קיבולת {cap || '—'} · כרגע {seated} · אחרי {after}
                                </Text>
                              </View>
                              <View style={[styles.moveRadio, active ? styles.moveRadioActive : null]}>
                                {active ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
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
              <View style={styles.moveFooterSummary}>
                <Text style={styles.moveFooterSummaryTitle}>
                  {moveTargetTableId ? 'מוכן לביצוע ההעברה' : 'בחר שולחן יעד כדי להמשיך'}
                </Text>
                <Text style={styles.moveFooterSummarySubtitle}>
                  {moveTargetTableId
                    ? `${selectedGuestIdsToRemove.size} מוזמנים יעברו לשולחן ${String((moveTargetTable as any)?.number ?? moveTargetTable?.number ?? '—')}`
                    : `העברה של ${selectedGuestIdsToRemove.size} מוזמנים תתאפשר מיד לאחר בחירת שולחן יעד`}
                </Text>
              </View>

              <View style={styles.moveFooterButtons}>
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
              </View>
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

function getGuestStatusMeta(status?: string | null): { label: string; tone: 'primary' | 'success' | 'warning' | 'danger' } {
  const label = String(status || '').trim() || 'ללא סטטוס';
  if (label === 'מגיע') return { label, tone: 'success' };
  if (label === 'ממתין') return { label, tone: 'warning' };
  if (label === 'לא מגיע') return { label, tone: 'danger' };
  return { label, tone: 'primary' };
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

function EmptyTableGuestsState({
  capacity,
  remaining,
  onAddPress,
}: {
  capacity: number;
  remaining: number;
  onAddPress: () => void;
}) {
  return (
    <View style={styles.emptyTableBox}>
      <View style={styles.emptyTableIconWrap}>
        <Ionicons name="wine-outline" size={28} color={colors.primary} />
      </View>
      <View style={styles.emptyTableTextWrap}>
        <Text style={styles.emptyTableEyebrow}>השולחן מוכן לאירוח</Text>
        <Text style={styles.emptyTitle}>עדיין אין מוזמנים בשולחן הזה</Text>
        <Text style={styles.emptySubtitle}>
          אפשר להתחיל למלא אותו בכמה לחיצות בודדות ולהושיב כאן את האורחים הראשונים.
        </Text>
      </View>
      <View style={styles.emptyTableStatsRow}>
        <View style={styles.emptyTableStatChip}>
          <Ionicons name="people-outline" size={15} color={colors.gray[700]} />
          <Text style={styles.emptyTableStatText}>כרגע יושבים כאן 0</Text>
        </View>
        {capacity > 0 ? (
          <View style={styles.emptyTableStatChip}>
            <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
            <Text style={styles.emptyTableStatText}>{remaining} מקומות פנויים להושבה</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="הוסף מוזמנים לשולחן"
        onPress={onAddPress}
        style={({ hovered, pressed }: any) => [
          styles.primaryBtn,
          styles.emptyTableActionBtn,
          Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
          pressed ? styles.btnPressed : null,
        ]}
      >
        <Ionicons name="add" size={18} color={colors.white} />
        <Text style={styles.primaryBtnText}>הוסף מוזמנים לשולחן</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.gray[50],
    direction: 'rtl',
  },
  pageAdmin: {
    backgroundColor: '#E8F1FF',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
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
  containerAdmin: {
    paddingTop: 24,
    ...(Platform.OS === 'web' ? ({ alignSelf: 'stretch', direction: 'rtl' } as any) : null),
  },
  adminHeroShell: {
    width: '100%',
  },
  adminHeaderMetaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  adminHeaderMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  adminHeaderStatChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  adminHeaderStatValue: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  adminHeaderStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  adminHeaderActionBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    backgroundColor: 'rgba(15,69,230,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  adminHeaderActionBtnHover: {
    backgroundColor: 'rgba(15,69,230,0.12)',
  },
  adminHeaderActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  adminHeaderSelectionBadge: {
    maxWidth: 260,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.10)',
    backgroundColor: 'rgba(15,69,230,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  adminHeaderSelectionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  adminBackBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(11,28,65,0.04)',
        } as any)
      : null),
  },
  adminBackBtnHover: {
    backgroundColor: '#F8FAFD',
    borderColor: 'rgba(15,69,230,0.14)',
  },
  adminBackBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
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

  pageTopBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 24px rgba(16,24,40,0.06)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  backBtnHover: {
    backgroundColor: colors.gray[50],
    borderColor: 'rgba(6,23,62,0.18)',
  },

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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    padding: 16,
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(16,24,40,0.04), 0 22px 44px rgba(16,24,40,0.08)',
  },
  cardAdmin: {
    borderColor: 'rgba(6,23,62,0.06)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 24px rgba(11,28,65,0.04)',
        } as any)
      : null),
  },
  adminSectionHeader: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  adminSectionHeaderText: {
    alignItems: 'stretch',
    gap: 4,
  },
  adminSectionEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  adminSectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  adminSectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
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
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    paddingRight: 40,
    paddingLeft: 12,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  searchInputAdmin: {
    backgroundColor: '#f7f9fc',
    borderColor: 'rgba(15,23,42,0.08)',
  },

  chipsRow: {
    marginTop: 12,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
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
  tableListAdmin: { backgroundColor: '#FBFCFF', borderColor: 'rgba(15,69,230,0.08)' },
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
  tableRowAdmin: {
    borderColor: 'rgba(15,23,42,0.06)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 20px rgba(15,23,42,0.04)',
        } as any)
      : null),
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

  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(248,250,252,0.82)',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  detailHeaderAdmin: {
    backgroundColor: '#F8FAFD',
    borderColor: 'rgba(15,69,230,0.08)',
  },
  detailTitleWrap: { flex: 1, minWidth: 280, alignItems: 'stretch', gap: 10 },
  detailTitle: {
    width: '100%',
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  detailStatsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
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

  detailBody: { marginTop: 16, gap: 16 },

  guestsSection: {
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(248,250,252,0.74)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
  },
  guestsSectionAdmin: {
    backgroundColor: '#F8FAFD',
    borderColor: 'rgba(15,69,230,0.08)',
  },
  guestsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 14,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestsSectionTitleWrap: { flex: 1, minWidth: 220, alignItems: 'stretch', gap: 4 },
  guestsSectionTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestsSectionSubtitle: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  guestsSectionCountPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  guestsSectionCountText: { fontSize: 11, fontWeight: '900', color: colors.primary, textAlign: 'right', writingDirection: 'rtl' },

  guestsGrid: {
    // In RTL, a plain 'row' starts at the physical right edge.
    // Using 'row-reverse' together with `direction: 'rtl'` can flip the start edge back to the left on web.
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'stretch',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestCard: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 48,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    gap: 10,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 12px 28px rgba(15,23,42,0.07)',
    ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null),
  },
  guestCardEditable: { ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  guestCardHover: {
    borderColor: 'rgba(6,23,62,0.16)',
    backgroundColor: colors.white,
    transform: [{ translateY: -2 }],
    boxShadow: '0 18px 42px rgba(16,24,40,0.12)',
  },
  guestCardSelected: {
    borderColor: 'rgba(6,23,62,0.28)',
    backgroundColor: 'rgba(239,246,255,0.95)',
    boxShadow: '0 18px 42px rgba(37,99,235,0.14)',
  },
  guestCardAccent: { position: 'absolute', top: 0, right: 0, left: 0, height: 4 },
  guestCardBody: { gap: 12 },
  guestCardTitleWrap: { gap: 4, alignItems: 'stretch' },
  guestName: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestMeta: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  guestCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '62%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestStatusDot: { width: 6, height: 6, borderRadius: 999 },
  guestStatusText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
  guestInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(248,250,252,0.92)',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestInfoPillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'nowrap',
  },
  editBarText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },

  emptyBox: { padding: 20, alignItems: 'flex-end', justifyContent: 'center', gap: 10 },
  emptyTableBox: {
    display: 'grid' as any,
    padding: 24,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    boxShadow: '0 18px 44px rgba(15,23,42,0.08)',
  },
  emptyTableIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,99,235,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.14)',
  },
  emptyTableTextWrap: { alignItems: 'stretch', gap: 6 },
  emptyTableEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  emptyTableStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 8,
  },
  emptyTableStatChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(248,250,252,0.98)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  emptyTableStatText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  emptyTableActionBtn: { alignSelf: 'flex-end', paddingHorizontal: 18 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    maxWidth: 560,
    alignSelf: 'stretch',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },

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
    backgroundColor: 'rgba(2,6,23,0.42)',
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
    flexShrink: 1,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  addModalCard: {
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
  addModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    backgroundColor: 'rgba(248,250,252,0.96)',
  },
  addModalHeaderMain: { flex: 1, minWidth: 0, gap: 12, alignItems: 'flex-end' },
  addModalHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    alignSelf: 'stretch',
  },
  addModalHeaderTextWrap: { flex: 1, minWidth: 0, justifyContent: 'center', alignItems: 'flex-start', gap: 4 },
  addModalMetaRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    alignSelf: 'stretch',
  },
  addModalMetaPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  addModalMetaPillWarning: {
    backgroundColor: 'rgba(255,241,242,0.92)',
    borderColor: 'rgba(244,63,94,0.20)',
  },
  addModalMetaText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  addModalMetaTextWarning: { color: '#9F1239' },
  modalTitleWrap: { flex: 1, minWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', gap: 4 },
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

  modalBody: { padding: 16, gap: 12, flexShrink: 1 },
  modalFilters: { gap: 10 },
  addModalFiltersCard: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(248,250,252,0.78)',
    gap: 12,
  },
  addModalFiltersHeader: { gap: 4, alignItems: 'flex-end' },
  addModalFiltersTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  addModalFiltersHint: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  editPeopleModalCard: {
    borderRadius: 26,
    boxShadow: '0 24px 64px rgba(15,23,42,0.16)',
  },
  editPeopleModalHeader: {
    flexDirection: 'row',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },

  editPeopleField: { gap: 8 },
  editPeopleTitle: { alignSelf: 'stretch', width: '100%', textAlign: 'right', writingDirection: 'rtl' },
  editPeopleSubtitle: { alignSelf: 'stretch', width: '100%', textAlign: 'right', writingDirection: 'rtl' },
  editPeopleField: { gap: 10, alignItems: 'flex-end' },
  editPeopleHero: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(248,250,252,0.82)',
    gap: 12,
  },
  editPeopleHeroTitleWrap: { gap: 4, alignItems: 'flex-end' },
  editPeopleHeroTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  editPeopleHeroText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  editPeopleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  editPeopleMetaPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  editPeopleMetaPillText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  editPeopleStatusPill: {
    backgroundColor: 'rgba(6,23,62,0.06)',
  },
  editPeopleStatusDot: { width: 6, height: 6, borderRadius: 999 },
  editPeopleFieldCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    boxShadow: '0 12px 28px rgba(15,23,42,0.05)',
  },
  editPeopleLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    width: '100%',
  },
  editPeopleHint: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    width: '100%',
  },
  editPeopleInput: {
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    alignSelf: 'stretch',
    width: '100%',
    boxShadow: '0 1px 0 rgba(255,255,255,0.7), inset 0 1px 2px rgba(15,23,42,0.03)',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  editPeopleFooter: {
    paddingTop: 12,
    marginTop: 4,
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

  modalList: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(248,250,252,0.78)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
  },
  modalListScrollContent: {
    paddingBottom: 56,
  },
  modalGrid: { padding: 14, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  modalEmpty: { padding: 20, alignItems: 'flex-end', justifyContent: 'center', gap: 10 },
  modalGuestCard: {
    width: '48%',
    minWidth: 260,
    flexGrow: 1,
    padding: 14,
    // Reserve space for pinned controls (checkbox + people badge)
    paddingTop: 48,
    paddingBottom: 46,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    position: 'relative',
    boxShadow: '0 12px 30px rgba(15,23,42,0.06)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalGuestCardHover: {
    borderColor: 'rgba(37,99,235,0.22)',
    transform: [{ translateY: -2 }],
    boxShadow: '0 18px 40px rgba(16,24,40,0.12)',
  },
  modalGuestCardSelected: {
    borderColor: 'rgba(37,99,235,0.28)',
    backgroundColor: 'rgba(239,246,255,0.98)',
    boxShadow: '0 18px 38px rgba(37,99,235,0.14)',
  },
  modalGuestTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modalGuestNameWrap: { flex: 1, minWidth: 0, justifyContent: 'center', alignItems: 'flex-start', gap: 4 },
  modalGuestName: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  modalGuestMeta: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl', lineHeight: 18 },
  modalGuestBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  modalGuestBadgeText: {
    marginLeft: 4,
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modalGuestStatus: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '60%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  modalGuestStatusDot: { width: 6, height: 6, borderRadius: 999 },
  modalGuestStatusText: {
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modalGuestCheckAbs: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 18px rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalGuestCheckAbsHover: { backgroundColor: colors.gray[50], borderColor: 'rgba(6,23,62,0.18)' },
  modalGuestCheckAbsChecked: { backgroundColor: colors.primary, borderColor: colors.primary },

  modalActions: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  addModalActions: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: 'rgba(248,250,252,0.92)',
  },
  addModalActionsSummary: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  addModalActionsTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  addModalActionsSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  // Move modal polish
  moveHeader: {
    backgroundColor: 'rgba(248,250,252,0.95)',
    flexDirection: 'row',
  },
  moveHeaderContent: {
    flex: 1,
    minWidth: 0,
    gap: 12,
    alignItems: 'flex-end',
  },
  moveHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    width: '100%',
  },
  moveHeaderTextWrap: { flex: 1, minWidth: 0, alignItems: 'flex-start', justifyContent: 'center' },
  moveMetaRow: {
    marginTop: 6,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
  },
  moveMetaPill: {
    minWidth: 148,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
  },
  moveMetaPillMuted: { opacity: 0.75 },
  moveMetaPillIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,246,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.10)',
  },
  moveMetaPillTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  moveMetaPillLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  moveMetaPillValue: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
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
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  moveFiltersCard: {
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(248,250,252,0.86)',
    boxShadow: '0 12px 28px rgba(15,23,42,0.04)',
  },
  moveSectionHeader: {
    gap: 4,
    alignItems: 'flex-end',
  },
  moveSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  moveSectionHint: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  moveSearchWrap: {
    marginTop: 0,
  },
  moveSearchInput: {
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },

  moveList: {
    padding: 10,
    gap: 10,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  moveListIntro: {
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 2,
    alignItems: 'flex-end',
  },
  moveListIntroTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  moveListIntroHint: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
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
  // Use `row` + `direction: rtl` to avoid row-reverse + direction interactions.
  moveTableTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  moveTableTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
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
    right: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.22)',
  },
  moveProgressFillAfter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.75)',
  },
  moveProgressFillWarn: { backgroundColor: 'rgba(245,158,11,0.85)' },
  // Use `row` + `direction: rtl` so the pill sequence starts from the right on web.
  movePillsRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
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
  moveFooterSummary: {
    flex: 1,
    minWidth: 220,
    gap: 2,
    alignItems: 'flex-end',
  },
  moveFooterSummaryTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  moveFooterSummarySubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  moveFooterButtons: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    flexWrap: 'wrap',
  },
});

