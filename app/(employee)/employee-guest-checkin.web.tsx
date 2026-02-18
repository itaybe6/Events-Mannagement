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

function statusTag(status: Guest['status']) {
  if (status === 'מגיע') return { bg: 'rgba(34,197,94,0.12)', fg: '#15803D' };
  if (status === 'לא מגיע') return { bg: 'rgba(244,63,94,0.12)', fg: '#BE123C' };
  return { bg: 'rgba(15,23,42,0.06)', fg: colors.gray[700] };
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

export default function EmployeeGuestCheckinWebScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const { width, height } = useWindowDimensions();
  const isLg = width >= 1024;
  const isNarrow = width < 520;
  const isAdminRoute = String(pathname || '').toLowerCase().includes('admin-guest-checkin');
  const [collapsedTableGroups, setCollapsedTableGroups] = useState<Record<string, boolean>>({});
  const [tableFilter, setTableFilter] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableNumberById, setTableNumberById] = useState<Map<string, number | null>>(() => new Map());
  const [webSketch, setWebSketch] = useState<WebSketch | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);

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
    toggleCheckIn,
    savingId,
    setCheckedInCount,
    savingCountId,
  } = useGuestCheckInModel({
    eventId: resolvedEventId ? resolvedEventId : null,
    errorTitle: 'שגיאה',
    errorMessage: 'לא ניתן לטעון את רשימת האורחים',
  });

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

  const activeTableLabel = useMemo(() => {
    if (!tableFilter) return 'הכל';
    if (tableFilter === NO_TABLE_KEY) return 'ללא שולחן';
    return tableLabelById.get(tableFilter) || 'שולחן';
  }, [tableFilter, tableLabelById]);

  const tableIdByNumber = useMemo(() => {
    const m = new Map<number, string>();
    tablesSorted.forEach((t) => {
      const n = parseTableNumber((t as any).number);
      if (typeof n === 'number') m.set(n, t.id);
    });
    return m;
  }, [tablesSorted]);

  const seatedByNumber = useMemo(() => {
    const m = new Map<number, number>();
    guests.forEach((g) => {
      const tableIdKey = g.tableId === null || g.tableId === undefined ? '' : String(g.tableId).trim();
      if (!tableIdKey) return;
      const num = tableNumberById.get(tableIdKey) ?? null;
      if (typeof num !== 'number') return;
      const ppl = Number(g.numberOfPeople) || 1;
      m.set(num, (m.get(num) || 0) + ppl);
    });
    return m;
  }, [guests, tableNumberById]);

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
      }
    >();

    for (const g of visibleGuests) {
      const tableIdKey = g.tableId === null || g.tableId === undefined ? '' : String(g.tableId).trim();
      const tableNumber = tableIdKey ? (tableNumberById.get(tableIdKey) ?? null) : null;

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
      };

      current.guests.push(g);
      current.peopleTotal += people;
      current.arrivedPeople += g.checkedIn ? arrivedCount : 0;
      current.guestCount += 1;
      groups.set(key, current);
    }

    const arr = Array.from(groups.values());
    arr.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return String(a.label).localeCompare(String(b.label), 'he');
    });
    return arr;
  }, [tableLabelById, tableNumberById, visibleGuests]);

  const mapCardHeight = useMemo(() => {
    if (!height || !isLg) return 620;
    return Math.max(620, Math.round(height - 120));
  }, [height, isLg]);

  const guestListMaxHeight = useMemo(() => {
    if (!height || !isLg) return undefined;
    return Math.max(420, Math.round(height - 320));
  }, [height, isLg]);

  const guestsColWidth = useMemo(() => {
    if (!isLg) return undefined as number | undefined;
    const w = Number(width) || 0;
    return Math.max(340, Math.min(520, Math.round(w * 0.32)));
  }, [isLg, width]);

  const stickyTop = useMemo(() => {
    if (Platform.OS !== 'web') return 0;
    if (!isLg) return 0;
    // Keep a tiny gap from the top on web.
    return 8;
  }, [isLg]);

  return (
    <View style={styles.page}>
      {!resolvedEventId ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.gray[500]} />
          <Text style={styles.emptyTitle}>חסר מזהה אירוע</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="חזרה לרשימת אירועים"
            onPress={() => router.replace('/(employee)/employee-events')}
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
          <View style={styles.topDashboardWrap}>
            <View style={Platform.OS === 'web' && isLg ? ({ position: 'sticky', top: stickyTop } as any) : null}>
              <View style={[styles.card, styles.dashboardCard, isLg ? styles.dashboardCardTop : null]}>
                <View style={styles.dashboardHeader}>
                  <View style={styles.dashboardHeaderLeft}>
                    <View style={styles.dashboardHeaderIcon}>
                      <Ionicons name="sparkles" size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.dashboardHeaderTitle}>ניהול אירוע</Text>
                      <Text style={styles.dashboardHeaderSub}>סטטוס נוכחי בזמן אמת</Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="חזרה לרשימת אירועים"
                    onPress={() => router.replace(isAdminRoute ? '/(admin)/admin-events' : '/(employee)/employee-events')}
                    style={({ hovered, pressed }: any) => [
                      styles.dashboardBackBtn,
                      Platform.OS === 'web' && hovered ? styles.dashboardBackBtnHover : null,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                  >
                  <Ionicons name="arrow-back" size={18} color="#fff" />
                    <Text style={styles.dashboardBackText}>חזור</Text>
                  </Pressable>

                  <View style={styles.dashboardHeaderGlow} pointerEvents="none" />
                </View>

                <View style={[styles.dashboardBody, isLg ? styles.dashboardBodyTop : null]}>
                  <View style={[styles.metricsGrid, isLg ? styles.metricsGridTop : null]}>
                    <View style={[styles.metricTile, isLg ? styles.metricTileTop : null, styles.metricTileNeutral]}>
                      <Text style={[styles.metricTileValue, isLg ? styles.metricTileValueTop : null]}>{eventOverview.invitedPeople}</Text>
                      <Text style={[styles.metricTileLabel, isLg ? styles.metricTileLabelTop : null]}>סה"כ מוזמנים</Text>
                    </View>

                    <View style={[styles.metricTile, isLg ? styles.metricTileTop : null, styles.metricTileSuccess]}>
                      <Text style={[styles.metricTileValue, isLg ? styles.metricTileValueTop : null, styles.metricTileValueSuccess]}>
                        {eventOverview.arrivedPeople}
                      </Text>
                      <Text style={[styles.metricTileLabel, isLg ? styles.metricTileLabelTop : null, styles.metricTileLabelSuccess]}>הגיעו</Text>
                    </View>

                    <View style={[styles.metricTile, isLg ? styles.metricTileTop : null, styles.metricTileWarn]}>
                      <Text style={[styles.metricTileValue, isLg ? styles.metricTileValueTop : null, styles.metricTileValueWarn]}>
                        {eventOverview.arrivingNotArrivedGuests}
                      </Text>
                      <Text style={[styles.metricTileLabel, isLg ? styles.metricTileLabelTop : null, styles.metricTileLabelWarn]}>טרם הגיעו</Text>
                    </View>

                    <View style={[styles.metricTile, isLg ? styles.metricTileTop : null, styles.metricTileNeutral]}>
                      <Text style={[styles.metricTileValue, isLg ? styles.metricTileValueTop : null, styles.metricTileValueMuted]}>
                        {eventOverview.emptyTables}
                      </Text>
                      <Text style={[styles.metricTileLabel, isLg ? styles.metricTileLabelTop : null]}>שולחנות ריקים</Text>
                    </View>

                    <View style={[styles.metricTile, isLg ? styles.metricTileTop : null, styles.metricTileIndigo]}>
                      <Text style={[styles.metricTileValue, isLg ? styles.metricTileValueTop : null, styles.metricTileValueIndigo]}>
                        {eventOverview.fullTables}
                      </Text>
                      <Text style={[styles.metricTileLabel, isLg ? styles.metricTileLabelTop : null, styles.metricTileLabelIndigo]}>
                        שולחנות מלאים
                      </Text>
                    </View>

                    <View style={[styles.metricTile, isLg ? styles.metricTileTop : null, styles.metricTileYellow]}>
                      <Text style={[styles.metricTileValue, isLg ? styles.metricTileValueTop : null, styles.metricTileValueYellow]}>
                        {eventOverview.reserveTables}
                      </Text>
                      <Text style={[styles.metricTileLabel, isLg ? styles.metricTileLabelTop : null, styles.metricTileLabelYellow]}>
                        שולחנות רזרבה
                      </Text>
                    </View>
                  </View>

                </View>
              </View>
            </View>
          </View>

          <View style={[styles.content, !isLg ? styles.contentSm : null]}>

            <View
              style={[
                styles.guestsCol,
                !isLg ? styles.colSm : null,
                isLg && guestsColWidth ? ({ width: guestsColWidth } as any) : null,
              ]}
            >
              <View style={Platform.OS === 'web' && isLg ? ({ position: 'sticky', top: stickyTop } as any) : null}>
                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
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

                  <View style={[styles.listWrap, { marginTop: 12 }]}>
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
                    ) : (
                      <ScrollView
                        style={guestListMaxHeight ? ({ maxHeight: guestListMaxHeight } as any) : undefined}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                      >
                        <View style={styles.tableGroupsWrap}>
                          {groupedVisibleGuests.map((group) => {
                            const collapsed = Boolean(collapsedTableGroups[group.key]);
                            return (
                              <View key={group.key} style={styles.tableGroupCard}>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`שולחן ${group.label}`}
                                  onPress={() =>
                                    setCollapsedTableGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                                  }
                                  style={({ hovered, pressed }: any) => [
                                    styles.tableGroupHeader,
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
                                      <Text style={styles.tableGroupMetaStrong}>{group.peopleTotal}</Text>
                                      <Text style={styles.tableGroupMetaDim}>אנשים</Text>
                                    </View>
                                    <View style={styles.tableGroupMetaPill}>
                                      <Text style={styles.tableGroupMetaStrong}>{group.guestCount}</Text>
                                      <Text style={styles.tableGroupMetaDim}>מוזמנים</Text>
                                    </View>
                                    <Ionicons
                                      name={collapsed ? 'chevron-down' : 'chevron-up'}
                                      size={16}
                                      color={colors.gray[500]}
                                    />
                                  </View>
                                </Pressable>

                                {collapsed ? null : (
                                  <View style={styles.tableGroupBody}>
                                    {group.guests.map((g: any) => {
                                      const checkedIn = Boolean(g.checkedIn);
                                      const isSaving = savingId === g.id;
                                      const tag = statusTag(g.status);
                                      const tableIdKey =
                                        g.tableId === null || g.tableId === undefined ? '' : String(g.tableId).trim();
                                      const tableNumber = tableIdKey ? (tableNumberById.get(tableIdKey) ?? null) : null;
                                      const people = Number(g.numberOfPeople) || 1;
                                      const arrivedCount =
                                        g.checkedInCount === null || g.checkedInCount === undefined
                                          ? people
                                          : Number(g.checkedInCount) || 0;

                                      return (
                                        <Pressable
                                          key={g.id}
                                          accessibilityRole="button"
                                          accessibilityLabel={`בחירת אורח ${g.name}`}
                                          onPress={() => {
                                            const next = typeof tableNumber === 'number' ? tableNumber : null;
                                            setSelectedTableNumber((prev) => (prev === next ? null : next));
                                          }}
                                          style={({ hovered, pressed }: any) => [
                                            styles.guestRowCompact,
                                            checkedIn ? styles.guestRowCompactOn : null,
                                            Platform.OS === 'web' && hovered ? { backgroundColor: 'rgba(6,23,62,0.03)' } : null,
                                            pressed ? { opacity: 0.96 } : null,
                                          ]}
                                        >
                                          <View style={[styles.guestRowAccent, checkedIn ? styles.guestRowAccentOn : null]} />

                                          <View style={styles.guestRowMain}>
                                            <View style={[styles.avatar, styles.avatarCompact, checkedIn ? styles.avatarOn : null]}>
                                              <Text style={styles.avatarText}>{initialsFromName(g.name)}</Text>
                                            </View>

                                            <View style={{ flex: 1, minWidth: 0 }}>
                                              <Text style={styles.guestNameCompact} numberOfLines={1}>
                                                {g.name}
                                              </Text>
                                              <Text style={styles.guestMetaCompact} numberOfLines={1}>
                                                {people === 1 ? 'אדם אחד' : `${people} אנשים`}
                                              </Text>
                                            </View>
                                          </View>

                                          <View style={styles.guestRowRight}>
                                            <View style={styles.tableChip}>
                                              <Text style={styles.tableChipText}>
                                                {tableNumber != null ? `שולחן ${tableNumber}` : '—'}
                                              </Text>
                                            </View>

                                            <View style={[styles.statusTag, { backgroundColor: tag.bg }]}>
                                              <Text style={[styles.statusTagText, { color: tag.fg }]}>{g.status}</Text>
                                            </View>

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
                                                      (savingCountId === g.id || arrivedCount <= 0) ? styles.stepBtnDisabled : null,
                                                      Platform.OS === 'web' && hovered ? styles.stepBtnHover : null,
                                                      pressed ? { opacity: 0.92 } : null,
                                                    ]}
                                                  >
                                                    <Text style={styles.stepBtnText}>-</Text>
                                                  </Pressable>

                                                  <View style={styles.compactCountWrap}>
                                                    {savingCountId === g.id ? (
                                                      <ActivityIndicator size={12} color={colors.primary} />
                                                    ) : (
                                                      <Text style={styles.compactCountText}>{arrivedCount}</Text>
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
                                          </View>
                                        </Pressable>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                    )}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.main}>
              <View
                style={[
                  styles.card,
                  Platform.OS === 'web' && isLg ? ({ position: 'sticky', top: stickyTop } as any) : null,
                  { minHeight: mapCardHeight },
                ]}
              >
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>מפת הושבה</Text>
                  <Text style={[styles.helperText, { marginTop: 0 }]}>לחץ על שולחן כדי לסנן</Text>
                </View>

                <View style={styles.mapLegendRow}>
                  <View style={styles.mapLegendItem}>
                    <View style={[styles.mapLegendDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.mapLegendText}>רגיל</Text>
                  </View>
                  <View style={styles.mapLegendItem}>
                    <View style={[styles.mapLegendDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.mapLegendText}>אביר</Text>
                  </View>
                  <View style={styles.mapLegendItem}>
                    <View style={[styles.mapLegendDot, { backgroundColor: colors.secondary }]} />
                    <Text style={styles.mapLegendText}>רזרבה</Text>
                  </View>
                </View>

                <View style={{ marginTop: 12, flex: 1, minHeight: mapCardHeight - 70 }}>
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
                      showTableBorder={false}
                      getTableBaseColor={(t: any) => {
                        const selected = Boolean(selectedTableNumber) && Number(t?.number) === Number(selectedTableNumber);
                        if (selected) return '#10B981';
                        return t?.type === 'reserve' ? colors.secondary : colors.primary;
                      }}
                      getTableBackgroundAlpha={(t: any) => {
                        const selected = Boolean(selectedTableNumber) && Number(t?.number) === Number(selectedTableNumber);
                        if (selected) return 0.28;
                        return t?.type === 'reserve' ? 0.18 : 0.42;
                      }}
                      selectedRingColor="#10B981"
                      isTableSelected={(t: any) => Boolean(selectedTableNumber) && Number(t?.number) === Number(selectedTableNumber)}
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
                        const id = tableIdByNumber.get(Number(num));
                        if (!id) return;
                        setTableFilter((prev) => (prev === id ? null : id));
                      }}
                    />
                  ) : (
                    <View style={styles.emptyRow}>
                      <Ionicons name="map-outline" size={42} color={colors.gray[500]} />
                      <Text style={styles.emptyTitle}>אין מפה עדיין</Text>
                      <Text style={styles.emptyText}>כשתהיה סקיצה לאירוע, היא תופיע כאן.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F6F4',
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh', direction: 'rtl' } as any) : null),
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
    gap: 14,
  },
  contentSm: { flexDirection: 'column', gap: 14 },
  // Keep side columns tighter to prioritize the map width.
  guestsCol: { width: 580, flexShrink: 1, minWidth: 340 },
  colSm: { width: '100%' },
  main: { flex: 1, minWidth: 520, flexShrink: 0 },

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
  dashboardCard: {
    padding: 0,
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
  },
  topDashboardWrap: { width: '100%', marginTop: 8, marginBottom: 10 },
  dashboardCardTop: { maxHeight: 200, maxWidth: 1960 },
  cardTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },

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
  dashboardHeaderGlow: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.22)',
    ...(Platform.OS === 'web' ? ({ filter: 'blur(28px)' } as any) : null),
  },
  dashboardBody: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 10, gap: 10 },
  dashboardBodyTop: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 8, gap: 8 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  metricsGridTop: { gap: 6 },
  metricTile: {
    width: '31.5%',
    minWidth: 86,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ transitionProperty: 'transform, box-shadow, background-color', transitionDuration: '150ms' } as any) : null),
  },
  metricTileTop: {
    width: '16%',
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  metricTileNeutral: { backgroundColor: 'rgba(248,250,252,1)', borderColor: 'rgba(15,23,42,0.06)' },
  metricTileSuccess: { backgroundColor: 'rgba(236,253,245,1)', borderColor: 'rgba(16,185,129,0.22)' },
  metricTileWarn: { backgroundColor: 'rgba(255,247,237,1)', borderColor: 'rgba(245,158,11,0.24)' },
  metricTileIndigo: { backgroundColor: 'rgba(238,242,255,1)', borderColor: 'rgba(99,102,241,0.22)' },
  metricTileYellow: { backgroundColor: 'rgba(254,252,232,1)', borderColor: 'rgba(234,179,8,0.24)' },
  metricTileValue: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'center' },
  metricTileValueTop: { fontSize: 18 },
  metricTileValueMuted: { color: 'rgba(55,65,81,0.95)' },
  metricTileValueSuccess: { color: '#047857' },
  metricTileValueWarn: { color: '#B45309' },
  metricTileValueIndigo: { color: '#4338CA' },
  metricTileValueYellow: { color: '#CA8A04' },
  metricTileLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(107,114,128,1)',
    textAlign: 'center',
    textTransform: 'uppercase' as any,
    letterSpacing: 0.6,
  },
  metricTileLabelTop: { marginTop: 3, fontSize: 9, letterSpacing: 0.4 },
  metricTileLabelSuccess: { color: 'rgba(4,120,87,0.95)' },
  metricTileLabelWarn: { color: 'rgba(180,83,9,0.95)' },
  metricTileLabelIndigo: { color: 'rgba(67,56,202,0.95)' },
  metricTileLabelYellow: { color: 'rgba(161,98,7,0.95)' },

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
  tableGroupsWrap: { gap: 10 },
  tableGroupCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
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
  tableGroupMetaStrong: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'left' },
  tableGroupMetaDim: { fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'left' },
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

  mapLegendRow: { marginTop: 10, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  mapLegendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  mapLegendDot: { width: 10, height: 10, borderRadius: 999 },
  mapLegendText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

  statusTag: { minWidth: 74, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  statusTagText: { fontSize: 12, fontWeight: '900', textAlign: 'center' },

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
    justifyContent: 'space-between',
    gap: 10,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  guestRowCompactOn: { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.14)' },
  guestRowAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: 'rgba(148,163,184,0.7)' },
  guestRowAccentOn: { backgroundColor: '#10B981' },
  guestRowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  guestRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  guestNameCompact: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },
  guestMetaCompact: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  tableChip: {
    height: 28,
    minWidth: 92,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    alignItems: 'flex-end',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  tableChipText: { alignSelf: 'stretch', fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
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

