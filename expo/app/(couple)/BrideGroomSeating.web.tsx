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
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';

import { colors } from '@/constants/colors';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { supabase } from '@/lib/supabase';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useUserStore } from '@/store/userStore';

import { SeatingGridReadonly } from '../seating/web/SeatingGridReadonly';
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type Orientation, type TableType } from '../seating/web/_types';
import type { Table } from '@/types';

const TABLE_NAME_MAX_LENGTH = 10;

type GuestRow = {
  id: string;
  name: string;
  status: 'מגיע' | 'אולי מגיע' | 'לא מגיע' | 'ממתין';
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
  narrow?: boolean;
};

function StatButton({ icon, value, label, accentColor, onPress, narrow }: StatButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ hovered, pressed, focused }: any) => {
        const border = Platform.OS === 'web' && (hovered || focused) ? withAlpha(accentColor, 0.38) : 'rgba(15,23,42,0.10)';
        const bg = pressed ? withAlpha(accentColor, 0.055) : 'rgba(255,255,255,0.94)';
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
                backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, ${withAlpha(accentColor, pressed ? 0.06 : hovered || focused ? 0.09 : 0.05)} 100%)`,
                boxShadow: focused
                  ? `0 0 0 4px ${withAlpha(accentColor, 0.18)}, 0 18px 42px ${withAlpha('#000000', 0.14)}`
                  : hovered && !pressed
                    ? `0 18px 42px ${withAlpha('#000000', 0.14)}`
                    : `0 10px 28px ${withAlpha('#000000', 0.08)}`,
              }
            : null;
        return [
          styles.statBtn,
          narrow ? styles.statBtnNarrow : null,
          { borderColor: border, backgroundColor: bg },
          webFx,
        ];
      }}
    >
      {({ pressed, hovered, focused }: any) => (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.statGlow,
              {
                backgroundColor: withAlpha(accentColor, hovered || focused ? 0.14 : 0.1),
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          />
          <View style={styles.statTopRow}>
            <View style={styles.statTopTextWrap}>
              <Text style={[styles.statEyebrow, { color: withAlpha(accentColor, 0.9) }]}>תמונת מצב</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
            <View
              style={[
                styles.statIconWrap,
                {
                  backgroundColor: withAlpha(accentColor, pressed ? 0.08 : 0.12),
                  borderColor: withAlpha(accentColor, hovered || focused ? 0.28 : 0.18),
                },
              ]}
            >
              <Ionicons name={icon} size={22} color={accentColor} />
            </View>
          </View>

          <View style={styles.statValueBlock}>
            <Text style={styles.statValue}>{value}</Text>
            <View style={styles.statFooterRow}>
              <View style={[styles.statAccentBar, { backgroundColor: accentColor }]} />
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

export default function BrideGroomSeatingWebScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { userData, isLoggedIn, userType } = useUserStore();
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
  const isAdminContext = useMemo(
    () => userType === 'admin' || String(pathname || '').toLowerCase().includes('admin'),
    [pathname, userType]
  );
  const showManagerChrome = Platform.OS === 'web';
  const useEmbeddedWebShell = Platform.OS === 'web' && !isAdminContext;
  const leftColWidth = useMemo(() => {
    // Side column (Guests + Tables).
    // Web: make it wider so the guest list feels comfortable on desktop.
    if (windowWidth < 1100) return 320;
    if (windowWidth < 1400) return 380;
    return 420;
  }, [windowWidth]);

  const mapCardHeight = useMemo(() => {
    // Fill most of the viewport height on desktop so the side panel + map
    // feel "full height" (not cut short).
    if (isNarrow) {
      // On narrow layouts we keep it reasonable to avoid huge vertical scroll.
      return Math.round(Math.min(680, Math.max(460, windowHeight * 0.62)));
    }
    // Approximate available viewport space after the stats row + paddings.
    const approxTopUi = 250;
    const available = windowHeight - approxTopUi;
    return Math.round(Math.min(760, Math.max(520, available)));
  }, [isNarrow, windowHeight]);

  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
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
  const [addingGuestsToTable, setAddingGuestsToTable] = useState(false);
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
    // לואדר מלא רק בטעינה הראשונה; בחזרות למסך מרעננים בשקט ברקע
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    try {
      await Promise.all([fetchTables(), fetchGuests()]);
    } finally {
      hasLoadedOnceRef.current = true;
      if (isFirstLoad) setLoading(false);
    }
  }, [fetchGuests, fetchTables, resolvedEventId]);

  // הפוקוס (למטה) מכסה גם את הטעינה הראשונית — useEffect נוסף היה גורם ל-fetch כפול

  // When switching event, reset quick-add selection/context.
  useEffect(() => {
    setQuickAddSelectedGuestIds(new Set());
    setQuickAddGuestSearch('');
  }, [resolvedEventId]);

  useEffect(() => {
    if (quickSeatFilter === 'unseated' && (quickStatusFilter === 'pending' || quickStatusFilter === 'not_arriving')) {
      setQuickStatusFilter('all');
    }
  }, [quickSeatFilter, quickStatusFilter]);

  useEffect(() => {
    if (quickSeatFilter === 'seated' && quickStatusFilter !== 'all') {
      setQuickStatusFilter('all');
    }
  }, [quickSeatFilter, quickStatusFilter]);

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
  const occupancyRate = useMemo(
    () => (confirmedGuestsCount > 0 ? Math.round((seatedGuestsCount / confirmedGuestsCount) * 100) : 0),
    [confirmedGuestsCount, seatedGuestsCount]
  );

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

  const occupiedTablesCount = useMemo(
    () => Array.from(seatedByNumber.values()).filter((value) => Number(value) > 0).length,
    [seatedByNumber]
  );

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
      setAddingGuestsToTable(false);

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

  const filteredGuestsForTableModal = useMemo(() => {
    const query = searchQueryTable.trim().toLowerCase();
    return unseatedGuestsList.filter((g) => {
      const cat = g.guest_categories?.name || 'ללא קטגוריה';
      const categoryMatch = categoryFilterTable === 'הכל' || cat === categoryFilterTable;
      const searchMatch = query ? String(g.name || '').toLowerCase().includes(query) : true;
      return categoryMatch && searchMatch;
    });
  }, [categoryFilterTable, searchQueryTable, unseatedGuestsList]);

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
        if (quickSeatFilter === 'unseated') {
          if (seated) return false;
          if (status !== 'מגיע') return false;
        }
        // When viewing seated guests, always show all statuses.
        if (quickSeatFilter === 'seated') return true;
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
    const id = String(guestId);
    setSelectedGuestsToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveTableName = useCallback(async () => {
    if (!selectedTableForModal) return;
    const currentName = selectedTableForModal.name || '';
    const nextName = tableName.trim().slice(0, TABLE_NAME_MAX_LENGTH);
    if (nextName === currentName.trim()) return;
    const { error } = await supabase
      .from('tables')
      .update({ name: nextName || null })
      .eq('id', selectedTableForModal.id);
    if (error) {
      console.error('Error updating table name:', error);
      return;
    }
    setTables((prev) => prev.map((t) => (t.id === selectedTableForModal.id ? { ...t, name: nextName || null } : t)));
    setSelectedTableForModal((prev) => (prev ? { ...prev, name: nextName || null } : null));
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
    if (selectedGuestsToAdd.size === 0 || addingGuestsToTable) return;
    const tableId = selectedTableForModal?.id;
    if (!tableId) return;

    const guestIds = Array.from(selectedGuestsToAdd);
    const guestsToAdd = guests.filter((g) => guestIds.includes(String(g.id)));
    const totalPeopleToAdd = guestsToAdd.reduce((sum, g) => sum + (Number(g.numberOfPeople) || 1), 0);

    setAddingGuestsToTable(true);
    try {
      const { error: guestUpdateError } = await supabase.from('guests').update({ table_id: tableId }).in('id', guestIds);
      if (guestUpdateError) {
        console.error('Error updating guests:', guestUpdateError);
        Alert.alert('שגיאה', 'לא ניתן להוסיף אורחים לשולחן.');
        return;
      }

      const currentGuestsAtTable = guests.filter((g) => String(g.table_id || '') === String(tableId));
      const currentTotalPeople = currentGuestsAtTable.reduce((sum, g) => sum + (Number(g.numberOfPeople) || 1), 0);
      const newTotalPeople = currentTotalPeople + totalPeopleToAdd;

      const { error: tableUpdateError } = await supabase.from('tables').update({ seated_guests: newTotalPeople }).eq('id', tableId);
      if (tableUpdateError) {
        console.error('Error updating table count:', tableUpdateError);
      }

      await Promise.all([fetchGuests(), fetchTables()]);
      setSelectedGuestsToAdd(new Set());
      await closeTableModal();
    } finally {
      setAddingGuestsToTable(false);
    }
  }, [addingGuestsToTable, closeTableModal, fetchGuests, fetchTables, guests, selectedGuestsToAdd, selectedTableForModal?.id]);

  const handleSaveTableModal = useCallback(async () => {
    if (addingGuestsToTable) return;
    if (tableModalView === 'add' && selectedGuestsToAdd.size > 0) {
      await handleAddGuestsToTable();
      return;
    }
    await closeTableModal();
  }, [addingGuestsToTable, closeTableModal, handleAddGuestsToTable, selectedGuestsToAdd.size, tableModalView]);

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
  const selectedMapTableNumber = useMemo(
    () =>
      (seatConfirmOpen && seatConfirmTable ? Number((seatConfirmTable as any).number) : null) ??
      (selectedTableForModal ? Number((selectedTableForModal as any).number) : null),
    [seatConfirmOpen, seatConfirmTable, selectedTableForModal]
  );
  const useAdminMapPresentation = showManagerChrome;

  const activeWebSketch = useMemo(
    () => (useAdminMapPresentation ? webSketch : webSketchWithNames) ?? webSketch,
    [useAdminMapPresentation, webSketch, webSketchWithNames]
  );

  const seatingMapNode = useMemo(() => {
    if (!webSketch) return null;
    const sketch = activeWebSketch ?? webSketch;
    return (
      <SeatingGridReadonly
        gridCols={sketch.gridCols ?? webSketch.gridCols}
        gridRows={sketch.gridRows ?? webSketch.gridRows}
        tables={sketch.tables ?? webSketch.tables}
        zones={sketch.zones ?? webSketch.zones}
        labels={sketch.labels ?? webSketch.labels}
        hideTableType
        autoFitZoomMultiplier={useAdminMapPresentation ? undefined : isNarrow ? 1.06 : 1.08}
        useBaseColorAsWebBackground
        showTableBorder={false}
        getTableBaseColor={(t: any) => {
          const selected = Number.isFinite(selectedMapTableNumber as any) && Number(t?.number) === Number(selectedMapTableNumber);
          if (selected) return useAdminMapPresentation ? '#10B981' : '#047857';
          const num = Number(t?.number);
          const cap = Number(t?.seats ?? 0) || 0;
          const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
          const full = cap > 0 && seated >= cap;
          const over = cap > 0 && seated > cap;
          if (over) return colors.primary;
          if (full) return colors.primary;
          return t?.type === 'reserve' ? colors.warning : colors.primary;
        }}
        getTableBackgroundAlpha={(t: any) => {
          const selected = Number.isFinite(selectedMapTableNumber as any) && Number(t?.number) === Number(selectedMapTableNumber);
          if (selected) return useAdminMapPresentation ? 0.28 : 0.52;
          const num = Number(t?.number);
          const cap = Number(t?.seats ?? 0) || 0;
          const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
          const full = cap > 0 && seated >= cap;
          const over = cap > 0 && seated > cap;
          if (over) return useAdminMapPresentation ? 0.9 : 0.62;
          if (full) return useAdminMapPresentation ? 0.9 : 0.62;
          return t?.type === 'reserve' ? (useAdminMapPresentation ? 0.72 : 0.34) : (useAdminMapPresentation ? 0.9 : 0.62);
        }}
        getTableBorderColor={(t: any) => {
          const selected = Number.isFinite(selectedMapTableNumber as any) && Number(t?.number) === Number(selectedMapTableNumber);
          if (selected) return useAdminMapPresentation ? '#10B981' : '#047857';
          const num = Number(t?.number);
          const cap = Number(t?.seats ?? 0) || 0;
          const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
          const full = cap > 0 && seated >= cap;
          const over = cap > 0 && seated > cap;
          if (over || full) return useAdminMapPresentation ? '#10B981' : '#047857';
          return t?.type === 'reserve' ? colors.warning : '#FFFFFF';
        }}
        selectedRingColor={useAdminMapPresentation ? '#10B981' : '#047857'}
        isTableSelected={(t: any) => Boolean(selectedMapTableNumber) && Number(t?.number) === Number(selectedMapTableNumber)}
        getTableSubLabel={(t: any) => {
          const num = t?.number;
          if (!num) return null;
          const seated = seatedByNumber.get(Number(num)) ?? 0;
          const cap = Number(t?.seats ?? 0) || 0;
          return cap ? `${seated}/${cap}` : String(seated);
        }}
        getTableTooltip={(t: any) => {
          const num = t?.number;
          if (!num) return null;
          const seated = seatedByNumber.get(Number(num)) ?? 0;
          const cap = Number(t?.seats ?? 0) || 0;
          return cap ? `יושבים בשולחן: ${seated}/${cap}` : `יושבים בשולחן: ${seated}`;
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
    );
  }, [
    activeWebSketch,
    isNarrow,
    openSeatConfirm,
    openTableModal,
    quickAddSelectedGuestIds,
    seatedByNumber,
    selectedMapTableNumber,
    tables,
    useAdminMapPresentation,
    webSketch,
  ]);

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

  // Web: let the seating map use the full available width (no centered maxWidth),
  // so the map doesn't look "boxed" with large side gutters on wide screens.
  const contentPaddingH = windowWidth >= 1100 ? 20 : 12;
  const PageContentComponent: any = useEmbeddedWebShell ? View : ScrollView;
  const pageContentStyle = [
    styles.container,
    { paddingHorizontal: contentPaddingH },
  ];

  const goToEventPage = () => {
    if (isAdminContext && resolvedEventId) {
      router.replace(`/(admin)/admin-event-details?id=${encodeURIComponent(resolvedEventId)}` as any);
      return;
    }
    router.replace({
      pathname: '/(couple)' as const,
      params: resolvedEventId ? { eventId: resolvedEventId } : {},
    });
  };

  const tableCapacity = Number(selectedTableForModal?.capacity ?? 0) || 0;
  const seatedPeopleInTableModal = seatedGuestsForTable.reduce((sum, g) => sum + (Number((g as any).numberOfPeople) || 1), 0);
  const tableOccupancyPercent = tableCapacity ? Math.max(0, Math.min(100, Math.round((seatedPeopleInTableModal / tableCapacity) * 100))) : 0;
  const remainingSeatsInTableModal = tableCapacity ? Math.max(0, tableCapacity - seatedPeopleInTableModal) : 0;
  const selectedTableName = String(selectedTableForModal?.name || '').trim();

  return (
    <View style={[styles.page, isAdminContext ? styles.pageAdmin : null]}>
      <PageContentComponent
        style={useEmbeddedWebShell ? pageContentStyle : styles.scroll}
        contentContainerStyle={!useEmbeddedWebShell ? pageContentStyle : undefined}
        showsVerticalScrollIndicator={!useEmbeddedWebShell ? false : undefined}
      >
        {showManagerChrome ? (
          <View style={styles.adminHeroShell}>
            <AdminWebPageHeader
              eyebrow="ניהול אירועים"
              title="מפת הושבה"
              subtitle="ניהול חלוקת האורחים והסקיצה של האולם בקו עיצובי אחיד עם מסך הצ׳ק אין."
              showNav={false}
              showMenu={!useEmbeddedWebShell}
              useDefaultActions={false}
              leading={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חזרה לעמוד האירוע"
                  onPress={goToEventPage}
                  style={({ hovered, pressed }: any) => [
                    styles.adminBackBtn,
                    Platform.OS === 'web' && hovered ? styles.adminBackBtnHover : null,
                    pressed ? styles.backToEventBtnPressed : null,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={16} color={colors.text} />
                  <Text style={styles.adminBackBtnText}>חזרה</Text>
                </Pressable>
              }
              actions={
                <View style={styles.adminHeaderActions}>
                  <View style={styles.adminHeaderPill}>
                    <View style={[styles.adminHeaderPillDot, { backgroundColor: webSketch ? '#10B981' : 'rgba(148,163,184,0.8)' }]} />
                    <Text style={styles.adminHeaderPillText}>{webSketch ? 'מפה פעילה' : 'ממתין לסקיצה'}</Text>
                  </View>
                </View>
              }
            />

            <View style={[styles.statsRow, isNarrow ? styles.statsRowNarrow : null, isAdminContext ? styles.statsRowAdmin : null]}>
              <StatButton
                icon="checkmark-circle-outline"
                value={confirmedGuestsCount}
                label="אישרו הגעה"
                accentColor={colors.info}
                onPress={() => openGuestModalWithGuests('אישרו הגעה', confirmedGuestsList)}
                narrow={isNarrow}
              />
              <StatButton
                icon="body"
                value={seatedGuestsCount}
                label="הושבו"
                accentColor={colors.success}
                onPress={() => openGuestModalWithGuests('הושבו', seatedGuestsList)}
                narrow={isNarrow}
              />
              <StatButton
                icon="walk"
                value={unseatedGuestsCount}
                label="טרם הושבו"
                accentColor={colors.secondary}
                onPress={() => openGuestModalWithGuests('טרם הושבו', unseatedGuestsList)}
                narrow={isNarrow}
              />
              <StatButton
                icon="grid"
                value={tables.length}
                label="שולחנות"
                accentColor={colors.primary}
                narrow={isNarrow}
                onPress={() =>
                  router.push({
                    pathname: isAdminContext ? ('/(admin)/TablesList' as const) : ('/(couple)/TablesList' as const),
                    params: resolvedEventId ? { eventId: resolvedEventId } : {},
                  })
                }
              />
            </View>
          </View>
        ) : (
          <View style={[styles.heroCard, isNarrow ? styles.heroCardNarrow : null]}>
            <View style={styles.heroMain}>
              <View style={styles.heroTitleRow}>
                <Text style={styles.heroTitleMain}>ניהול הושבה ברור ומסודר</Text>
                <Pressable
                  onPress={goToEventPage}
                  accessibilityRole="button"
                  accessibilityLabel="חזרה לעמוד אירוע"
                  style={({ hovered, pressed }: any) => [
                    styles.heroBackIconBtn,
                    Platform.OS === 'web' && hovered ? styles.heroBackIconBtnHover : null,
                    pressed ? styles.backToEventBtnPressed : null,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={18} color={colors.primary} />
                </Pressable>
              </View>
              <Text style={styles.heroSubtitleMain}>
                בחר מוזמנים, עבור בין שולחנות, ולחץ על המפה כדי לשבץ מהר יותר בלי ללכת לאיבוד בין אזורים שונים במסך.
              </Text>

              <View style={[styles.statsRow, styles.statsRowInsideHero, isNarrow ? styles.statsRowNarrow : null]}>
                <StatButton
                  icon="checkmark-circle-outline"
                  value={confirmedGuestsCount}
                  label="אישרו הגעה"
                  accentColor={colors.info}
                  onPress={() => openGuestModalWithGuests('אישרו הגעה', confirmedGuestsList)}
                  narrow={isNarrow}
                />
                <StatButton
                  icon="body"
                  value={seatedGuestsCount}
                  label="הושבו"
                  accentColor={colors.success}
                  onPress={() => openGuestModalWithGuests('הושבו', seatedGuestsList)}
                  narrow={isNarrow}
                />
                <StatButton
                  icon="walk"
                  value={unseatedGuestsCount}
                  label="טרם הושבו"
                  accentColor={colors.secondary}
                  onPress={() => openGuestModalWithGuests('טרם הושבו', unseatedGuestsList)}
                  narrow={isNarrow}
                />
                <StatButton
                  icon="grid"
                  value={tables.length}
                  label="שולחנות"
                  accentColor={colors.primary}
                  narrow={isNarrow}
                  onPress={() =>
                    router.push({
                      pathname: '/(couple)/TablesList' as const,
                      params: resolvedEventId ? { eventId: resolvedEventId } : {},
                    })
                  }
                />
              </View>

              <View style={styles.heroProgressCard}>
                <View style={styles.heroProgressTop}>
                  <Text style={styles.heroProgressValue}>{occupiedTablesCount}/{tables.length || 0}</Text>
                  <Text style={styles.heroProgressLabel}>שולחנות עם ישיבה בפועל</Text>
                </View>
                <View style={styles.heroProgressBar}>
                  <View
                    style={[
                      styles.heroProgressFill,
                      { width: `${tables.length > 0 ? Math.max(0, Math.min(100, Math.round((occupiedTablesCount / tables.length) * 100))) : 0}%` },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={[styles.mainRow, isNarrow ? styles.mainRowNarrow : null]}>
          <View style={[styles.leftCol, !isNarrow ? { width: leftColWidth } : null]}>
            <ScrollView
              style={[styles.card, !isNarrow ? { height: mapCardHeight } : null]}
              contentContainerStyle={styles.sidePanelCardContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.panelIntro}>
                <View style={styles.panelIntroIcon}>
                  <Ionicons name={sidePanelTab === 'guests' ? 'people-outline' : 'grid-outline'} size={18} color={colors.white} />
                </View>
                <View style={styles.panelIntroText}>
                  <Text style={styles.panelIntroTitle}>{sidePanelTab === 'guests' ? 'רשימת מוזמנים' : 'רשימת שולחנות'}</Text>
                  <Text style={styles.panelIntroSubtitle}>
                    {sidePanelTab === 'guests'
                      ? 'בחר מוזמנים לסידור מהיר או ערוך אותם ישירות מהרשימה.'
                      : 'פתח שולחן כדי לראות תפוסה, שם ופרטי הושבה.'}
                  </Text>
                </View>
              </View>

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
                <View style={styles.cardHeaderTopRow}>
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
                </View>
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

                    {quickSeatFilter !== 'seated' ? (
                      <View style={styles.quickGuestFiltersRow}>
                        {([
                          { key: 'all', label: 'הכל' },
                          { key: 'arriving', label: 'מגיע' },
                        ] as Array<{ key: QuickStatusFilterKey; label: string }>).map((f) => {
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
                    ) : null}
                  </View>

                  <View style={{ height: 10 }} />

                  <View style={styles.sidePanelBody}>
                    <View style={styles.quickGuestList}>
                      {quickAddSections.length === 0 ? (
                        <View style={styles.quickEmptyState}>
                          <View style={styles.quickEmptyIconWrap}>
                            <Ionicons name="people-outline" size={22} color={colors.gray[500]} />
                          </View>
                          <Text style={styles.quickEmptyTitle}>אין מוזמנים להצגה</Text>
                          <Text style={styles.quickEmptySubtitle}>
                            שנה את החיפוש או הסינון כדי לראות אורחים מתאימים להושבה.
                          </Text>
                        </View>
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
                  </View>
                </>
              ) : (
                <>
                  <View style={{ height: 10 }} />

                  <View style={styles.sidePanelBody}>
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
                                <View style={[styles.tableStatusPill, full ? styles.tableStatusFull : styles.tableStatusOk]}>
                                  <Text style={[styles.tableStatusText, full ? styles.tableStatusTextFull : styles.tableStatusTextOk]}>
                                    {full ? 'מלא' : 'זמין'}
                                  </Text>
                                </View>

                                <View style={styles.tableRowRight}>
                                  <View style={styles.tableRowText}>
                                    <Text style={styles.tableRowTitle} numberOfLines={1}>
                                      {name ? name : 'ללא שם'}
                                    </Text>
                                    <Text style={styles.tableRowSub} numberOfLines={1}>
                                      {cap ? `${seatedPeople} / ${cap}` : `${seatedPeople} יושבים`}
                                    </Text>
                                  </View>
                                  <View style={styles.tableNumPill}>
                                    <Text style={styles.tableNumPillText}>#{t.number ?? '—'}</Text>
                                  </View>
                                </View>
                              </View>
                            </Pressable>
                          );
                        })
                      )}
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </View>

          <View style={styles.rightCol}>
            <View style={[styles.mapCard, useAdminMapPresentation ? styles.adminMapCard : null, { minHeight: mapCardHeight }]}>
              <View style={styles.mapHeader}>
                <View style={styles.mapLegendRow}>
                  <View style={[styles.mapLegendPill, useAdminMapPresentation ? styles.adminMapLegendPill : null]}>
                    <View style={[styles.mapLegendDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.mapLegendText}>שולחן רגיל</Text>
                  </View>
                  <View style={[styles.mapLegendPill, useAdminMapPresentation ? styles.adminMapLegendPill : null]}>
                    <View style={[styles.mapLegendDot, { backgroundColor: '#047857' }]} />
                    <Text style={styles.mapLegendText}>מלא או מסומן</Text>
                  </View>
                  <View style={[styles.mapLegendPill, useAdminMapPresentation ? styles.adminMapLegendPill : null]}>
                    <View style={[styles.mapLegendDot, { backgroundColor: colors.secondary }]} />
                    <Text style={styles.mapLegendText}>רזרבה</Text>
                  </View>
                </View>

                <View style={styles.mapHeaderText}>
                  <Text style={styles.mapHeaderTitle}>פריסת שולחנות חיה</Text>
                  <Text style={styles.mapHeaderSubtitle}>
                    {selectedMapTableNumber
                      ? `השולחן ${selectedMapTableNumber} מודגש כעת במפה`
                      : 'לחץ על שולחן במפה כדי למקד את הסקיצה'}
                  </Text>
                </View>

                {useAdminMapPresentation && selectedMapTableNumber ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="נקה שולחן נבחר במפה"
                    onPress={() => {
                      setSeatConfirmOpen(false);
                      setSeatConfirmTable(null);
                      setSelectedTableForModal(null);
                    }}
                    style={({ hovered, pressed }: any) => [
                      styles.linkBtnLike,
                      Platform.OS === 'web' && hovered ? styles.linkBtnLikeHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={styles.linkBtnLikeText}>נקה בחירה</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.mapBody}>
                {webSketch ? (
                  seatingMapNode
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
      </PageContentComponent>

      {/* Guests modal */}
      <Modal visible={guestModalOpen} transparent animationType="fade" onRequestClose={closeGuestModal}>
        <Pressable style={styles.modalOverlay} onPress={closeGuestModal}>
          <Pressable style={[styles.modalCard, { maxHeight: Math.min(0.92 * windowHeight, 760) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTextWrap}>
                <Text style={styles.modalTitle}>{guestModalTitle}</Text>
                <View style={styles.modalHeaderMetaRow}>
                  <View style={styles.modalHeaderMetaPill}>
                    <Text style={styles.modalHeaderMetaText}>{guestModalTotals.guestsCount} מוזמנים</Text>
                  </View>
                  <View style={styles.modalHeaderMetaPill}>
                    <Text style={styles.modalHeaderMetaText}>{guestModalTotals.peopleCount} אנשים</Text>
                  </View>
                  <View style={styles.modalHeaderMetaPill}>
                    <Text style={styles.modalHeaderMetaText}>{guestModalTotals.sectionsCount} קטגוריות</Text>
                  </View>
                </View>
              </View>
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

              {!isNarrow ? (
                <View style={styles.guestModalSidebar}>
                  <View style={styles.guestModalSidebarHeader}>
                    <Text style={styles.guestModalSidebarTitle}>קטגוריות</Text>
                    <View style={styles.guestModalSidebarCountPill}>
                      <Text style={styles.guestModalSidebarCountText}>{guestModalCategories.length}</Text>
                    </View>
                  </View>
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
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Seat selected guests confirmation */}
      <Modal visible={seatConfirmOpen} transparent animationType="fade" onRequestClose={closeSeatConfirm}>
        <Pressable style={styles.modalOverlay} onPress={closeSeatConfirm}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <View style={styles.confirmTopRow}>
              <View style={styles.confirmIconWrap}>
                <Ionicons name="people-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.confirmTopText}>
                <Text style={styles.confirmTitle}>להושיב מוזמנים בשולחן?</Text>
                <Text style={styles.confirmSub} numberOfLines={2}>
                  {seatConfirmTable ? `שולחן ${seatConfirmTable.number ?? '—'}` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.confirmMetaRow}>
              <View style={styles.confirmMetaPill}>
                <Text style={styles.confirmMetaPillValue}>{selectedGuestsForQuickAdd.length}</Text>
                <Text style={styles.confirmMetaPillLabel}>מוזמנים נבחרו</Text>
              </View>
            </View>

            {selectedGuestsForQuickAdd.length ? (
              <View style={styles.confirmNames}>
                {selectedGuestsForQuickAdd.slice(0, 6).map((g: any) => (
                  <View key={String(g.id)} style={styles.confirmNameChip}>
                    <Text style={styles.confirmName} numberOfLines={1}>
                      {String(g.name || '').trim()}
                    </Text>
                  </View>
                ))}
                {selectedGuestsForQuickAdd.length > 6 ? (
                  <View style={styles.confirmMoreChip}>
                    <Text style={styles.confirmMore} numberOfLines={1}>
                      + עוד {selectedGuestsForQuickAdd.length - 6}
                    </Text>
                  </View>
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
              <View style={styles.guestEditHeaderMain}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="סגירה"
                  onPress={closeGuestEdit}
                  style={({ hovered, pressed }: any) => [
                    styles.guestEditCloseBtn,
                    Platform.OS === 'web' && hovered ? styles.guestEditCloseBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="close" size={18} color={colors.white} />
                </Pressable>
                <View style={styles.guestEditHeaderText}>
                  <Text style={styles.guestEditHeaderOverline}>עדכון פרטי מוזמן</Text>
                  <Text style={styles.guestEditTitle} numberOfLines={1}>
                    עריכת מוזמן
                  </Text>
                  <Text style={styles.guestEditSubtitle} numberOfLines={1}>
                    {guestEditGuest?.name ? String(guestEditGuest.name).trim() : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.guestEditHeroBadge}>
                <Ionicons name="person-circle-outline" size={22} color={colors.white} />
              </View>
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
                <View style={styles.guestEditSectionTop}>
                  <View style={styles.guestEditSectionTitleWrap}>
                    <Ionicons name="people-outline" size={16} color={colors.primary} />
                    <Text style={styles.guestEditSectionTitle}>פרטי הגעה</Text>
                  </View>
                  <Text style={styles.guestEditSectionHint}>עדכון מהיר של מספר המקומות שנשמרו עבור המוזמן</Text>
                </View>
                <Text style={styles.guestEditLabel}>כמות מגיעים</Text>
                <View style={styles.guestEditInputShell}>
                  <View style={styles.guestEditInputMetaPill}>
                    <Ionicons name="person-outline" size={14} color={colors.primary} />
                    <Text style={styles.guestEditInputMetaText}>מקומות</Text>
                  </View>
                  <TextInput
                    value={guestEditPeople}
                    onChangeText={setGuestEditPeople}
                    placeholder="לדוגמה: 2"
                    placeholderTextColor={colors.gray[500]}
                    keyboardType="numeric"
                    style={styles.guestEditInput}
                  />
                </View>
              </View>

              {guestEditGuest?.table_id ? (
                <View style={styles.guestEditMoveCard}>
                  <View style={styles.guestEditMoveHeader}>
                    <View style={styles.guestEditSectionTitleWrap}>
                      <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                      <Text style={styles.guestEditMoveTitle}>העברה לשולחן אחר</Text>
                    </View>
                  </View>
                  <Text style={styles.guestEditSectionHint}>בחר שולחן חלופי מהרשימה למטה כדי להעביר את המוזמן בצורה ברורה ומסודרת</Text>

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
                              t === moveTablesForEdit[0] ? styles.guestEditTableOptionFirst : null,
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
                  styles.guestEditFooterBtn,
                  Platform.OS === 'web' && hovered ? styles.guestEditFooterBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.guestEditFooterBtnText}>ביטול</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור"
                onPress={() => void saveGuestEdit()}
                style={({ hovered, pressed }: any) => [
                  styles.guestEditFooterBtnPrimary,
                  Platform.OS === 'web' && hovered ? styles.guestEditFooterBtnPrimaryHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.guestEditFooterBtnPrimaryText}>שמור</Text>
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
                <Text style={styles.tableModalTitle}>שולחן {selectedTableForModal?.number ?? '—'}</Text>
                <View style={styles.tableModalMetaRow}>
                  <View style={styles.tableModalMetaPill}>
                    <Ionicons name="people-outline" size={14} color={colors.gray[700]} />
                    <Text style={styles.tableModalMetaPillText}>{seatedGuestsForTable.length} אורחים</Text>
                  </View>
                  {tableCapacity ? (
                    <View style={styles.tableModalMetaPill}>
                      <Ionicons name="grid-outline" size={14} color={colors.gray[700]} />
                      <Text style={styles.tableModalMetaPillText}>{remainingSeatsInTableModal} מושבים פנויים</Text>
                    </View>
                  ) : null}
                  <View style={[styles.tableModalMetaPill, selectedTableName ? null : styles.tableModalMetaPillMuted]}>
                    <Ionicons name="pricetag-outline" size={14} color={selectedTableName ? colors.primary : colors.gray[500]} />
                    <Text style={[styles.tableModalMetaPillText, selectedTableName ? styles.tableModalMetaPillTextStrong : styles.tableModalMetaPillTextMuted]}>
                      {selectedTableName || 'ללא שם'}
                    </Text>
                  </View>
                </View>
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
                  </View>

                  <View style={styles.tableSettingsField}>
                    <Text style={styles.fieldLabelModern}>שם שולחן (אופציונלי)</Text>
                    <View style={styles.tableNameInputWrap}>
                      <TextInput
                        value={tableName}
                        onChangeText={(text) => setTableName(text.slice(0, TABLE_NAME_MAX_LENGTH))}
                        placeholder="לדוגמה: משפחה / חברים / VIP"
                        placeholderTextColor={colors.gray[500]}
                        style={styles.fieldInputModern}
                        maxLength={TABLE_NAME_MAX_LENGTH}
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
                </View>
              </View>

              {/* Guests */}
              <View style={styles.tableGuestsHeaderRow}>
                <View style={styles.occupancyCard}>
                  <View style={styles.occupancyTopRow}>
                    <Text style={styles.occupancyLabel}>תפוסה</Text>
                    <Text style={styles.occupancyValue}>{tableCapacity ? `${seatedPeopleInTableModal}/${tableCapacity}` : String(seatedPeopleInTableModal)}</Text>
                  </View>
                  <Text style={styles.occupancySubLabel}>
                    {tableCapacity ? `${tableOccupancyPercent}% תפוסה` : 'ללא הגדרת קיבולת לשולחן'}
                  </Text>
                  <View style={styles.occupancyBar}>
                    <View style={[styles.occupancyFill, { width: `${tableOccupancyPercent}%` }]} />
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
                <View style={styles.tableGuestsCardTop}>
                  <View style={styles.tableGuestsCardTopText}>
                    <Text style={styles.tableGuestsCardTitle}>רשימת הושבה</Text>
                    <Text style={styles.tableGuestsCardHint}>
                      {seatedGuestsForTable.length
                        ? `כרגע יושבים בשולחן ${seatedGuestsForTable.length} אורחים`
                        : 'עדיין לא שובצו אורחים לשולחן הזה'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="מעבר להוספת אורחים"
                    onPress={() => setTableModalView('add')}
                    style={({ hovered, pressed }: any) => [
                      styles.addGuestsPrimaryBtn,
                      Platform.OS === 'web' && hovered ? styles.addGuestsPrimaryBtnHover : null,
                      pressed ? styles.btnPressed : null,
                    ]}
                  >
                    <Ionicons name="person-add" size={15} color={colors.white} />
                    <Text style={styles.addGuestsPrimaryBtnText}>הוסף אורחים</Text>
                  </Pressable>
                </View>

                {seatedGuestsForTable.length === 0 ? (
                  <View style={styles.tableGuestsEmpty}>
                    <View style={styles.tableGuestsEmptyIcon}>
                      <Ionicons name="people-outline" size={22} color={colors.gray[500]} />
                    </View>
                    <Text style={styles.tableGuestsEmptyTitle}>אין אורחים יושבים בשולחן זה</Text>
                    <Text style={styles.tableGuestsEmptySubtitle}>אפשר להוסיף אורחים בלחיצה על הכפתור למעלה.</Text>
                  </View>
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

                <View style={styles.addGuestsSection}>
                  <View style={styles.addGuestsSectionHeader}>
                    <View style={styles.addGuestsSectionBadge}>
                      <Text style={styles.addGuestsSectionBadgeText}>{filteredGuestsForTableModal.length}</Text>
                    </View>
                    <View style={styles.addGuestsSectionText}>
                      <Text style={styles.addGuestsSectionTitle}>אורחים זמינים להושבה</Text>
                      <Text style={styles.addGuestsSectionSubtitle}>
                        בחר את האורחים שעדיין לא שובצו ולאחר מכן אשר את ההוספה לשולחן.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.addList}>
                    {filteredGuestsForTableModal.length === 0 ? (
                      <View style={styles.addGuestsEmpty}>
                        <View style={styles.addGuestsEmptyIcon}>
                          <Ionicons name="people-outline" size={22} color={colors.gray[500]} />
                        </View>
                        <Text style={styles.addGuestsEmptyTitle}>לא נמצאו אורחים זמינים</Text>
                        <Text style={styles.addGuestsEmptySubtitle}>
                          כל האורחים שהגיעו כבר הושבו, או שאין התאמה לחיפוש ולסינון שבחרת.
                        </Text>
                      </View>
                    ) : (
                      filteredGuestsForTableModal.map((item) => {
                        const selected = selectedGuestsToAdd.has(String(item.id));
                        return (
                          <Pressable
                            key={String(item.id)}
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
                      })
                    )}
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="הוסף אורחים"
                    onPress={() => void handleAddGuestsToTable()}
                    disabled={selectedGuestsToAdd.size === 0 || addingGuestsToTable}
                    style={({ hovered, pressed }: any) => [
                      styles.primaryBtn,
                      selectedGuestsToAdd.size === 0 || addingGuestsToTable ? styles.primaryBtnDisabled : null,
                      Platform.OS === 'web' && hovered && selectedGuestsToAdd.size > 0 && !addingGuestsToTable
                        ? styles.primaryBtnHover
                        : null,
                      pressed ? styles.btnPressed : null,
                    ]}
                  >
                    <Ionicons name="person-add" size={18} color={colors.white} />
                    <Text style={styles.primaryBtnText}>
                      {addingGuestsToTable
                        ? 'מושיב...'
                        : selectedGuestsToAdd.size > 0
                          ? `הוסף ${selectedGuestsToAdd.size} אורחים`
                          : 'בחר אורחים להוספה'}
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
                disabled={addingGuestsToTable}
                style={({ hovered, pressed }: any) => [
                  styles.footerBtn,
                  addingGuestsToTable ? styles.primaryBtnDisabled : null,
                  Platform.OS === 'web' && hovered && !addingGuestsToTable ? styles.footerBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.footerBtnText}>ביטול</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור שינויים"
                onPress={() => void handleSaveTableModal()}
                disabled={addingGuestsToTable}
                style={({ hovered, pressed }: any) => [
                  styles.footerBtnPrimary,
                  addingGuestsToTable ? styles.primaryBtnDisabled : null,
                  Platform.OS === 'web' && hovered && !addingGuestsToTable ? styles.footerBtnPrimaryHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Text style={styles.footerBtnPrimaryText}>
                  {addingGuestsToTable
                    ? 'שומר...'
                    : tableModalView === 'add' && selectedGuestsToAdd.size > 0
                      ? `שמור (${selectedGuestsToAdd.size} אורחים)`
                      : 'שמור שינויים'}
                </Text>
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
    backgroundColor: 'transparent',
    direction: 'rtl',
  },
  pageAdmin: {
    backgroundColor: '#E8F1FF',
  },
  backToEventBtnPressed: {
    opacity: 0.9,
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

  statsRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' },
  statsRowNarrow: { gap: 10 },
  statsRowAdmin: { marginTop: 0 },
  adminHeroShell: { gap: 18, marginBottom: 14 },
  adminBackBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  adminBackBtnHover: {
    backgroundColor: '#F8FAFD',
    borderColor: 'rgba(15,69,230,0.12)',
  },
  adminBackBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  adminHeaderActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  adminHeaderPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  adminHeaderPillDot: { width: 8, height: 8, borderRadius: 999 },
  adminHeaderPillText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  heroCard: {
    marginBottom: 14,
    padding: 18,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: 'rgba(255,255,255,0.86)',
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 16,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 18px 48px rgba(13,28,43,0.08)' } as any)
      : null),
  },
  heroCardNarrow: {
    flexDirection: 'column',
  },
  heroMain: {
    flex: 1.2,
    alignItems: 'stretch',
  },
  heroTitleMain: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0d1c2b',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroTitleRow: {
    marginTop: 6,
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  heroBackIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,53,102,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.12)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  heroBackIconBtnHover: {
    backgroundColor: 'rgba(0,53,102,0.12)',
    borderColor: 'rgba(0,53,102,0.18)',
  },
  heroSubtitleMain: {
    marginTop: 6,
    maxWidth: 760,
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
    width: '100%',
    alignSelf: 'stretch',
  },
  heroProgressCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  heroProgressTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroProgressLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroProgressValue: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'left',
  },
  heroProgressBar: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.10)',
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.secondary,
  },
  statBtn: {
    position: 'relative',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    minWidth: 140,
    minHeight: 130,
    flexGrow: 1,
    flexBasis: 150,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 1px rgba(11,48,65,0.02), 0 12px 28px rgba(16,24,40,0.08)' } as any) : null),
  },
  statBtnNarrow: {
    flexBasis: '47%',
    minWidth: 0,
    minHeight: 112,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  statGlow: {
    position: 'absolute',
    top: -34,
    right: -22,
    width: 118,
    height: 118,
    borderRadius: 999,
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 12,
  },
  statTopTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  statEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 22px rgba(15,23,42,0.08)' } as any) : null),
  },
  statValueBlock: {
    marginTop: 18,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  statValue: { fontSize: 34, fontWeight: '900', color: colors.text, letterSpacing: -0.8, textAlign: 'right' },
  statLabel: { fontSize: 14, fontWeight: '800', color: colors.gray[700], marginTop: 4, textAlign: 'right', writingDirection: 'rtl' },
  statFooterRow: {
    marginTop: 14,
    width: '100%',
    alignItems: 'flex-end',
  },
  statAccentBar: {
    width: 64,
    height: 4,
    borderRadius: 999,
  },
  statsRowInsideHero: {
    marginTop: 16,
    width: '100%',
  },

  // RTL layout: with `direction: 'rtl'`, `row` places the first column on the RIGHT.
  // We render the tables column first, so it becomes the right side panel, and the map stays on the left.
  mainRow: { marginTop: 14, flexDirection: 'row', alignItems: 'stretch', gap: 14 },
  mainRowNarrow: { flexDirection: 'column-reverse' },
  leftCol: { gap: 14 },
  rightCol: { flex: 1, minWidth: 0 },

  card: {
    backgroundColor: '#F4F7FB',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.10)',
    padding: 18,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 22px 48px rgba(13,28,43,0.12)',
        } as any)
      : null),
  },
  sidePanelToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    padding: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(0,53,102,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.08)',
  },
  sidePanelCardContent: { paddingBottom: 10 },
  sidePanelBody: { width: '100%' },
  panelIntro: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.14)',
    marginBottom: 14,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 16px 32px rgba(0,53,102,0.18)' } as any) : null),
  },
  panelIntroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  panelIntroText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    width: '100%',
  },
  panelIntroTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    alignSelf: 'stretch',
  },
  panelIntroSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
    width: '100%',
    alignSelf: 'stretch',
  },
  cardHeader: { gap: 10, marginBottom: 4 },
  cardHeaderTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    alignSelf: 'stretch',
  },
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    height: 44,
    width: '100%',
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.12)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 18px rgba(13,28,43,0.06)' } as any) : null),
  },
  searchInput: {
    flex: 1,
    minWidth: 160,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', direction: 'rtl' } as any) : null),
  },
  tableList: { gap: 14, paddingBottom: 8 },
  tableRow: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.10)',
    borderRightWidth: 4,
    borderRightColor: 'rgba(0,53,102,0.30)',
    backgroundColor: colors.white,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl', boxShadow: '0 12px 24px rgba(13,28,43,0.07)' } as any) : null),
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tableRowRight: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flex: 1, minWidth: 0 },
  tableRowText: { flex: 1, minWidth: 0, alignItems: 'flex-start', justifyContent: 'center' },
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
  tableNumPill: { minWidth: 44, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(0,53,102,0.12)', borderWidth: 1, borderColor: 'rgba(0,53,102,0.14)', alignItems: 'center' },
  tableNumPillText: { fontSize: 12, fontWeight: '900', color: '#0d1c2b', textAlign: 'right', writingDirection: 'rtl' },
  tableRowTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  tableRowSub: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  tableStatusPill: { minWidth: 68, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, alignItems: 'center' },
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
  adminMapCard: {
    borderRadius: 24,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 18,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(13,28,43,0.06)' } as any) : null),
  },
  mapHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  mapBody: { flex: 1, minHeight: 0 },
  mapHeaderText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  mapHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapHeaderSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapLegendRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  mapLegendPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  adminMapLegendPill: {
    backgroundColor: 'rgba(248,250,252,1)',
  },
  mapLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  mapLegendText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  linkBtnLike: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  linkBtnLikeHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  linkBtnLikeText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right', writingDirection: 'rtl' },
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
    backgroundColor: 'rgba(250,252,255,0.98)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(214,226,242,0.95)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 30px 80px rgba(15,23,42,0.18)' } as any) : null),
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(214,226,242,0.95)',
    backgroundColor: 'rgba(255,255,255,0.88)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalHeaderTextWrap: { flex: 1, minWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', gap: 8 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  modalHeaderMetaRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  modalHeaderMetaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  modalHeaderMetaText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalCloseBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },

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
  tableModalMetaRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tableModalMetaPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  tableModalMetaPillMuted: {
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.12)',
  },
  tableModalMetaPillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  tableModalMetaPillTextStrong: { color: colors.primary },
  tableModalMetaPillTextMuted: { color: colors.gray[500] },
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
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    padding: 14,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 28px rgba(15,23,42,0.06)' } as any) : null),
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
    backgroundColor: 'rgba(22,163,74,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableActionBtnHover: { backgroundColor: 'rgba(22,163,74,0.10)' },
  tableActionBtnDanger: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(244,63,94,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableActionBtnDangerHover: { backgroundColor: 'rgba(244,63,94,0.06)' },

  // With the table modal forced to LTR on web, keep a predictable order:
  // occupancy on the left, header text on the right.
  tableGuestsHeaderRow: { gap: 12 },
  // When wrapping onto a new line (small modal width), force the header block
  // to take the full row so the Hebrew text can align to the RIGHT edge.
  tableGuestsHeaderText: { minWidth: 240, width: '100%', alignItems: 'flex-end' },
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
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 28px rgba(37,99,235,0.08)' } as any) : null),
  },
  occupancyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  occupancyLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  occupancyValue: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  occupancySubLabel: { marginTop: 4, fontSize: 11, fontWeight: '800', color: colors.primary, textAlign: 'right', writingDirection: 'rtl' },
  occupancyBar: { marginTop: 10, height: 10, borderRadius: 999, backgroundColor: 'rgba(191,219,254,0.45)', overflow: 'hidden' },
  occupancyFill: { height: 10, borderRadius: 999, backgroundColor: colors.primary },

  tableGuestsCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 28px rgba(15,23,42,0.06)' } as any) : null),
  },
  tableGuestsCardTop: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226,232,240,0.8)',
    backgroundColor: 'rgba(248,250,252,0.86)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  tableGuestsCardTopText: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 },
  tableGuestsCardTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl', width: '100%' },
  tableGuestsCardHint: { fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl', width: '100%' },
  addGuestsPrimaryBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 8px 18px rgba(15,69,230,0.18)' } as any) : null),
  },
  addGuestsPrimaryBtnHover: {
    opacity: 0.96,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 22px rgba(15,69,230,0.22)' } as any) : null),
  },
  addGuestsPrimaryBtnText: { color: colors.white, fontSize: 12, fontWeight: '900', writingDirection: 'rtl' },
  tableGuestsEmpty: { paddingHorizontal: 18, paddingVertical: 24, alignItems: 'center', justifyContent: 'center', gap: 8 },
  tableGuestsEmptyIcon: { width: 44, height: 44, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.05)', alignItems: 'center', justifyContent: 'center' },
  tableGuestsEmptyTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'center', writingDirection: 'rtl' },
  tableGuestsEmptySubtitle: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center', writingDirection: 'rtl' },
  tableGuestsList: { padding: 10, gap: 8 },
  tableGuestRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.72)',
    borderRadius: 16,
    backgroundColor: colors.white,
  },
  tableGuestRowHover: {
    backgroundColor: 'rgba(248,250,252,0.96)',
    borderColor: 'rgba(59,130,246,0.16)',
  },
  tableGuestRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  tableGuestAvatar: { width: 38, height: 38, borderRadius: 999, backgroundColor: 'rgba(59,130,246,0.10)', alignItems: 'center', justifyContent: 'center' },
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

  guestModalContent: { flex: 1, flexDirection: 'row', minHeight: 0 },
  guestModalContentNarrow: { flexDirection: 'column' },
  guestModalSidebar: {
    width: 240,
    backgroundColor: 'rgba(245,249,255,0.92)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(214,226,242,0.95)',
    padding: 14,
    gap: 12,
  },
  guestModalSidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  guestModalSidebarTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestModalSidebarCountPill: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestModalSidebarCountText: { fontSize: 11, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  guestModalSidebarScroll: { flex: 1 },
  guestModalSidebarList: { gap: 8, paddingBottom: 8 },
  guestModalCategoryBtn: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(214,226,242,0.9)',
    alignItems: 'flex-end',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 8px 18px rgba(15,23,42,0.04)' } as any) : null),
  },
  guestModalCategoryBtnHover: { backgroundColor: 'rgba(248,250,252,0.98)' },
  guestModalCategoryBtnActive: { backgroundColor: '#0F2B5B', borderColor: '#0F2B5B' },
  guestModalCategoryText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },
  guestModalCategoryTextActive: { color: colors.white },

  guestModalMain: { flex: 1, minWidth: 0, minHeight: 0, backgroundColor: 'rgba(252,253,255,0.92)' },
  guestModalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(214,226,242,0.72)',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
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
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    padding: 14,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 24px rgba(15,23,42,0.05)' } as any) : null),
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionCountText: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  sectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(248,250,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guestRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  guestRowAvatar: { width: 34, height: 34, borderRadius: 999, backgroundColor: 'rgba(59,130,246,0.10)', alignItems: 'center', justifyContent: 'center' },
  guestRowAvatarText: { fontSize: 14, fontWeight: '900', color: colors.yaleBlue, writingDirection: 'rtl' },
  guestRowText: { flex: 1, minWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start' },
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
  toggleBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  toggleBtnHover: { backgroundColor: colors.white, borderColor: 'rgba(0,53,102,0.16)' },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 20px rgba(0,53,102,0.22)' } as any) : null),
  },
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

  addGuestsSection: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 28px rgba(15,23,42,0.06)' } as any) : null),
  },
  addGuestsSectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226,232,240,0.8)',
    backgroundColor: 'rgba(248,250,252,0.82)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  addGuestsSectionText: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 },
  addGuestsSectionTitle: { width: '100%', fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  addGuestsSectionSubtitle: { width: '100%', fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  addGuestsSectionBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  addGuestsSectionBadgeText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'center' },
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
  addGuestsEmpty: { paddingHorizontal: 18, paddingVertical: 24, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addGuestsEmptyIcon: { width: 44, height: 44, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.05)', alignItems: 'center', justifyContent: 'center' },
  addGuestsEmptyTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'center', writingDirection: 'rtl' },
  addGuestsEmptySubtitle: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center', writingDirection: 'rtl' },

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

  quickAddHint: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(239,246,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.14)',
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  quickGuestFiltersOuter: {
    marginTop: 12,
    alignSelf: 'stretch',
    alignItems: 'stretch',
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(230,238,248,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.10)',
    ...(Platform.OS === 'web' ? ({ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 10px 24px rgba(13,28,43,0.05)' } as any) : null),
  },
  quickSeatToggleRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  quickGuestFiltersRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
    paddingTop: 2,
    paddingBottom: 2,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  quickFilterChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.12)',
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
  quickGuestList: { gap: 14, paddingBottom: 8 },
  quickEmptyState: {
    paddingHorizontal: 18,
    paddingVertical: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 24px rgba(13,28,43,0.05)' } as any) : null),
  },
  quickEmptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickEmptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  quickEmptySubtitle: {
    maxWidth: 280,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  quickSectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.10)',
    borderRightWidth: 4,
    borderRightColor: 'rgba(0,53,102,0.26)',
    backgroundColor: colors.white,
    padding: 12,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(13,28,43,0.07)' } as any) : null),
  },
  // RTL: `row` places first child on the RIGHT.
  quickSectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 0,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    marginBottom: 10,
  },
  quickSectionTitleWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  quickSectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.gray[800],
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
    minWidth: 0,
    marginLeft: 5,
    marginRight: 5,
  },
  quickSectionPill: { minWidth: 36, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,53,102,0.12)', borderWidth: 1, borderColor: 'rgba(0,53,102,0.14)', alignItems: 'center' },
  quickSectionPillText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'center' },
  quickSectionBody: { gap: 10 },
  quickGuestRow: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.10)',
    borderRightWidth: 4,
    borderRightColor: 'rgba(59,130,246,0.28)',
    backgroundColor: colors.white,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl', boxShadow: '0 12px 24px rgba(13,28,43,0.07)' } as any) : null),
  },
  quickGuestRowHover: {
    borderColor: 'rgba(59,130,246,0.20)',
    backgroundColor: 'rgba(59,130,246,0.04)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 1px rgba(59,130,246,0.08), 0 14px 28px rgba(13,28,43,0.10)' } as any) : null),
  },
  quickGuestRowSelected: {
    borderColor: 'rgba(59,130,246,0.35)',
    backgroundColor: 'rgba(59,130,246,0.06)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 1px rgba(59,130,246,0.10), 0 16px 30px rgba(59,130,246,0.10)' } as any) : null),
  },
  quickGuestRowDisabled: {
    opacity: 0.75,
    backgroundColor: 'rgba(248,250,252,0.92)',
  },
  // RTL row: right side (checkbox + name), left side (status)
  quickGuestRowTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  // In RTL, `row` places first child on the RIGHT.
  // We render checkbox first, then text => checkbox is right of the name.
  quickGuestRightGroup: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  quickGuestLeftGroup: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  quickGuestEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(0,53,102,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  quickGuestEditBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  quickGuestTextWrap: { flex: 1, minWidth: 0, alignItems: 'flex-start', justifyContent: 'center' },
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
  quickGuestBadge: { minWidth: 78, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, alignItems: 'center' },
  quickGuestBadgeOk: { backgroundColor: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.24)' },
  quickGuestBadgeMuted: { backgroundColor: 'rgba(15,23,42,0.04)', borderColor: 'rgba(15,23,42,0.10)' },
  quickGuestBadgeText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
  quickGuestBadgeTextOk: { color: '#065F46' },
  quickGuestBadgeTextMuted: { color: colors.gray[700] },

  // Guest edit modal
  guestEditCard: {
    width: '100%',
    backgroundColor: '#F8FBFF',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.12)',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 32px 90px rgba(6,23,62,0.22)',
          direction: 'rtl',
        } as any)
      : null),
  },
  guestEditHeader: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        } as any)
      : null),
  },
  guestEditHeaderMain: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 },
  guestEditHeroBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 28px rgba(0,0,0,0.14)' } as any) : null),
  },
  guestEditCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  guestEditCloseBtnHover: { backgroundColor: 'rgba(255,255,255,0.16)' },
  guestEditHeaderText: { flex: 1, minWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-end', gap: 3, alignSelf: 'stretch' },
  guestEditHeaderOverline: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    letterSpacing: 0.4,
  },
  guestEditTitle: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    alignSelf: 'stretch',
  },
  guestEditSubtitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    alignSelf: 'stretch',
  },
  guestEditBody: {
    padding: 22,
    gap: 18,
    alignItems: 'stretch',
    backgroundColor: '#F8FBFF',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestEditInfoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  guestEditInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.09)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 24px rgba(13,28,43,0.06)' } as any) : null),
  },
  guestEditInfoText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },
  guestEditField: {
    gap: 12,
    alignItems: 'stretch',
    padding: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.08)',
    borderRightWidth: 4,
    borderRightColor: 'rgba(0,53,102,0.22)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 14px 32px rgba(13,28,43,0.07)' } as any) : null),
  },
  guestEditSectionTop: { gap: 6, justifyContent: 'flex-start', alignItems: 'flex-start' },
  guestEditSectionTitleWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  guestEditSectionTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestEditSectionHint: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl', width: '100%' },
  guestEditLabel: {
    alignSelf: 'stretch',
    width: '100%',
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestEditInputShell: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  guestEditInputMetaPill: {
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  guestEditInputMetaText: { fontSize: 12, fontWeight: '900', color: colors.primary, writingDirection: 'rtl' },
  guestEditInput: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.10)',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  guestEditMoveCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.08)',
    borderRightWidth: 4,
    borderRightColor: 'rgba(59,130,246,0.22)',
    padding: 18,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 14px 32px rgba(13,28,43,0.07)' } as any) : null),
  },
  guestEditMoveHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 6 },
  guestEditMoveTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestEditTablesList: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.08)',
    backgroundColor: 'rgba(248,250,252,0.96)',
    maxHeight: 280,
    overflow: 'hidden',
  },
  guestEditTableOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.65)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  guestEditTableOptionFirst: { borderTopWidth: 0 },
  guestEditTableOptionHover: { backgroundColor: 'rgba(239,246,255,0.92)' },
  guestEditTableOptionSelected: { backgroundColor: 'rgba(16,185,129,0.08)', borderRightWidth: 4, borderRightColor: '#16A34A' },
  guestEditTableOptionRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  guestEditTableNumPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,53,102,0.08)', borderWidth: 1, borderColor: 'rgba(0,53,102,0.10)' },
  guestEditTableNumText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], writingDirection: 'rtl' },
  guestEditTableName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestEditFooter: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,53,102,0.08)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    flexDirection: 'row',
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
  guestEditFooterBtn: {
    minWidth: 110,
    paddingHorizontal: 16,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  guestEditFooterBtnHover: { backgroundColor: 'rgba(248,250,252,0.92)' },
  guestEditFooterBtnText: { fontSize: 13, fontWeight: '900', color: colors.gray[800], writingDirection: 'rtl' },
  guestEditFooterBtnPrimary: {
    minWidth: 150,
    paddingHorizontal: 22,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 12px 28px rgba(6,23,62,0.20)' } as any) : null),
  },
  guestEditFooterBtnPrimaryHover: {
    opacity: 0.97,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 14px 32px rgba(6,23,62,0.24)' } as any) : null),
  },
  guestEditFooterBtnPrimaryText: { fontSize: 13, fontWeight: '900', color: colors.white, writingDirection: 'rtl' },

  confirmCard: {
    width: 420,
    maxWidth: '92%',
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    padding: 18,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 30px 80px rgba(0,0,0,0.18)' } as any) : null),
  },
  confirmTopRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  confirmIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  confirmTopText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  confirmTitle: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl', width: '100%' },
  confirmSub: { marginTop: 4, fontSize: 14, fontWeight: '800', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl', width: '100%' },
  confirmMetaRow: { marginTop: 14, alignItems: 'center', justifyContent: 'center' },
  confirmMetaPill: {
    minWidth: 132,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(248,250,252,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  confirmMetaPillValue: { fontSize: 22, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  confirmMetaPillLabel: { fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'center', writingDirection: 'rtl' },
  confirmNames: { marginTop: 14, flexDirection: 'row', flexWrap: 'nowrap', gap: 8, alignItems: 'center', justifyContent: 'center' },
  confirmNameChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  confirmName: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  confirmMoreChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  confirmMore: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  confirmActions: { marginTop: 18, flexDirection: 'row-reverse', gap: 10 },
  confirmBtn: { flex: 1, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmBtnPrimary: { backgroundColor: colors.primary },
  confirmBtnPrimaryHover: { opacity: 0.96 },
  confirmBtnGhost: { backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)' },
  confirmBtnGhostHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  confirmBtnDisabled: { opacity: 0.7 },
  confirmPrimaryText: { color: colors.white, fontSize: 13, fontWeight: '900', writingDirection: 'rtl' },
  confirmGhostText: { color: colors.gray[800], fontSize: 13, fontWeight: '900', writingDirection: 'rtl' },
});


