import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { tableService } from '@/lib/services/tableService';
import { supabase } from '@/lib/supabase';
import { SeatingGridReadonly } from '../seating/web/SeatingGridReadonly';
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type Orientation, type TableType } from '../seating/web/_types';
import type { Guest, Table } from '@/types';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';

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
  compact,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}) {
  return (
    <View style={[styles.overviewStatCard, compact ? styles.overviewStatCardCompact : null]}>
      <View style={styles.overviewStatTop}>
        <View style={styles.overviewStatIconBox}>
          <Ionicons name={icon} size={17} color={colors.primary} />
        </View>
        <Text style={styles.overviewStatLabel}>{label}</Text>
      </View>
      <Text style={styles.overviewStatValue}>{value}</Text>
    </View>
  );
}

function Switch({
  checked,
  disabled,
  onPress,
  accessibilityLabel,
  saving,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ hovered, pressed }: any) => [
        ui.switchWrap,
        checked ? ui.switchWrapOn : null,
        disabled ? { opacity: 0.6 } : null,
        Platform.OS === 'web' && hovered ? ui.switchHover : null,
        pressed ? { opacity: 0.92 } : null,
      ]}
    >
      <View style={[ui.switchTrack, checked ? ui.switchTrackOn : null]} />
      <View style={[ui.switchThumb, checked ? ui.switchThumbOn : null]}>
        {saving ? <ActivityIndicator size={12} color={colors.primary} /> : null}
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
  const isLg = width >= 1024;
  const isNarrow = width < 520;
  const isMobile = width < 768;
  const metricsInOneRow = Platform.OS === 'web' && !isMobile;
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
  const [collapsedTableGroups, setCollapsedTableGroups] = useState<Record<string, boolean>>({});
  const [tableFilter, setTableFilter] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableNumberById, setTableNumberById] = useState<Map<string, number | null>>(() => new Map());
  const [webSketch, setWebSketch] = useState<WebSketch | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);

  const sendCheckInTableSms = useCallback(
    async (guest: Guest) => {
      if (!resolvedEventId || !guest?.id) return;
      try {
        await supabase.functions.invoke('send-checkin-table-sms', {
          body: { eventId: resolvedEventId, guestId: guest.id },
        });
      } catch (e) {
        console.warn('Check-in table SMS send failed:', e);
      }
    },
    [resolvedEventId]
  );

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
    guests,
    filteredGuests,
    counts,
    query,
    setQuery,
    filter,
    setFilter,
    refresh,
    toggleCheckIn: toggleCheckInRaw,
    savingId,
    setCheckedInCount,
    savingCountId,
    assignGuestToTable,
    savingMoveId,
  } = useGuestCheckInModel({
    eventId: resolvedEventId ? resolvedEventId : null,
    errorTitle: 'שגיאה',
    errorMessage: 'לא ניתן לטעון את רשימת האורחים',
  });

  const toggleCheckIn = useCallback(
    async (guest: Guest) => {
      const wasCheckedIn = Boolean((guest as any)?.checkedIn);
      await toggleCheckInRaw(guest);
      if (!wasCheckedIn) {
        await sendCheckInTableSms(guest);
      }
    },
    [sendCheckInTableSms, toggleCheckInRaw]
  );

  const [moveGuest, setMoveGuest] = useState<Guest | null>(null);
  const [moveTableQuery, setMoveTableQuery] = useState('');
  const [moveSelectedTableId, setMoveSelectedTableId] = useState<string | null>(null);
  const [movePrevSelectedTableNumber, setMovePrevSelectedTableNumber] = useState<number | null>(null);

  const [editingArrivedCountGuestId, setEditingArrivedCountGuestId] = useState<string | null>(null);
  const [editingArrivedCountValue, setEditingArrivedCountValue] = useState('');

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
      const rows = await tableService.getTables(resolvedEventId);
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
      if (typeof n === 'number') m.set(n, t.id);
    });
    return m;
  }, [tablesSorted]);

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
    const invitedPeople = guests.reduce((sum, g) => sum + (Number(g.numberOfPeople) || 1), 0);
    const arrivedPeople = guests.reduce((sum, g) => {
      if (!g.checkedIn) return sum;
      const actual = g.checkedInCount === null || g.checkedInCount === undefined ? null : Number(g.checkedInCount);
      const n = actual !== null && Number.isFinite(actual) ? actual : Number(g.numberOfPeople) || 1;
      return sum + n;
    }, 0);
    const arrivingNotArrivedGuests = guests.filter((g) => g.status === 'מגיע' && !g.checkedIn).length;

    const reserveTables = tables.filter((t) => t.shape === 'reserve');
    const regularTables = tables.filter((t) => t.shape !== 'reserve');

    const occupiedCount = (t: Table) => (Array.isArray(t.guests) ? t.guests.length : 0);
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
  }, [guests, tables]);

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

  const mapCardHeight = useMemo(() => {
    if (!height || !isLg) return 620;
    return Math.max(620, Math.round(height - 120));
  }, [height, isLg]);

  const guestListMaxHeight = useMemo(() => {
    if (!height || !isLg) return undefined;
    return Math.max(420, Math.round(height - 360));
  }, [height, isLg]);

  const guestsListEstimatedHeight = useMemo(() => {
    // Heuristic so the list "shrinks to fit" when there are few guests.
    const GROUP_GAP = 10;
    const GROUP_HEADER_H = 52;
    const BODY_PADDING_V = 20; // tableGroupBody paddingVertical
    const BODY_GAP = 10; // tableGroupBody gap
    const ROW_H = 66; // guestRowCompact height + padding
    const LIST_WRAP_PADDING_V = 28; // listWrap paddingVertical (14 top + 14 bottom)

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
    if (isLg) return true;
    if (!guestListMaxHeight) return false;
    return guestsListEstimatedHeight > guestListMaxHeight;
  }, [guestListMaxHeight, guestsListEstimatedHeight, isLg]);

  const guestsColWidth = useMemo(() => {
    if (!isLg) return undefined as number | undefined;
    const w = Number(width) || 0;
    // Give the guests panel a bit more room so longer names fit better.
    return Math.max(450, Math.min(520, Math.round(w * 0.38)));
  }, [isLg, width]);

  const stickyTop = useMemo(() => {
    if (Platform.OS !== 'web') return 0;
    if (!isLg) return 0;
    // Keep a tiny gap from the top on web.
    return 8;
  }, [isLg]);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([refresh(), loadTables(), fetchWebSketch()]);
  }, [fetchWebSketch, loadTables, refresh]);

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

  const moveOptions = useMemo(() => {
    const q = moveTableQuery.trim().toLowerCase();
    const base = tablesSorted.map((t) => {
      const id = String((t as any).id ?? t.id);
      const label = tableLabelById.get(id) || 'שולחן';
      const capacity = Number((t as any).capacity) || 0;
      const seated = seatedByTableId.get(String(id).trim()) || 0;
      const shape = ((t as any).shape ?? null) as any;
      return { id, label, capacity, seated, shape };
    });
    if (!q) return base;
    return base.filter((x) => x.label.toLowerCase().includes(q));
  }, [moveTableQuery, seatedByTableId, tableLabelById, tablesSorted]);

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
      {groupedVisibleGuests.map((group) => {
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
                    <View key={g.id} style={[styles.guestRowCompact, checkedIn ? styles.guestRowCompactOn : null, isMobile ? styles.guestRowCompactSm : null]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`בחירת אורח ${g.name}`}
                        onPress={() => {
                          const next = typeof tableNumber === 'number' ? tableNumber : null;
                          setSelectedTableNumber((prev) => (prev === next ? null : next));
                        }}
                        style={({ hovered, pressed }: any) => [
                          styles.guestRowMain,
                          isMobile ? styles.guestRowMainSm : null,
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

                      <View style={[styles.guestRowRight, isMobile ? styles.guestRowRightSm : null]}>
                        <View style={styles.arrivalSlot}>
                          {checkedIn ? (
                            <View style={styles.compactStepper}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`הפחת כמות שהגיעה עבור ${g.name}`}
                                onPress={() => void setCheckedInCount(g, Math.max(0, arrivedCount - 1))}
                                disabled={savingCountId === g.id || arrivedCount <= 0}
                                style={({ hovered, pressed }: any) => [
                                  styles.stepBtnCompact,
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
                                style={({ hovered, pressed }: any) => [
                                  styles.stepBtnCompact,
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
                          accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                          onPress={() => void toggleCheckIn(g)}
                        />

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`העבר אורח ${g.name} לשולחן אחר`}
                          onPress={() => openMoveModal(g)}
                          disabled={isSaving || savingMoveId === g.id}
                          style={({ hovered, pressed }: any) => [
                            styles.moveBtn,
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
          style={styles.pageScroll}
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroShell}>
            <AdminWebPageHeader
              eyebrow={isAdminRoute ? 'ניהול אורחים' : 'צ׳ק אין'}
              title="צ'ק אין אורחים"
              subtitle={`${counts.checkedIn} מתוך ${counts.total} מוזמנים באולם`}
              showNav={false}
              useDefaultActions={false}
              leading={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חזרה לרשימת האירועים"
                  onPress={handleBack}
                  style={({ hovered, pressed }: any) => [
                    styles.webBackBtn,
                    Platform.OS === 'web' && hovered ? styles.webBackBtnHover : null,
                    pressed ? styles.webBackBtnPressed : null,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={16} color={colors.text} />
                  <Text style={styles.webBackBtnText}>חזרה</Text>
                </Pressable>
              }
              actions={
                <View style={styles.heroHeaderActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="רענן נתוני צ׳ק אין"
                    onPress={() => void handleRefreshAll()}
                    style={({ hovered, pressed }: any) => [
                      styles.heroHeaderActionBtn,
                      Platform.OS === 'web' && hovered ? styles.heroHeaderActionBtnHover : null,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                  >
                    <Ionicons name="refresh" size={16} color={colors.primary} />
                    <Text style={styles.heroHeaderActionText}>רענון</Text>
                  </Pressable>
                </View>
              }
            />
          </View>

          <View style={styles.topDashboardWrap}>
            <View style={Platform.OS === 'web' && isLg ? ({ position: 'sticky', top: stickyTop } as any) : null}>
              <View style={[styles.card, styles.dashboardCard, styles.heroMainCard, isLg ? styles.dashboardCardTop : null]}>
                <View style={styles.dashboardHeader}>
                  <View style={styles.dashboardHeaderLeft}>
                    <View style={styles.dashboardHeaderIcon}>
                      <Ionicons name="pulse-outline" size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.dashboardHeaderTitle}>תמונת מצב בזמן אמת</Text>
                      <Text style={styles.dashboardHeaderSub}>מוזמנים, שולחנות ויחס הגעה לאירוע</Text>
                    </View>
                  </View>

                  <View style={styles.dashboardHeaderBadge}>
                    <Text style={styles.dashboardHeaderBadgeValue}>{attendanceRate}%</Text>
                    <Text style={styles.dashboardHeaderBadgeText}>יחס הגעה</Text>
                  </View>
                </View>

                <View style={[styles.dashboardBody, isLg ? styles.dashboardBodyTop : null]}>
                  <View style={[styles.metricsGrid, metricsInOneRow ? styles.metricsGridTop : null]}>
                    <CheckinOverviewStat
                      compact={metricsInOneRow}
                      label='סה"כ מוזמנים'
                      value={eventOverview.invitedPeople}
                      icon="people-outline"
                    />
                    <CheckinOverviewStat
                      compact={metricsInOneRow}
                      label="הגיעו לאולם"
                      value={counts.checkedIn}
                      icon="walk-outline"
                    />
                    <CheckinOverviewStat
                      compact={metricsInOneRow}
                      label="שולחנות ריקים"
                      value={eventOverview.emptyTables}
                      icon="grid-outline"
                    />
                    <CheckinOverviewStat
                      compact={metricsInOneRow}
                      label="שולחנות מלאים"
                      value={eventOverview.fullTables}
                      icon="checkmark-circle-outline"
                    />
                    <CheckinOverviewStat
                      compact={metricsInOneRow}
                      label="שולחנות רזרבה"
                      value={eventOverview.reserveTables}
                      icon="bookmark-outline"
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.content, !isLg ? styles.contentSm : styles.contentLg]}>

            <View
              style={[
                styles.guestsCol,
                !isLg ? styles.colSm : styles.guestsColLg,
                isLg && guestsColWidth ? ({ width: guestsColWidth } as any) : null,
              ]}
            >
              <View
                style={
                  Platform.OS === 'web' && isLg
                    ? ({ position: 'sticky', top: stickyTop, alignSelf: 'stretch', flex: 1 } as any)
                    : null
                }
              >
                <View style={[styles.card, styles.guestListCard, isLg ? ({ minHeight: mapCardHeight } as any) : null]}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.panelHeaderCopy}>
                      <Text style={styles.panelEyebrow}>אורחים</Text>
                      <Text style={styles.panelTitle}>רשימת צ'ק אין</Text>
                      <Text style={styles.panelSubtitle}>נהל את האורחים לפי חיפוש, סטטוס ושולחן בלחיצה אחת.</Text>
                    </View>
                    {tableFilter ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="נקה סינון שולחן"
                        onPress={() => setTableFilter(null)}
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

                  <View style={styles.panelMetaRow}>
                    <View style={styles.panelMetaPill}>
                      <Ionicons name="people-outline" size={14} color={colors.primary} />
                      <Text style={styles.panelMetaPillText}>{visibleGuests.length} אורחים בתצוגה</Text>
                    </View>
                  </View>

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

                  <View style={[styles.mainSearchWrap, { marginTop: 12 }]}>
                    <View style={styles.searchIconRight}>
                      <Ionicons name="search" size={18} color={colors.gray[500]} />
                    </View>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="חיפוש אורח או שולחן..."
                      placeholderTextColor={colors.gray[500]}
                      value={query}
                      onChangeText={setQuery}
                      textAlign="right"
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={[styles.listWrap, isLg ? styles.listWrapFill : null, { marginTop: 12 }]}>
                    {loading ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.loadingText}>טוען אורחים…</Text>
                      </View>
                    ) : visibleGuests.length === 0 ? (
                      <View style={styles.emptyRow}>
                        <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                        <Text style={styles.emptyTitle}>לא נמצאו אורחים</Text>
                        <Text style={styles.emptyText}>נסה לשנות חיפוש / פילטר / שולחן.</Text>
                      </View>
                    ) : shouldScrollGuests ? (
                      <ScrollView
                        style={
                          isLg
                            ? ({ flex: 1, minHeight: guestListMaxHeight, maxHeight: guestListMaxHeight } as any)
                            : guestListMaxHeight
                              ? ({ maxHeight: guestListMaxHeight } as any)
                              : undefined
                        }
                        contentContainerStyle={isLg ? ({ flexGrow: 1 } as any) : undefined}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
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

            <View style={[styles.main, !isLg ? styles.mainSm : null]}>
              <View
                style={[
                  styles.card,
                  styles.mapCard,
                  Platform.OS === 'web' && isLg ? ({ position: 'sticky', top: stickyTop } as any) : null,
                  { minHeight: mapCardHeight },
                ]}
              >
                <View style={styles.mapCardHeader}>
                  <View style={styles.panelHeaderCopy}>
                    <Text style={styles.panelEyebrow}>מפת הושבה</Text>
                    <Text style={styles.panelTitle}>פריסת שולחנות חיה</Text>
                    <Text style={styles.panelSubtitle}>
                      {selectedTableNumber
                        ? `השולחן ${selectedTableNumber} מודגש כעת במפה`
                        : 'לחץ על שולחן במפה או על אורח ברשימה כדי למקד את הסקיצה'}
                    </Text>
                  </View>

                  <View style={styles.mapCardHeaderSide}>
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

                <View style={styles.mapLegendRow}>
                  <View style={styles.mapLegendItem}>
                    <View style={[styles.mapLegendDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.mapLegendText}>שולחן רגיל</Text>
                  </View>
                  <View style={styles.mapLegendItem}>
                    <View style={[styles.mapLegendDot, { backgroundColor: colors.secondary }]} />
                    <Text style={styles.mapLegendText}>שולחן רזרבה</Text>
                  </View>
                  <View style={styles.mapLegendItem}>
                    <View style={[styles.mapLegendDot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.mapLegendText}>מלא או מסומן</Text>
                  </View>
                </View>

                <View style={{ flex: 1, minHeight: mapCardHeight }}>
                  {mapLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={styles.loadingText}>טוען מפה…</Text>
                    </View>
                  ) : webSketch ? (
                    <SeatingGridReadonly
                      gridCols={webSketch.gridCols}
                      gridRows={webSketch.gridRows}
                      tables={webSketch.tables}
                      zones={webSketch.zones}
                      labels={webSketch.labels}
                      hideTableType
                      useBaseColorAsWebBackground
                      showTableBorder={false}
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
                      onPressTableNumber={(num) => {
                        if (!num) return;
                        const id = tableIdByNumber.get(Number(num));
                        if (!id) return;
                        setTableFilter((prev) => (prev === id ? null : id));
                      }}
                    />
                  ) : (
                    <View style={styles.mapEmptyState}>
                      <View style={styles.mapEmptyIconWrap}>
                        <Ionicons name="map-outline" size={34} color={colors.primary} />
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

      {moveGuest ? (
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סגור העברת אורח"
            onPress={closeMoveModal}
            style={styles.modalBackdropPressable}
          />

          <View style={[styles.modalCard, (isNarrow || isMobile) ? styles.modalCardNarrow : null]}>
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
          backgroundColor: '#F7FAFF',
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.14), rgba(25,93,230,0) 40%), radial-gradient(circle at top left, rgba(232,241,255,0.95), rgba(232,241,255,0) 34%), radial-gradient(circle at bottom left, rgba(242,224,186,0.34), rgba(242,224,186,0) 32%), radial-gradient(circle at bottom center, rgba(240,203,70,0.12), rgba(240,203,70,0) 26%)',
        } as any)
      : null),
  },
  pageScroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ overflowY: 'auto', overscrollBehavior: 'contain' } as any) : null),
  },

  screen: {
    width: '100%',
    // Allow more horizontal room so the seating map can be big on wide monitors.
    maxWidth: 1960,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingBottom: 28,
    paddingTop: 8,
  },

  content: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  contentLg: {
    alignItems: 'stretch',
    ...(Platform.OS === 'web' ? ({ minHeight: 'calc(100dvh - 280px)' } as any) : null),
  },
  contentSm: { flexDirection: 'column', gap: 10 },
  // Keep side columns tighter to prioritize the map width.
  guestsCol: { width: 500, flexShrink: 1, minWidth: 400 },
  guestsColLg: {
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ display: 'flex', flexDirection: 'column' } as any) : null),
  },
  // On stacked layout (no map), keep the guests panel compact and centered.
  // minWidth: 0 prevents the 400px base minWidth from forcing horizontal
  // overflow on phones.
  colSm: { width: '100%', maxWidth: 520, minWidth: 0, alignSelf: 'center' },
  main: { flex: 1, minWidth: 460, flexShrink: 0 },
  // When stacked (phone/tablet portrait) the map column must be allowed to
  // shrink to the viewport width instead of forcing a 460px horizontal scroll.
  mainSm: { width: '100%', minWidth: 0, flexShrink: 1 },

  card: {
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
  topDashboardWrap: { width: '100%', marginTop: 8, marginBottom: 10 },
  dashboardCardTop: { maxWidth: 1960 },
  cardTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  heroShell: { width: '100%', marginTop: 8, gap: 10 },
  heroHeaderActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  heroHeaderActionBtn: {
    minHeight: 40,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  heroHeaderActionBtnHover: { backgroundColor: 'rgba(241,245,249,1)' },
  heroHeaderActionText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  webBackBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  webBackBtnHover: {
    backgroundColor: '#F8FAFD',
    borderColor: 'rgba(15,69,230,0.12)',
  },
  webBackBtnPressed: {
    opacity: 0.92,
  },
  webBackBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
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
    backgroundColor: 'rgba(25,93,230,0.08)',
    borderColor: 'rgba(25,93,230,0.22)',
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
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricsGridTop: { flexWrap: 'nowrap', gap: 10 },
  overviewStatCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 140,
    minHeight: 104,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 24px rgba(11,28,65,0.04)',
        } as any)
      : null),
  },
  overviewStatCardCompact: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 112,
    borderRadius: 20,
  },
  overviewStatTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  overviewStatIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(6,23,62,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  overviewStatLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 16,
  },
  overviewStatValue: {
    fontSize: 28,
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
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  searchIconRight: { position: 'absolute', right: 12 },
  searchInput: { paddingRight: 42, paddingLeft: 12, fontSize: 14, fontWeight: '800', color: colors.text },

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

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelHeaderCopy: { flex: 1, minWidth: 0, gap: 4 },
  panelEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    letterSpacing: 0.7,
    textTransform: 'uppercase' as any,
  },
  panelTitle: { fontSize: 22, fontWeight: '900', color: '#111827', textAlign: 'right' },
  panelSubtitle: { fontSize: 12, fontWeight: '700', color: colors.gray[600], lineHeight: 18, textAlign: 'right' },
  panelMetaRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'nowrap', gap: 10 },
  panelMetaPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  panelMetaPillText: { fontSize: 12, fontWeight: '800', color: colors.gray[700], textAlign: 'right' },
  panelFilterChipsRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  panelFilterChip: {
    minHeight: 42,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.9)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 6px 18px rgba(15,23,42,0.06)' } as any) : null),
  },
  panelFilterChipHover: { backgroundColor: 'rgba(241,245,249,1)', borderColor: 'rgba(148,163,184,0.45)' },
  panelFilterChipActive: {
    backgroundColor: 'rgba(25,93,230,0.10)',
    borderColor: 'rgba(25,93,230,0.28)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 24px rgba(25,93,230,0.12)' } as any) : null),
  },
  panelFilterChipText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  panelFilterChipTextActive: { color: colors.primary },
  panelFilterChipCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
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
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 14,
  },
  listWrapFill: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' ? ({ display: 'flex', flexDirection: 'column' } as any) : null),
  },
  tableGroupsWrap: { gap: 10 },
  tableGroupCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
  },
  tableGroupCardOverflow: {
    borderColor: 'rgba(239,68,68,0.26)',
    backgroundColor: 'rgba(254,242,242,0.92)',
  },
  tableGroupHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.02)',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
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
  tableGroupBody: { padding: 10, gap: 10 },
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
  mapEmptyState: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    ...(Platform.OS === 'web' ? ({ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.45)' } as any) : null),
  },
  mapEmptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  mapEmptyTitle: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'center' },
  mapEmptyText: { maxWidth: 360, fontSize: 14, fontWeight: '700', lineHeight: 22, color: colors.gray[600], textAlign: 'center' },

  mapLegendRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  mapLegendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  mapLegendDot: { width: 10, height: 10, borderRadius: 999 },
  mapLegendText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  mapCard: { gap: 12 },
  mapCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  mapCardHeaderSide: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  mapStatusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  mapStatusDot: { width: 8, height: 8, borderRadius: 999 },
  mapStatusPillText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

  guestRowCompact: {
    position: 'relative',
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  guestRowCompactOn: { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.14)' },
  // On phones the name + controls (~196px) cannot fit on one line, so wrap the
  // controls onto a second row beneath the name.
  guestRowCompactSm: { flexWrap: 'wrap', alignItems: 'flex-start', minHeight: 0, paddingVertical: 12 },
  guestRowMainSm: { flexBasis: '100%', flexGrow: 1, flexShrink: 1 },
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
  moveBtn: {
    width: 32,
    height: 32,
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
  moveBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  moveBtnDisabled: { opacity: 0.55 },
  guestNameCompact: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },
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
  avatarCompact: { width: 34, height: 34 },
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
    backgroundColor: 'rgba(15,23,42,0.10)',
  },
  modalCard: {
    position: 'absolute',
    right: 16,
    top: 16,
    bottom: 16,
    width: 420,
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.20)',
    backgroundColor: '#F9FAFB',
    padding: 18,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    ...(Platform.OS === 'web' ? ({ maxHeight: 'calc(100dvh - 32px)' } as any) : null),
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
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalPrimaryBtnHover: { opacity: 0.98 },
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
  switchWrapOn: { backgroundColor: '#10B981', borderColor: 'rgba(16,185,129,0.35)' },
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
});

export default function EmployeeGuestCheckinWebScreen() {
  // On web (including narrow mobile-web viewports) always render the web screen.
  // The native mobile screen relies on native-only APIs (Stack.Screen, BackHandler,
  // SafeAreaView) and crashes when rendered in a browser. The web screen below is
  // already responsive down to phone widths (see isMobile/contentSm/colSm handling).
  return <EmployeeGuestCheckinWebDesktopScreen />;
}

