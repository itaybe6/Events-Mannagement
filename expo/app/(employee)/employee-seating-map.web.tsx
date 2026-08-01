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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { useResponsive } from '@/lib/responsive';
import { useSeatingMapModel } from '@/features/seating/useSeatingMapModel';
import { SeatingGridReadonly } from '../seating/web/SeatingGridReadonly';
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type Orientation, type TableType } from '../seating/web/_types';
import { supabase } from '@/lib/supabase';

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

export default function EmployeeSeatingMapWebScreen() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const fallbackToDetails = useMemo(
    () =>
      resolvedEventId
        ? `/(employee)/employee-event-details?id=${resolvedEventId}`
        : '/(employee)/employee-events',
    [resolvedEventId]
  );

  const { loading, eventTitle, tables, guests, sumPeople, refresh } = useSeatingMapModel(
    resolvedEventId ? resolvedEventId : null
  );

  const [query, setQuery] = useState('');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [webSketch, setWebSketch] = useState<WebSketch | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);

  const { isPhone, isTablet, isTabletPortrait } = useResponsive();
  // Stack map over list when there is no room for both. A portrait iPad has the
  // height for a tall map but not the width for a side column.
  const isNarrow = isTablet ? isTabletPortrait : windowWidth < 980;
  const isMobile = isPhone;
  const contentPaddingH = windowWidth >= 1100 ? 20 : isMobile ? 10 : 14;

  const leftColWidth = useMemo(() => {
    if (isNarrow) return undefined;
    if (windowWidth < 1100) return 300;
    if (windowWidth < 1400) return 340;
    return 380;
  }, [isNarrow, windowWidth]);

  const mapCardHeight = useMemo(() => {
    if (isNarrow) {
      return Math.round(Math.min(680, Math.max(420, windowHeight * 0.55)));
    }
    const approxTopUi = 220;
    const available = windowHeight - approxTopUi;
    return Math.round(Math.min(780, Math.max(480, available)));
  }, [isNarrow, windowHeight]);

  // Stacked layouts have the map above the list, so the list gets whatever the
  // map left behind rather than a fixed 280px sliver on a 1180pt-tall iPad.
  const tableListMaxHeight = useMemo(() => {
    if (!isNarrow) return 320;
    if (!windowHeight) return 280;
    return Math.round(Math.min(460, Math.max(280, windowHeight - mapCardHeight - 260)));
  }, [isNarrow, mapCardHeight, windowHeight]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const buildSketchFromTables = useCallback((): WebSketch | null => {
    const placed = (tables || [])
      .filter(Boolean)
      .filter((t) => typeof t.x === 'number' && typeof t.y === 'number')
      .map((t) => {
        const type = tableTypeFromShape(t.shape);
        const seats = Number(t.capacity) || (type === 'knight' ? 20 : 12);
        const gridX = Math.round((Number(t.x) || 0) / 40);
        const gridY = Math.round((Number(t.y) || 0) / 40);
        return {
          id: `table-live-${String(t.id)}`,
          type,
          seats,
          orientation: 'row' as Orientation,
          gridX,
          gridY,
          number: typeof t.number === 'number' ? t.number : undefined,
          name: t.name,
        };
      });

    if (!placed.length) return null;

    const maxX = placed.reduce(
      (m, t) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w),
      0
    );
    const maxY = placed.reduce(
      (m, t) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h),
      0
    );

    return {
      gridCols: Math.max(DEFAULT_GRID_COLS, maxX + 6),
      gridRows: Math.max(DEFAULT_GRID_ROWS, maxY + 6),
      tables: placed,
      zones: [],
      labels: [],
    };
  }, [tables]);

  const fetchWebSketch = useCallback(async () => {
    if (!resolvedEventId) {
      setWebSketch(null);
      return;
    }
    setMapLoading(true);
    try {
      const { data } = await supabase
        .from('seating_maps')
        .select('annotations,tables')
        .eq('event_id', resolvedEventId)
        .maybeSingle();

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

      if (!finalTables.length) {
        const fromLive = buildSketchFromTables();
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
  }, [buildSketchFromTables, resolvedEventId]);

  useEffect(() => {
    void fetchWebSketch();
  }, [fetchWebSketch, tables.length]);

  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const tableByNumber = useMemo(() => {
    const m = new Map<number, string>();
    tables.forEach((t) => {
      if (typeof t.number === 'number') m.set(t.number, t.id);
    });
    return m;
  }, [tables]);

  const activeTable = activeTableId ? tableById.get(activeTableId) : null;

  const guestsForActiveTable = useMemo(() => {
    if (!activeTableId) return [];
    return guests.filter((g) => g.table_id === activeTableId);
  }, [activeTableId, guests]);

  const seatedByNumber = useMemo(() => {
    const m = new Map<number, number>();
    guests.forEach((g) => {
      if (!g.table_id) return;
      const table = tableById.get(g.table_id);
      if (!table || typeof table.number !== 'number') return;
      const people = Number(g.number_of_people) || 1;
      m.set(table.number, (m.get(table.number) || 0) + people);
    });
    return m;
  }, [guests, tableById]);

  const filteredTables = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => {
      const label = `${t.number ?? ''} ${t.name ?? ''}`.toLowerCase();
      return label.includes(q);
    });
  }, [query, tables]);

  const stats = useMemo(() => {
    const byId = new Map<string, number>();
    guests.forEach((g) => {
      if (!g.table_id) return;
      byId.set(g.table_id, (byId.get(g.table_id) || 0) + (Number(g.number_of_people) || 1));
    });
    const full = tables.filter((t) => (byId.get(t.id) || 0) >= (Number(t.capacity) || 0)).length;
    const total = tables.length;
    const reserve = tables.filter((t) => t.shape === 'reserve').length;
    return { total, full, reserve };
  }, [guests, tables]);

  const handlePressMapTable = useCallback(
    (num: number | null | undefined) => {
      if (num === null || num === undefined) return;
      const n = Number(num);
      if (!Number.isFinite(n)) return;
      const id = tableByNumber.get(n) ?? null;
      setSelectedTableNumber((prev) => {
        if (prev === n) {
          setActiveTableId(null);
          return null;
        }
        setActiveTableId(id);
        return n;
      });
    },
    [tableByNumber]
  );

  const handleSelectTable = useCallback(
    (tableId: string) => {
      const table = tableById.get(tableId);
      setActiveTableId(tableId);
      setSelectedTableNumber(typeof table?.number === 'number' ? table.number : null);
    },
    [tableById]
  );

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([refresh(), fetchWebSketch()]);
  }, [fetchWebSketch, refresh]);

  const seatingMap = useMemo(() => {
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
        cellSizeMultiplier={isMobile ? 0.88 : isNarrow ? 0.94 : 1}
        getTableBaseColor={(t: any) => {
          const selected = Boolean(selectedTableNumber) && Number(t?.number) === Number(selectedTableNumber);
          if (selected) return '#10B981';
          const num = t?.number;
          const seated = num ? (seatedByNumber.get(Number(num)) ?? 0) : 0;
          const cap = Number(t?.seats ?? 0) || 0;
          const isFullOrOver = cap > 0 && seated >= cap;
          if (isFullOrOver) return colors.success;
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
          if (isFullOrOver) return colors.success;
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
        onPressTableNumber={handlePressMapTable}
      />
    );
  }, [handlePressMapTable, isMobile, isNarrow, seatedByNumber, selectedTableNumber, webSketch]);

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
          contentContainerStyle={[styles.screen, { paddingHorizontal: contentPaddingH }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroShell}>
            <AdminWebPageHeader
              eyebrow="צפייה בלבד"
              title="מפת הושבה"
              subtitle={`${eventTitle || 'אירוע'} · ${stats.total} שולחנות`}
              showNav={false}
              useDefaultActions={false}
              leading={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חזרה"
                  onPress={() => router.replace(fallbackToDetails)}
                  style={({ hovered, pressed }: any) => [
                    styles.backBtn,
                    Platform.OS === 'web' && hovered ? styles.backBtnHover : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={16} color={colors.text} />
                  <Text style={styles.backBtnText}>חזרה</Text>
                </Pressable>
              }
              actions={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="רענון"
                  onPress={() => void handleRefreshAll()}
                  style={({ hovered, pressed }: any) => [
                    styles.refreshBtn,
                    Platform.OS === 'web' && hovered ? styles.refreshBtnHover : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name="refresh" size={16} color={colors.primary} />
                  <Text style={styles.refreshBtnText}>רענון</Text>
                </Pressable>
              }
            />
          </View>

          <View style={[styles.statsRow, isMobile ? styles.statsRowMobile : null]}>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>שולחנות</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{stats.full}</Text>
              <Text style={styles.statLabel}>מלאים</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{stats.reserve}</Text>
              <Text style={styles.statLabel}>רזרבה</Text>
            </View>
          </View>

          <View style={[styles.mainRow, isNarrow ? styles.mainRowNarrow : null]}>
            <View style={[styles.mapCol, isNarrow ? styles.mapColNarrow : null]}>
              <View style={[styles.mapCard, { minHeight: mapCardHeight }]}>
                <View style={styles.mapCardHeader}>
                  <View style={styles.mapHeaderText}>
                    <Text style={styles.mapHeaderTitle}>פריסת שולחנות</Text>
                    <Text style={styles.mapHeaderSub}>
                      {selectedTableNumber
                        ? `שולחן ${selectedTableNumber} מודגש`
                        : 'לחץ על שולחן במפה או ברשימה'}
                    </Text>
                  </View>
                  <View style={styles.mapLegendRow}>
                    <View style={styles.mapLegendItem}>
                      <View style={[styles.mapLegendDot, { backgroundColor: colors.primary }]} />
                      <Text style={styles.mapLegendText}>רגיל</Text>
                    </View>
                    <View style={styles.mapLegendItem}>
                      <View style={[styles.mapLegendDot, { backgroundColor: colors.success }]} />
                      <Text style={styles.mapLegendText}>מלא</Text>
                    </View>
                    <View style={styles.mapLegendItem}>
                      <View style={[styles.mapLegendDot, { backgroundColor: colors.warning }]} />
                      <Text style={styles.mapLegendText}>רזרבה</Text>
                    </View>
                  </View>
                </View>

                <View style={{ flex: 1, minHeight: mapCardHeight - 80 }}>
                  {loading || mapLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={styles.loadingText}>טוען מפת הושבה...</Text>
                    </View>
                  ) : webSketch ? (
                    seatingMap
                  ) : (
                    <View style={styles.mapEmptyState}>
                      <Ionicons name="map-outline" size={36} color={colors.primary} />
                      <Text style={styles.mapEmptyTitle}>אין מפת הושבה</Text>
                      <Text style={styles.mapEmptyText}>כשתהיה סקיצה לאירוע, היא תופיע כאן.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View style={[styles.sideCol, !isNarrow && leftColWidth ? { width: leftColWidth } : null]}>
              <View style={styles.filterCard}>
                <Text style={styles.cardTitle}>חיפוש שולחנות</Text>
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="מספר / שם שולחן..."
                    placeholderTextColor={colors.gray[500]}
                    style={styles.searchInput}
                    textAlign="right"
                  />
                </View>

                <ScrollView
                  style={[styles.tableListScroll, { maxHeight: tableListMaxHeight }]}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredTables.map((t) => {
                    const active = activeTableId === t.id;
                    const guestsAt = guests.filter((g) => g.table_id === t.id);
                    const ppl = sumPeople(guestsAt);
                    const full = ppl >= (Number(t.capacity) || 0);
                    return (
                      <Pressable
                        key={t.id}
                        accessibilityRole="button"
                        accessibilityLabel={`בחירת שולחן ${t.number ?? ''}`}
                        onPress={() => handleSelectTable(t.id)}
                        style={({ hovered, pressed }: any) => [
                          styles.tableRow,
                          active ? styles.tableRowActive : null,
                          full ? styles.tableRowFull : null,
                          Platform.OS === 'web' && hovered ? styles.tableRowHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <View style={styles.tableRowLeft}>
                          <Text style={styles.tableRowCap}>{`${ppl}/${t.capacity}`}</Text>
                          {t.shape === 'reserve' ? <Text style={styles.reserveTag}>רזרבה</Text> : null}
                        </View>
                        <View style={styles.tableRowRight}>
                          <Text style={styles.tableRowTitle} numberOfLines={1}>
                            {t.number != null ? `שולחן ${t.number}` : 'שולחן'}
                          </Text>
                          <Text style={styles.tableRowSub} numberOfLines={1}>
                            {t.name || '—'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.detailCard}>
                <Text style={styles.cardTitle}>פרטי שולחן</Text>
                {!activeTable ? (
                  <View style={styles.detailEmpty}>
                    <Ionicons name="grid-outline" size={36} color={colors.gray[500]} />
                    <Text style={styles.emptyText}>בחר שולחן לצפייה בפרטים</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.detailTitle} numberOfLines={1}>
                      {activeTable.number != null ? `שולחן ${activeTable.number}` : 'שולחן'}
                    </Text>
                    <Text style={styles.detailSub} numberOfLines={1}>
                      {activeTable.name || '—'}
                    </Text>
                    <View style={styles.detailMetaRow}>
                      <View style={styles.metaPill}>
                        <Text style={styles.metaPillText}>
                          {`${sumPeople(guestsForActiveTable)}/${activeTable.capacity}`}
                        </Text>
                      </View>
                      {activeTable.shape === 'reserve' ? (
                        <View style={[styles.metaPill, styles.metaPillReserve]}>
                          <Text style={styles.metaPillText}>רזרבה</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.divider} />
                    <ScrollView
                      style={[styles.guestListScroll, isNarrow ? { maxHeight: 200 } : { maxHeight: 240 }]}
                      showsVerticalScrollIndicator={false}
                    >
                      {guestsForActiveTable.length === 0 ? (
                        <Text style={styles.emptyText}>אין אורחים בשולחן</Text>
                      ) : (
                        guestsForActiveTable.map((g) => (
                          <View key={g.id} style={styles.guestRow}>
                            <Text style={styles.guestPeople}>{`${Number(g.number_of_people) || 1}×`}</Text>
                            <Text style={styles.guestName} numberOfLines={1}>
                              {g.name}
                            </Text>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </>
                )}
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
    ...(Platform.OS === 'web'
      ? ({
          direction: 'rtl',
          minHeight: '100dvh',
          backgroundColor: '#F7FAFF',
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.12), rgba(25,93,230,0) 40%), radial-gradient(circle at top left, rgba(232,241,255,0.95), rgba(232,241,255,0) 34%)',
        } as any)
      : null),
  },
  pageScroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ overflowY: 'auto', overscrollBehavior: 'contain' } as any) : null),
  },
  screen: {
    width: '100%',
    maxWidth: 1960,
    alignSelf: 'center',
    paddingBottom: 28,
    paddingTop: 8,
  },
  heroShell: { width: '100%', marginTop: 4, marginBottom: 8 },
  backBtn: {
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
  backBtnHover: { backgroundColor: 'rgba(241,245,249,1)' },
  backBtnText: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  refreshBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  refreshBtnHover: { backgroundColor: 'rgba(241,245,249,1)' },
  refreshBtnText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  statsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginBottom: 12,
  },
  statsRowMobile: { flexWrap: 'wrap' },
  statPill: {
    flex: 1,
    minWidth: 90,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  statLabel: { marginTop: 4, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center' },

  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  mainRowNarrow: {
    flexDirection: 'column',
    gap: 12,
  },
  mapCol: { flex: 1, minWidth: 0 },
  mapColNarrow: { width: '100%' },
  sideCol: { gap: 12, flexShrink: 0 },

  mapCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 14,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 36px rgba(11,28,65,0.06)' } as any) : null),
  },
  mapCardHeader: {
    marginBottom: 10,
    gap: 10,
  },
  mapHeaderText: { gap: 4 },
  mapHeaderTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  mapHeaderSub: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  mapLegendRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  mapLegendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  mapLegendDot: { width: 10, height: 10, borderRadius: 999 },
  mapLegendText: { fontSize: 12, fontWeight: '800', color: colors.gray[700], textAlign: 'right' },

  filterCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 14,
  },
  detailCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 14,
  },
  cardTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },

  searchWrap: {
    marginTop: 10,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: 12 },
  searchInput: { paddingLeft: 40, paddingRight: 12, fontSize: 14, fontWeight: '800', color: colors.text },

  tableListScroll: { marginTop: 10 },
  guestListScroll: { marginTop: 4 },

  tableRow: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(15,23,42,0.02)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', minHeight: 48 } as any) : null),
  },
  tableRowHover: { backgroundColor: 'rgba(15,23,42,0.05)' },
  tableRowActive: { backgroundColor: 'rgba(15,69,230,0.06)', borderColor: 'rgba(15,69,230,0.16)' },
  tableRowFull: { borderColor: 'rgba(34,197,94,0.30)' },
  tableRowRight: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  tableRowTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  tableRowSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  tableRowLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  tableRowCap: { fontSize: 12, fontWeight: '900', color: colors.gray[800] },
  reserveTag: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[700],
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },

  detailEmpty: { paddingVertical: 16, alignItems: 'center', gap: 8 },
  detailTitle: { marginTop: 8, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  detailSub: { marginTop: 4, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  detailMetaRow: { marginTop: 10, flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  metaPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  metaPillReserve: { backgroundColor: 'rgba(0,0,0,0.06)', borderColor: 'rgba(0,0,0,0.08)' },
  metaPillText: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right' },
  divider: { height: 1, backgroundColor: 'rgba(15,23,42,0.08)', marginVertical: 10 },
  guestRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    marginBottom: 8,
  },
  guestName: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '900', color: colors.text },
  guestPeople: { width: 40, textAlign: 'left', fontSize: 12, fontWeight: '900', color: colors.primary },

  loadingRow: { flex: 1, paddingVertical: 40, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },
  mapEmptyState: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(255,255,255,0.68)',
  },
  mapEmptyTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  mapEmptyText: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
  primaryBtn: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  primaryBtnHover: { opacity: 0.95 },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'center' },
});
