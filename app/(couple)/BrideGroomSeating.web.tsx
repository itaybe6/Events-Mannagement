import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useUserStore } from '@/store/userStore';

import { SeatingGridReadonly } from '../seating/web/SeatingGridReadonly';
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type Orientation, type TableType } from '../seating/web/_types';
import type { Table } from '@/types';

type GuestRow = {
  id: string;
  name: string;
  status: 'מגיע' | 'לא מגיע' | 'ממתין';
  table_id: string | null;
  category_id?: string | null;
  numberOfPeople?: number;
  // denormalized helpers (built client-side)
  guest_categories?: { name: string } | null;
  tables?: { number?: number } | null;
};

type QuickSeatFilterKey = 'seated' | 'unseated';
type QuickStatusFilterKey = 'all' | 'arriving' | 'not_arriving' | 'pending';

type WebSketch = {
  gridCols: number;
  gridRows: number;
  tables: Array<{
    id: string;
    type: TableType;
    seats: number;
    orientation: Orientation;
    gridX: number;
    gridY: number;
    number?: number;
  }>;
  zones: Array<{
    id: string;
    name: string;
    gridX: number;
    gridY: number;
    widthCells: number;
    heightCells: number;
  }>;
  labels: Array<{
    id: string;
    text: string;
    gridX: number;
    gridY: number;
  }>;
};

function withAlpha(hex: string, alpha: number) {
  const raw = String(hex || '').trim().replace('#', '');
  const a = Math.max(0, Math.min(1, alpha));
  if (raw.length !== 6) return `rgba(0,0,0,${a})`;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}

function getWebV2FromAnnotations(annotations: any) {
  if (!annotations) return null;
  if (Array.isArray(annotations)) {
    const found = annotations.find((x) => x && typeof x === 'object' && x.type === 'web_v2' && x.version === 2);
    return found ?? null;
  }
  if (typeof annotations === 'object') {
    const w = (annotations as any).web_v2;
    return w && typeof w === 'object' ? w : null;
  }
  return null;
}

function toArrayMaybe(value: any) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function tableTypeFromShape(shape: any): TableType {
  if (shape === 'reserve') return 'reserve';
  if (shape === 'rectangle') return 'knight';
  return 'regular';
}

type StatButtonProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: number | string;
  label: string;
  accentColor: string;
  onPress: () => void;
};

