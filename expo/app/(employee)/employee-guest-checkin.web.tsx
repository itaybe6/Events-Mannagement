import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';

import { colors } from '@/constants/colors';
import { useGuestCheckInModel } from '@/features/guests/useGuestCheckInModel';
import { TableNumberFilter } from '@/features/guests/TableNumberFilter';
import { eventService } from '@/lib/services/eventService';
import { tableService } from '@/lib/services/tableService';
import { supabase } from '@/lib/supabase';
import { SeatingGridReadonly } from '../seating/web/SeatingGridReadonly';
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type Orientation, type TableType } from '../seating/web/_types';
import type { Guest, Table } from '@/types';
import { touchHitSlop, useResponsive } from '@/lib/responsive';
import WebAppMenu from '@/components/desktop/WebAppMenu';
import { useWebAppShell } from '@/components/desktop/WebAppShell';

const NO_TABLE_KEY = '__no_table__' as const;

type WebSketch = {
  gridCols: number;
  gridRows: number;
  tables: any[];
  zones: any[];
  labels: any[];
};

function toArrayMaybe(v: any): any[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [];
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

function tableTypeFromShape(shape: any): TableType {
  const s = String(shape || '').toLowerCase();
  if (s === 'reserve') return 'reserve';
  if (s === 'rectangle' || s === 'knight') return 'knight';
  return 'regular';
}

function parseTableNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function initialsFromName(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  const s = `${a}${b}`.trim();
  return s ? s.toUpperCase() : '•';
}

function CheckinOverviewStat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  /** Single accent for the "arrived" stat — keeps the rest of the strip quiet. */
  highlight?: boolean;
}) {
  return (
    <View style={styles.overviewStatCard}>
      <View style={[styles.overviewStatIconBox, highlight ? styles.overviewStatIconBoxHighlight : null]}>
        <Ionicons name={icon} size={14} color={highlight ? '#0E9F6E' : colors.primary} />
      </View>
      <View style={styles.overviewStatCopy}>
        <Text style={styles.overviewStatValue}>{value}</Text>
        <Text style={styles.overviewStatLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function Switch({
  checked,
  disabled,
  onPress,
  accessibilityLabel,
  saving,
  large,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  /** Touch sizing — this is the most-tapped control on the check-in screen. */
  large?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={large ? { top: 8, bottom: 8, left: 6, right: 6 } : undefined}
      style={({ hovered, pressed }: any) => [
        ui.switchWrap,
        large ? ui.switchWrapLarge : null,
        checked ? ui.switchWrapOn : null,
        disabled ? { opacity: 0.6 } : null,
        Platform.OS === 'web' && hovered ? ui.switchHover : null,
        pressed ? { opacity: 0.92 } : null,
      ]}
    >
      <View style={[ui.switchTrack, checked ? ui.switchTrackOn : null]} />
      <View
        style={[
          ui.switchThumb,
          large ? ui.switchThumbLarge : null,
          checked ? (large ? ui.switchThumbLargeOn : ui.switchThumbOn) : null,
        ]}
      >
        {saving ? <ActivityIndicator size={large ? 16 : 12} color={colors.primary} /> : null}
      </View>
    </Pressable>
  );
}

function EmployeeGuestCheckinWebDesktopScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { eventId, returnTo } = useLocalSearchParams<{ eventId?: string; returnTo?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const { width, height } = useWindowDimensions();
  const {
    isPhone,
    isTablet,
    isTabletPortrait,
    isTouchLayout,
    sidebarWidth,
  } = useResponsive();
  const { hasSidebar, sidebarInset } = useWebAppShell();
  const railInset = hasSidebar ? sidebarInset || sidebarWidth || 280 : 0;
  const scrollTopFabRight = hasSidebar ? Math.max(20, railInset + 18) : 22;
  const isMobile = isPhone;
  // Side-by-side needs real horizontal room. A portrait iPad has the width for it
  // on paper (1024pt on a 13") but the map ends up unusably squeezed, so key off
  // orientation rather than raw width.
  const isSideBySide = isTablet ? !isTabletPortrait : width >= 1024;
  const isNarrow = width < 520;
  // Drawers are `position: fixed` to the viewport, so they must sit to the
  // LEFT of the RTL sidebar instead of sliding out underneath it.
  const drawerRight = hasSidebar && !isNarrow && !isMobile ? railInset + 16 : 16;
  const drawerScrimRight = drawerRight + 436;
  const metricsInOneRow = Platform.OS === 'web' && width >= 768;
  // Row controls stay visually compact so the list keeps its density, but their
  // hit areas grow to the 44pt minimum on touch.
  const stepBtnHitSlop = touchHitSlop(isTouchLayout ? 34 : 26, isTouchLayout);
  const moveBtnHitSlop = touchHitSlop(isTouchLayout ? 40 : 36, isTouchLayout);
  const isAdminRoute = String(pathname || '').toLowerCase().includes('admin-guest-checkin');
  const fallbackToDetails = useMemo(
    () =>
      resolvedEventId
        ? isAdminRoute
          ? `/(admin)/admin-event-details?id=${resolvedEventId}`
          : `/(employee)/employee-event-details?id=${resolvedEventId}`
        : isAdminRoute
          ? '/(admin)/admin-events'
          : '/(employee)/employee-events',
    [isAdminRoute, resolvedEventId]
  );
  const backHref = useMemo(() => {
    const raw = String(returnTo || '').trim();
    return raw || fallbackToDetails;
  }, [fallbackToDetails, returnTo]);
  const handleBack = useCallback(() => {
    router.replace(backHref as any);
  }, [backHref, router]);

  /**
   * Live map, with this check-in screen as its "back" target so an usher can
   * bounce between counting heads and marking arrivals.
   */
  const liveMapHref = useMemo(() => {
    if (!resolvedEventId) return null;

    const liveBase = isAdminRoute ? '/(admin)/live-seating' : '/(employee)/employee-live-seating';
    const checkInBase = isAdminRoute
      ? '/(admin)/admin-guest-checkin'
      : '/(employee)/employee-guest-checkin';
    const rawReturn = String(returnTo || '').trim();
    const backToCheckIn = `${checkInBase}?eventId=${resolvedEventId}${
      rawReturn ? `&returnTo=${encodeURIComponent(rawReturn)}` : ''
    }`;

    return `${liveBase}?eventId=${resolvedEventId}&returnTo=${encodeURIComponent(backToCheckIn)}`;
  }, [isAdminRoute, resolvedEventId, returnTo]);

  const openLiveMap = useCallback(() => {
    if (liveMapHref) router.push(liveMapHref as any);
  }, [liveMapHref, router]);
  const [collapsedTableGroups, setCollapsedTableGroups] = useState<Record<string, boolean>>({});
  const [tableFilter, setTableFilter] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableNumberById, setTableNumberById] = useState<Map<string, number | null>>(() => new Map());
  const [webSketch, setWebSketch] = useState<WebSketch | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);

  const sendTableUpdateSms = useCallback(
    async (guestId: string) => {
      if (!resolvedEventId || !guestId) return;
      try {
        await supabase.functions.invoke('send-checkin-table-sms', {
          body: { eventId: resolvedEventId, guestId, type: 'table_update' },
        });
      } catch (e) {
        console.warn('Table update SMS send failed:', e);
      }
    },
    [resolvedEventId]
  );

  const {
    loading,
    searching,
    listHint,
    guests,
    categories,
    filteredGuests,
    counts,
    query,
    setQuery,
    filter,
    setFilter,
    refresh,
    toggleCheckIn,
    savingId,
    setCheckedInCount,
    savingCountId,
    assignGuestToTable,
    savingMoveId,
    addWalkInGuest,
    addingWalkIn,
  } = useGuestCheckInModel({
    eventId: resolvedEventId ? resolvedEventId : null,
    errorTitle: 'שגיאה',
    errorMessage: 'לא ניתן לטעון את רשימת האורחים',
  });

  // Uncontrolled search input: binding value={query} re-rendered the whole
  // screen (including every guest card) on each keystroke.
  const queryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeQuery = useCallback(
    (text: string) => {
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
      queryDebounceRef.current = setTimeout(() => setQuery(text), 120);
    },
    [setQuery]
  );
  useEffect(() => {
    return () => {
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    };
  }, []);

  const [exportingExcel, setExportingExcel] = useState(false);
  const [moveGuest, setMoveGuest] = useState<Guest | null>(null);
  const [moveTableQuery, setMoveTableQuery] = useState('');
  const [moveSelectedTableId, setMoveSelectedTableId] = useState<string | null>(null);
  const [movePrevSelectedTableNumber, setMovePrevSelectedTableNumber] = useState<number | null>(null);

  const [editingArrivedCountGuestId, setEditingArrivedCountGuestId] = useState<string | null>(null);
  const [editingArrivedCountValue, setEditingArrivedCountValue] = useState('');
  const pageScrollRef = useRef<ScrollView>(null);
  const guestsScrollRef = useRef<ScrollView>(null);
  const pageScrolledRef = useRef(false);
  const guestsScrolledRef = useRef(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const updateShowScrollTop = useCallback((source: 'page' | 'guests', y: number) => {
    const scrolled = y > 220;
    if (source === 'page') pageScrolledRef.current = scrolled;
    else guestsScrolledRef.current = scrolled;
    const next = pageScrolledRef.current || guestsScrolledRef.current;
    setShowScrollTop((prev) => (prev === next ? prev : next));
  }, []);

  const scrollPageToTop = useCallback(() => {
    pageScrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
    guestsScrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
  }, []);

  const startEditArrivedCount = useCallback((g: any, arrivedCount: number) => {
    const id = String(g?.id ?? '').trim();
    if (!id) return;
    setEditingArrivedCountGuestId(id);
    setEditingArrivedCountValue(String(Number(arrivedCount) || 0));
  }, []);

  const cancelEditArrivedCount = useCallback(() => {
    setEditingArrivedCountGuestId(null);
    setEditingArrivedCountValue('');
  }, []);

  const confirmEditArrivedCount = useCallback(
    async (g: any) => {
      if (!g) return;
      const id = String(g?.id ?? '').trim();
      if (!id) return;
      const raw = String(editingArrivedCountValue ?? '').trim();
      const n0 = raw === '' ? 0 : Number(raw);
      const next = Number.isFinite(n0) ? Math.max(0, Math.floor(n0)) : null;
      cancelEditArrivedCount();
      if (next === null) return;
      await setCheckedInCount(g, next);
    },
    [cancelEditArrivedCount, editingArrivedCountValue, setCheckedInCount]
  );

  const loadTables = useCallback(async () => {
    if (!resolvedEventId) {
      setTables([]);
      setTableNumberById(new Map());
      return;
    }

    try {
      const rows = await tableService.getTablesLite(resolvedEventId);
      const normalized = rows.map((t) => {
        const n = parseTableNumber((t as any).number);
        return { ...t, number: n === null ? undefined : n };
      });
      const next = new Map<string, number | null>();
      normalized.forEach((t) => {
        next.set(t.id, parseTableNumber((t as any).number));
      });
      setTables(normalized);
      setTableNumberById(next);
    } catch (e) {
      console.error('Load tables error:', e);
      setTables([]);
      setTableNumberById(new Map());
    }
  }, [resolvedEventId]);

  useEffect(() => {
    void refresh();
    void loadTables();
  }, [refresh, loadTables]);

  const handleExportArrivedExcel = useCallback(async () => {
    if (exportingExcel) return;
    const arrived = guests.filter((g) => Boolean(g.checkedIn));
    if (!arrived.length) {
      Alert.alert('אין אורחים לייצוא', 'עדיין אין מוזמנים שסומנו כהגיעו לאולם.');
      return;
    }

    setExportingExcel(true);
    try {
      let eventTitle = 'אירוע';
      if (resolvedEventId) {
        try {
          const ev = await eventService.getEventLite(resolvedEventId);
          if (ev?.title) eventTitle = String(ev.title).trim() || eventTitle;
        } catch {
          // Filename can fall back to a generic title.
        }
      }

      const { exportCheckInGuestsToExcel } = await import('@/lib/exportCheckInGuestsExcel');
      exportCheckInGuestsToExcel(guests, {
        eventTitle,
        categories,
        tables: tables.map((t) => ({
          id: t.id,
          number: parseTableNumber((t as any).number),
          name: t.name,
          capacity: t.capacity,
        })),
      });
    } catch (e) {
      console.error('Export check-in Excel error:', e);
      const message =
        e instanceof Error && e.message === 'אין אורחים שהגיעו לייצוא'
          ? 'עדיין אין מוזמנים שסומנו כהגיעו לאולם.'
          : 'אירעה תקלה בייצוא לאקסל. נסו שוב.';
      Alert.alert('שגיאה', message);
    } finally {
      setExportingExcel(false);
    }
  }, [categories, exportingExcel, guests, resolvedEventId, tables]);

  const tablesSorted = useMemo(() => {
    const copy = [...tables];
    copy.sort((a, b) => {
      const an = typeof a.number === 'number' ? a.number : Number.POSITIVE_INFINITY;
      const bn = typeof b.number === 'number' ? b.number : Number.POSITIVE_INFINITY;
      if (an !== bn) return an - bn;
      return String(a.name || '').localeCompare(String(b.name || ''), 'he');
    });
    return copy;
  }, [tables]);

  const tableLabelById = useMemo(() => {
    const m = new Map<string, string>();
    tablesSorted.forEach((t) => {
      const n = parseTableNumber((t as any).number);
      const name = String(t.name || '').trim();
      const label = n !== null ? `שולחן ${n}` : name ? `שולחן ${name}` : 'שולחן';
      m.set(t.id, label);
    });
    return m;
  }, [tablesSorted]);

  const tableIdByNumber = useMemo(() => {
    const m = new Map<number, string>();
    tablesSorted.forEach((t) => {
      const n = parseTableNumber((t as any).number);
      if (typeof n === 'number') m.set(n, String(t.id));
    });
    return m;
  }, [tablesSorted]);

  const resolveTableIdForNumber = useCallback(
    (num: number | null | undefined): string | null => {
      if (num === null || num === undefined || !Number.isFinite(Number(num))) return null;
      const n = Number(num);
      const fromMap = tableIdByNumber.get(n);
      if (fromMap) return fromMap;
      const found = tablesSorted.find((t) => parseTableNumber((t as any).number) === n);
      return found ? String(found.id) : null;
    },
    [tableIdByNumber, tablesSorted]
  );

  const syncTableSelection = useCallback(
    (num: number) => {
      const id = resolveTableIdForNumber(num);
      setSelectedTableNumber((prev) => {
        if (prev === num) {
          setTableFilter(null);
          return null;
        }
        if (id) setTableFilter(id);
        else setTableFilter(null);
        return num;
      });
    },
    [resolveTableIdForNumber]
  );

  const resolveFocusedTableId = useCallback((): string | null => {
    if (tableFilter && tableFilter !== NO_TABLE_KEY) return tableFilter;
    if (selectedTableNumber !== null) return resolveTableIdForNumber(selectedTableNumber);
    return null;
  }, [resolveTableIdForNumber, selectedTableNumber, tableFilter]);

  const tableCapacityById = useMemo(() => {
    const m = new Map<string, number>();
    tablesSorted.forEach((t) => {
      const id = String((t as any).id ?? '').trim();
      if (!id) return;
      const cap = Number((t as any).capacity) || 0;
      m.set(id, cap);
    });
    return m;
  }, [tablesSorted]);

  const tableCapacityByNumber = useMemo(() => {
    const m = new Map<number, number>();
    tablesSorted.forEach((t) => {
      const n = parseTableNumber((t as any).number);
      if (typeof n !== 'number') return;
      const cap = Number((t as any).capacity) || 0;
      m.set(n, cap);
    });
    return m;
  }, [tablesSorted]);

  const seatedByNumber = useMemo(() => {
    const m = new Map<number, number>();
    guests.forEach((g) => {
      const tableIdKey = g.tableId === null || g.tableId === undefined ? '' : String(g.tableId).trim();
      if (!tableIdKey) return;
      if (!g.checkedIn) return;
      const num = tableNumberById.get(tableIdKey) ?? null;
      if (typeof num !== 'number') return;
      const people = Number(g.numberOfPeople) || 1;
      const actual = g.checkedInCount === null || g.checkedInCount === undefined ? null : Number(g.checkedInCount);
      const arrived = actual !== null && Number.isFinite(actual) ? actual : people;
      m.set(num, (m.get(num) || 0) + Math.max(0, arrived));
    });
    return m;
  }, [guests, tableNumberById]);

  const seatedByTableId = useMemo(() => {
    const m = new Map<string, number>();
    guests.forEach((g) => {
      const tableIdKey = g.tableId === null || g.tableId === undefined ? '' : String(g.tableId).trim();
      if (!tableIdKey) return;
      if (!g.checkedIn) return;
      const people = Number(g.numberOfPeople) || 1;
      const actual = g.checkedInCount === null || g.checkedInCount === undefined ? null : Number(g.checkedInCount);
      const arrived = actual !== null && Number.isFinite(actual) ? actual : people;
      m.set(tableIdKey, (m.get(tableIdKey) || 0) + Math.max(0, arrived));
    });
    return m;
  }, [guests]);

  const handlePressMapTableNumber = useCallback(
    (num: number | null | undefined) => {
      if (num === null || num === undefined) return;
      const n = Number(num);
      if (!Number.isFinite(n)) return;
      syncTableSelection(n);
    },
    [syncTableSelection]
  );

  const checkinSeatingMap = useMemo(() => {
    if (!webSketch) return null;
    return (
      <SeatingGridReadonly
        gridCols={webSketch.gridCols}
        gridRows={webSketch.gridRows}
        tables={webSketch.tables}
        zones={webSketch.zones}
        labels={webSketch.labels}
        hideTableType
        useBaseColorAsWebBackground
        showTableBorder={false}
        autoFitZoomMultiplier={isSideBySide ? 0.76 : 0.86}
        cellSizeMultiplier={0.88}
        tableTextScale={0.8}
        getTableBaseColor={(t: any) => {
          const selected = Boolean(selectedTableNumber) && Number(t?.number) === Number(selectedTableNumber);
          if (selected) return '#10B981';
          const num = t?.number;
          const seated = num ? (seatedByNumber.get(Number(num)) ?? 0) : 0;
          const cap = Number(t?.seats ?? 0) || 0;
          const isFullOrOver = cap > 0 && seated >= cap;
          if (isFullOrOver) return colors.primary;
          return t?.type === 'reserve' ? colors.warning : colors.primary;
        }}
        getTableBackgroundAlpha={(t: any) => {
          const selected = Boolean(selectedTableNumber) && Number(t?.number) === Number(selectedTableNumber);
          if (selected) return 0.28;
          const num = t?.number;
          const seated = num ? (seatedByNumber.get(Number(num)) ?? 0) : 0;
          const cap = Number(t?.seats ?? 0) || 0;
          const isFullOrOver = cap > 0 && seated >= cap;
          if (isFullOrOver) return 0.9;
          return t?.type === 'reserve' ? 0.72 : 0.9;
        }}
        getTableBorderColor={(t: any) => {
          const selected = Boolean(selectedTableNumber) && Number(t?.number) === Number(selectedTableNumber);
          if (selected) return '#10B981';
          const num = t?.number;
          const seated = num ? (seatedByNumber.get(Number(num)) ?? 0) : 0;
          const cap = Number(t?.seats ?? 0) || 0;
          const isFullOrOver = cap > 0 && seated >= cap;
          if (isFullOrOver) return '#10B981';
          return t?.type === 'reserve' ? colors.warning : '#FFFFFF';
        }}
        selectedRingColor="#10B981"
        isTableSelected={(t: any) => Boolean(selectedTableNumber) && Number(t?.number) === Number(selectedTableNumber)}
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
        onPressTableNumber={handlePressMapTableNumber}
      />
    );
  }, [handlePressMapTableNumber, isSideBySide, seatedByNumber, selectedTableNumber, webSketch]);

  const buildSketchFromCurrentTables = useCallback((currentTables: Table[]): WebSketch | null => {
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
  }, []);

  const fetchWebSketch = useCallback(async () => {
    if (!resolvedEventId) {
      setWebSketch(null);
      return;
    }
    setMapLoading(true);
    try {
      const { data, error } = await supabase
        .from('seating_maps')
        .select('annotations,tables')
        .eq('event_id', resolvedEventId)
        .maybeSingle();

      void error;
      const annotations = (data as any)?.annotations;
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
        });
        return;
      }

      setWebSketch(null);
    } catch (e) {
      console.error('Fetch web sketch error:', e);
      setWebSketch(null);
    } finally {
      setMapLoading(false);
    }
  }, [buildSketchFromCurrentTables, resolvedEventId, tables]);

  useEffect(() => {
    void fetchWebSketch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId, tables.length]);

  const eventOverview = useMemo(() => {
    const invitedPeople = counts.total;
    const arrivedPeople = counts.checkedIn;
    const arrivingNotArrivedGuests = guests.filter((g) => g.status === 'מגיע' && !g.checkedIn).length;

    const occupiedByTableId = new Map<string, number>();
    for (const g of guests) {
      const tid = String(g.tableId ?? '').trim();
      if (!tid) continue;
      occupiedByTableId.set(tid, (occupiedByTableId.get(tid) || 0) + 1);
    }

    const reserveTables = tables.filter((t) => t.shape === 'reserve');
    const regularTables = tables.filter((t) => t.shape !== 'reserve');

    const occupiedCount = (t: Table) => occupiedByTableId.get(t.id) || 0;
    const fullTables = regularTables.filter((t) => (t.capacity || 0) > 0 && occupiedCount(t) >= (t.capacity || 0));
    const emptyTables = regularTables.filter((t) => occupiedCount(t) === 0);

    return {
      invitedPeople,
      arrivedPeople,
      arrivingNotArrivedGuests,
      fullTables: fullTables.length,
      emptyTables: emptyTables.length,
      reserveTables: reserveTables.length,
    };
  }, [counts.checkedIn, counts.total, guests, tables]);

  const attendanceRate = useMemo(() => {
    if (!eventOverview.invitedPeople) return 0;
    return Math.max(0, Math.min(100, Math.round((eventOverview.arrivedPeople / eventOverview.invitedPeople) * 100)));
  }, [eventOverview.arrivedPeople, eventOverview.invitedPeople]);

  const pendingPeopleCount = useMemo(() => Math.max(0, counts.total - counts.checkedIn), [counts.checkedIn, counts.total]);

  const filterOptions = useMemo(
    () => [
      { key: 'all' as const, label: 'כל המוזמנים', count: counts.total },
      { key: 'checked_in' as const, label: 'הגיעו', count: counts.checkedIn },
      { key: 'not_checked_in' as const, label: 'טרם הגיעו', count: pendingPeopleCount },
    ],
    [counts.checkedIn, counts.total, pendingPeopleCount]
  );

  const visibleGuests = useMemo(() => {
    if (!tableFilter) return filteredGuests;
    if (tableFilter === NO_TABLE_KEY) {
      return filteredGuests.filter((g) => g.tableId === null || g.tableId === undefined || String(g.tableId).trim() === '');
    }
    return filteredGuests.filter((g) => String(g.tableId ?? '').trim() === tableFilter);
  }, [filteredGuests, tableFilter]);

  const groupedVisibleGuests = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        sort: number;
        guests: any[];
        peopleTotal: number;
        arrivedPeople: number;
        guestCount: number;
        maxPeople: number; // table capacity (falls back to peopleTotal if 0)
      }
    >();

    for (const g of visibleGuests) {
      const tableIdKey = g.tableId === null || g.tableId === undefined ? '' : String(g.tableId).trim();
      const tableNumber = tableIdKey ? (tableNumberById.get(tableIdKey) ?? null) : null;
      const capacity =
        tableIdKey
          ? tableCapacityById.get(tableIdKey) || 0
          : typeof tableNumber === 'number'
            ? tableCapacityByNumber.get(tableNumber) || 0
            : 0;

      let key = 'none';
      let label = 'ללא שולחן';
      let sort = 2_000_000;

      if (typeof tableNumber === 'number') {
        key = `t:${tableNumber}`;
        label = `שולחן ${tableNumber}`;
        sort = tableNumber;
      } else if (tableIdKey) {
        key = `id:${tableIdKey}`;
        label = tableLabelById.get(tableIdKey) || 'שולחן';
        sort = 1_000_000;
      }

      const people = Number(g.numberOfPeople) || 1;
      const arrivedCount =
        g.checkedInCount === null || g.checkedInCount === undefined ? people : Number(g.checkedInCount) || 0;

      const current = groups.get(key) || {
        key,
        label,
        sort,
        guests: [] as any[],
        peopleTotal: 0,
        arrivedPeople: 0,
        guestCount: 0,
        maxPeople: 0,
      };

      current.guests.push(g);
      current.peopleTotal += people;
      current.arrivedPeople += g.checkedIn ? arrivedCount : 0;
      current.guestCount += 1;
      current.maxPeople = Math.max(current.maxPeople || 0, capacity || 0);
      groups.set(key, current);
    }

    const arr = Array.from(groups.values());
    arr.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return String(a.label).localeCompare(String(b.label), 'he');
    });
    return arr;
  }, [tableCapacityById, tableCapacityByNumber, tableLabelById, tableNumberById, visibleGuests]);

  // Progressive render with a cap: painting every guest card made each search
  // keystroke re-render the whole list. Beyond the cap a "show more" button
  // reveals the rest on demand.
  const INITIAL_RENDER_ROWS = 40;
  const RENDER_ROWS_PER_BATCH = 80;
  const AUTO_RENDER_ROW_CAP = 160;
  const SHOW_MORE_STEP = 240;
  const [rowRenderLimit, setRowRenderLimit] = useState(INITIAL_RENDER_ROWS);
  const [renderCap, setRenderCap] = useState(AUTO_RENDER_ROW_CAP);

  useEffect(() => {
    setRowRenderLimit(INITIAL_RENDER_ROWS);
    setRenderCap(AUTO_RENDER_ROW_CAP);
  }, [query, filter, tableFilter]);

  const totalListRows = useMemo(
    () => groupedVisibleGuests.reduce((sum, group) => sum + group.guests.length, 0),
    [groupedVisibleGuests]
  );

  useEffect(() => {
    const target = Math.min(totalListRows, renderCap);
    if (rowRenderLimit >= target) return;
    const t = setTimeout(() => {
      setRowRenderLimit((prev) => Math.min(prev + RENDER_ROWS_PER_BATCH, target));
    }, 32);
    return () => clearTimeout(t);
  }, [renderCap, rowRenderLimit, totalListRows]);

  const hiddenListRows = Math.max(0, totalListRows - Math.min(rowRenderLimit, renderCap, totalListRows));
  const showMoreRows = useCallback(() => {
    setRenderCap((prev) => prev + SHOW_MORE_STEP);
  }, []);

  const renderedGroupedGuests = useMemo(() => {
    if (rowRenderLimit >= totalListRows) return groupedVisibleGuests;
    let used = 0;
    const out: typeof groupedVisibleGuests = [];
    for (const group of groupedVisibleGuests) {
      if (used >= rowRenderLimit) break;
      const remaining = rowRenderLimit - used;
      if (group.guests.length <= remaining) {
        out.push(group);
        used += group.guests.length;
      } else {
        out.push({ ...group, guests: group.guests.slice(0, remaining) });
        used = rowRenderLimit;
      }
    }
    return out;
  }, [groupedVisibleGuests, rowRenderLimit, totalListRows]);

  const allGroupsCollapsed = useMemo(
    () => groupedVisibleGuests.length > 0 && groupedVisibleGuests.every((g) => Boolean(collapsedTableGroups[g.key])),
    [collapsedTableGroups, groupedVisibleGuests]
  );

  const toggleCollapseAllGroups = useCallback(() => {
    if (allGroupsCollapsed) {
      setCollapsedTableGroups({});
      return;
    }
    const next: Record<string, boolean> = {};
    groupedVisibleGuests.forEach((g) => {
      next[g.key] = true;
    });
    setCollapsedTableGroups(next);
  }, [allGroupsCollapsed, groupedVisibleGuests]);

  const workspaceHeight = useMemo(() => {
    if (!height) return 520;
    // Fill the viewport: subtract the chrome above the workspace (top bar,
    // metrics strip and paddings) so the map + guest list reach the bottom.
    if (isSideBySide) return Math.max(460, Math.round(height - 208));
    if (isTablet) return Math.round(Math.min(480, Math.max(360, height * 0.42)));
    return Math.round(Math.min(400, Math.max(300, height * 0.38)));
  }, [height, isSideBySide, isTablet]);

  const mapStageHeight = useMemo(() => Math.max(280, workspaceHeight - 64), [workspaceHeight]);

  const guestListMaxHeight = useMemo(() => {
    if (!height || !isSideBySide) return undefined;
    return Math.max(260, workspaceHeight - 148);
  }, [height, isSideBySide, workspaceHeight]);

  const guestsListEstimatedHeight = useMemo(() => {
    // Heuristic so the list "shrinks to fit" when there are few guests.
    const GROUP_GAP = 8;
    const GROUP_HEADER_H = 42;
    const BODY_PADDING_V = 16;
    const BODY_GAP = 6;
    const ROW_H = 54;
    const LIST_WRAP_PADDING_V = 16;

    let total = LIST_WRAP_PADDING_V;
    groupedVisibleGuests.forEach((group, idx) => {
      if (idx > 0) total += GROUP_GAP;
      total += GROUP_HEADER_H;
      const collapsed = Boolean(collapsedTableGroups[group.key]);
      if (collapsed) return;
      const rows = Array.isArray(group.guests) ? group.guests.length : 0;
      if (rows <= 0) return;
      total += BODY_PADDING_V;
      total += rows * ROW_H;
      total += Math.max(0, rows - 1) * BODY_GAP;
    });
    return total;
  }, [groupedVisibleGuests, collapsedTableGroups]);

  const shouldScrollGuests = useMemo(() => {
    if (isSideBySide) return true;
    if (!guestListMaxHeight) return false;
    return guestsListEstimatedHeight > guestListMaxHeight;
  }, [guestListMaxHeight, guestsListEstimatedHeight, isSideBySide]);

  const guestsColWidth = useMemo(() => {
    if (!isSideBySide) return undefined as number | undefined;
    const w = Number(width) || 0;
    if (w < 1200) return Math.max(340, Math.min(400, Math.round(w * 0.4)));
    if (w < 1600) return Math.max(400, Math.min(440, Math.round(w * 0.34)));
    return 440;
  }, [isSideBySide, width]);

  const stickyTop = useMemo(() => {
    if (Platform.OS !== 'web') return 0;
    if (!isSideBySide) return 0;
    return 8;
  }, [isSideBySide]);

  const tableNumberForId = useCallback(
    (tableId: string | null) => {
      if (!tableId) return null;
      const key = String(tableId).trim();
      const n = tableNumberById.get(key) ?? null;
      return typeof n === 'number' ? n : null;
    },
    [tableNumberById]
  );

  const setMoveTargetTableId = useCallback(
    (tableId: string | null) => {
      setMoveSelectedTableId(tableId);
      setSelectedTableNumber(tableNumberForId(tableId));
    },
    [tableNumberForId]
  );

  const openMoveModal = useCallback(
    (guest: Guest) => {
      setMovePrevSelectedTableNumber(selectedTableNumber);
      setMoveGuest(guest);
      setMoveTableQuery('');
      setMoveTargetTableId(guest.tableId ?? null);
    },
    [selectedTableNumber, setMoveTargetTableId]
  );

  const closeMoveModal = useCallback(() => {
    setMoveGuest(null);
    setMoveTableQuery('');
    setMoveSelectedTableId(null);
    setSelectedTableNumber(movePrevSelectedTableNumber);
    setMovePrevSelectedTableNumber(null);
  }, [movePrevSelectedTableNumber]);

  const tableOptions = useMemo(() => {
    return tablesSorted.map((t) => {
      const id = String((t as any).id ?? t.id);
      const label = tableLabelById.get(id) || 'שולחן';
      const capacity = Number((t as any).capacity) || 0;
      const seated = seatedByTableId.get(String(id).trim()) || 0;
      const shape = ((t as any).shape ?? null) as any;
      return { id, label, capacity, seated, shape };
    });
  }, [seatedByTableId, tableLabelById, tablesSorted]);

  const tableFilterOptions = useMemo(
    () => [
      ...tableOptions.map((opt) => ({
        id: opt.id,
        label: opt.label,
        meta: opt.capacity > 0 ? `${opt.seated}/${opt.capacity}` : undefined,
      })),
      { id: NO_TABLE_KEY, label: 'ללא שולחן' },
    ],
    [tableOptions]
  );

  const applyTableFilter = useCallback(
    (id: string | null) => {
      setTableFilter(id);
      if (!id || id === NO_TABLE_KEY) {
        setSelectedTableNumber(null);
        return;
      }
      const n = tableNumberById.get(id);
      setSelectedTableNumber(typeof n === 'number' ? n : null);
    },
    [tableNumberById]
  );

  const moveOptions = useMemo(() => {
    const q = moveTableQuery.trim().toLowerCase();
    if (!q) return tableOptions;
    return tableOptions.filter((x) => x.label.toLowerCase().includes(q));
  }, [moveTableQuery, tableOptions]);

  const moveGuestPeople = useMemo(() => {
    if (!moveGuest) return 0;
    const people = Number((moveGuest as any).numberOfPeople) || 1;
    if (!(moveGuest as any).checkedIn) return people;
    const raw = (moveGuest as any).checkedInCount;
    if (raw === null || raw === undefined) return people;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : people;
  }, [moveGuest]);

  const moveGuestFromTableId = useMemo(() => {
    if (!moveGuest?.tableId) return null;
    const s = String(moveGuest.tableId).trim();
    return s ? s : null;
  }, [moveGuest?.tableId]);

  const previewSeatedForOption = useCallback(
    (optId: string, optSeated: number) => {
      let seated = Number(optSeated) || 0;
      if (!moveGuest) return seated;
      const id = String(optId || '').trim();
      // If moving away from this table (and the target isn't this table), subtract.
      if (moveGuestFromTableId && moveGuestFromTableId === id && moveSelectedTableId !== id) {
        seated -= moveGuestPeople;
      }
      // If moving into this table (and the guest isn't already here), add.
      if (moveSelectedTableId === id && moveGuestFromTableId !== id) {
        seated += moveGuestPeople;
      }
      return Math.max(0, seated);
    },
    [moveGuest, moveGuestFromTableId, moveGuestPeople, moveSelectedTableId]
  );

  const previewOverflowForOption = useCallback(
    (optId: string, optSeated: number, capacity: number, shape: any) => {
      if (shape === 'reserve') return 0;
      const cap = Number(capacity) || 0;
      if (cap <= 0) return 0;
      const wouldSeated = previewSeatedForOption(optId, optSeated);
      return Math.max(0, wouldSeated - cap);
    },
    [previewSeatedForOption]
  );

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPeople, setAddPeople] = useState(1);
  const [addTableQuery, setAddTableQuery] = useState('');
  const [addTableId, setAddTableId] = useState<string | null>(null);
  const [addTablePickerExpanded, setAddTablePickerExpanded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const addSelectedTableOption = useMemo(() => {
    if (!addTableId) return null;
    return tableOptions.find((opt) => opt.id === addTableId) ?? null;
  }, [addTableId, tableOptions]);

  const addSelectedTableNumber = useMemo(() => {
    if (selectedTableNumber !== null && resolveTableIdForNumber(selectedTableNumber) === addTableId) {
      return selectedTableNumber;
    }
    if (!addTableId) return null;
    for (const [num, id] of tableIdByNumber.entries()) {
      if (id === addTableId) return num;
    }
    return null;
  }, [addTableId, resolveTableIdForNumber, selectedTableNumber, tableIdByNumber]);

  const openAddModal = useCallback(() => {
    setAddName('');
    setAddPhone('');
    setAddPeople(1);
    setAddTableQuery('');
    setAddError(null);
    const focused = resolveFocusedTableId();
    setAddTableId(focused);
    // When a table is already selected on the map, focus on guest details — not another table list.
    setAddTablePickerExpanded(!focused);
    setAddOpen(true);
  }, [resolveFocusedTableId]);

  const closeAddModal = useCallback(() => {
    setAddOpen(false);
    setAddError(null);
    setAddTableQuery('');
    setAddTablePickerExpanded(false);
  }, []);

  const addOptions = useMemo(() => {
    const q = addTableQuery.trim().toLowerCase();
    if (!q) return tableOptions;
    return tableOptions.filter((x) => x.label.toLowerCase().includes(q));
  }, [addTableQuery, tableOptions]);

  const previewSeatedForAddOption = useCallback(
    (optId: string, optSeated: number) => {
      const seated = Number(optSeated) || 0;
      return addTableId === optId ? seated + addPeople : seated;
    },
    [addPeople, addTableId]
  );

  const previewOverflowForAddOption = useCallback(
    (optId: string, optSeated: number, capacity: number, shape: any) => {
      if (shape === 'reserve') return 0;
      const cap = Number(capacity) || 0;
      if (cap <= 0) return 0;
      return Math.max(0, previewSeatedForAddOption(optId, optSeated) - cap);
    },
    [previewSeatedForAddOption]
  );

  const confirmAddGuest = useCallback(async () => {
    setAddError(null);
    const tableId =
      addTableId ??
      (selectedTableNumber !== null ? resolveTableIdForNumber(selectedTableNumber) : null);
    const result = await addWalkInGuest({
      name: addName,
      phone: addPhone,
      numberOfPeople: addPeople,
      tableId,
    });

    if (!result.ok) {
      setAddError(result.error);
      return;
    }

    // Show the full list again — don't leave the screen filtered to the table
    // the walk-in was just seated at (users had to refresh to "un-stick" it).
    setFilter('all');
    setSelectedTableNumber(null);
    setTableFilter(null);
    closeAddModal();
  }, [
    addName,
    addPeople,
    addPhone,
    addTableId,
    addWalkInGuest,
    closeAddModal,
    resolveTableIdForNumber,
    selectedTableNumber,
    setFilter,
  ]);

  const isMoveSaving = Boolean(moveGuest && savingMoveId === moveGuest.id);

  const confirmMove = useCallback(async () => {
    if (!moveGuest) return;
    const ok = await assignGuestToTable(moveGuest, moveSelectedTableId);
    if (ok) {
      sendTableUpdateSms(moveGuest.id);
      closeMoveModal();
    }
  }, [assignGuestToTable, closeMoveModal, moveGuest, moveSelectedTableId, sendTableUpdateSms]);

  const guestsListContent = (
    <View style={styles.tableGroupsWrap}>
      {renderedGroupedGuests.map((group) => {
        const collapsed = Boolean(collapsedTableGroups[group.key]);
        const maxPeople = (Number((group as any).maxPeople) || 0) > 0 ? Number((group as any).maxPeople) || 0 : group.peopleTotal;
        const overflow = Math.max(0, (Number(group.arrivedPeople) || 0) - (Number(maxPeople) || 0));
        return (
          <View key={group.key} style={[styles.tableGroupCard, overflow > 0 ? styles.tableGroupCardOverflow : null]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`שולחן ${group.label}`}
              onPress={() => setCollapsedTableGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
              style={({ hovered, pressed }: any) => [
                styles.tableGroupHeader,
                overflow > 0 ? styles.tableGroupHeaderOverflow : null,
                Platform.OS === 'web' && hovered ? { backgroundColor: 'rgba(17,24,39,0.03)' } : null,
                pressed ? { opacity: 0.95 } : null,
              ]}
            >
              <View style={styles.tableGroupTitleRow}>
                <View style={styles.tableGroupIcon}>
                  <Ionicons name="restaurant" size={14} color={colors.primary} />
                </View>
                <Text style={styles.tableGroupTitle} numberOfLines={1}>
                  {group.label}
                </Text>
              </View>

              <View style={styles.tableGroupMetaRow}>
                <View style={styles.tableGroupMetaPill}>
                  <Text style={styles.tableGroupMetaStrong}>{group.arrivedPeople}</Text>
                  <Text style={styles.tableGroupMetaDim}>/</Text>
                  <Text style={styles.tableGroupMetaStrong}>{maxPeople}</Text>
                  <Text style={styles.tableGroupMetaDim}>אנשים</Text>
                </View>
                {overflow > 0 ? (
                  <View style={[styles.tableGroupMetaPill, styles.tableGroupMetaPillOverflow]}>
                    <Text style={styles.tableGroupMetaStrongOverflow}>{overflow}</Text>
                    <Text style={styles.tableGroupMetaDimOverflow}>חריגה</Text>
                  </View>
                ) : null}
                <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={colors.gray[500]} />
              </View>
            </Pressable>

            <View style={styles.tableGroupProgressTrack}>
              <View
                style={[
                  styles.tableGroupProgressFill,
                  {
                    width: `${Math.min(
                      100,
                      maxPeople > 0 ? Math.round(((Number(group.arrivedPeople) || 0) / maxPeople) * 100) : 0
                    )}%`,
                  } as any,
                  overflow > 0 ? styles.tableGroupProgressFillOver : null,
                ]}
              />
            </View>

            {collapsed ? null : (
              <View style={styles.tableGroupBody}>
                {group.guests.map((g: any) => {
                  const checkedIn = Boolean(g.checkedIn);
                  const isSaving = savingId === g.id;
                  const tableIdKey = g.tableId === null || g.tableId === undefined ? '' : String(g.tableId).trim();
                  const tableNumber = tableIdKey ? (tableNumberById.get(tableIdKey) ?? null) : null;
                  const people = Number(g.numberOfPeople) || 1;
                  const arrivedCount =
                    g.checkedInCount === null || g.checkedInCount === undefined ? people : Number(g.checkedInCount) || 0;

                  return (
                    <View key={g.id} style={[styles.guestRowCompact, checkedIn ? styles.guestRowCompactOn : null, isMobile ? styles.guestRowCompactSm : isTablet ? styles.guestRowCompactTablet : null]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`בחירת אורח ${g.name}`}
                        onPress={() => {
                          const next = typeof tableNumber === 'number' ? tableNumber : null;
                          if (next === null) {
                            setSelectedTableNumber(null);
                            setTableFilter(null);
                            return;
                          }
                          syncTableSelection(next);
                        }}
                        style={({ hovered, pressed }: any) => [
                          styles.guestRowMain,
                          isMobile ? styles.guestRowMainSm : isTablet ? styles.guestRowMainTablet : null,
                          Platform.OS === 'web' && hovered ? ({ backgroundColor: 'rgba(6,23,62,0.03)', borderRadius: 12 } as any) : null,
                          pressed ? { opacity: 0.96 } : null,
                        ]}
                      >
                        <View style={[styles.guestRowAccent, checkedIn ? styles.guestRowAccentOn : null]} />
                        <View style={[styles.avatar, styles.avatarCompact, checkedIn ? styles.avatarOn : null]}>
                          <Text style={styles.avatarText}>{initialsFromName(g.name)}</Text>
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.guestNameCompact} numberOfLines={1}>
                            {g.name}
                          </Text>
                         
                        </View>
                      </Pressable>

                      <View
                        style={[
                          styles.guestRowRight,
                          isTouchLayout && !isMobile ? styles.guestRowRightTouch : null,
                          isMobile ? styles.guestRowRightSm : null,
                        ]}
                      >
                        <View style={styles.arrivalSlot}>
                          {checkedIn ? (
                            <View style={[styles.compactStepper, isTouchLayout ? styles.compactStepperTouch : null]}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`הפחת כמות שהגיעה עבור ${g.name}`}
                                onPress={() => void setCheckedInCount(g, Math.max(0, arrivedCount - 1))}
                                disabled={savingCountId === g.id || arrivedCount <= 0}
                                hitSlop={stepBtnHitSlop}
                                style={({ hovered, pressed }: any) => [
                                  styles.stepBtnCompact,
                                  isTouchLayout ? styles.stepBtnCompactTouch : null,
                                  savingCountId === g.id || arrivedCount <= 0 ? styles.stepBtnDisabled : null,
                                  Platform.OS === 'web' && hovered ? styles.stepBtnHover : null,
                                  pressed ? { opacity: 0.92 } : null,
                                ]}
                              >
                                <Text style={styles.stepBtnText}>-</Text>
                              </Pressable>

                              <View style={styles.compactCountWrap}>
                                {savingCountId === g.id ? (
                                  <ActivityIndicator size={12} color={colors.primary} />
                                ) : editingArrivedCountGuestId === String(g.id) ? (
                                  <TextInput
                                    style={[
                                      styles.compactCountInput,
                                      Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
                                    ]}
                                    value={editingArrivedCountValue}
                                    onChangeText={setEditingArrivedCountValue}
                                    autoFocus
                                    keyboardType="numeric"
                                    {...(Platform.OS === 'web' ? ({ inputMode: 'numeric' } as any) : null)}
                                    returnKeyType="done"
                                    blurOnSubmit
                                    onSubmitEditing={() => void confirmEditArrivedCount(g)}
                                    onBlur={cancelEditArrivedCount}
                                    onKeyPress={(e: any) => {
                                      const k = e?.nativeEvent?.key;
                                      if (k === 'Enter') void confirmEditArrivedCount(g);
                                      if (k === 'Escape') cancelEditArrivedCount();
                                    }}
                                    textAlign="center"
                                  />
                                ) : (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`עריכת כמות שהגיעה עבור ${g.name}`}
                                    onPress={() => startEditArrivedCount(g, arrivedCount)}
                                    style={({ hovered, pressed }: any) => [
                                      Platform.OS === 'web' ? ({ cursor: 'text' } as any) : null,
                                      Platform.OS === 'web' && hovered ? ({ opacity: 0.85 } as any) : null,
                                      pressed ? ({ opacity: 0.85 } as any) : null,
                                    ]}
                                  >
                                    <Text style={styles.compactCountText}>{arrivedCount}</Text>
                                  </Pressable>
                                )}
                              </View>

                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`הגדל כמות שהגיעה עבור ${g.name}`}
                                onPress={() => void setCheckedInCount(g, arrivedCount + 1)}
                                disabled={savingCountId === g.id}
                                hitSlop={stepBtnHitSlop}
                                style={({ hovered, pressed }: any) => [
                                  styles.stepBtnCompact,
                                  isTouchLayout ? styles.stepBtnCompactTouch : null,
                                  savingCountId === g.id ? styles.stepBtnDisabled : null,
                                  Platform.OS === 'web' && hovered ? styles.stepBtnHover : null,
                                  pressed ? { opacity: 0.92 } : null,
                                ]}
                              >
                                <Text style={styles.stepBtnText}>+</Text>
                              </Pressable>
                            </View>
                          ) : (
                            <Text style={styles.peoplePill}>{people}</Text>
                          )}
                        </View>

                        <Switch
                          checked={checkedIn}
                          saving={isSaving}
                          disabled={isSaving}
                          large={isTouchLayout}
                          accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                          onPress={() => void toggleCheckIn(g)}
                        />

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`העבר אורח ${g.name} לשולחן אחר`}
                          onPress={() => openMoveModal(g)}
                          disabled={isSaving || savingMoveId === g.id}
                          hitSlop={moveBtnHitSlop}
                          style={({ hovered, pressed }: any) => [
                            styles.moveBtn,
                            isTouchLayout ? styles.moveBtnTouch : null,
                            (isSaving || savingMoveId === g.id) ? styles.moveBtnDisabled : null,
                            Platform.OS === 'web' && hovered ? styles.moveBtnHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          {savingMoveId === g.id ? (
                            <ActivityIndicator size={14} color={colors.primary} />
                          ) : (
                            <Ionicons name="swap-horizontal" size={16} color={colors.gray[700]} />
                          )}
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      {hiddenListRows > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="הצגת אורחים נוספים ברשימה"
          onPress={showMoreRows}
          style={({ hovered, pressed }: any) => [
            styles.showMoreBtn,
            Platform.OS === 'web' && hovered ? { backgroundColor: 'rgba(17,24,39,0.03)' } : null,
            pressed ? { opacity: 0.92 } : null,
          ]}
        >
          <Ionicons name="chevron-down" size={16} color={colors.primary} />
          <Text style={styles.showMoreBtnText}>הצג עוד אורחים ({hiddenListRows})</Text>
        </Pressable>
      ) : null}
      {listHint ? <Text style={styles.listHint}>{listHint}</Text> : null}
    </View>
  );

  return (
    <View style={styles.page}>
      {!resolvedEventId ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.gray[500]} />
          <Text style={styles.emptyTitle}>חסר מזהה אירוע</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="חזרה לרשימת אירועים"
            onPress={handleBack}
            style={({ hovered, pressed }: any) => [
              styles.primaryBtn,
              Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Text style={styles.primaryBtnText}>חזרה לרשימת אירועים</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          ref={pageScrollRef}
          style={styles.pageScroll}
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => updateShowScrollTop('page', e.nativeEvent.contentOffset.y)}
        >
          {hasSidebar ? null : (
            <View style={styles.mobileNavRow}>
              <WebAppMenu compact />
            </View>
          )}

          <View style={styles.topDashboardWrap}>
            <View style={styles.metricsStrip}>
              <View style={[styles.metricsStripMain, metricsInOneRow ? styles.metricsStripRow : null]}>
                <View style={styles.metricsStripLive}>
                  <Ionicons name="pulse-outline" size={14} color="#F0CB46" />
                  <Text style={styles.metricsStripLiveText}>בזמן אמת</Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="מפת לייב באירוע"
                  onPress={openLiveMap}
                  style={({ hovered, pressed }: any) => [
                    styles.liveMapBtn,
                    Platform.OS === 'web' && hovered ? styles.liveMapBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <View style={styles.liveMapDot} />
                  <Text style={styles.liveMapBtnText}>מפת לייב</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ייצוא אקסל של אורחים שהגיעו"
                  onPress={() => void handleExportArrivedExcel()}
                  disabled={exportingExcel}
                  style={({ hovered, pressed }: any) => [
                    styles.exportExcelBtn,
                    Platform.OS === 'web' && hovered ? styles.exportExcelBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                    exportingExcel ? { opacity: 0.7 } : null,
                  ]}
                >
                  {exportingExcel ? (
                    <ActivityIndicator size={14} color={colors.primary} />
                  ) : (
                    <Ionicons name="download-outline" size={15} color={colors.primary} />
                  )}
                  <Text style={styles.exportExcelBtnText}>{exportingExcel ? 'מייצא…' : 'ייצוא אקסל'}</Text>
                </Pressable>

                <View style={[styles.metricsGrid, metricsInOneRow ? styles.metricsGridTop : null]}>
                  <CheckinOverviewStat label='סה"כ מוזמנים' value={eventOverview.invitedPeople} icon="people-outline" />
                  <CheckinOverviewStat label="הגיעו לאולם" value={counts.checkedIn} icon="walk-outline" highlight />
                  <CheckinOverviewStat label="שולחנות ריקים" value={eventOverview.emptyTables} icon="grid-outline" />
                  <CheckinOverviewStat label="שולחנות מלאים" value={eventOverview.fullTables} icon="checkmark-circle-outline" />
                  <CheckinOverviewStat label="שולחנות רזרבה" value={eventOverview.reserveTables} icon="bookmark-outline" />
                </View>

                <View style={styles.metricsStripRate}>
                  <Text style={styles.metricsStripRateValue}>{attendanceRate}%</Text>
                  <Text style={styles.metricsStripRateLabel}>יחס הגעה</Text>
                </View>
              </View>

              <View style={styles.arrivalProgressWrap}>
                <View style={styles.arrivalProgressTrack}>
                  <View style={[styles.arrivalProgressFill, { width: `${attendanceRate}%` } as any]} />
                </View>
                <Text style={styles.arrivalProgressText}>
                  {eventOverview.arrivedPeople} מתוך {eventOverview.invitedPeople} אורחים באולם
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.content, !isSideBySide ? styles.contentSm : styles.contentLg]}>

            <View
              style={[
                styles.guestsCol,
                !isSideBySide ? (isTablet ? styles.colTablet : styles.colSm) : styles.guestsColLg,
                isSideBySide && guestsColWidth ? ({ width: guestsColWidth } as any) : null,
              ]}
            >
              <View
                style={
                  Platform.OS === 'web' && isSideBySide
                    ? ({ position: 'sticky', top: stickyTop, alignSelf: 'stretch', flex: 1 } as any)
                    : null
                }
              >
                <View style={[styles.card, styles.guestListCard, isSideBySide ? ({ height: workspaceHeight } as any) : null]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.panelHeaderCopy}>
                      <Text style={styles.panelTitle}>רשימת צ'ק אין</Text>
                    </View>
                    <View style={styles.cardHeaderActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="ייצוא אקסל של אורחים שהגיעו"
                        onPress={() => void handleExportArrivedExcel()}
                        disabled={exportingExcel}
                        style={({ hovered, pressed }: any) => [
                          styles.exportExcelHeaderBtn,
                          isTouchLayout ? styles.exportExcelHeaderBtnTouch : null,
                          Platform.OS === 'web' && hovered ? styles.exportExcelHeaderBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                          exportingExcel ? { opacity: 0.7 } : null,
                        ]}
                      >
                        {exportingExcel ? (
                          <ActivityIndicator size={14} color={colors.primary} />
                        ) : (
                          <Ionicons name="download-outline" size={16} color={colors.primary} />
                        )}
                        {!isNarrow ? (
                          <Text style={styles.exportExcelHeaderBtnText}>{exportingExcel ? 'מייצא…' : 'ייצוא אקסל'}</Text>
                        ) : null}
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="הוספת מוזמן שלא נמצא ברשימה"
                        onPress={openAddModal}
                        style={({ hovered, pressed }: any) => [
                          styles.addGuestBtn,
                          isTouchLayout ? styles.addGuestBtnTouch : null,
                          Platform.OS === 'web' && hovered ? styles.addGuestBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name="person-add" size={16} color={colors.white} />
                        {!isNarrow ? <Text style={styles.addGuestBtnText}>הוסף מוזמן</Text> : null}
                      </Pressable>
                      {tableFilter ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="נקה סינון שולחן"
                          onPress={() => {
                            setSelectedTableNumber(null);
                            setTableFilter(null);
                          }}
                          style={({ hovered, pressed }: any) => [
                            styles.linkBtn,
                            Platform.OS === 'web' && hovered ? styles.linkBtnHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Text style={styles.linkBtnText}>נקה שולחן</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  {groupedVisibleGuests.length > 1 ? (
                    <View style={styles.panelMetaRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={allGroupsCollapsed ? 'פתח את כל השולחנות' : 'סגור את כל השולחנות'}
                        onPress={toggleCollapseAllGroups}
                        style={({ hovered, pressed }: any) => [
                          styles.collapseAllBtn,
                          Platform.OS === 'web' && hovered ? styles.collapseAllBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons
                          name={allGroupsCollapsed ? 'chevron-expand-outline' : 'chevron-collapse-outline'}
                          size={14}
                          color={colors.primary}
                        />
                        <Text style={styles.collapseAllBtnText}>{allGroupsCollapsed ? 'פתח הכל' : 'סגור הכל'}</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={styles.panelFilterChipsRow}>
                    {filterOptions.map((option) => {
                      const active = filter === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          accessibilityRole="button"
                          accessibilityLabel={`סנן ${option.label}`}
                          accessibilityState={{ selected: active }}
                          onPress={() => setFilter(option.key)}
                          style={({ hovered, pressed }: any) => [
                            styles.panelFilterChip,
                            isTouchLayout ? styles.panelFilterChipTouch : null,
                            active ? styles.panelFilterChipActive : null,
                            Platform.OS === 'web' && hovered && !active ? styles.panelFilterChipHover : null,
                            pressed ? { opacity: 0.94 } : null,
                          ]}
                        >
                          <Text style={[styles.panelFilterChipText, active ? styles.panelFilterChipTextActive : null]}>
                            {option.label}
                          </Text>
                          <View style={[styles.panelFilterChipCount, active ? styles.panelFilterChipCountActive : null]}>
                            <Text
                              style={[styles.panelFilterChipCountText, active ? styles.panelFilterChipCountTextActive : null]}
                            >
                              {option.count}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={[styles.mainSearchWrap, { marginTop: 8 }]}>
                    <View style={styles.searchIconRight}>
                      <Ionicons name="search" size={18} color={colors.gray[500]} />
                    </View>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="חיפוש שם או טלפון..."
                      placeholderTextColor={colors.gray[500]}
                      defaultValue={query}
                      onChangeText={onChangeQuery}
                      textAlign="right"
                      autoCapitalize="none"
                    />
                    {searching ? (
                      <View style={styles.searchSpinner}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    ) : null}
                  </View>

                  {(isMobile || isNarrow || !isSideBySide) ? (
                    <TableNumberFilter
                      compact
                      options={tableFilterOptions}
                      selectedId={tableFilter}
                      onSelect={applyTableFilter}
                    />
                  ) : null}

                  <View style={[styles.listWrap, isSideBySide ? styles.listWrapFill : null, { marginTop: 8 }]}>
                    {loading && visibleGuests.length === 0 && !query.trim() ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.loadingText}>טוען אורחים…</Text>
                      </View>
                    ) : searching && visibleGuests.length === 0 ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.loadingText}>מחפש…</Text>
                      </View>
                    ) : visibleGuests.length === 0 ? (
                      <View style={styles.emptyRow}>
                        <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                        <Text style={styles.emptyTitle}>לא נמצאו אורחים</Text>
                        <Text style={styles.emptyText}>נסה לשנות חיפוש / פילטר / שולחן, או להוסיף מוזמן חדש.</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="הוספת מוזמן שלא נמצא ברשימה"
                          onPress={openAddModal}
                          style={({ hovered, pressed }: any) => [
                            styles.addGuestEmptyBtn,
                            Platform.OS === 'web' && hovered ? styles.addGuestEmptyBtnHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Ionicons name="person-add" size={16} color={colors.primary} />
                          <Text style={styles.addGuestEmptyBtnText}>הוסף מוזמן חדש</Text>
                        </Pressable>
                      </View>
                    ) : shouldScrollGuests ? (
                      <ScrollView
                        ref={guestsScrollRef}
                        style={
                          isSideBySide
                            ? ({ flex: 1, minHeight: 0 } as any)
                            : guestListMaxHeight
                              ? ({ maxHeight: guestListMaxHeight } as any)
                              : undefined
                        }
                        contentContainerStyle={isSideBySide ? ({ flexGrow: 1 } as any) : undefined}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        scrollEventThrottle={16}
                        onScroll={(e) => updateShowScrollTop('guests', e.nativeEvent.contentOffset.y)}
                      >
                        {guestsListContent}
                      </ScrollView>
                    ) : (
                      guestsListContent
                    )}
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.main, !isSideBySide ? styles.mainSm : null]}>
              <View
                style={[
                  styles.card,
                  styles.mapCard,
                  Platform.OS === 'web' && isSideBySide ? ({ position: 'sticky', top: stickyTop } as any) : null,
                  isSideBySide ? ({ height: workspaceHeight } as any) : null,
                ]}
              >
                <View style={styles.mapCardHeader}>
                  <View style={styles.panelHeaderCopy}>
                    <Text style={styles.panelTitle}>
                      {selectedTableNumber ? `שולחן ${selectedTableNumber}` : 'מפת הושבה'}
                    </Text>
                  </View>

                  <View style={styles.mapLegendRow}>
                    <View style={styles.mapLegendItem}>
                      <View style={[styles.mapLegendDot, { backgroundColor: colors.primary }]} />
                      <Text style={styles.mapLegendText}>רגיל</Text>
                    </View>
                    <View style={styles.mapLegendItem}>
                      <View style={[styles.mapLegendDot, { backgroundColor: colors.secondary }]} />
                      <Text style={styles.mapLegendText}>רזרבה</Text>
                    </View>
                    <View style={styles.mapLegendItem}>
                      <View style={[styles.mapLegendDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.mapLegendText}>מלא</Text>
                    </View>
                  </View>

                  <View style={styles.mapCardHeaderSide}>
                    {selectedTableNumber ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`הוסף מוזמן לשולחן ${selectedTableNumber}`}
                        onPress={openAddModal}
                        style={({ hovered, pressed }: any) => [
                          styles.mapAddGuestBtn,
                          Platform.OS === 'web' && hovered ? styles.mapAddGuestBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name="person-add" size={14} color={colors.white} />
                        <Text style={styles.mapAddGuestBtnText}>הוסף לשולחן {selectedTableNumber}</Text>
                      </Pressable>
                    ) : null}

                    <View style={styles.mapStatusPill}>
                      <View
                        style={[
                          styles.mapStatusDot,
                          { backgroundColor: webSketch ? '#10B981' : 'rgba(107,114,128,0.65)' },
                        ]}
                      />
                      <Text style={styles.mapStatusPillText}>{webSketch ? 'מפה פעילה' : 'ממתין לסקיצה'}</Text>
                    </View>

                    {selectedTableNumber ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="נקה שולחן נבחר במפה"
                        onPress={() => {
                          setSelectedTableNumber(null);
                          setTableFilter(null);
                        }}
                        style={({ hovered, pressed }: any) => [
                          styles.linkBtn,
                          Platform.OS === 'web' && hovered ? styles.linkBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Text style={styles.linkBtnText}>נקה בחירה</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={[styles.mapStage, { height: mapStageHeight }]}>
                  {mapLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={styles.loadingText}>טוען מפה…</Text>
                    </View>
                  ) : webSketch ? (
                    checkinSeatingMap
                  ) : (
                    <View style={styles.mapEmptyState}>
                      <View style={styles.mapEmptyIconWrap}>
                        <Ionicons name="map-outline" size={28} color={colors.primary} />
                      </View>
                      <Text style={styles.mapEmptyTitle}>עדיין אין מפת הושבה</Text>
                      <Text style={styles.mapEmptyText}>כשתהיה סקיצה לאירוע, היא תופיע כאן באופן אוטומטי.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {showScrollTop && !addOpen && !moveGuest ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חזרה לראש העמוד"
          onPress={scrollPageToTop}
          style={({ hovered, pressed }: any) => [
            styles.scrollTopFab,
            { right: scrollTopFabRight },
            Platform.OS === 'web' && hovered ? styles.scrollTopFabHover : null,
            pressed ? { opacity: 0.92, transform: [{ translateY: 1 }] } : null,
          ]}
        >
          <Text style={styles.scrollTopFabText}>למעלה</Text>
          <View style={styles.scrollTopFabIcon}>
            <Ionicons name="chevron-up" size={16} color={colors.primary} />
          </View>
        </Pressable>
      ) : null}

      {moveGuest ? (
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סגור העברת אורח"
            onPress={closeMoveModal}
            style={[styles.modalBackdropPressable, { right: drawerScrimRight }]}
          />

          <View style={[styles.modalCard, (isNarrow || isMobile) ? styles.modalCardNarrow : { right: drawerRight }]}>
            <View style={styles.modalHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגור"
                onPress={closeMoveModal}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
                <Text style={styles.modalKicker}>העברת אורח</Text>
              </View>
            </View>

            <View style={styles.modalGuestRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalSubTitle} numberOfLines={1}>
                  {moveGuest.name}
                </Text>
                <View style={styles.modalGuestMetaRow}>
                  <Ionicons name="people" size={14} color={colors.primary} />
                  <Text style={styles.modalGuestMetaText}>
                    {moveGuestPeople === 1 ? 'אורח 1' : `${moveGuestPeople} אורחים`}
                  </Text>
                </View>
              </View>
              <View style={styles.modalAvatar}>
                <Text style={styles.modalAvatarText}>{String(initialsFromName(moveGuest.name)).slice(0, 1)}</Text>
              </View>
            </View>

            <View style={styles.modalSearchWrap}>
              <View style={styles.modalSearchIcon}>
                <Ionicons name="search" size={18} color={colors.primary} />
              </View>
              <TextInput
                style={styles.modalSearchInput}
                placeholder="חיפוש שולחן..."
                placeholderTextColor="rgba(107,114,128,0.75)"
                value={moveTableQuery}
                onChangeText={setMoveTableQuery}
                textAlign="right"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalListWrap}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.modalListScroll}
                contentContainerStyle={{ paddingVertical: 6 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="בחר ללא שולחן"
                  onPress={() => setMoveTargetTableId(null)}
                  style={({ hovered, pressed }: any) => [
                    styles.modalOptionRow,
                    moveSelectedTableId === null ? styles.modalOptionRowSelected : null,
                    Platform.OS === 'web' && hovered ? styles.modalOptionRowHover : null,
                    pressed ? { opacity: 0.94 } : null,
                  ]}
                >
                  <Text style={styles.modalOptionText}>ללא שולחן</Text>
                  <Ionicons
                    name={moveSelectedTableId === null ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={moveSelectedTableId === null ? colors.primary : 'rgba(156,163,175,0.9)'}
                  />
                </Pressable>

                {moveOptions.map((opt) => (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="button"
                    accessibilityLabel={`בחר ${opt.label}`}
                    onPress={() => setMoveTargetTableId(opt.id)}
                    style={({ hovered, pressed }: any) => [
                      styles.modalOptionRow,
                      moveSelectedTableId === opt.id ? styles.modalOptionRowSelected : null,
                      Platform.OS === 'web' && hovered ? styles.modalOptionRowHover : null,
                      pressed ? { opacity: 0.94 } : null,
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.modalOptionText} numberOfLines={1}>
                        {opt.label}
                      </Text>
                      {opt.capacity > 0 ? (
                        <View style={styles.modalOptionMetaRow}>
                          <Ionicons name="person" size={14} color="rgba(107,114,128,0.9)" />
                          <Text style={styles.modalOptionMeta} numberOfLines={1}>
                            יושבים: {previewSeatedForOption(opt.id, opt.seated)} מתוך {opt.capacity}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.modalOptionRight}>
                      {opt.capacity > 0 ? (
                        (() => {
                          if (opt.shape === 'reserve') {
                            return (
                              <View style={styles.modalBadgeReserve}>
                                <Text style={styles.modalBadgeReserveText}>רזרבה</Text>
                              </View>
                            );
                          }
                          const overflow = previewOverflowForOption(opt.id, opt.seated, opt.capacity, opt.shape);
                          if (overflow > 0) {
                            return (
                              <View style={styles.modalBadgeOverflow}>
                                <Text style={styles.modalBadgeOverflowText}>חריגה {overflow}</Text>
                              </View>
                            );
                          }
                          return (
                            <View style={styles.modalBadgeOk}>
                              <Text style={styles.modalBadgeOkText}>פנוי</Text>
                            </View>
                          );
                        })()
                      ) : null}
                      <Ionicons
                        name={moveSelectedTableId === opt.id ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={moveSelectedTableId === opt.id ? colors.primary : 'rgba(156,163,175,0.9)'}
                      />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="העבר"
                onPress={confirmMove}
                disabled={isMoveSaving}
                style={({ hovered, pressed }: any) => [
                  styles.modalPrimaryBtn,
                  isMoveSaving ? styles.modalBtnDisabled : null,
                  Platform.OS === 'web' && hovered ? styles.modalPrimaryBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                {isMoveSaving ? (
                  <ActivityIndicator size={16} color={colors.white} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.modalPrimaryBtnText}>העבר</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.white} />
                  </View>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={closeMoveModal}
                disabled={isMoveSaving}
                style={({ hovered, pressed }: any) => [
                  styles.modalSecondaryBtn,
                  isMoveSaving ? styles.modalBtnDisabled : null,
                  Platform.OS === 'web' && hovered ? styles.modalSecondaryBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Text style={styles.modalSecondaryBtnText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {addOpen ? (
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סגור הוספת מוזמן"
            onPress={closeAddModal}
            style={
              addTableId && !addTablePickerExpanded && !isNarrow && !isMobile
                ? styles.modalBackdropPressableMapSide
                : [styles.modalBackdropPressable, { right: drawerScrimRight }]
            }
          />

          <View
            style={[
              styles.modalCard,
              isNarrow || isMobile ? styles.modalCardNarrow : { right: drawerRight },
              addTableId && !addTablePickerExpanded && !isNarrow && !isMobile ? styles.modalCardMapSide : null,
            ]}
          >
            <View style={styles.modalHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגור"
                onPress={closeAddModal}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
                <Text style={styles.modalKicker}>
                  {addSelectedTableNumber !== null && !addTablePickerExpanded
                    ? `הוספה לשולחן ${addSelectedTableNumber}`
                    : 'מוזמן חדש בכניסה'}
                </Text>
              </View>
            </View>

            <View style={styles.modalGuestRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalSubTitle} numberOfLines={1}>
                  הוספת מוזמן
                </Text>
                <View style={styles.modalGuestMetaRow}>
                  <Ionicons name="information-circle" size={14} color={colors.primary} />
                  <Text style={styles.modalGuestMetaText}>מוזמן שלא נמצא ברשימה – יסומן מיד כהגיע</Text>
                </View>
              </View>
              <View style={styles.modalAvatar}>
                <Ionicons name="person-add" size={20} color={colors.primary} />
              </View>
            </View>

            <ScrollView
              style={styles.addFormScroll}
              contentContainerStyle={{ paddingBottom: 4 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formField}>
                <Text style={styles.formLabel}>שם המוזמן</Text>
                <TextInput
                  style={[styles.formInput, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
                  value={addName}
                  onChangeText={(text) => {
                    setAddName(text);
                    if (addError) setAddError(null);
                  }}
                  placeholder="לדוגמה: ישראל ישראלי"
                  placeholderTextColor="rgba(107,114,128,0.75)"
                  textAlign="right"
                  autoFocus
                  returnKeyType="next"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>מספר טלפון (לא חובה)</Text>
                <TextInput
                  style={[styles.formInput, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
                  value={addPhone}
                  onChangeText={(text) => {
                    setAddPhone(text);
                    if (addError) setAddError(null);
                  }}
                  placeholder="050-0000000"
                  placeholderTextColor="rgba(107,114,128,0.75)"
                  textAlign="right"
                  keyboardType="phone-pad"
                  {...(Platform.OS === 'web' ? ({ inputMode: 'tel' } as any) : null)}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>מספר אנשים</Text>
                <View style={styles.formStepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="הפחת מספר אנשים"
                    onPress={() => setAddPeople((prev) => Math.max(1, prev - 1))}
                    disabled={addPeople <= 1}
                    style={({ hovered, pressed }: any) => [
                      styles.formStepBtn,
                      addPeople <= 1 ? styles.formStepBtnDisabled : null,
                      Platform.OS === 'web' && hovered && addPeople > 1 ? styles.formStepBtnHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Ionicons name="remove" size={18} color={colors.primary} />
                  </Pressable>

                  <View style={styles.formStepValueWrap}>
                    <Text style={styles.formStepValue}>{addPeople}</Text>
                    <Text style={styles.formStepValueHint}>{addPeople === 1 ? 'אורח' : 'אורחים'}</Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="הגדל מספר אנשים"
                    onPress={() => setAddPeople((prev) => Math.min(50, prev + 1))}
                    style={({ hovered, pressed }: any) => [
                      styles.formStepBtn,
                      Platform.OS === 'web' && hovered ? styles.formStepBtnHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>הושבה בשולחן</Text>
                {addTableId && !addTablePickerExpanded ? (
                  <>
                    <View style={styles.selectedTableCard}>
                      <View style={styles.selectedTableCardIcon}>
                        <Ionicons name="restaurant" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.selectedTableCardTitle}>
                          {addSelectedTableOption?.label ??
                            (addSelectedTableNumber !== null ? `שולחן ${addSelectedTableNumber}` : 'שולחן נבחר')}
                        </Text>
                        {addSelectedTableOption && addSelectedTableOption.capacity > 0 ? (
                          <Text style={styles.selectedTableCardMeta}>
                            יושבים: {previewSeatedForAddOption(addSelectedTableOption.id, addSelectedTableOption.seated)}{' '}
                            מתוך {addSelectedTableOption.capacity}
                          </Text>
                        ) : (
                          <Text style={styles.selectedTableCardMeta}>המוזמן יושב בשולחן שבחרת במפה</Text>
                        )}
                      </View>
                      <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="שנה שולחן"
                      onPress={() => setAddTablePickerExpanded(true)}
                      style={({ hovered, pressed }: any) => [
                        styles.changeTableLink,
                        Platform.OS === 'web' && hovered ? styles.changeTableLinkHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <Text style={styles.changeTableLinkText}>שנה שולחן</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.formHint}>בחר שולחן להושבת המוזמן, או השאר ללא שולחן.</Text>

                    <View style={[styles.modalSearchWrap, { marginTop: 10 }]}>
                      <View style={styles.modalSearchIcon}>
                        <Ionicons name="search" size={18} color={colors.primary} />
                      </View>
                      <TextInput
                        style={[styles.modalSearchInput, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
                        placeholder="חיפוש שולחן..."
                        placeholderTextColor="rgba(107,114,128,0.75)"
                        value={addTableQuery}
                        onChangeText={setAddTableQuery}
                        textAlign="right"
                        autoCapitalize="none"
                      />
                    </View>

                    <View style={{ marginTop: 12 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="בחר ללא שולחן"
                        onPress={() => setAddTableId(null)}
                        style={({ hovered, pressed }: any) => [
                          styles.modalOptionRow,
                          addTableId === null ? styles.modalOptionRowSelected : null,
                          Platform.OS === 'web' && hovered ? styles.modalOptionRowHover : null,
                          pressed ? { opacity: 0.94 } : null,
                        ]}
                      >
                        <Text style={styles.modalOptionText}>ללא שולחן</Text>
                        <Ionicons
                          name={addTableId === null ? 'checkmark-circle' : 'ellipse-outline'}
                          size={20}
                          color={addTableId === null ? colors.primary : 'rgba(156,163,175,0.9)'}
                        />
                      </Pressable>

                      {addOptions.length === 0 ? (
                        <Text style={styles.formHint}>לא נמצאו שולחנות מתאימים לחיפוש.</Text>
                      ) : null}

                      {addOptions.map((opt) => (
                        <Pressable
                          key={opt.id}
                          accessibilityRole="button"
                          accessibilityLabel={`הושב ב${opt.label}`}
                          onPress={() => {
                            setAddTableId(opt.id);
                            setAddTablePickerExpanded(false);
                          }}
                          style={({ hovered, pressed }: any) => [
                            styles.modalOptionRow,
                            addTableId === opt.id ? styles.modalOptionRowSelected : null,
                            Platform.OS === 'web' && hovered ? styles.modalOptionRowHover : null,
                            pressed ? { opacity: 0.94 } : null,
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.modalOptionText} numberOfLines={1}>
                              {opt.label}
                            </Text>
                            {opt.capacity > 0 ? (
                              <View style={styles.modalOptionMetaRow}>
                                <Ionicons name="person" size={14} color="rgba(107,114,128,0.9)" />
                                <Text style={styles.modalOptionMeta} numberOfLines={1}>
                                  יושבים: {previewSeatedForAddOption(opt.id, opt.seated)} מתוך {opt.capacity}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.modalOptionRight}>
                            {opt.capacity > 0
                              ? (() => {
                                  if (opt.shape === 'reserve') {
                                    return (
                                      <View style={styles.modalBadgeReserve}>
                                        <Text style={styles.modalBadgeReserveText}>רזרבה</Text>
                                      </View>
                                    );
                                  }
                                  const overflow = previewOverflowForAddOption(opt.id, opt.seated, opt.capacity, opt.shape);
                                  if (overflow > 0) {
                                    return (
                                      <View style={styles.modalBadgeOverflow}>
                                        <Text style={styles.modalBadgeOverflowText}>חריגה {overflow}</Text>
                                      </View>
                                    );
                                  }
                                  return (
                                    <View style={styles.modalBadgeOk}>
                                      <Text style={styles.modalBadgeOkText}>פנוי</Text>
                                    </View>
                                  );
                                })()
                              : null}
                            <Ionicons
                              name={addTableId === opt.id ? 'checkmark-circle' : 'ellipse-outline'}
                              size={20}
                              color={addTableId === opt.id ? colors.primary : 'rgba(156,163,175,0.9)'}
                            />
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </ScrollView>

            {addError ? (
              <View style={styles.formErrorBox}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
                <Text style={styles.formErrorText}>{addError}</Text>
              </View>
            ) : null}

            <View style={styles.modalFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="הוסף מוזמן וסמן כהגיע"
                onPress={() => void confirmAddGuest()}
                disabled={addingWalkIn || !addName.trim()}
                style={({ hovered, pressed }: any) => [
                  styles.modalPrimaryBtn,
                  addingWalkIn || !addName.trim() ? styles.modalBtnDisabled : null,
                  Platform.OS === 'web' && hovered ? styles.modalPrimaryBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                {addingWalkIn ? (
                  <ActivityIndicator size={16} color={colors.white} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.modalPrimaryBtnText}>הוסף וסמן כהגיע</Text>
                    <Ionicons name="checkmark-circle" size={16} color={colors.white} />
                  </View>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={closeAddModal}
                disabled={addingWalkIn}
                style={({ hovered, pressed }: any) => [
                  styles.modalSecondaryBtn,
                  addingWalkIn ? styles.modalBtnDisabled : null,
                  Platform.OS === 'web' && hovered ? styles.modalSecondaryBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Text style={styles.modalSecondaryBtnText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#E8F1FF',
    ...(Platform.OS === 'web'
      ? ({
          minHeight: '100dvh',
          direction: 'rtl',
          backgroundColor: '#F6F9FF',
          backgroundImage:
            'radial-gradient(circle at 88% -10%, rgba(6,23,62,0.10), rgba(6,23,62,0) 42%), radial-gradient(circle at 8% 4%, rgba(240,203,70,0.14), rgba(240,203,70,0) 30%), radial-gradient(circle at 50% 120%, rgba(0,53,102,0.10), rgba(0,53,102,0) 44%), linear-gradient(180deg, #F2F6FF 0%, #F7FAFF 40%, #FDFDFB 100%)',
        } as any)
      : null),
  },
  pageScroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ overflowY: 'auto', overscrollBehavior: 'contain' } as any) : null),
  },
  scrollTopFab: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    bottom: 26,
    zIndex: 40,
    minHeight: 44,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 14px 32px rgba(6,23,62,0.28), 0 0 0 4px rgba(6,23,62,0.06)',
          backdropFilter: 'blur(8px)',
        } as any)
      : null),
  },
  scrollTopFabHover: {
    transform: [{ translateY: -2 }],
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 18px 36px rgba(6,23,62,0.34), 0 0 0 5px rgba(255,255,255,0.12)' } as any) : null),
  },
  scrollTopFabText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
    letterSpacing: 0.2,
  },
  scrollTopFabIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  screen: {
    width: '100%',
    maxWidth: 1960,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingBottom: 22,
    paddingTop: 6,
  },

  content: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  contentLg: {
    alignItems: 'stretch',
  },
  contentSm: { flexDirection: 'column', gap: 8 },
  // Keep side columns tighter to prioritize the map width.
  guestsCol: { width: 440, flexShrink: 1, minWidth: 340 },
  guestsColLg: {
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ display: 'flex', flexDirection: 'column' } as any) : null),
  },
  // On stacked layout (no map), keep the guests panel compact and centered.
  // minWidth: 0 prevents the 400px base minWidth from forcing horizontal
  // overflow on phones.
  colSm: { width: '100%', maxWidth: 520, minWidth: 0, alignSelf: 'center' },
  colTablet: { width: '100%', minWidth: 0, alignSelf: 'stretch' },
  main: { flex: 1, minWidth: 0, flexShrink: 1 },
  // When stacked (phone/tablet portrait) the map column must be allowed to
  // shrink to the viewport width instead of forcing a 460px horizontal scroll.
  mainSm: { width: '100%', minWidth: 0, flexShrink: 1 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    padding: 14,
    shadowColor: colors.primary,
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 16px 40px rgba(6,23,62,0.06), 0 2px 6px rgba(6,23,62,0.03)',
        } as any)
      : null),
  },
  guestListCard: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ display: 'flex', flexDirection: 'column' } as any) : null),
  },
  dashboardCard: {
    padding: 0,
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
  },
  topDashboardWrap: { width: '100%', marginTop: 8, marginBottom: 4 },
  dashboardCardTop: { maxWidth: 1960 },
  cardTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  heroShell: { width: '100%', marginTop: 4, gap: 8 },
  mobileNavRow: {
    width: '100%',
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  metricsStrip: {
    width: '100%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 14px 34px rgba(6,23,62,0.06), 0 2px 6px rgba(6,23,62,0.03)',
          backdropFilter: 'blur(10px)',
        } as any)
      : null),
  },
  metricsStripMain: { gap: 8 },
  metricsStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveMapBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.30)',
    flexShrink: 0,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  liveMapBtnHover: { backgroundColor: '#FEF2F2' },
  liveMapDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#DC2626' },
  liveMapBtnText: { fontSize: 12, fontWeight: '900', color: '#B91C1C' },
  exportExcelBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.18)',
    flexShrink: 0,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  exportExcelBtnHover: { backgroundColor: 'rgba(6,23,62,0.05)' },
  exportExcelBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  metricsStripLive: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(135deg, #06173E, #0F2F6B)',
          boxShadow: '0 8px 18px rgba(6,23,62,0.22)',
        } as any)
      : null),
  },
  metricsStripLiveText: { fontSize: 11, fontWeight: '900', color: '#fff', textAlign: 'right' },
  metricsStripRate: {
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(240,203,70,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metricsStripRateValue: { fontSize: 17, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  metricsStripRateLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(6,23,62,0.60)', textAlign: 'center' },
  arrivalProgressWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },
  arrivalProgressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.07)',
    overflow: 'hidden',
  },
  arrivalProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#10B981',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(90deg, #34D399, #10B981)',
          transition: 'width 500ms ease',
        } as any)
      : null),
  },
  arrivalProgressText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(6,23,62,0.65)',
    textAlign: 'right',
    flexShrink: 0,
  },

  dashboardGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dashboardGridSm: {
    gap: 8,
  },
  dashboardHeader: {
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dashboardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  dashboardHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardHeaderTitle: { fontSize: 15, fontWeight: '900', color: '#fff', textAlign: 'right' },
  dashboardHeaderSub: { marginTop: 2, fontSize: 11, fontWeight: '800', color: 'rgba(209,213,219,0.95)', textAlign: 'right' },
  dashboardHeaderMenu: { padding: 6, borderRadius: 10 },
  dashboardBackBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  dashboardBackBtnHover: { backgroundColor: 'rgba(255,255,255,0.14)' },
  dashboardBackText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },
  dashboardHeaderBadge: {
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardHeaderBadgeValue: { fontSize: 20, fontWeight: '900', color: '#fff', textAlign: 'center' },
  dashboardHeaderBadgeText: { marginTop: 2, fontSize: 15, fontWeight: '500', fontFamily: 'Rubik', color: 'rgba(229,231,235,0.95)', textAlign: 'center' },
  dashboardBody: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 12, gap: 10 },
  dashboardBodyTop: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 12, gap: 10 },
  heroMainCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: 'rgba(17,24,39,0.06)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 36px rgba(11,28,65,0.06)' } as any) : null),
  },
  heroToolbar: { gap: 10 },
  heroFiltersRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  heroFilterChip: {
    minHeight: 42,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  heroFilterChipHover: { backgroundColor: 'rgba(241,245,249,1)' },
  heroFilterChipActive: {
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderColor: 'rgba(6,23,62,0.22)',
  },
  heroFilterChipText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  heroFilterChipTextActive: { color: colors.primary },
  heroFilterChipCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  heroFilterChipCountActive: { backgroundColor: colors.primary },
  heroFilterChipCountText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'center' },
  heroFilterChipCountTextActive: { color: '#fff' },
  heroMetaChipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  heroMetaChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.05)',
  },
  heroMetaChipText: { fontSize: 12, fontWeight: '800', color: colors.primary, textAlign: 'right' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  metricsGridTop: { flexWrap: 'nowrap', gap: 6 },
  overviewStatCard: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 88,
    minHeight: 0,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 8px rgba(6,23,62,0.04)' } as any) : null),
  },
  overviewStatCardCompact: {},
  overviewStatTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  overviewStatCopy: { flex: 1, minWidth: 0, gap: 0 },
  overviewStatIconBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  overviewStatIconBoxHighlight: {
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  overviewStatLabel: {
    minWidth: 0,
    fontSize: 10,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 13,
  },
  overviewStatValue: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },

  arrivalCard: {
    borderRadius: 18,
    padding: 10,
    backgroundColor: 'rgba(249,250,251,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  arrivalCardTop: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16 },
  arrivalTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  arrivalTopRowTop: { marginBottom: 6 },
  arrivalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrivalTitle: { fontSize: 12, fontWeight: '900', color: 'rgba(55,65,81,0.95)', textAlign: 'right' },
  arrivalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' } as any) : null),
  },
  arrivalBadgeStrong: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'right' },
  arrivalBadgeSub: { fontSize: 10, fontWeight: '800', color: 'rgba(107,114,128,1)', textAlign: 'right' },
  arrivalBarWrap: {
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(229,231,235,1)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  arrivalBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 999,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  arrivalBarText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },
  arrivalBarStripes: { position: 'absolute', inset: 0 as any, opacity: 0.28 },
  arrivalBarLegend: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  arrivalLegendText: { fontSize: 10, fontWeight: '800', color: 'rgba(156,163,175,1)', textAlign: 'right' },

  quickFilterWrap: { gap: 6 },
  metricCard: {
    width: '48%',
    minWidth: 140,
    backgroundColor: 'rgba(6,23,62,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    borderRadius: 16,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },
  metricValue: { marginTop: 2, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[500],
    textAlign: 'right',
    textTransform: 'uppercase' as any,
    letterSpacing: 0.8,
  },

  searchWrap: {
    marginTop: 12,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  mainSearchWrap: {
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 4px rgba(6,23,62,0.04)' } as any) : null),
  },
  searchIconRight: { position: 'absolute', right: 10 },
  searchSpinner: { position: 'absolute', left: 10, top: 0, bottom: 0, justifyContent: 'center' },
  searchInput: { paddingRight: 36, paddingLeft: 10, fontSize: 13, fontWeight: '800', color: colors.text },

  pillsRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pillsRowTop: { marginTop: 0 },
  pill: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  pillHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.20)',
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  pillText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  pillTextActive: { color: colors.white },

  summaryRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  summaryPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(6,23,62,0.06)',
  },
  summaryPillText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardHeaderActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 0 },
  panelHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
  panelEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    letterSpacing: 0.6,
    textTransform: 'uppercase' as any,
  },
  panelTitle: { fontSize: 16, fontWeight: '900', color: colors.primary, textAlign: 'right', letterSpacing: 0.1 },
  panelSubtitle: { fontSize: 11, fontWeight: '700', color: colors.gray[600], lineHeight: 16, textAlign: 'right' },
  panelMetaRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
  collapseAllBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'background-color 140ms ease' } as any) : null),
  },
  collapseAllBtnHover: { backgroundColor: 'rgba(6,23,62,0.09)' },
  collapseAllBtnText: { fontSize: 11, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  panelFilterChipsRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  panelFilterChip: {
    minHeight: 32,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.9)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  panelFilterChipTouch: { minHeight: 40, paddingHorizontal: 14, paddingVertical: 8 },
  panelFilterChipHover: { backgroundColor: 'rgba(241,245,249,1)', borderColor: 'rgba(148,163,184,0.45)' },
  panelFilterChipActive: {
    backgroundColor: 'rgba(6,23,62,0.08)',
    borderColor: 'rgba(6,23,62,0.26)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 24px rgba(6,23,62,0.10)' } as any) : null),
  },
  panelFilterChipText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  panelFilterChipTextActive: { color: colors.primary },
  panelFilterChipCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  panelFilterChipCountActive: { backgroundColor: colors.primary },
  panelFilterChipCountText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'center' },
  panelFilterChipCountTextActive: { color: '#fff' },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.04)' },
  linkBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  linkBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  helperText: { marginTop: 8, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },

  statCard: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(15,23,42,0.03)',
  },
  statCardHover: { backgroundColor: 'rgba(255,255,255,0.96)' },
  statCardActive: { backgroundColor: 'rgba(6,23,62,0.04)', borderColor: 'rgba(6,23,62,0.12)' },
  statTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  statPctPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(204,160,0,0.10)' },
  statPctText: { fontSize: 12, fontWeight: '900', color: colors.secondary, textAlign: 'right' },
  progressTrack: {
    marginTop: 10,
    height: 6,
    backgroundColor: 'rgba(15,23,42,0.12)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.primary, borderRadius: 999 },
  statBottomText: { marginTop: 8, fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },

  mainHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  h2: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'right' },

  listWrap: {
    marginTop: 8,
    backgroundColor: 'rgba(246,249,255,0.75)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    padding: 8,
  },
  listWrapFill: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' ? ({ display: 'flex', flexDirection: 'column' } as any) : null),
  },
  tableGroupsWrap: { gap: 8 },
  tableGroupCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.07)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 2px 10px rgba(6,23,62,0.04)' } as any) : null),
  },
  tableGroupCardOverflow: {
    borderColor: 'rgba(239,68,68,0.26)',
    backgroundColor: 'rgba(254,242,242,0.92)',
  },
  tableGroupHeader: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: 'rgba(6,23,62,0.02)',
    ...(Platform.OS === 'web'
      ? ({
          direction: 'ltr',
          backgroundImage: 'linear-gradient(180deg, rgba(246,249,255,0.9), rgba(255,255,255,0.4))',
        } as any)
      : null),
  },
  tableGroupProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(6,23,62,0.06)',
    overflow: 'hidden',
  },
  tableGroupProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#10B981',
    ...(Platform.OS === 'web' ? ({ transition: 'width 400ms ease' } as any) : null),
  },
  tableGroupProgressFillOver: {
    backgroundColor: '#EF4444',
  },
  tableGroupHeaderOverflow: { backgroundColor: 'rgba(239,68,68,0.06)' },
  tableGroupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  tableGroupIcon: {
    width: 26,
    height: 26,
    borderRadius: 10,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  tableGroupTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'left' },
  tableGroupMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  tableGroupMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  tableGroupMetaPillOverflow: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.18)',
  },
  tableGroupMetaStrong: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'left' },
  tableGroupMetaDim: { fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'left' },
  tableGroupMetaStrongOverflow: { fontSize: 12, fontWeight: '900', color: '#DC2626', textAlign: 'left' },
  tableGroupMetaDimOverflow: { fontSize: 11, fontWeight: '900', color: '#DC2626', textAlign: 'left' },
  tableGroupBody: { padding: 8, gap: 6 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  th: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },

  loadingRow: { paddingVertical: 26, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },
  emptyRow: { paddingVertical: 30, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
  listHint: { marginTop: 10, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
  showMoreBtn: {
    marginTop: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  showMoreBtnText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  mapEmptyState: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  mapEmptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  mapEmptyTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  mapEmptyText: { maxWidth: 320, fontSize: 13, fontWeight: '700', lineHeight: 20, color: colors.gray[600], textAlign: 'center' },

  mapLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  mapLegendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  mapLegendDot: { width: 8, height: 8, borderRadius: 999 },
  mapLegendText: { fontSize: 11, fontWeight: '800', color: colors.gray[700], textAlign: 'right' },
  mapCard: { gap: 8, overflow: 'hidden' },
  mapStage: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F3F7FC',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    ...(Platform.OS === 'web'
      ? ({
          display: 'flex',
          flexDirection: 'column',
          backgroundImage: 'radial-gradient(rgba(6,23,62,0.07) 1px, transparent 1.4px)',
          backgroundSize: '20px 20px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 40px rgba(6,23,62,0.02)',
        } as any)
      : null),
  },
  mapCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  mapCardHeaderSide: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  mapAddGuestBtn: {
    minHeight: 32,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(240,203,70,0.30)',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          backgroundImage: 'linear-gradient(135deg, #0A2454, #06173E)',
          boxShadow: '0 8px 18px rgba(6,23,62,0.22)',
        } as any)
      : null),
  },
  mapAddGuestBtnHover: { opacity: 0.94 },
  mapAddGuestBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },
  mapStatusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  mapStatusDot: { width: 8, height: 8, borderRadius: 999 },
  mapStatusPillText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

  guestRowCompact: {
    position: 'relative',
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ direction: 'ltr', transition: 'border-color 140ms ease, box-shadow 140ms ease' } as any)
      : null),
  },
  guestRowCompactOn: {
    backgroundColor: 'rgba(16,185,129,0.05)',
    borderColor: 'rgba(16,185,129,0.16)',
  },
  // On phones the name + controls (~196px) cannot fit on one line, so wrap the
  // controls onto a second row beneath the name.
  guestRowCompactSm: { flexWrap: 'wrap', alignItems: 'flex-start', minHeight: 0, paddingVertical: 12 },
  // Tall enough to hold the 42pt touch stepper plus vertical padding.
  guestRowCompactTablet: { minHeight: 68, paddingVertical: 12 },
  guestRowMainSm: { flexBasis: '100%', flexGrow: 1, flexShrink: 1 },
  guestRowMainTablet: { flexBasis: 220, flexGrow: 1, flexShrink: 1 },
  guestRowRightSm: { width: '100%', justifyContent: 'flex-end', marginTop: 10 },
  guestRowAccent: {
    width: 4,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.7)',
    flexShrink: 0,
  },
  guestRowAccentOn: { backgroundColor: '#10B981' },
  guestRowMain: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // Keep a consistent "name column" width so the toggle aligns vertically across rows.
    flexBasis: 310,
    flexGrow: 1,
    flexShrink: 1,
  },
  // Fixed controls width keeps the toggle in the same X position.
  guestRowRight: { width: 196, flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  // Touch controls are wider (62pt switch, 40pt move button, 34pt steppers), so
  // the column has to grow with them or the move button clips.
  guestRowRightTouch: { width: 240 },
  moveBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    marginLeft: 12,
    marginRight: -6,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  moveBtnTouch: { width: 40, height: 40, borderRadius: 14 },
  moveBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  moveBtnDisabled: { opacity: 0.55 },
  guestNameCompact: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  guestMetaCompact: { marginTop: 0, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  arrivalSlot: { width: 112, alignItems: 'center', justifyContent: 'center' },
  peoplePill: {
    minWidth: 30,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  compactStepper: {
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactStepperTouch: { height: 42, borderRadius: 14 },
  stepBtnCompact: {
    width: 26,
    height: 26,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnCompactTouch: { width: 34, height: 34, borderRadius: 12 },
  compactCountWrap: { minWidth: 20, alignItems: 'center', justifyContent: 'center' },
  compactCountText: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'center' },
  compactCountInput: {
    minWidth: 20,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },

  guestCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  guestCardSm: { padding: 12 },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: 'rgba(148,163,184,0.7)' },
  accentBarOn: { backgroundColor: '#10B981' },
  guestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 10 },
  cell: { justifyContent: 'center' },
  cellText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'center' },

  countStepper: {
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnHover: { backgroundColor: 'rgba(255,255,255,1)' },
  stepBtnDisabled: { opacity: 0.55 },
  stepBtnText: { fontSize: 16, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  countValueWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 34 },
  countValueText: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'center' },
  countValueSub: { marginTop: -2, fontSize: 10, fontWeight: '900', color: colors.gray[600], textAlign: 'center' },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCompact: { width: 28, height: 28 },
  avatarOn: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.20)' },
  avatarText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'center' },
  guestName: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },
  guestSub: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.gray[500], textAlign: 'right' },

  kvRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kvLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },
  kvValue: { fontSize: 13, fontWeight: '900', color: colors.gray[800], textAlign: 'left' },
  miniBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  miniBtnDisabled: { opacity: 0.55 },
  miniBtnText: { fontSize: 16, fontWeight: '900', color: colors.primary, textAlign: 'center' },

  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  loadMoreBtnHover: { backgroundColor: 'rgba(255,255,255,1)' },
  loadMoreText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

  modalBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    ...(Platform.OS === 'web' ? ({ position: 'fixed', zIndex: 50 } as any) : null),
  },
  // Scrim area (left side) so the map stays visible.
  modalBackdropPressable: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    // Leave room for the right-side drawer (width 420 + 16px margin on each side).
    right: 452,
    backgroundColor: 'rgba(6,23,62,0.16)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(2px)' } as any) : null),
  },
  modalBackdropPressableMapSide: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    // Scrim only the map side — keep the guest list fully visible on the right.
    right: 452,
    backgroundColor: 'rgba(6,23,62,0.16)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(2px)' } as any) : null),
  },
  modalCard: {
    position: 'absolute',
    right: 16,
    top: 16,
    bottom: 16,
    width: 420,
    maxWidth: 440,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    backgroundColor: '#FBFCFE',
    padding: 18,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    ...(Platform.OS === 'web'
      ? ({
          maxHeight: 'calc(100dvh - 32px)',
          boxShadow: '0 30px 70px rgba(6,23,62,0.26), 0 4px 14px rgba(6,23,62,0.10)',
        } as any)
      : null),
  },
  modalCardMapSide: {
    left: 16,
    right: 'auto',
  },
  modalCardNarrow: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: 0,
    maxWidth: 9999,
  },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalKicker: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    letterSpacing: 0.6,
  },
  modalSubTitle: { marginTop: 2, fontSize: 26, fontWeight: '900', color: '#111827', textAlign: 'right' },
  modalGuestRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalGuestMetaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalGuestMetaText: { fontSize: 13, fontWeight: '800', color: '#6B7280', textAlign: 'right' },
  modalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.18)',
  },
  modalAvatarText: { fontSize: 18, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalCloseBtnHover: { backgroundColor: '#F8FAFC' },
  modalSearchWrap: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  modalSearchIcon: { position: 'absolute', right: 12, top: 12 },
  modalSearchInput: {
    paddingRight: 42,
    paddingLeft: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  modalListWrap: { marginTop: 14, flex: 1, minHeight: 0 },
  modalListScroll: { flex: 1, minHeight: 0, maxHeight: 420 },
  modalOptionRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,1)',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalOptionRowSelected: {
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderColor: 'rgba(6,23,62,0.70)',
    borderWidth: 2,
  },
  modalOptionRowHover: { borderColor: 'rgba(6,23,62,0.30)' },
  modalOptionText: { fontSize: 16, fontWeight: '900', color: '#111827', textAlign: 'right' },
  modalOptionMetaRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalOptionMeta: { fontSize: 12, fontWeight: '800', color: '#6B7280', textAlign: 'right' },
  modalOptionRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  modalBadgeOk: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.18)',
  },
  modalBadgeOkText: { fontSize: 12, fontWeight: '900', color: '#16A34A', textAlign: 'center' },
  modalBadgeOverflow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
  },
  modalBadgeOverflowText: { fontSize: 12, fontWeight: '900', color: '#DC2626', textAlign: 'center' },
  modalBadgeReserve: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.16)',
  },
  modalBadgeReserveText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'center' },

  selectedTableCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.22)',
  },
  selectedTableCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedTableCardTitle: { fontSize: 16, fontWeight: '900', color: '#111827', textAlign: 'right' },
  selectedTableCardMeta: { marginTop: 4, fontSize: 12, fontWeight: '800', color: '#6B7280', textAlign: 'right' },
  changeTableLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  changeTableLinkHover: { opacity: 0.85 },
  changeTableLinkText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  addGuestBtn: {
    flexShrink: 0,
    minHeight: 34,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(240,203,70,0.30)',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          backgroundImage: 'linear-gradient(135deg, #0A2454, #06173E)',
          boxShadow: '0 10px 22px rgba(6,23,62,0.24)',
          transition: 'transform 140ms ease, box-shadow 140ms ease',
        } as any)
      : null),
  },
  addGuestBtnTouch: { minHeight: 48, paddingHorizontal: 18 },
  addGuestBtnHover: {
    ...(Platform.OS === 'web'
      ? ({
          transform: [{ translateY: -1 }],
          boxShadow: '0 14px 28px rgba(6,23,62,0.30), 0 0 0 3px rgba(240,203,70,0.16)',
        } as any)
      : ({ opacity: 0.94 } as any)),
  },
  addGuestBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },
  exportExcelHeaderBtn: {
    flexShrink: 0,
    minHeight: 34,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.16)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'background-color 140ms ease' } as any) : null),
  },
  exportExcelHeaderBtnTouch: { minHeight: 48, paddingHorizontal: 16 },
  exportExcelHeaderBtnHover: { backgroundColor: 'rgba(6,23,62,0.05)' },
  exportExcelHeaderBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  addGuestEmptyBtn: {
    marginTop: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  addGuestEmptyBtnHover: { backgroundColor: 'rgba(6,23,62,0.10)' },
  addGuestEmptyBtnText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  addFormScroll: { marginTop: 14, flex: 1, minHeight: 0 },
  formField: { marginBottom: 14 },
  formLabel: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right', marginBottom: 8 },
  formHint: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#6B7280', textAlign: 'right', lineHeight: 17 },
  formInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  formStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  formStepBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  formStepBtnHover: { backgroundColor: 'rgba(6,23,62,0.10)' },
  formStepBtnDisabled: { opacity: 0.45 },
  formStepValueWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  formStepValue: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'center' },
  formStepValueHint: { fontSize: 11, fontWeight: '800', color: '#6B7280', textAlign: 'center' },
  formErrorBox: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
  },
  formErrorText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '900', color: '#DC2626', textAlign: 'right' },

  modalFooter: { marginTop: 10, flexDirection: 'column', gap: 10 },
  modalSecondaryBtn: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalSecondaryBtnHover: { backgroundColor: 'rgba(6,23,62,0.06)' },
  modalSecondaryBtnText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  modalPrimaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(240,203,70,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          backgroundImage: 'linear-gradient(135deg, #0A2454, #06173E)',
          boxShadow: '0 12px 26px rgba(6,23,62,0.24)',
          transition: 'box-shadow 140ms ease',
        } as any)
      : null),
  },
  modalPrimaryBtnHover: {
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 16px 32px rgba(6,23,62,0.32), 0 0 0 3px rgba(240,203,70,0.16)' } as any)
      : ({ opacity: 0.98 } as any)),
  },
  modalPrimaryBtnText: { fontSize: 13, fontWeight: '900', color: colors.white, textAlign: 'center' },
  modalBtnDisabled: { opacity: 0.6 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  primaryBtn: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnHover: { opacity: 0.95 },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'center' },
});

const ui = StyleSheet.create({
  switchWrap: {
    width: 46,
    height: 26,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  switchWrapLarge: { width: 62, height: 34 },
  switchWrapOn: {
    backgroundColor: '#10B981',
    borderColor: 'rgba(16,185,129,0.35)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 12px rgba(16,185,129,0.30)' } as any) : null),
  },
  switchHover: { opacity: 0.98 },
  switchTrack: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 999 },
  switchTrackOn: {},
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
  },
  switchThumbOn: { right: 22 - 2, backgroundColor: colors.white, borderColor: 'rgba(15,23,42,0.12)' },
  switchThumbLarge: { width: 30, height: 30 },
  switchThumbLargeOn: { right: 30 - 2, backgroundColor: colors.white, borderColor: 'rgba(15,23,42,0.12)' },
});

export default function EmployeeGuestCheckinWebScreen() {
  // On web (including narrow mobile-web viewports) always render the web screen.
  // The native mobile screen relies on native-only APIs (Stack.Screen, BackHandler,
  // SafeAreaView) and crashes when rendered in a browser. The web screen below is
  // already responsive down to phone widths (see isMobile/contentSm/colSm handling).
  return <EmployeeGuestCheckinWebDesktopScreen />;
}