function StatButton({ icon, value, label, accentColor, onPress }: StatButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ hovered, pressed, focused }: any) => {
        const border = Platform.OS === 'web' && (hovered || focused) ? withAlpha(accentColor, 0.38) : 'rgba(15,23,42,0.10)';
        const bg = pressed ? colors.gray[50] : colors.white;
        const webFx: any =
          Platform.OS === 'web'
            ? {
                cursor: 'pointer',
                userSelect: 'none',
                outlineStyle: 'none',
                overflow: 'hidden',
                transitionProperty: 'transform, box-shadow, border-color, background-color',
                transitionDuration: '180ms',
                transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
                transform: [{ translateY: hovered && !pressed ? -2 : 0 }, { scale: pressed ? 0.985 : 1 }],
                boxShadow: focused
                  ? `0 0 0 4px ${withAlpha(accentColor, 0.18)}, 0 14px 34px ${withAlpha('#000000', 0.12)}`
                  : hovered && !pressed
                    ? `0 14px 34px ${withAlpha('#000000', 0.12)}`
                    : `0 8px 22px ${withAlpha('#000000', 0.08)}`,
              }
            : null;
        return [styles.statBtn, { borderColor: border, backgroundColor: bg }, webFx];
      }}
    >
      {({ pressed, hovered, focused }: any) => (
        <>
          {Platform.OS === 'web' ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.statShineBlob,
                  {
                    top: -34,
                    left: -34,
                    backgroundColor: withAlpha(accentColor, focused ? 0.16 : hovered ? 0.14 : 0.10),
                    opacity: pressed ? 0.55 : 1,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.statShineBlob,
                  {
                    bottom: -40,
                    right: -40,
                    backgroundColor: withAlpha(accentColor, focused ? 0.12 : hovered ? 0.10 : 0.08),
                    opacity: pressed ? 0.5 : 1,
                  },
                ]}
              />
            </>
          ) : null}

          <View
            style={[
              styles.statIconWrap,
              {
                backgroundColor: withAlpha(accentColor, pressed ? 0.06 : 0.08),
                borderColor: withAlpha(accentColor, hovered || focused ? 0.26 : 0.18),
              },
            ]}
          >
            <Ionicons name={icon} size={22} color={accentColor} />
          </View>
          <Text style={styles.statValue}>{value}</Text>
          <Text style={styles.statLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export default function BrideGroomSeatingWebScreen() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { userData, isLoggedIn } = useUserStore();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);

  const { setTabBarVisible } = useLayoutStore();

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const handleSelectEventId = (nextEventId: string) => {
    if (userData?.id) setActiveEvent(userData.id, nextEventId);
    router.replace({ pathname: '/(couple)/BrideGroomSeating', params: { eventId: nextEventId } });
  };

  const isNarrow = windowWidth < 980;
  const leftColWidth = useMemo(() => {
    // Side column (Guests + Tables). Keep it a bit narrower.
    if (windowWidth < 1100) return 260;
    if (windowWidth < 1400) return 300;
    return 330;
  }, [windowWidth]);

  const mapCardHeight = useMemo(() => {
    // Fill most of the viewport height on desktop so the side panel + map
    // feel "full height" (not cut short).
    if (isNarrow) {
      // On narrow layouts we keep it reasonable to avoid huge vertical scroll.
      return Math.round(Math.min(680, Math.max(460, windowHeight * 0.62)));
    }
    // Approximate available viewport space after the stats row + paddings.
    const approxTopUi = 220;
    const available = windowHeight - approxTopUi;
    return Math.round(Math.min(900, Math.max(620, available)));
  }, [isNarrow, windowHeight]);

  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState<Table[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [webSketch, setWebSketch] = useState<WebSketch | null>(null);

  // Stats modal (lists guests by category)
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestModalTitle, setGuestModalTitle] = useState('');
  const [guestModalSections, setGuestModalSections] = useState<Array<{ id: string; title: string; data: GuestRow[] }>>([]);
  const [guestModalSearch, setGuestModalSearch] = useState('');
  const [guestModalCategory, setGuestModalCategory] = useState<string>('הכל');
  const [guestModalCategories, setGuestModalCategories] = useState<string[]>([]);

  // Table modal
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [selectedTableForModal, setSelectedTableForModal] = useState<Table | null>(null);
  const [tableModalView, setTableModalView] = useState<'seated' | 'add'>('seated');
  const [tableName, setTableName] = useState('');
  const [seatedGuestsForTable, setSeatedGuestsForTable] = useState<GuestRow[]>([]);
  const [selectedGuestsToAdd, setSelectedGuestsToAdd] = useState<Set<string>>(new Set());
  const [searchQueryTable, setSearchQueryTable] = useState('');
  const [categoryFilterTable, setCategoryFilterTable] = useState('הכל');
  const [categoriesForTable, setCategoriesForTable] = useState<string[]>([]);

  const [tableListSearch, setTableListSearch] = useState('');
  const [quickAddSelectedGuestIds, setQuickAddSelectedGuestIds] = useState<Set<string>>(new Set());
  const [quickAddGuestSearch, setQuickAddGuestSearch] = useState<string>('');
  const [quickSeatFilter, setQuickSeatFilter] = useState<QuickSeatFilterKey>('unseated');
  const [quickStatusFilter, setQuickStatusFilter] = useState<QuickStatusFilterKey>('all');
  const [sidePanelTab, setSidePanelTab] = useState<'guests' | 'tables'>('guests');
  const [seatConfirmOpen, setSeatConfirmOpen] = useState(false);
  const [seatConfirmTable, setSeatConfirmTable] = useState<Table | null>(null);

  // Guest edit modal (edit people count + move table if seated)
  const suppressQuickSelectRef = useRef(false);
  const [guestEditOpen, setGuestEditOpen] = useState(false);
  const [guestEditGuest, setGuestEditGuest] = useState<GuestRow | null>(null);
  const [guestEditPeople, setGuestEditPeople] = useState('');
  const [guestEditTableId, setGuestEditTableId] = useState<string | null>(null);
  const [guestEditTableSearch, setGuestEditTableSearch] = useState('');

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (userData?.id && resolvedEventId) setActiveEvent(userData.id, resolvedEventId);
  }, [resolvedEventId, setActiveEvent, userData?.id]);

  const fetchTables = useCallback(async () => {
    if (!resolvedEventId) return;
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('event_id', resolvedEventId)
      .order('number');
    if (!error) setTables((data as any) || []);
  }, [resolvedEventId]);

  const fetchGuests = useCallback(async () => {
    if (!resolvedEventId) return;
    try {
      const [
        { data: guestsData, error: guestsError },
        { data: categoriesData, error: categoriesError },
        { data: tablesData, error: tablesError },
      ] = await Promise.all([
        supabase.from('guests').select('*').eq('event_id', resolvedEventId),
        supabase.from('guest_categories').select('id,name').eq('event_id', resolvedEventId),
        supabase.from('tables').select('id,number').eq('event_id', resolvedEventId),
      ]);

      if (guestsError) throw guestsError;
      if (categoriesError) throw categoriesError;
      if (tablesError) throw tablesError;

      const categoryNameById = new Map<string, string>((categoriesData || []).map((c: any) => [String(c.id), String(c.name)]));
      const tableNumberById = new Map<string, number>(
        (tablesData || []).map((t: any) => [String(t.id), typeof t.number === 'number' ? t.number : Number(t.number)])
      );

      const mappedGuests = (guestsData || []).map((guest: any) => {
        const numberOfPeople = Number(guest.number_of_people ?? guest.numberOfPeople ?? guest.numberOfPeople ?? 1) || 1;
        const categoryName = guest.category_id ? categoryNameById.get(String(guest.category_id)) : undefined;
        const tableNumber = guest.table_id ? tableNumberById.get(String(guest.table_id)) : undefined;
        return {
          ...guest,
          table_id: guest.table_id ?? null,
          numberOfPeople,
          guest_categories: categoryName ? { name: categoryName } : null,
          tables: guest.table_id ? { number: tableNumber } : null,
        } as GuestRow;
      });
      setGuests(mappedGuests);
    } catch (e) {
      console.error('Fetch guests error:', e);
      setGuests([]);
    }
  }, [resolvedEventId]);

  const buildSketchFromCurrentTables = useCallback(
    (currentTables: Table[]): WebSketch | null => {
      const placed = (currentTables || [])
        .filter(Boolean)
        .filter((t) => typeof t.x === 'number' && typeof t.y === 'number')
        .map((t) => {
          const type = tableTypeFromShape((t as any).shape);
          const seats = Number((t as any).capacity ?? 12) || (type === 'knight' ? 20 : 12);
          return {
            id: `table-live-${String(t.id)}`,
            type,
            seats,
            orientation: 'row' as Orientation,
            gridX: Math.round((Number(t.x) || 0) / 40),
            gridY: Math.round((Number(t.y) || 0) / 40),
            number: typeof (t as any).number === 'number' ? (t as any).number : Number((t as any).number) || undefined,
            name: String((t as any)?.name ?? '').trim() || null,
          };
        });

      if (!placed.length) return null;
      const maxX = placed.reduce((m, t) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w), 0);
      const maxY = placed.reduce((m, t) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h), 0);
      return {
        gridCols: Math.max(DEFAULT_GRID_COLS, maxX + 10),
        gridRows: Math.max(DEFAULT_GRID_ROWS, maxY + 10),
        tables: placed,
        zones: [],
        labels: [],
      };
    },
    []
  );

  const fetchWebSketch = useCallback(async () => {
    if (!resolvedEventId) return;

    try {
      const { data, error } = await supabase
        .from('seating_maps')
        .select('annotations,tables')
        .eq('event_id', resolvedEventId)
        .maybeSingle();

      const annotations = (data as any)?.annotations;
      void error;

      const webV2 = getWebV2FromAnnotations(annotations);
      const webV2Cols = webV2 && typeof webV2?.grid?.cols === 'number' ? Math.round(webV2.grid.cols) : DEFAULT_GRID_COLS;
      const webV2Rows = webV2 && typeof webV2?.grid?.rows === 'number' ? Math.round(webV2.grid.rows) : DEFAULT_GRID_ROWS;
      const webV2Zones = webV2 ? toArrayMaybe(webV2.zones ?? webV2?.state?.zones ?? webV2?.data?.zones) : [];
      const webV2Labels = webV2 ? toArrayMaybe(webV2.labels ?? webV2?.state?.labels ?? webV2?.data?.labels) : [];
      const webV2Tables = webV2 ? toArrayMaybe(webV2.tables ?? webV2?.state?.tables ?? webV2?.data?.tables) : [];

      let finalCols = webV2Cols;
      let finalRows = webV2Rows;
      let finalTables: any[] = webV2Tables;
      let finalZones: any[] = webV2Zones;
      let finalLabels: any[] = webV2Labels;

      // If web_v2 didn't include tables, try legacy seating_maps.tables first.
      if (!finalTables.length) {
        const legacy = Array.isArray((data as any)?.tables) ? ((data as any).tables as any[]) : null;
        if (legacy?.length) {
          const mapped = legacy
            .filter(Boolean)
            .map((t: any, idx: number) => {
              const type: TableType = t.isReserve ? 'reserve' : t.isKnight ? 'knight' : 'regular';
              const num = typeof t.id === 'number' ? t.id : idx + 1;
              const gridX = Math.round((Number(t.x) || 0) / 40);
              const gridY = Math.round((Number(t.y) || 0) / 40);
              return {
                id: `table-legacy-${num}`,
                type,
                seats: Number(t.seats) || (type === 'knight' ? 20 : 12),
                orientation: 'row' as Orientation,
                gridX,
                gridY,
                number: num,
                name: String(t?.name ?? '').trim() || null,
              };
            });
          const maxX = mapped.reduce(
            (m: number, t: any) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w),
            0
          );
          const maxY = mapped.reduce(
            (m: number, t: any) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h),
            0
          );
          finalCols = Math.max(finalCols, DEFAULT_GRID_COLS, maxX + 6);
          finalRows = Math.max(finalRows, DEFAULT_GRID_ROWS, maxY + 6);
          finalTables = mapped;
        }
      }

      // Last fallback: query public tables directly.
      if (!finalTables.length) {
        const { data: publicTables, error: publicTablesError } = await supabase
          .from('tables')
          .select('id,number,name,capacity,shape,x,y')
          .eq('event_id', resolvedEventId);
        if (!publicTablesError && Array.isArray(publicTables) && publicTables.length) {
          const mapped = publicTables.map((t: any) => {
            const type = tableTypeFromShape(t.shape);
            const gridX = Math.round((Number(t.x) || 0) / 40);
            const gridY = Math.round((Number(t.y) || 0) / 40);
            return {
              id: `table-public-${String(t.id)}`,
              type,
              seats: Number(t.capacity) || (type === 'knight' ? 20 : 12),
              orientation: 'row' as Orientation,
              gridX,
              gridY,
              number: typeof t.number === 'number' ? t.number : Number(t.number) || undefined,
              name: String(t?.name ?? '').trim() || null,
            };
          });
          const maxX = mapped.reduce(
            (m: number, t: any) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w),
            0
          );
          const maxY = mapped.reduce(
            (m: number, t: any) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h),
            0
          );
          finalCols = Math.max(finalCols, DEFAULT_GRID_COLS, maxX + 6);
          finalRows = Math.max(finalRows, DEFAULT_GRID_ROWS, maxY + 6);
          finalTables = mapped;
        }
      }

      // Final fallback: build from current tables state (if positions exist)
      if (!finalTables.length) {
        const fromLive = buildSketchFromCurrentTables(tables);
        if (fromLive) {
          setWebSketch(fromLive);
          return;
        }
      }

      if (finalTables.length || finalZones.length || finalLabels.length) {
        setWebSketch({
          gridCols: finalCols,
          gridRows: finalRows,
          tables: finalTables,
          zones: finalZones,
          labels: finalLabels,
        } as any);
        return;
      }

      setWebSketch(null);
    } catch (e) {
      console.error('Fetch web sketch error:', e);
      setWebSketch(null);
    }
  }, [buildSketchFromCurrentTables, resolvedEventId, tables]);

  const loadAll = useCallback(async () => {
    if (!resolvedEventId) return;
    setLoading(true);
    try {
      await Promise.all([fetchTables(), fetchGuests()]);
    } finally {
      setLoading(false);
    }
  }, [fetchGuests, fetchTables, resolvedEventId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // When switching event, reset quick-add selection/context.
  useEffect(() => {
    setQuickAddSelectedGuestIds(new Set());
    setQuickAddGuestSearch('');
  }, [resolvedEventId]);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
      return () => {};
    }, [loadAll])
  );

  // Rebuild webSketch after we have tables (and after seating_maps load).
  useEffect(() => {
    void fetchWebSketch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId, tables.length]);

  const confirmedGuestsList = useMemo(() => guests.filter((g) => g.status === 'מגיע'), [guests]);
  const seatedGuestsList = useMemo(() => confirmedGuestsList.filter((g) => g.table_id), [confirmedGuestsList]);
  const unseatedGuestsList = useMemo(() => confirmedGuestsList.filter((g) => !g.table_id), [confirmedGuestsList]);

  const sumPeople = useCallback((list: GuestRow[]) => list.reduce((sum, g) => sum + (Number(g.numberOfPeople) || 1), 0), []);
  const confirmedGuestsCount = useMemo(() => sumPeople(confirmedGuestsList), [confirmedGuestsList, sumPeople]);
  const seatedGuestsCount = useMemo(() => sumPeople(seatedGuestsList), [seatedGuestsList, sumPeople]);
  const unseatedGuestsCount = useMemo(() => sumPeople(unseatedGuestsList), [unseatedGuestsList, sumPeople]);

  const seatedByNumber = useMemo(() => {
    const numberById = new Map<string, number>((tables || []).filter(Boolean).map((t: any) => [String(t.id), Number(t.number)]));
    const map = new Map<number, number>();
    for (const g of guests || []) {
      const tid = g?.table_id ? String(g.table_id) : null;
      if (!tid) continue;
      const num = numberById.get(tid);
      if (!num) continue;
      const ppl = Number(g?.numberOfPeople ?? 1) || 1;
      map.set(num, (map.get(num) ?? 0) + ppl);
    }
    return map;
  }, [guests, tables]);

  const webSketchWithNames = useMemo(() => {
    if (!webSketch) return null;
    const byNumber = new Map<number, string | null>();
    const byId = new Map<string, string | null>();
    for (const t of tables || []) {
      const name = String((t as any)?.name ?? '').trim() || null;
      const id = String((t as any)?.id ?? '');
      if (id) byId.set(id, name);
      const num = Number((t as any)?.number);
      if (Number.isFinite(num)) byNumber.set(num, name);
    }
    const mergedTables = (webSketch.tables || []).map((t: any) => {
      const existing = String(t?.name ?? '').trim() || null;
      if (existing) return t;
      const num = Number(t?.number);
      const fromNum = Number.isFinite(num) ? (byNumber.get(num) ?? null) : null;
      const rawId = String(t?.id ?? '');
      const stripped =
        rawId.startsWith('table-public-')
          ? rawId.replace('table-public-', '')
          : rawId.startsWith('table-live-')
            ? rawId.replace('table-live-', '')
            : rawId;
      const fromId = byId.get(rawId) ?? byId.get(stripped) ?? null;
      const name = fromNum ?? fromId;
      return name ? { ...t, name } : t;
    });
    return { ...webSketch, tables: mergedTables };
  }, [tables, webSketch]);

  const openGuestModalWithGuests = useCallback((title: string, list: GuestRow[]) => {
    setGuestModalTitle(title);
    setGuestModalSearch('');
    setGuestModalCategory('הכל');
    const categories = ['הכל', ...Array.from(new Set(list.map((g) => g.guest_categories?.name || 'ללא קטגוריה')))];
    setGuestModalCategories(categories);

    const grouped = list.reduce((acc: Record<string, GuestRow[]>, g) => {
      const c = g.guest_categories?.name || 'ללא קטגוריה';
      if (!acc[c]) acc[c] = [];
      acc[c].push(g);
      return acc;
    }, {});
    const sections = Object.keys(grouped).map((c) => ({ id: c, title: c, data: grouped[c] }));
    setGuestModalSections(sections);
    setGuestModalOpen(true);
    setTabBarVisible(false);
  }, [setTabBarVisible]);

  const openTableModal = useCallback(
    (table: Table) => {
      setSelectedTableForModal(table);
      setTableName(table.name || '');
      const seated = guests.filter((g) => g.table_id === table.id);
      setSeatedGuestsForTable(seated);

      setTableModalView('seated');
      setSearchQueryTable('');
      const unseated = guests.filter((g) => g.status === 'מגיע' && !g.table_id);
      const cats = ['הכל', ...Array.from(new Set(unseated.map((g) => g.guest_categories?.name || 'ללא קטגוריה')))];
      setCategoriesForTable(cats);
      setCategoryFilterTable('הכל');
      setSelectedGuestsToAdd(new Set());

      setTableModalOpen(true);
      setTabBarVisible(false);
    },
    [guests, setTabBarVisible]
  );

  const selectedGuestsForQuickAdd = useMemo(() => {
    const ids = quickAddSelectedGuestIds;
    if (!ids.size) return [];
    return (guests || []).filter((g: any) => ids.has(String(g?.id)));
  }, [guests, quickAddSelectedGuestIds]);

  const quickAddSections = useMemo(() => {
    const q = quickAddGuestSearch.trim().toLowerCase();
    const rows = (guests || [])
      .filter(Boolean)
      .filter((g: any) => (q ? String(g.name || '').toLowerCase().includes(q) : true))
      .filter((g: any) => {
        const status = String(g?.status || '').trim();
        const seated = Boolean(String(g?.table_id || '').trim());
        // Seat filter (toggle)
        if (quickSeatFilter === 'seated' && !seated) return false;
        if (quickSeatFilter === 'unseated' && seated) return false;
        // Status filter (tags)
        if (quickStatusFilter === 'all') return true;
        if (quickStatusFilter === 'arriving') return status === 'מגיע';
        if (quickStatusFilter === 'not_arriving') return status === 'לא מגיע';
        if (quickStatusFilter === 'pending') return status === 'ממתין';
        return true;
      });

    const grouped = rows.reduce((acc: Record<string, any[]>, g: any) => {
      const cat = String(g?.guest_categories?.name || 'ללא קטגוריה');
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(g);
      return acc;
    }, {});

    const sections = Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b, 'he'))
      .map((title) => {
        const data = grouped[title] || [];
        // Sort: available-to-add first, then by name.
        data.sort((a: any, b: any) => {
          const aAvail = a?.status === 'מגיע' && !a?.table_id ? 0 : 1;
          const bAvail = b?.status === 'מגיע' && !b?.table_id ? 0 : 1;
          if (aAvail !== bAvail) return aAvail - bAvail;
          return String(a?.name || '').localeCompare(String(b?.name || ''), 'he');
        });
        return { id: title, title, data };
      });

    return sections;
  }, [guests, quickAddGuestSearch, quickSeatFilter, quickStatusFilter]);

  const toggleQuickAddGuest = useCallback((guestId: string) => {
    setQuickAddSelectedGuestIds((prev) => {
      const next = new Set(prev);
      const id = String(guestId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openSeatConfirm = useCallback(
    (table: Table) => {
      setSeatConfirmTable(table);
      setSeatConfirmOpen(true);
      setTabBarVisible(false);
    },
    [setTabBarVisible]
  );

  const closeSeatConfirm = useCallback(() => {
    setSeatConfirmOpen(false);
    setSeatConfirmTable(null);
    setTabBarVisible(true);
  }, [setTabBarVisible]);

  const openGuestEdit = useCallback(
    (g: GuestRow) => {
      setGuestEditGuest(g);
      setGuestEditPeople(String(Number(g.numberOfPeople ?? 1) || 1));
      setGuestEditTableId(g.table_id ? String(g.table_id) : null);
      setGuestEditTableSearch('');
      setGuestEditOpen(true);
      setTabBarVisible(false);
    },
    [setTabBarVisible]
  );

  const closeGuestEdit = useCallback(() => {
    setGuestEditOpen(false);
    setGuestEditGuest(null);
    setGuestEditPeople('');
    setGuestEditTableId(null);
    setGuestEditTableSearch('');
    setTabBarVisible(true);
  }, [setTabBarVisible]);

  const saveGuestEdit = useCallback(async () => {
    const g = guestEditGuest;
    if (!g) return;

    const parsed = Number.parseInt(String(guestEditPeople || '').trim(), 10);
    const nextPeople = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    if (!nextPeople) {
      Alert.alert('שגיאה', 'כמות אנשים חייבת להיות מספר גדול מ-0.');
      return;
    }

    const prevTableId = g.table_id ? String(g.table_id) : null;
    const canMove = Boolean(prevTableId);
    const nextTableId = canMove ? (guestEditTableId ? String(guestEditTableId) : prevTableId) : null;

    try {
      const { error } = await supabase
        .from('guests')
        .update({ number_of_people: nextPeople, ...(canMove ? { table_id: nextTableId } : {}) })
        .eq('id', String(g.id));
      if (error) throw error;

      // Update seated_guests for affected tables (legacy field).
      const nextGuests = (guests || []).map((row) =>
        String(row.id) === String(g.id)
          ? ({
              ...row,
              numberOfPeople: nextPeople,
              table_id: canMove ? nextTableId : row.table_id,
            } as any)
          : row
      );
      const affected = Array.from(new Set([prevTableId, canMove ? nextTableId : prevTableId].filter(Boolean) as string[]));
      await Promise.all(
        affected.map(async (tid) => {
          const total = nextGuests
            .filter((x: any) => String(x.table_id || '') === String(tid))
            .reduce((sum: number, x: any) => sum + (Number(x.numberOfPeople) || 1), 0);
          const { error: tErr } = await supabase.from('tables').update({ seated_guests: total }).eq('id', tid);
          if (tErr) {
            // non-fatal
            console.warn('Update table seated_guests failed:', tErr);
          }
        })
      );

      await Promise.all([fetchGuests(), fetchTables()]);
      closeGuestEdit();
    } catch (e) {
      console.error('Save guest edit error:', e);
      Alert.alert('שגיאה', 'לא ניתן לעדכן את המוזמן.');
    }
  }, [closeGuestEdit, fetchGuests, fetchTables, guestEditGuest, guestEditPeople, guestEditTableId, guests]);

  const moveTablesForEdit = useMemo(() => {
    const g = guestEditGuest;
    if (!g?.table_id) return [];
    const q = guestEditTableSearch.trim().toLowerCase();
    return (tables || [])
      .filter(Boolean)
      .filter((t: any) => {
        if (!q) return true;
        const num = String((t as any).number ?? '');
        const name = String((t as any).name ?? '').toLowerCase();
        return num.includes(q) || name.includes(q);
      })
      .sort((a: any, b: any) => Number(a.number || 0) - Number(b.number || 0));
  }, [guestEditGuest, guestEditTableSearch, tables]);

  const confirmSeatSelectedGuests = useCallback(async () => {
    const tableId = seatConfirmTable?.id;
    if (!tableId) return;

    const rawIds = Array.from(quickAddSelectedGuestIds).map(String);
    if (!rawIds.length) {
      closeSeatConfirm();
      return;
    }

    const isSeatableGuest = (g: any) => {
      if (!g) return false;
      if (g.table_id) return false; // already seated
      const status = String(g.status || '').trim();
      // Be tolerant: allow seating when status is missing/unknown, but block explicit "not coming".
      if (status === 'לא מגיע') return false;
      return true;
    };

    // Only seat guests that are currently eligible (not already seated, and not explicitly declined).
    const byId = new Map<string, any>((guests || []).map((g: any) => [String(g?.id), g]));
    const eligibleIds = rawIds.filter((id) => {
      const g = byId.get(id);
      return isSeatableGuest(g);
    });

    if (!eligibleIds.length) {
      Alert.alert('שים לב', 'אין מוזמנים זמינים להושבה (אולי כבר הושבו או סומנו כ"לא מגיע").');
      setQuickAddSelectedGuestIds(new Set());
      closeSeatConfirm();
      return;
    }

    try {
      const guestsToAdd = eligibleIds.map((id) => byId.get(id)).filter(Boolean);
      const totalPeopleToAdd = guestsToAdd.reduce((sum: number, g: any) => sum + (Number(g.numberOfPeople) || 1), 0);

      const { error: guestUpdateError } = await supabase.from('guests').update({ table_id: tableId }).in('id', eligibleIds);
      if (guestUpdateError) {
        console.error('Seat guests error:', guestUpdateError);
        Alert.alert('שגיאה', 'לא ניתן להושיב את המוזמנים בשולחן.');
        return;
      }

      // Update seated_guests (best-effort)
      const currentGuestsAtTable = (guests || []).filter((g: any) => String(g.table_id) === String(tableId));
      const currentTotalPeople = currentGuestsAtTable.reduce((sum: number, g: any) => sum + (Number(g.numberOfPeople) || 1), 0);
      const newTotalPeople = currentTotalPeople + totalPeopleToAdd;
      const { error: tableUpdateError } = await supabase.from('tables').update({ seated_guests: newTotalPeople }).eq('id', tableId);
      if (tableUpdateError) console.error('Seat guests table count error:', tableUpdateError);

      await Promise.all([fetchGuests(), fetchTables()]);
      setQuickAddSelectedGuestIds(new Set());
      closeSeatConfirm();
    } catch (e) {
      console.error('Seat guests error:', e);
      Alert.alert('שגיאה', 'אירעה שגיאה בהושבה.');
    }
  }, [closeSeatConfirm, fetchGuests, fetchTables, guests, quickAddSelectedGuestIds, seatConfirmTable?.id]);

  const handleToggleGuestSelection = (guestId: string) => {
    setSelectedGuestsToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const handleSaveTableName = useCallback(async () => {
    if (!selectedTableForModal) return;
    const currentName = selectedTableForModal.name || '';
    if (tableName.trim() === currentName.trim()) return;
    const { error } = await supabase
      .from('tables')
      .update({ name: tableName.trim() || null })
      .eq('id', selectedTableForModal.id);
    if (error) {
      console.error('Error updating table name:', error);
      return;
    }
    setTables((prev) => prev.map((t) => (t.id === selectedTableForModal.id ? { ...t, name: tableName.trim() || null } : t)));
    setSelectedTableForModal((prev) => (prev ? { ...prev, name: tableName.trim() || null } : null));
  }, [selectedTableForModal, tableName]);

  const closeTableModal = useCallback(async () => {
    await handleSaveTableName();
    setTableModalOpen(false);
    setSelectedTableForModal(null);
    setTabBarVisible(true);
  }, [handleSaveTableName, setTabBarVisible]);

  const closeGuestModal = useCallback(() => {
    setGuestModalOpen(false);
    setTabBarVisible(true);
  }, [setTabBarVisible]);

  const handleAddGuestsToTable = useCallback(async () => {
    if (selectedGuestsToAdd.size === 0) return;
    const tableId = selectedTableForModal?.id;
    if (!tableId) return;

    const guestIds = Array.from(selectedGuestsToAdd);
    const guestsToAdd = guests.filter((g) => guestIds.includes(g.id));
    const totalPeopleToAdd = guestsToAdd.reduce((sum, g) => sum + (Number(g.numberOfPeople) || 1), 0);

    const { error: guestUpdateError } = await supabase.from('guests').update({ table_id: tableId }).in('id', guestIds);
    if (guestUpdateError) {
      console.error('Error updating guests:', guestUpdateError);
      Alert.alert('שגיאה', 'לא ניתן להוסיף אורחים לשולחן.');
      return;
    }

    const currentGuestsAtTable = guests.filter((g) => g.table_id === tableId);
    const currentTotalPeople = currentGuestsAtTable.reduce((sum, g) => sum + (Number(g.numberOfPeople) || 1), 0);
    const newTotalPeople = currentTotalPeople + totalPeopleToAdd;

    const { error: tableUpdateError } = await supabase.from('tables').update({ seated_guests: newTotalPeople }).eq('id', tableId);
    if (tableUpdateError) {
      console.error('Error updating table count:', tableUpdateError);
    }

    await Promise.all([fetchGuests(), fetchTables()]);
    setSelectedGuestsToAdd(new Set());
    await closeTableModal();
  }, [closeTableModal, fetchGuests, fetchTables, guests, selectedGuestsToAdd, selectedTableForModal?.id]);

  const handleRemoveGuestFromTable = useCallback(
    async (guestId: string) => {
      if (!selectedTableForModal?.id) return;
      const guestToRemove = guests.find((g) => g.id === guestId);
      if (!guestToRemove) return;

      const { error: guestUpdateError } = await supabase.from('guests').update({ table_id: null }).eq('id', guestId);
      if (guestUpdateError) {
        console.error('Error removing guest from table:', guestUpdateError);
        Alert.alert('שגיאה', 'לא ניתן להסיר אורח מהשולחן.');
        return;
      }

      const remainingGuestsAtTable = guests.filter((g) => g.table_id === selectedTableForModal.id && g.id !== guestId);
      const newTotalPeople = remainingGuestsAtTable.reduce((sum, g) => sum + (Number(g.numberOfPeople) || 1), 0);
      const { error: tableUpdateError } = await supabase.from('tables').update({ seated_guests: newTotalPeople }).eq('id', selectedTableForModal.id);
      if (tableUpdateError) console.error('Error updating table count:', tableUpdateError);

      await Promise.all([fetchGuests(), fetchTables()]);
      setSeatedGuestsForTable((prev) => prev.filter((g) => g.id !== guestId));
    },
    [fetchGuests, fetchTables, guests, selectedTableForModal?.id]
  );

  const handleDeleteTable = useCallback(async () => {
    if (!selectedTableForModal) return;
    Alert.alert('מחיקת שולחן', `האם למחוק את שולחן ${selectedTableForModal.number}? כל האורחים שיושבים בו יוסרו מהשולחן.`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error: guestUpdateError } = await supabase.from('guests').update({ table_id: null }).eq('table_id', selectedTableForModal.id);
            if (guestUpdateError) {
              console.error('Error removing guests from table:', guestUpdateError);
              Alert.alert('שגיאה', 'אירעה שגיאה בהסרת האורחים מהשולחן');
              return;
            }
            const { error: tableDeleteError } = await supabase.from('tables').delete().eq('id', selectedTableForModal.id);
            if (tableDeleteError) {
              console.error('Error deleting table:', tableDeleteError);
              Alert.alert('שגיאה', 'אירעה שגיאה במחיקת השולחן');
              return;
            }
            await Promise.all([fetchGuests(), fetchTables()]);
            await closeTableModal();
            Alert.alert('הצלחה', 'השולחן נמחק בהצלחה');
          } catch (e) {
            console.error('Delete table error:', e);
            Alert.alert('שגיאה', 'אירעה שגיאה במחיקת השולחן');
          }
        },
      },
    ]);
  }, [closeTableModal, fetchGuests, fetchTables, selectedTableForModal]);

  const filteredGuestSections = useMemo(() => {
    const q = guestModalSearch.trim().toLowerCase();
    return guestModalSections
      .map((section) => {
        if (guestModalCategory !== 'הכל' && section.title !== guestModalCategory) return null;
        const filtered = section.data.filter((g) => String(g.name || '').toLowerCase().includes(q));
        if (!filtered.length) return null;
        return { ...section, data: filtered };
      })
      .filter(Boolean) as Array<{ id: string; title: string; data: GuestRow[] }>;
  }, [guestModalCategory, guestModalSearch, guestModalSections]);

  const guestModalTotals = useMemo(() => {
    let guestsCount = 0;
    let peopleCount = 0;
    for (const section of filteredGuestSections) {
      guestsCount += section.data.length;
      for (const g of section.data) peopleCount += Number((g as any)?.numberOfPeople) || 1;
    }
    return { guestsCount, peopleCount, sectionsCount: filteredGuestSections.length };
  }, [filteredGuestSections]);

  const tablesForList = useMemo(() => {
    const q = tableListSearch.trim().toLowerCase();
    const byId = new Map<string, number>();
    for (const g of guests) {
      if (!g.table_id) continue;
      const ppl = Number(g.numberOfPeople) || 1;
      byId.set(String(g.table_id), (byId.get(String(g.table_id)) ?? 0) + ppl);
    }
    return (tables || [])
      .filter(Boolean)
      .filter((t) => {
        if (!q) return true;
        const num = String((t as any).number ?? '');
        const name = String((t as any).name ?? '').toLowerCase();
        return num.includes(q) || name.includes(q);
      })
      .map((t: any) => ({ ...t, _seatedPeople: byId.get(String(t.id)) ?? 0 }))
      .sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  }, [guests, tableListSearch, tables]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerSub}>טוען מפת הושבה...</Text>
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
  const contentPaddingH = windowWidth >= 1100 ? 24 : 16;

  const goToEventPage = () => {
    router.replace({
      pathname: '/(couple)' as const,
      params: resolvedEventId ? { eventId: resolvedEventId } : {},
    });
  };

  return (
    <View style={styles.page}>
      {Platform.OS === 'web' ? (
        <Pressable
          onPress={goToEventPage}
          accessibilityRole="button"
          accessibilityLabel="חזרה לעמוד אירוע"
          style={({ hovered, pressed }: any) => [
            styles.backToEventBtn,
            Platform.OS === 'web' && hovered ? styles.backToEventBtnHover : null,
            pressed ? styles.backToEventBtnPressed : null,
          ]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
          <Text style={styles.backToEventBtnText}>חזרה לאירוע</Text>
        </Pressable>
      ) : null}
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
        <View style={styles.statsRow}>
          <StatButton
            icon="walk"
            value={unseatedGuestsCount}
            label="טרם הושבו"
            accentColor={colors.secondary}
            onPress={() => openGuestModalWithGuests('טרם הושבו', unseatedGuestsList)}
          />
          <StatButton
            icon="grid"
            value={tables.length}
            label="שולחנות"
            accentColor={colors.primary}
            onPress={() =>
              router.push({
                pathname: '/(couple)/TablesList' as const,
                params: resolvedEventId ? { eventId: resolvedEventId } : {},
              })
            }
          />
          <StatButton
            icon="body"
            value={seatedGuestsCount}
            label="הושבו"
            accentColor={colors.success}
            onPress={() => openGuestModalWithGuests('הושבו', seatedGuestsList)}
          />
          <StatButton
            icon="checkmark-circle-outline"
            value={confirmedGuestsCount}
            label="אישרו הגעה"
            accentColor={colors.info}
            onPress={() => openGuestModalWithGuests('אישרו הגעה', confirmedGuestsList)}
          />
        </View>

        <View style={[styles.mainRow, isNarrow ? styles.mainRowNarrow : null]}>
          <View style={[styles.leftCol, !isNarrow ? { width: leftColWidth } : null]}>
            <View style={[styles.card, !isNarrow ? { height: mapCardHeight } : null]}>
              <View style={styles.sidePanelToggleRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="הצג מוזמנים"
                  onPress={() => setSidePanelTab('guests')}
                  style={({ hovered, pressed }: any) => [
                    styles.toggleBtn,
                    sidePanelTab === 'guests' ? styles.toggleBtnActive : null,
                    Platform.OS === 'web' && hovered && sidePanelTab !== 'guests' ? styles.toggleBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Text style={[styles.toggleText, sidePanelTab === 'guests' ? styles.toggleTextActive : null]}>מוזמנים</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="הצג שולחנות"
                  onPress={() => setSidePanelTab('tables')}
                  style={({ hovered, pressed }: any) => [
                    styles.toggleBtn,
                    sidePanelTab === 'tables' ? styles.toggleBtnActive : null,
                    Platform.OS === 'web' && hovered && sidePanelTab !== 'tables' ? styles.toggleBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Text style={[styles.toggleText, sidePanelTab === 'tables' ? styles.toggleTextActive : null]}>שולחנות</Text>
                </Pressable>
              </View>

              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{sidePanelTab === 'guests' ? 'מוזמנים' : 'שולחנות'}</Text>
                {sidePanelTab === 'guests' && quickAddSelectedGuestIds.size > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="נקה בחירה"
                    onPress={() => setQuickAddSelectedGuestIds(new Set())}
                    style={({ hovered, pressed }: any) => [
                      styles.quickClearBtn,
                      Platform.OS === 'web' && hovered ? styles.quickClearBtnHover : null,
                      pressed ? styles.btnPressed : null,
                    ]}
                  >
                    <Ionicons name="close" size={14} color={colors.gray[700]} />
                    <Text style={styles.quickClearBtnText}>נקה ({quickAddSelectedGuestIds.size})</Text>
                  </Pressable>
                ) : null}
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={16} color={colors.gray[500]} />
                  <TextInput
                    value={sidePanelTab === 'guests' ? quickAddGuestSearch : tableListSearch}
                    onChangeText={sidePanelTab === 'guests' ? setQuickAddGuestSearch : setTableListSearch}
                    placeholder={sidePanelTab === 'guests' ? 'חיפוש אורח...' : 'חיפוש לפי מספר / שם...'}
                    placeholderTextColor={colors.gray[500]}
                    style={styles.searchInput}
                  />
                </View>
              </View>

              {sidePanelTab === 'guests' ? (
                <>
                  <Text style={styles.quickAddHint}>
                    {quickAddSelectedGuestIds.size > 0
                      ? 'בחרת מוזמנים. עכשיו לחץ על שולחן במפה כדי להושיב אותם.'
                      : 'בחר מוזמנים מהרשימה, ואז לחץ על שולחן במפה כדי להושיב אותם.'}
                  </Text>

                  <View style={styles.quickGuestFiltersOuter}>
                    <View style={styles.quickSeatToggleRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="סינון: לא הושבו"
                        onPress={() => setQuickSeatFilter('unseated')}
                        style={({ hovered, pressed }: any) => [
                          styles.toggleBtn,
                          quickSeatFilter === 'unseated' ? styles.toggleBtnActive : null,
                          Platform.OS === 'web' && hovered && quickSeatFilter !== 'unseated' ? styles.toggleBtnHover : null,
                          pressed ? styles.btnPressed : null,
                        ]}
                      >
                        <Text style={[styles.toggleText, quickSeatFilter === 'unseated' ? styles.toggleTextActive : null]}>לא הושבו</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="סינון: הושבו"
                        onPress={() => setQuickSeatFilter('seated')}
                        style={({ hovered, pressed }: any) => [
                          styles.toggleBtn,
                          quickSeatFilter === 'seated' ? styles.toggleBtnActive : null,
                          Platform.OS === 'web' && hovered && quickSeatFilter !== 'seated' ? styles.toggleBtnHover : null,
                          pressed ? styles.btnPressed : null,
                        ]}
                      >
                        <Text style={[styles.toggleText, quickSeatFilter === 'seated' ? styles.toggleTextActive : null]}>הושבו</Text>
                      </Pressable>
                    </View>

                    <View style={styles.quickGuestFiltersRow}>
                      {[
                        { key: 'all' as const, label: 'הכל' },
                        { key: 'pending' as const, label: 'ממתין' },
                        { key: 'arriving' as const, label: 'מגיע' },
                        { key: 'not_arriving' as const, label: 'לא מגיע' },
                      ].map((f) => {
                        const active = quickStatusFilter === f.key;
                        const tone =
                          f.key === 'arriving' ? 'green' : f.key === 'not_arriving' ? 'red' : f.key === 'pending' ? 'yellow' : 'neutral';
                        const toneChip =
                          tone === 'green'
                            ? styles.quickFilterChipGreen
                            : tone === 'red'
                              ? styles.quickFilterChipRed
                              : tone === 'yellow'
                                ? styles.quickFilterChipYellow
                                : null;
                        const toneChipActive =
                          tone === 'green'
                            ? styles.quickFilterChipGreenActive
                            : tone === 'red'
                              ? styles.quickFilterChipRedActive
                              : tone === 'yellow'
                                ? styles.quickFilterChipYellowActive
                                : null;
                        const toneText =
                          tone === 'green'
                            ? styles.quickFilterChipTextGreen
                            : tone === 'red'
                              ? styles.quickFilterChipTextRed
                              : tone === 'yellow'
                                ? styles.quickFilterChipTextYellow
                                : null;
                        const toneTextActive =
                          tone === 'yellow' ? styles.quickFilterChipTextActiveOnYellow : null;
                        return (
                          <Pressable
                            key={f.key}
                            accessibilityRole="button"
                            accessibilityLabel={`סינון סטטוס: ${f.label}`}
                            onPress={() => setQuickStatusFilter(f.key)}
                            style={({ hovered, pressed }: any) => [
                              styles.quickFilterChip,
                              toneChip,
                              active ? styles.quickFilterChipActive : null,
                              active ? toneChipActive : null,
                              Platform.OS === 'web' && hovered && !active ? styles.quickFilterChipHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.quickFilterChipText,
                                toneText,
                                active ? styles.quickFilterChipTextActive : null,
                                active ? toneTextActive : null,
                              ]}
                            >
                              {f.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={{ height: 10 }} />

                  <View style={styles.sidePanelBody}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      <View style={styles.quickGuestList}>
                        {quickAddSections.length === 0 ? (
                          <Text style={styles.muted}>אין מוזמנים להצגה</Text>
                        ) : (
                          quickAddSections.map((section) => (
                            <View key={section.id} style={styles.quickSectionCard}>
                              <View style={styles.quickSectionHeader}>
                                <View style={styles.quickSectionTitleWrap}>
                                  <Text style={styles.quickSectionTitle} numberOfLines={1}>
                                    {section.title}
                                  </Text>
                                </View>
                                <View style={styles.quickSectionPill}>
                                  <Text style={styles.quickSectionPillText}>{section.data.length}</Text>
                                </View>
                              </View>

                              <View style={styles.quickSectionBody}>
                                {section.data.map((g: any) => {
                                  const id = String(g.id);
                                  const selected = quickAddSelectedGuestIds.has(id);
                                  const ppl = Number(g.numberOfPeople ?? g.number_of_people ?? 1) || 1;
                                  const status = String(g.status || '').trim();
                                  const isAvailable = !g.table_id && status !== 'לא מגיע';
                                  const seatedTable = g.tables?.number ? `שולחן ${g.tables.number}` : g.table_id ? 'משובץ' : null;
                                  const badge = isAvailable
                                    ? 'זמין'
                                    : seatedTable
                                      ? seatedTable
                                      : status
                                        ? status
                                        : 'לא זמין';

                                  return (
                                    <Pressable
                                      key={id}
                                      accessibilityRole="button"
                                      accessibilityLabel={selected ? 'בטל בחירה' : 'בחר מוזמן'}
                                      onPress={() => {
                                        if (suppressQuickSelectRef.current) {
                                          suppressQuickSelectRef.current = false;
                                          return;
                                        }
                                        if (isAvailable) toggleQuickAddGuest(id);
                                      }}
                                      style={({ hovered, pressed }: any) => [
                                        styles.quickGuestRow,
                                        selected ? styles.quickGuestRowSelected : null,
                                        !isAvailable ? styles.quickGuestRowDisabled : null,
                                        Platform.OS === 'web' && hovered && isAvailable ? styles.quickGuestRowHover : null,
                                        pressed ? styles.btnPressed : null,
                                      ]}
                                    >
                                      <View style={styles.quickGuestRowTop}>
                                        <View style={styles.quickGuestRightGroup}>
                                          <Ionicons
                                            name={selected ? 'checkbox' : 'square-outline'}
                                            size={20}
                                            color={!isAvailable ? colors.gray[300] : selected ? colors.primary : colors.gray[300]}
                                          />
                                          <View style={styles.quickGuestTextWrap}>
                                            <Text style={styles.quickGuestName} numberOfLines={1}>
                                              {String(g.name || '').trim()}
                                            </Text>
                                            <Text style={styles.quickGuestSub} numberOfLines={1}>
                                              {ppl} אנשים
                                            </Text>
                                          </View>
                                        </View>

                                        <View style={styles.quickGuestLeftGroup}>
                                          <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="עריכת מוזמן"
                                            onPressIn={() => {
                                              suppressQuickSelectRef.current = true;
                                            }}
                                            onPress={() => openGuestEdit(g as any)}
                                            style={({ hovered, pressed }: any) => [
                                              styles.quickGuestEditBtn,
                                              Platform.OS === 'web' && hovered ? styles.quickGuestEditBtnHover : null,
                                              pressed ? styles.btnPressed : null,
                                            ]}
                                          >
                                            <Ionicons name="create-outline" size={16} color={colors.gray[700]} />
                                          </Pressable>

                                          <View style={[styles.quickGuestBadge, isAvailable ? styles.quickGuestBadgeOk : styles.quickGuestBadgeMuted]}>
                                            <Text
                                              style={[
                                                styles.quickGuestBadgeText,
                                                isAvailable ? styles.quickGuestBadgeTextOk : styles.quickGuestBadgeTextMuted,
                                              ]}
                                            >
                                              {badge}
                                            </Text>
                                          </View>
                                        </View>
                                      </View>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          ))
                        )}
                      </View>
                    </ScrollView>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ height: 10 }} />

                  <View style={styles.sidePanelBody}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      <View style={styles.tableList}>
                        {tablesForList.length === 0 ? (
                          <Text style={styles.muted}>אין שולחנות להצגה</Text>
                        ) : (
                          tablesForList.map((t: any) => {
                            const seatedPeople = Number(t._seatedPeople ?? 0) || 0;
                            const cap = Number(t.capacity ?? 0) || 0;
                            const full = cap > 0 ? seatedPeople >= cap : false;
                            const name = String(t.name || '').trim();
                            return (
                              <Pressable
                                key={String(t.id)}
                                accessibilityRole="button"
                                accessibilityLabel={`שולחן ${t.number}`}
                                onPress={() => openTableModal(t)}
                                style={({ hovered, pressed }: any) => [
                                  styles.tableRow,
                                  Platform.OS === 'web' && hovered ? styles.tableRowHover : null,
                                  pressed ? styles.btnPressed : null,
                                ]}
                              >
                                <View style={styles.tableRowTop}>
                                  {/* Right side: table number + name + seated/cap */}
                                  <View style={styles.tableRowRight}>
                                    <View style={styles.tableNumPill}>
                                      <Text style={styles.tableNumPillText}>#{t.number ?? '—'}</Text>
                                    </View>
                                    <View style={styles.tableRowText}>
                                      <Text style={styles.tableRowTitle} numberOfLines={1}>
                                        {name ? name : 'ללא שם'}
                                      </Text>
                                      <Text style={styles.tableRowSub} numberOfLines={1}>
                                        {cap ? `${seatedPeople} / ${cap}` : `${seatedPeople} יושבים`}
                                      </Text>
                                    </View>
                                  </View>

                                  {/* Left side: status */}
                                  <View style={[styles.tableStatusPill, full ? styles.tableStatusFull : styles.tableStatusOk]}>
                                    <Text style={[styles.tableStatusText, full ? styles.tableStatusTextFull : styles.tableStatusTextOk]}>
                                      {full ? 'מלא' : 'זמין'}
                                    </Text>
                                  </View>
                                </View>
                              </Pressable>
                            );
                          })
                        )}
                      </View>
                    </ScrollView>
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.rightCol}>
            <View style={[styles.mapCard, { minHeight: mapCardHeight }]}>
              <View style={{ flex: 1, minHeight: mapCardHeight }}>
                {webSketch ? (
                  <SeatingGridReadonly
                    gridCols={webSketchWithNames?.gridCols ?? webSketch.gridCols}
                    gridRows={webSketchWithNames?.gridRows ?? webSketch.gridRows}
                    tables={webSketchWithNames?.tables ?? webSketch.tables}
                    zones={webSketchWithNames?.zones ?? webSketch.zones}
                    labels={webSketchWithNames?.labels ?? webSketch.labels}
                    hideTableType
                    autoFitZoomMultiplier={1.12}
                    useBaseColorAsWebBackground
                    showTableBorder={false}
                    getTableBaseColor={(t: any) => {
                      const selectedNumber =
                        (seatConfirmOpen && seatConfirmTable ? Number((seatConfirmTable as any).number) : null) ??
                        (selectedTableForModal ? Number((selectedTableForModal as any).number) : null);
                      const selected = Number.isFinite(selectedNumber as any) && Number(t?.number) === Number(selectedNumber);
                      if (selected) return '#047857';
                      const num = Number(t?.number);
                      const cap = Number(t?.seats ?? 0) || 0;
                      const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
                      const full = cap > 0 && seated >= cap;
                      const over = cap > 0 && seated > cap;
                      if (over) return '#065f46';
                      if (full) return '#047857';
                      return t?.type === 'reserve' ? colors.secondary : colors.primary;
                    }}
                    getTableBackgroundAlpha={(t: any) => {
                      const selectedNumber =
                        (seatConfirmOpen && seatConfirmTable ? Number((seatConfirmTable as any).number) : null) ??
                        (selectedTableForModal ? Number((selectedTableForModal as any).number) : null);
                      const selected = Number.isFinite(selectedNumber as any) && Number(t?.number) === Number(selectedNumber);
                      if (selected) return 0.52;
                      const num = Number(t?.number);
                      const cap = Number(t?.seats ?? 0) || 0;
                      const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
                      const full = cap > 0 && seated >= cap;
                      const over = cap > 0 && seated > cap;
                      if (over) return 0.58;
                      if (full) return 0.48;
                      return t?.type === 'reserve' ? 0.38 : 0.62;
                    }}
                    selectedRingColor="#047857"
                    isTableSelected={(t: any) => {
                      const selectedNumber =
                        (seatConfirmOpen && seatConfirmTable ? Number((seatConfirmTable as any).number) : null) ??
                        (selectedTableForModal ? Number((selectedTableForModal as any).number) : null);
                      return Boolean(selectedNumber) && Number(t?.number) === Number(selectedNumber);
                    }}
                    getTableSubLabel={(t: any) => {
                      const num = t?.number;
                      if (!num) return null;
                      const seated = seatedByNumber.get(Number(num)) ?? 0;
                      const cap = Number(t?.seats ?? 0) || 0;
                      return cap ? `${cap} / ${seated}` : String(seated);
                    }}
                    getTableTooltip={(t: any) => {
                      const num = t?.number;
                      if (!num) return null;
                      const seated = seatedByNumber.get(Number(num)) ?? 0;
                      const cap = Number(t?.seats ?? 0) || 0;
                      return cap ? `יושבים בשולחן: ${cap} / ${seated}` : `יושבים בשולחן: ${seated}`;
                    }}
                    onPressTableNumber={(num) => {
                      if (!num) return;
                      const t = tables.find((x: any) => Number(x.number) === Number(num));
                      if (!t) return;
                      if (quickAddSelectedGuestIds.size > 0) {
                        openSeatConfirm(t);
                        return;
                      }
                      openTableModal(t);
                    }}
                  />
                ) : (
                  <View style={styles.emptyMap}>
                    <Ionicons name="map-outline" size={42} color={colors.gray[500]} />
                    <Text style={styles.emptyMapTitle}>אין מפה עדיין</Text>
                    <Text style={styles.emptyMapSub}>כשתהיה סקיצה לאירוע, היא תופיע כאן.</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Guests modal */}
      <Modal visible={guestModalOpen} transparent animationType="fade" onRequestClose={closeGuestModal}>
        <Pressable style={styles.modalOverlay} onPress={closeGuestModal}>
          <Pressable style={[styles.modalCard, { maxHeight: Math.min(0.92 * windowHeight, 760) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{guestModalTitle}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeGuestModal}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <View style={[styles.guestModalContent, isNarrow ? styles.guestModalContentNarrow : null]}>
              {!isNarrow ? (
                <View style={styles.guestModalSidebar}>
                  <Text style={styles.guestModalSidebarTitle}>קטגוריות</Text>
                  <ScrollView
                    style={styles.guestModalSidebarScroll}
                    contentContainerStyle={styles.guestModalSidebarList}
                    showsVerticalScrollIndicator={false}
                  >
                    {guestModalCategories.map((c) => {
                      const active = guestModalCategory === c;
                      return (
                        <Pressable
                          key={c}
                          accessibilityRole="button"
                          accessibilityLabel={`קטגוריה ${c}`}
                          onPress={() => setGuestModalCategory(c)}
                          style={({ hovered, pressed }: any) => [
                            styles.guestModalCategoryBtn,
                            active ? styles.guestModalCategoryBtnActive : null,
                            Platform.OS === 'web' && hovered && !active ? styles.guestModalCategoryBtnHover : null,
                            pressed ? styles.btnPressed : null,
                          ]}
                        >
                          <Text style={[styles.guestModalCategoryText, active ? styles.guestModalCategoryTextActive : null]} numberOfLines={1}>
                            {c}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.guestModalMain}>
                <View style={[styles.modalFilterBar, !isNarrow ? styles.guestModalTopBar : null]}>
                  <View style={[styles.modalSearchWrap, { flex: 1 }]}>
                    <Ionicons name="search" size={16} color={colors.gray[500]} />
                    <TextInput
                      value={guestModalSearch}
                      onChangeText={setGuestModalSearch}
                      placeholder="חיפוש לפי שם..."
                      placeholderTextColor={colors.gray[500]}
                      style={styles.modalSearchInput}
                    />
                  </View>

                  {isNarrow ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      {guestModalCategories.map((c) => {
                        const active = guestModalCategory === c;
                        return (
                          <Pressable
                            key={c}
                            accessibilityRole="button"
                            accessibilityLabel={`קטגוריה ${c}`}
                            onPress={() => setGuestModalCategory(c)}
                            style={({ hovered, pressed }: any) => [
                              styles.chip,
                              active ? styles.chipActive : null,
                              Platform.OS === 'web' && hovered && !active ? styles.chipHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{c}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={styles.guestModalStatsWrap}>
                      <Text style={styles.guestModalStatsText}>
                        {guestModalTotals.guestsCount} מוזמנים • {guestModalTotals.peopleCount} אנשים
                      </Text>
                      <Text style={styles.guestModalStatsSubText} numberOfLines={1}>
                        {guestModalCategory === 'הכל' ? `ב־${guestModalTotals.sectionsCount} קטגוריות` : `קטגוריה: ${guestModalCategory}`}
                      </Text>
                    </View>
                  )}
                </View>

                <ScrollView
                  style={styles.guestModalListScroll}
                  contentContainerStyle={styles.modalBody}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredGuestSections.length === 0 ? (
                    <Text style={styles.muted}>אין תוצאות</Text>
                  ) : (
                    filteredGuestSections.map((section) => (
                      <View key={section.id} style={styles.sectionCard}>
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.sectionTitle}>{section.title}</Text>
                          <Text style={styles.sectionCountText}>
                            {section.data.length} • {section.data.reduce((sum, g) => sum + (Number((g as any)?.numberOfPeople) || 1), 0)} אנשים
                          </Text>
                        </View>

                        {isNarrow ? (
                          <View style={styles.sectionGrid}>
                            {section.data.map((g) => (
                              <View key={g.id} style={styles.guestMiniCard}>
                                <Text style={styles.guestMiniName} numberOfLines={1}>
                                  {g.name}
                                </Text>
                                <View style={styles.guestMiniMetaRow}>
                                  {g.tables?.number ? (
                                    <View style={styles.miniPill}>
                                      <Ionicons name="grid-outline" size={12} color={colors.gray[700]} />
                                      <Text style={styles.miniPillText}>שולחן {g.tables.number}</Text>
                                    </View>
                                  ) : null}
                                  <View style={styles.miniPill}>
                                    <Ionicons name="person" size={12} color={colors.gray[700]} />
                                    <Text style={styles.miniPillText}>{Number(g.numberOfPeople) || 1}</Text>
                                  </View>
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <View style={styles.guestRows}>
                            {section.data.map((g) => {
                              const name = String((g as any)?.name ?? '').trim();
                              const initial = name ? name.slice(0, 1) : '—';
                              return (
                                <View key={g.id} style={styles.guestRow}>
                                  <View style={styles.guestRowRight}>
                                    <View style={styles.guestRowAvatar}>
                                      <Text style={styles.guestRowAvatarText}>{initial}</Text>
                                    </View>
                                    <View style={styles.guestRowText}>
                                      <Text style={styles.guestRowName} numberOfLines={1}>
                                        {name || 'ללא שם'}
                                      </Text>
                                      <Text style={styles.guestRowSub} numberOfLines={1}>
                                        {g.tables?.number ? `שולחן ${g.tables.number}` : 'טרם הושב'}
                                      </Text>
                                    </View>
                                  </View>

                                  <View style={styles.guestRowLeft}>
                                    {g.tables?.number ? (
                                      <View style={styles.miniPill}>
                                        <Ionicons name="grid-outline" size={12} color={colors.gray[700]} />
                                        <Text style={styles.miniPillText}>שולחן {g.tables.number}</Text>
                                      </View>
                                    ) : null}
                                    <View style={styles.miniPill}>
                                      <Ionicons name="person" size={12} color={colors.gray[700]} />
                                      <Text style={styles.miniPillText}>{Number(g.numberOfPeople) || 1}</Text>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Seat selected guests confirmation */}
      <Modal visible={seatConfirmOpen} transparent animationType="fade" onRequestClose={closeSeatConfirm}>
        <Pressable style={styles.modalOverlay} onPress={closeSeatConfirm}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>להושיב מוזמנים בשולחן?</Text>
            <Text style={styles.confirmSub} numberOfLines={2}>
              {seatConfirmTable ? `שולחן ${seatConfirmTable.number ?? '—'}` : ''}
            </Text>

            <View style={{ height: 10 }} />

            <Text style={styles.confirmMeta}>
              {selectedGuestsForQuickAdd.length
                ? `נבחרו ${selectedGuestsForQuickAdd.length} מוזמנים`
                : 'לא נבחרו מוזמנים'}
            </Text>

            {selectedGuestsForQuickAdd.length ? (
              <View style={styles.confirmNames}>
                {selectedGuestsForQuickAdd.slice(0, 6).map((g: any) => (
                  <Text key={String(g.id)} style={styles.confirmName} numberOfLines={1}>
                    {String(g.name || '').trim()}
                  </Text>
                ))}
                {selectedGuestsForQuickAdd.length > 6 ? (
                  <Text style={styles.confirmMore} numberOfLines={1}>
                    + עוד {selectedGuestsForQuickAdd.length - 6}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={closeSeatConfirm}
                style={({ hovered, pressed }: any) => [
                  styles.confirmBtn,
                  styles.confirmBtnGhost,
                  Platform.OS === 'web' && hovered ? styles.confirmBtnGhostHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.confirmGhostText}>ביטול</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="אישור הושבה"
                onPress={() => void confirmSeatSelectedGuests()}
                disabled={!seatConfirmTable || quickAddSelectedGuestIds.size === 0}
                style={({ hovered, pressed }: any) => [
                  styles.confirmBtn,
                  styles.confirmBtnPrimary,
                  (!seatConfirmTable || quickAddSelectedGuestIds.size === 0) ? styles.confirmBtnDisabled : null,
                  Platform.OS === 'web' && hovered && seatConfirmTable && quickAddSelectedGuestIds.size > 0 ? styles.confirmBtnPrimaryHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.confirmPrimaryText}>אישור</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Guest edit modal */}
      <Modal visible={guestEditOpen} transparent animationType="fade" onRequestClose={closeGuestEdit}>
        <Pressable style={styles.modalOverlay} onPress={closeGuestEdit}>
          <Pressable
            style={[styles.guestEditCard, { maxHeight: Math.min(0.92 * windowHeight, 760), maxWidth: 620 }]}
            onPress={() => {}}
          >
            <View style={styles.guestEditHeader}>
              <View style={styles.guestEditHeaderText}>
                <Text style={styles.guestEditTitle} numberOfLines={1}>
                  עריכת מוזמן
                </Text>
                <Text style={styles.guestEditSubtitle} numberOfLines={1}>
                  {guestEditGuest?.name ? String(guestEditGuest.name).trim() : ''}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeGuestEdit}
                style={({ hovered, pressed }: any) => [
                  styles.tableModalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.tableModalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.guestEditBody} showsVerticalScrollIndicator={false}>
              <View style={styles.guestEditInfoRow}>
                <View style={styles.guestEditInfoPill}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.gray[700]} />
                  <Text style={styles.guestEditInfoText}>
                    סטטוס: {String(guestEditGuest?.status || '').trim() || '—'}
                  </Text>
                </View>
                {guestEditGuest?.tables?.number ? (
                  <View style={styles.guestEditInfoPill}>
                    <Ionicons name="grid-outline" size={14} color={colors.gray[700]} />
                    <Text style={styles.guestEditInfoText}>שולחן: {guestEditGuest.tables.number}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.guestEditField}>
                <Text style={styles.guestEditLabel}>כמות מגיעים</Text>
                <TextInput
                  value={guestEditPeople}
                  onChangeText={setGuestEditPeople}
                  placeholder="לדוגמה: 2"
                  placeholderTextColor={colors.gray[500]}
                  keyboardType="numeric"
                  style={styles.guestEditInput}
                />
              </View>

              {guestEditGuest?.table_id ? (
                <View style={styles.guestEditMoveCard}>
                  <View style={styles.guestEditMoveHeader}>
                    <Ionicons name="swap-horizontal" size={16} color={colors.text} />
                    <Text style={styles.guestEditMoveTitle}>העברה לשולחן אחר</Text>
                  </View>

                  <View style={styles.searchWrap}>
                    <Ionicons name="search" size={16} color={colors.gray[500]} />
                    <TextInput
                      value={guestEditTableSearch}
                      onChangeText={setGuestEditTableSearch}
                      placeholder="חיפוש שולחן..."
                      placeholderTextColor={colors.gray[500]}
                      style={styles.searchInput}
                    />
                  </View>

                  <View style={styles.guestEditTablesList}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      {moveTablesForEdit.map((t: any) => {
                        const tid = String(t.id);
                        const selected = String(guestEditTableId || '') === tid;
                        const name = String(t.name || '').trim();
                        return (
                          <Pressable
                            key={tid}
                            accessibilityRole="button"
                            accessibilityLabel={`בחר שולחן ${String(t.number ?? '')}`}
                            onPress={() => setGuestEditTableId(tid)}
                            style={({ hovered, pressed }: any) => [
                              styles.guestEditTableOption,
                              selected ? styles.guestEditTableOptionSelected : null,
                              Platform.OS === 'web' && hovered && !selected ? styles.guestEditTableOptionHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <View style={styles.guestEditTableOptionRight}>
                              <View style={styles.guestEditTableNumPill}>
                                <Text style={styles.guestEditTableNumText}>#{String(t.number ?? '—')}</Text>
                              </View>
                              <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
                                <Text style={styles.guestEditTableName} numberOfLines={1}>
                                  {name ? name : 'ללא שם'}
                                </Text>
                              </View>
                            </View>
                            {selected ? <Ionicons name="checkmark-circle" size={18} color="#16A34A" /> : null}
                          </Pressable>
                        );
                      })}
                      {moveTablesForEdit.length === 0 ? <Text style={styles.muted}>אין שולחנות להצגה</Text> : null}
                    </ScrollView>
                  </View>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.guestEditFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={closeGuestEdit}
                style={({ hovered, pressed }: any) => [
                  styles.footerBtn,
                  Platform.OS === 'web' && hovered ? styles.footerBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.footerBtnText}>ביטול</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור"
                onPress={() => void saveGuestEdit()}
                style={({ hovered, pressed }: any) => [
                  styles.footerBtnPrimary,
                  Platform.OS === 'web' && hovered ? styles.footerBtnPrimaryHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.footerBtnPrimaryText}>שמור</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Table modal */}
      <Modal visible={tableModalOpen} transparent animationType="fade" onRequestClose={closeTableModal}>
        <Pressable style={styles.modalOverlay} onPress={closeTableModal}>
          <Pressable style={[styles.tableModalCard, { maxHeight: Math.min(0.92 * windowHeight, 840), maxWidth: 440 }]} onPress={() => {}}>
            <View style={styles.tableModalHeader}>
              <View style={styles.tableModalHeaderText}>
                <Text style={styles.tableModalTitle}>
                  שולחן {selectedTableForModal?.number ?? '—'}
                  {selectedTableForModal?.name ? ` • ${selectedTableForModal.name}` : ''}
                </Text>
                <Text style={styles.tableModalSubtitle}>ניהול פרטי שולחן וסידור הושבה</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeTableModal}
                style={({ hovered, pressed }: any) => [
                  styles.tableModalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.tableModalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.tableModalBody} showsVerticalScrollIndicator={false}>
              {/* Settings */}
              <View style={styles.tableSettingsCard}>
                <View style={styles.tableSectionHeader}>
                  <View style={styles.tableSectionHeaderRight}>
                    <Ionicons name="settings-outline" size={18} color={colors.text} />
                    <Text style={styles.tableSectionTitle}>הגדרות שולחן</Text>
                  </View>
                </View>

                <View style={styles.tableSettingsGrid}>
                  <View style={styles.tableSettingsField}>
                    <Text style={styles.fieldLabelModern}>שם שולחן (אופציונלי)</Text>
                    <View style={styles.tableNameInputWrap}>
                      <TextInput
                        value={tableName}
                        onChangeText={setTableName}
                        placeholder="לדוגמה: משפחה / חברים / VIP"
                        placeholderTextColor={colors.gray[500]}
                        style={styles.fieldInputModern}
                        onBlur={() => void handleSaveTableName()}
                        onSubmitEditing={() => void handleSaveTableName()}
                        returnKeyType="done"
                      />
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={String((selectedTableForModal?.name || '').trim()) === String((tableName || '').trim()) ? '#16A34A' : 'rgba(148,163,184,0.9)'}
                        style={styles.tableNameCheckIcon as any}
                      />
                    </View>
                  </View>

                  <View style={styles.tableSettingsActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="שמור שינויים"
                      onPress={() => void handleSaveTableName()}
                      style={({ hovered, pressed }: any) => [
                        styles.tableActionBtn,
                        Platform.OS === 'web' && hovered ? styles.tableActionBtnHover : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <Ionicons name="checkmark" size={18} color="#16A34A" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="מחק שולחן"
                      onPress={() => void handleDeleteTable()}
                      style={({ hovered, pressed }: any) => [
                        styles.tableActionBtnDanger,
                        Platform.OS === 'web' && hovered ? styles.tableActionBtnDangerHover : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <Ionicons name="trash-outline" size={18} color="#E11D48" />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Guests */}
              <View style={styles.tableGuestsHeaderRow}>
                <View style={styles.occupancyCard}>
                  <View style={styles.occupancyTopRow}>
                    <Text style={styles.occupancyLabel}>תפוסה</Text>
                    <Text style={styles.occupancyValue}>
                      {(() => {
                        const cap = Number(selectedTableForModal?.capacity ?? 0) || 0;
                        const seated = seatedGuestsForTable.reduce((sum, g) => sum + (Number((g as any).numberOfPeople) || 1), 0);
                        return cap ? `${seated}/${cap}` : String(seated);
                      })()}
                    </Text>
                  </View>
                  <View style={styles.occupancyBar}>
                    <View
                      style={[
                        styles.occupancyFill,
                        {
                          width: (() => {
                            const cap = Number(selectedTableForModal?.capacity ?? 0) || 0;
                            const seated = seatedGuestsForTable.reduce((sum, g) => sum + (Number((g as any).numberOfPeople) || 1), 0);
                            if (!cap) return '0%';
                            return `${Math.max(0, Math.min(100, Math.round((seated / cap) * 100)))}%`;
                          })(),
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.tableGuestsHeaderText}>
                  <View style={styles.tableGuestsTitleRow}>
                    <Ionicons name="people-outline" size={18} color={colors.text} />
                    <Text style={styles.tableSectionTitle}>רשימת אורחים</Text>
                  </View>
                  <Text style={styles.tableGuestsSubtitle}>נהל את האורחים היושבים בשולחן זה</Text>
                </View>
              </View>

            {tableModalView === 'seated' ? (
              <View style={styles.tableGuestsCard}>
                {seatedGuestsForTable.length === 0 ? (
                  <Text style={styles.muted}>אין אורחים יושבים בשולחן זה</Text>
                ) : (
                  <View style={styles.tableGuestsList}>
                    {seatedGuestsForTable.map((g: any) => {
                      const name = String(g?.name || '').trim();
                      const initial = name ? name[0] : '?';
                      const ppl = Number(g?.numberOfPeople ?? 1) || 1;
                      const cat = g?.guest_categories?.name || 'ללא קטגוריה';
                      return (
                        <Pressable
                          key={String(g.id)}
                          style={({ hovered }: any) => [
                            styles.tableGuestRow,
                            Platform.OS === 'web' && hovered ? styles.tableGuestRowHover : null,
                          ]}
                        >
                          <View style={styles.tableGuestRight}>
                            <View style={styles.tableGuestAvatar}>
                              <Text style={styles.tableGuestAvatarText}>{initial}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
                              <Text style={styles.tableGuestName} numberOfLines={1}>
                                {name}
                              </Text>
                              <Text style={styles.tableGuestSub} numberOfLines={1}>
                                {cat}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.tableGuestLeft}>
                            <View style={styles.tableGuestSeatsPill}>
                              <Ionicons name="person" size={12} color={colors.gray[700]} />
                              <Text style={styles.tableGuestSeatsText}>{ppl} מושב</Text>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="הסר אורח"
                              onPress={() => void handleRemoveGuestFromTable(g.id)}
                              style={({ hovered }: any) => [
                                styles.tableGuestDeleteBtn,
                                Platform.OS === 'web' && hovered ? styles.tableGuestDeleteBtnHover : null,
                              ]}
                            >
                              <Ionicons name="trash-outline" size={16} color="#E11D48" />
                            </Pressable>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              <>
                <View style={styles.modalFilterBar}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="חזרה לרשימת אורחים"
                    onPress={() => setTableModalView('seated')}
                    style={({ hovered, pressed }: any) => [
                      styles.backToGuestsBtn,
                      Platform.OS === 'web' && hovered ? styles.backToGuestsBtnHover : null,
                      pressed ? styles.btnPressed : null,
                    ]}
                  >
                    <Ionicons name="arrow-forward" size={16} color={colors.gray[700]} />
                    <Text style={styles.backToGuestsBtnText}>חזרה</Text>
                  </Pressable>
                  <View style={[styles.modalSearchWrap, { flex: 1 }]}>
                    <Ionicons name="search" size={16} color={colors.gray[500]} />
                    <TextInput
                      value={searchQueryTable}
                      onChangeText={setSearchQueryTable}
                      placeholder="חיפוש לפי שם..."
                      placeholderTextColor={colors.gray[500]}
                      style={styles.modalSearchInput}
                    />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    {categoriesForTable.map((c) => {
                      const active = categoryFilterTable === c;
                      return (
                        <Pressable
                          key={c}
                          accessibilityRole="button"
                          accessibilityLabel={`קטגוריה ${c}`}
                          onPress={() => setCategoryFilterTable(c)}
                          style={({ hovered, pressed }: any) => [
                            styles.chip,
                            active ? styles.chipActive : null,
                            Platform.OS === 'web' && hovered && !active ? styles.chipHover : null,
                            pressed ? styles.btnPressed : null,
                          ]}
                        >
                          <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{c}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <FlatList
                  data={unseatedGuestsList.filter((g) => {
                    const cat = g.guest_categories?.name || 'ללא קטגוריה';
                    const categoryMatch = categoryFilterTable === 'הכל' || cat === categoryFilterTable;
                    const searchMatch = String(g.name || '').toLowerCase().includes(searchQueryTable.trim().toLowerCase());
                    return categoryMatch && searchMatch;
                  })}
                  keyExtractor={(item) => String(item.id)}
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.addList}
                  renderItem={({ item }) => {
                    const selected = selectedGuestsToAdd.has(item.id);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={selected ? 'הסר בחירה' : 'בחר אורח'}
                        onPress={() => handleToggleGuestSelection(item.id)}
                        style={({ hovered, pressed }: any) => [
                          styles.addRow,
                          selected ? styles.addRowSelected : null,
                          Platform.OS === 'web' && hovered && !selected ? styles.addRowHover : null,
                          pressed ? styles.btnPressed : null,
                        ]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.addName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.addSub} numberOfLines={1}>
                            {item.guest_categories?.name || 'ללא קטגוריה'} · {Number(item.numberOfPeople) || 1} אנשים
                          </Text>
                        </View>
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={selected ? colors.primary : colors.gray[300]}
                        />
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={<Text style={styles.muted}>כל האורחים שהגיעו כבר הושבו</Text>}
                />

                <View style={styles.modalActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="הוסף אורחים"
                    onPress={() => void handleAddGuestsToTable()}
                    disabled={selectedGuestsToAdd.size === 0}
                    style={({ hovered, pressed }: any) => [
                      styles.primaryBtn,
                      selectedGuestsToAdd.size === 0 ? styles.primaryBtnDisabled : null,
                      Platform.OS === 'web' && hovered && selectedGuestsToAdd.size > 0 ? styles.primaryBtnHover : null,
                      pressed ? styles.btnPressed : null,
                    ]}
                  >
                    <Ionicons name="person-add" size={18} color={colors.white} />
                    <Text style={styles.primaryBtnText}>
                      {selectedGuestsToAdd.size > 0 ? `הוסף ${selectedGuestsToAdd.size} אורחים` : 'בחר אורחים להוספה'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
            </ScrollView>

            <View style={styles.tableModalFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={closeTableModal}
                style={({ hovered, pressed }: any) => [
                  styles.footerBtn,
                  Platform.OS === 'web' && hovered ? styles.footerBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.footerBtnText}>ביטול</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור שינויים"
                onPress={async () => {
                  await handleSaveTableName();
                  closeTableModal();
                }}
                style={({ hovered, pressed }: any) => [
                  styles.footerBtnPrimary,
                  Platform.OS === 'web' && hovered ? styles.footerBtnPrimaryHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.footerBtnPrimaryText}>שמור שינויים</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F6F7F8',
    direction: 'rtl',
  },
  backToEventBtn: {
    position: 'absolute',
    left: 16,
    top: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  backToEventBtnHover: {
    backgroundColor: colors.gray[50],
    borderColor: 'rgba(15,23,42,0.14)',
  },
  backToEventBtnPressed: {
    opacity: 0.9,
  },
  backToEventBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  container: {
    paddingTop: 14,
    paddingBottom: 26,
    width: '100%',
    maxWidth: 1520,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  centerTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  centerSub: { marginTop: 10, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center' },

  bgShapes: { ...StyleSheet.absoluteFillObject, pointerEvents: 'none' },
  shapeTopRight: {
    position: 'absolute',
    top: -90,
    right: -80,
    width: 640,
    height: 640,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.10) 0%, rgba(255,255,255,0) 70%)' } as any)
      : { backgroundColor: 'rgba(59,130,246,0.10)' }),
  },
  shapeBottomLeft: {
    position: 'absolute',
    bottom: -50,
    left: -120,
    width: 820,
    height: 820,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, rgba(255,255,255,0) 70%)' } as any)
      : { backgroundColor: 'rgba(139,92,246,0.07)' }),
  },

  topBar: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  topBarRight: { flex: 1, minWidth: 260, alignItems: 'flex-end', gap: 6 },
  topBarLeft: { alignItems: 'flex-start' },
  topBarActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: '900', color: '#0d1c2b', textAlign: 'right' },
  subtitle: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  topBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  topBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(59,130,246,0.20)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 24px rgba(13,28,43,0.08)' } as any) : null),
  },
  topBtnText: { fontSize: 12, fontWeight: '900', color: '#0d1c2b', textAlign: 'right' },
  btnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },

  statsRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'nowrap', gap: 12 },
  statBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 160,
    flexGrow: 1,
    flexBasis: 200,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 1px rgba(11,48,65,0.02), 0 10px 24px rgba(16,24,40,0.06)' } as any) : null),
  },
  statIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 8 },
  statShineBlob: { position: 'absolute', width: 110, height: 110, borderRadius: 110 },
  statValue: { fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.3, textAlign: 'center' },
  statLabel: { fontSize: 13, fontWeight: '700', color: colors.gray[700], marginTop: 2, textAlign: 'center', writingDirection: 'rtl' },

  // RTL layout: with `direction: 'rtl'`, `row` places the first column on the RIGHT.
  // We render the tables column first, so it becomes the right side panel, and the map stays on the left.
  mainRow: { marginTop: 14, flexDirection: 'row', alignItems: 'stretch', gap: 14 },
  mainRowNarrow: { flexDirection: 'column-reverse' },
  leftCol: { gap: 14 },
  rightCol: { flex: 1, minWidth: 0 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', boxShadow: '0 12px 30px rgba(13,28,43,0.06)' } as any) : null),
  },
  sidePanelToggleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10 },
  sidePanelBody: { flex: 1, minHeight: 0 },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: '900', color: '#0d1c2b', textAlign: 'right' },
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  searchInput: { flex: 1, minWidth: 160, fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'right' },
  tableList: { gap: 10, paddingBottom: 4 },
  tableRow: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  tableRowActive: {
    borderColor: 'rgba(59,130,246,0.35)',
    backgroundColor: 'rgba(59,130,246,0.05)',
  },
  tableRowHover: {
    borderColor: 'rgba(59,130,246,0.20)',
    backgroundColor: 'rgba(59,130,246,0.04)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 1px rgba(59,130,246,0.08), 0 14px 28px rgba(13,28,43,0.10)' } as any) : null),
  },
  tableRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tableRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  tableRowText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  tableRowActions: { marginTop: 10, alignItems: 'flex-end' },
  tableManageBtn: {
    height: 36,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableManageBtnHover: {
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderColor: 'rgba(59,130,246,0.22)',
  },
  tableManageBtnText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  tableNumPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(6,23,62,0.08)', borderWidth: 1, borderColor: 'rgba(6,23,62,0.10)' },
  tableNumPillText: { fontSize: 12, fontWeight: '900', color: '#0d1c2b', textAlign: 'right', writingDirection: 'rtl' },
  tableRowTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  tableRowSub: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  tableStatusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  tableStatusOk: { backgroundColor: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.24)' },
  tableStatusFull: { backgroundColor: 'rgba(244,63,94,0.10)', borderColor: 'rgba(244,63,94,0.24)' },
  tableStatusText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
  tableStatusTextOk: { color: '#065F46' },
  tableStatusTextFull: { color: '#9F1239' },

  tips: { marginTop: 8, gap: 8, alignItems: 'flex-end' },
  tipLine: { fontSize: 12, fontWeight: '800', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },

  mapCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 16,
    shadowColor: colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  emptyMap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 30 },
  emptyMapTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'center', writingDirection: 'rtl' },
  emptyMapSub: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center', writingDirection: 'rtl', maxWidth: 460 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        } as any)
      : null),
  },
  modalCard: {
    width: '100%',
    maxWidth: 980,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 30px 80px rgba(0,0,0,0.20)', direction: 'ltr' } as any) : null),
  },
  modalHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  modalCloseBtnHover: { backgroundColor: colors.gray[200] },

  // Table modal (modern)
  tableModalCard: {
    width: '100%',
    maxWidth: 640,
    backgroundColor: colors.gray[50],
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 6px 26px rgba(0,0,0,0.10)', direction: 'ltr' } as any) : null),
  },
  tableModalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226,232,240,0.9)',
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tableModalHeaderText: { flex: 1, minWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', gap: 4 },
  tableModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  tableModalSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  tableModalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableModalCloseBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  tableModalBody: { padding: 18, gap: 16 },

  tableSettingsCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    padding: 14,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 14px rgba(0,0,0,0.04)' } as any) : null),
  },
  // Force the section header group (icon + title) to stick to the RIGHT edge.
  // This avoids relying on inherited RTL/LTR direction behavior on web.
  tableSectionHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10 },
  tableSectionHeaderRight: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  tableSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  tableSettingsGrid: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' },
  tableSettingsField: { flex: 1, minWidth: 240 },
  fieldLabelModern: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    marginBottom: 8,
    writingDirection: 'rtl',
    width: '100%',
  },
  tableNameInputWrap: { position: 'relative' },
  fieldInputModern: {
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.95)',
    paddingRight: 12,
    paddingLeft: 42,
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  tableNameCheckIcon: { position: 'absolute', left: 12, top: 14 },
  tableSettingsActions: { flexDirection: 'row-reverse', gap: 10, minWidth: 120 },
  tableActionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableActionBtnHover: { backgroundColor: 'rgba(248,250,252,0.92)' },
  tableActionBtnDanger: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableActionBtnDangerHover: { backgroundColor: 'rgba(244,63,94,0.06)' },

  // With the table modal forced to LTR on web, keep a predictable order:
  // occupancy on the left, header text on the right.
  tableGuestsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  // When wrapping onto a new line (small modal width), force the header block
  // to take the full row so the Hebrew text can align to the RIGHT edge.
  tableGuestsHeaderText: { flex: 1, minWidth: 240, width: '100%', alignItems: 'flex-end' },
  tableGuestsTitleRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  tableGuestsSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  occupancyCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 240,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 14px rgba(0,0,0,0.04)' } as any) : null),
  },
  occupancyTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  occupancyLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  occupancyValue: { fontSize: 11, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  occupancyBar: { marginTop: 8, height: 8, borderRadius: 999, backgroundColor: 'rgba(226,232,240,0.7)', overflow: 'hidden' },
  occupancyFill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },

  tableGuestsCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 14px rgba(0,0,0,0.04)' } as any) : null),
  },
  tableGuestsCardTop: { padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.8)', backgroundColor: 'rgba(248,250,252,0.75)' },
  addGuestsPrimaryBtn: { height: 44, borderRadius: 14, backgroundColor: colors.primary, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  addGuestsPrimaryBtnHover: { opacity: 0.95 },
  addGuestsPrimaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', writingDirection: 'rtl' },
  tableGuestsList: { paddingVertical: 6 },
  tableGuestRow: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(226,232,240,0.65)' },
  tableGuestRowHover: { backgroundColor: 'rgba(248,250,252,0.92)' },
  tableGuestRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  tableGuestAvatar: { width: 36, height: 36, borderRadius: 999, backgroundColor: 'rgba(59,130,246,0.10)', alignItems: 'center', justifyContent: 'center' },
  tableGuestAvatarText: { fontSize: 16, fontWeight: '900', color: colors.yaleBlue, writingDirection: 'rtl' },
  tableGuestName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', alignSelf: 'stretch', writingDirection: 'rtl' },
  tableGuestSub: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', alignSelf: 'stretch', writingDirection: 'rtl' },
  tableGuestLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tableGuestSeatsPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  tableGuestSeatsText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  tableGuestDeleteBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  tableGuestDeleteBtnHover: { backgroundColor: 'rgba(244,63,94,0.08)' },

  backToGuestsBtn: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  backToGuestsBtnHover: { backgroundColor: 'rgba(248,250,252,0.92)' },
  backToGuestsBtnText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },

  tableModalFooter: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.9)',
    backgroundColor: 'rgba(248,250,252,0.75)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  footerBtn: {
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  footerBtnHover: { backgroundColor: 'rgba(248,250,252,0.92)' },
  footerBtnText: { fontSize: 13, fontWeight: '900', color: colors.gray[800], writingDirection: 'rtl' },
  footerBtnPrimary: {
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  footerBtnPrimaryHover: { opacity: 0.95 },
  footerBtnPrimaryText: { fontSize: 13, fontWeight: '900', color: colors.white, writingDirection: 'rtl' },

  modalFilterBar: { padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)' },
  modalSearchWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.gray[50], borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)' },
  modalSearchInput: {
    flex: 1,
    minWidth: 140,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },

  guestModalContent: { flex: 1, flexDirection: 'row-reverse', minHeight: 0 },
  guestModalContentNarrow: { flexDirection: 'column' },
  guestModalSidebar: {
    width: 240,
    backgroundColor: 'rgba(248,250,252,0.85)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(15,23,42,0.06)',
    padding: 12,
    gap: 10,
  },
  guestModalSidebarTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestModalSidebarScroll: { flex: 1 },
  guestModalSidebarList: { gap: 8, paddingBottom: 8 },
  guestModalCategoryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'flex-end',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  guestModalCategoryBtnHover: { backgroundColor: 'rgba(248,250,252,0.92)' },
  guestModalCategoryBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  guestModalCategoryText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },
  guestModalCategoryTextActive: { color: colors.white },

  guestModalMain: { flex: 1, minWidth: 0, minHeight: 0 },
  guestModalTopBar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  guestModalStatsWrap: { alignItems: 'flex-end', gap: 2, minWidth: 220 },
  guestModalStatsText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },
  guestModalStatsSubText: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  guestModalListScroll: { flex: 1 },

  chipsRow: { flexDirection: 'row-reverse', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: 'rgba(15,23,42,0.12)', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  chipHover: { backgroundColor: colors.gray[50] },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  chipTextActive: { color: colors.white },

  modalBody: { padding: 14, gap: 12 },
  sectionCard: { backgroundColor: 'rgba(248,250,252,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', padding: 12 },
  sectionHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionCountText: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  sectionGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  guestMiniCard: { flexBasis: 220, flexGrow: 1, minWidth: 220, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', padding: 10 },
  guestMiniName: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestMiniMetaRow: { marginTop: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  miniPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  miniPillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },

  guestRows: { gap: 10 },
  guestRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guestRowRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  guestRowAvatar: { width: 34, height: 34, borderRadius: 999, backgroundColor: 'rgba(59,130,246,0.10)', alignItems: 'center', justifyContent: 'center' },
  guestRowAvatarText: { fontSize: 14, fontWeight: '900', color: colors.yaleBlue, writingDirection: 'rtl' },
  guestRowText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  guestRowName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestRowSub: { marginTop: 2, fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  guestRowLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start' },

  muted: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 10,
    width: '100%',
  },

  tableNameRow: { padding: 14, paddingBottom: 10, flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', marginBottom: 8 },
  fieldInput: { height: 44, borderRadius: 14, backgroundColor: colors.gray[50], borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)', paddingHorizontal: 12, fontSize: 14, fontWeight: '800', color: colors.text, textAlign: 'right' },
  tableNameActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.gray[100], borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  iconBtnHover: { backgroundColor: colors.gray[200] },
  iconBtnDanger: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(244,63,94,0.10)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.22)', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  iconBtnDangerHover: { backgroundColor: 'rgba(244,63,94,0.14)' },

  toggleRow: { paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row-reverse', gap: 10 },
  toggleBtn: { flex: 1, height: 40, borderRadius: 14, backgroundColor: colors.gray[100], borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  toggleBtnHover: { backgroundColor: colors.gray[200] },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[800],
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  toggleTextActive: { color: colors.white },

  seatedGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  seatedCard: { flexBasis: 260, flexGrow: 1, minWidth: 240, padding: 12, borderRadius: 18, backgroundColor: 'rgba(248,250,252,0.92)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  seatedName: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  seatedMetaRow: { marginTop: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  addList: { padding: 14, gap: 10 },
  addRow: { padding: 12, borderRadius: 18, backgroundColor: 'rgba(248,250,252,0.92)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  addRowHover: { borderColor: 'rgba(59,130,246,0.20)', backgroundColor: 'rgba(59,130,246,0.04)' },
  addRowSelected: { borderColor: 'rgba(0,53,102,0.35)', backgroundColor: 'rgba(0,53,102,0.06)' },
  addName: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  addSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  modalActions: { padding: 14, paddingTop: 0, borderTopWidth: 1, borderTopColor: 'rgba(15,23,42,0.06)' },
  primaryBtn: { height: 46, borderRadius: 16, backgroundColor: colors.primary, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  primaryBtnHover: { opacity: 0.96 },
  primaryBtnDisabled: { opacity: 0.75 },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  quickClearBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  quickClearBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)', borderColor: 'rgba(59,130,246,0.22)' },
  quickClearBtnText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },

  quickAddHint: { marginTop: 10, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  quickGuestFiltersOuter: { marginTop: 10, alignSelf: 'stretch', alignItems: 'flex-end' },
  quickSeatToggleRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10 },
  quickGuestFiltersRow: {
    maxWidth: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start', // row-reverse => start is the RIGHT
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    padding: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(248,250,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  quickFilterChip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  quickFilterChipHover: { backgroundColor: 'rgba(248,250,252,0.92)', borderColor: 'rgba(6,23,62,0.18)' },
  quickFilterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Status tones (מגיע / לא מגיע / ממתין)
  quickFilterChipGreen: { backgroundColor: 'rgba(22,163,74,0.10)', borderColor: 'rgba(22,163,74,0.22)' },
  quickFilterChipGreenActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  quickFilterChipRed: { backgroundColor: 'rgba(225,29,72,0.08)', borderColor: 'rgba(225,29,72,0.22)' },
  quickFilterChipRedActive: { backgroundColor: '#E11D48', borderColor: '#E11D48' },
  quickFilterChipYellow: { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.28)' },
  quickFilterChipYellowActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  quickFilterChipText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },
  quickFilterChipTextActive: { color: colors.white },
  quickFilterChipTextGreen: { color: '#166534' },
  quickFilterChipTextRed: { color: '#9F1239' },
  quickFilterChipTextYellow: { color: '#92400E' },
  quickFilterChipTextActiveOnYellow: { color: '#111827' },
  quickGuestList: { gap: 10, paddingBottom: 4 },
  quickSectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(248,250,252,0.92)',
    padding: 10,
  },
  // RTL: `row` places first child on the RIGHT.
  quickSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    marginBottom: 10,
  },
  quickSectionTitleWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  quickSectionTitle: { fontSize: 13, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl', flex: 1, minWidth: 0 },
  quickSectionPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  quickSectionPillText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'center' },
  quickSectionBody: { gap: 10 },
  quickGuestRow: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  quickGuestRowHover: {
    borderColor: 'rgba(59,130,246,0.20)',
    backgroundColor: 'rgba(59,130,246,0.04)',
  },
  quickGuestRowSelected: {
    borderColor: 'rgba(59,130,246,0.35)',
    backgroundColor: 'rgba(59,130,246,0.06)',
  },
  quickGuestRowDisabled: {
    opacity: 0.75,
    backgroundColor: 'rgba(248,250,252,0.92)',
  },
  // RTL row: right side (checkbox + name), left side (status)
  quickGuestRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  // In RTL, `row` places first child on the RIGHT.
  // We render checkbox first, then text => checkbox is right of the name.
  quickGuestRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  quickGuestLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quickGuestEditBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  quickGuestEditBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  quickGuestTextWrap: { flex: 1, minWidth: 0, alignItems: 'flex-end', justifyContent: 'center' },
  quickGuestName: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  quickGuestSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  quickGuestBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  quickGuestBadgeOk: { backgroundColor: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.24)' },
  quickGuestBadgeMuted: { backgroundColor: 'rgba(15,23,42,0.04)', borderColor: 'rgba(15,23,42,0.10)' },
  quickGuestBadgeText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
  quickGuestBadgeTextOk: { color: '#065F46' },
  quickGuestBadgeTextMuted: { color: colors.gray[700] },

  // Guest edit modal
  guestEditCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 30px 80px rgba(0,0,0,0.22)',
          direction: 'rtl',
        } as any)
      : null),
  },
  guestEditHeader: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226,232,240,0.9)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        } as any)
      : null),
  },
  guestEditHeaderText: { flex: 1, minWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', gap: 4 },
  guestEditTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestEditSubtitle: { fontSize: 13, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  guestEditBody: {
    padding: 18,
    gap: 14,
    alignItems: 'stretch',
    backgroundColor: 'rgba(248,250,252,0.72)',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestEditInfoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  guestEditInfoPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 10px rgba(0,0,0,0.04)' } as any) : null),
  },
  guestEditInfoText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },
  guestEditField: {
    gap: 8,
    alignItems: 'stretch',
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 14px rgba(0,0,0,0.04)' } as any) : null),
  },
  guestEditLabel: { alignSelf: 'flex-end', fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  guestEditInput: {
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.95)',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  guestEditMoveCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    padding: 14,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 14px rgba(0,0,0,0.04)' } as any) : null),
  },
  guestEditMoveHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 10 },
  guestEditMoveTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestEditTablesList: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(248,250,252,0.70)',
    maxHeight: 260,
    overflow: 'hidden',
  },
  guestEditTableOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.65)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  guestEditTableOptionHover: { backgroundColor: 'rgba(248,250,252,0.92)' },
  guestEditTableOptionSelected: { backgroundColor: 'rgba(16,185,129,0.08)' },
  guestEditTableOptionRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  guestEditTableNumPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  guestEditTableNumText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], writingDirection: 'rtl' },
  guestEditTableName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestEditFooter: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.9)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        } as any)
      : null),
  },

  confirmCard: {
    width: 420,
    maxWidth: '92%',
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    padding: 14,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 30px 80px rgba(0,0,0,0.20)' } as any) : null),
  },
  confirmTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center', writingDirection: 'rtl' },
  confirmSub: { marginTop: 6, fontSize: 13, fontWeight: '800', color: colors.gray[700], textAlign: 'center', writingDirection: 'rtl' },
  confirmMeta: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center', writingDirection: 'rtl' },
  confirmNames: { marginTop: 10, gap: 6 },
  confirmName: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  confirmMore: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  confirmActions: { marginTop: 12, flexDirection: 'row-reverse', gap: 10 },
  confirmBtn: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirmBtnPrimary: { backgroundColor: colors.primary },
  confirmBtnPrimaryHover: { opacity: 0.96 },
  confirmBtnGhost: { backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)' },
  confirmBtnGhostHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  confirmBtnDisabled: { opacity: 0.7 },
  confirmPrimaryText: { color: colors.white, fontSize: 13, fontWeight: '900', writingDirection: 'rtl' },
  confirmGhostText: { color: colors.gray[800], fontSize: 13, fontWeight: '900', writingDirection: 'rtl' },
});


