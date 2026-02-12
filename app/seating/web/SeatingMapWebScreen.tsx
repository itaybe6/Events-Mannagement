import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { SeatingGrid } from './SeatingGrid';
import { TableSidebar } from './TableSidebar';
import { useSeatingState } from './useSeatingState';
import { CELL_SIZE, DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type TableConfig, type PlacedTable, type Zone, type TextLabel } from './types';

type SeatingMapsRow = {
  event_id: string;
  num_tables?: number;
  tables?: any;
  annotations?: any;
  map_cols?: number;
  map_rows?: number;
};

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

function mergeWebV2IntoAnnotations(prev: any, webV2: any) {
  if (Array.isArray(prev)) {
    const next = prev.filter((x) => !(x && typeof x === 'object' && x.type === 'web_v2'));
    next.push(webV2);
    return next;
  }
  if (prev && typeof prev === 'object') {
    return { ...(prev as any), web_v2: webV2 };
  }
  return [webV2];
}

export default function SeatingMapWebScreen() {
  const params = useLocalSearchParams();
  const eventId = params.eventId ? String(params.eventId) : undefined;
  const router = useRouter();
  const userType = useUserStore(s => s.userType);
  const api = useSeatingState();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingRow, setExistingRow] = useState<SeatingMapsRow | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  type Snap = {
    gridCols: number;
    gridRows: number;
    tableCounter: number;
    tables: any[];
    zones: any[];
    labels: any[];
  };

  const toSnapshot = useCallback((s: Snap) => {
    const byId = (a: any, b: any) => String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'en');
    return JSON.stringify({
      gridCols: s.gridCols,
      gridRows: s.gridRows,
      tableCounter: s.tableCounter,
      tables: [...(s.tables || [])].sort(byId).map(t => ({
        id: t.id,
        type: t.type,
        seats: t.seats,
        orientation: t.orientation,
        gridX: t.gridX,
        gridY: t.gridY,
        number: t.number,
      })),
      zones: [...(s.zones || [])].sort(byId).map(z => ({
        id: z.id,
        name: z.name,
        gridX: z.gridX,
        gridY: z.gridY,
        widthCells: z.widthCells,
        heightCells: z.heightCells,
      })),
      labels: [...(s.labels || [])].sort(byId).map(l => ({
        id: l.id,
        text: l.text,
        gridX: l.gridX,
        gridY: l.gridY,
      })),
    });
  }, []);

  const savedSnapshotRef = useRef<string>('');
  const currentSnapshot = useMemo(
    () =>
      toSnapshot({
        gridCols: api.gridCols,
        gridRows: api.gridRows,
        tableCounter: api.tableCounter,
        tables: api.tables,
        zones: api.zones,
        labels: api.labels,
      }),
    [api.gridCols, api.gridRows, api.labels, api.tableCounter, api.tables, api.zones, toSnapshot]
  );

  const isDirty = useMemo(() => {
    if (!savedSnapshotRef.current) return false;
    return savedSnapshotRef.current !== currentSnapshot;
  }, [currentSnapshot]);

  // Hydrate from Supabase
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!eventId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('seating_maps')
          .select('*')
          .eq('event_id', eventId)
          .maybeSingle();

        if (!active) return;
        if (error) throw error;

        const row = (data as any) as SeatingMapsRow | null;
        setExistingRow(row);

        const webV2 = getWebV2FromAnnotations(row?.annotations);
        if (webV2) {
          const cols =
            typeof webV2?.grid?.cols === 'number' && webV2.grid.cols > 0 ? Math.round(webV2.grid.cols) : DEFAULT_GRID_COLS;
          const rows =
            typeof webV2?.grid?.rows === 'number' && webV2.grid.rows > 0 ? Math.round(webV2.grid.rows) : DEFAULT_GRID_ROWS;
          const snap = toSnapshot({
            gridCols: cols,
            gridRows: rows,
            tables: Array.isArray(webV2.tables) ? webV2.tables : [],
            zones: Array.isArray(webV2.zones) ? webV2.zones : [],
            labels: Array.isArray(webV2.labels) ? webV2.labels : [],
            tableCounter: typeof webV2.tableCounter === 'number' ? webV2.tableCounter : 1,
          });
          savedSnapshotRef.current = snap;
          api.hydrate({
            gridCols: cols,
            gridRows: rows,
            tables: Array.isArray(webV2.tables) ? webV2.tables : [],
            zones: Array.isArray(webV2.zones) ? webV2.zones : [],
            labels: Array.isArray(webV2.labels) ? webV2.labels : [],
            tableCounter: typeof webV2.tableCounter === 'number' ? webV2.tableCounter : 1,
            selectedIds: new Set(),
          } as any);
        } else if (Array.isArray(row?.tables) && row?.tables.length) {
          // Fallback: convert legacy pixel tables into grid cells (scale ~40px per cell)
          const legacy = row.tables as any[];
          const tables: PlacedTable[] = legacy
            .filter(Boolean)
            .map((t: any, idx: number) => {
              const type = t.isReserve ? 'reserve' : t.isKnight ? 'knight' : 'regular';
              const num = typeof t.id === 'number' ? t.id : idx + 1;
              const gridX = Math.round((Number(t.x) || 0) / 40);
              const gridY = Math.round((Number(t.y) || 0) / 40);
              return {
                id: `table-legacy-${num}`,
                type,
                seats: Number(t.seats) || (type === 'knight' ? 20 : 12),
                orientation: 'row',
                gridX,
                gridY,
                number: num,
              } as PlacedTable;
            });

          const maxNum = tables.reduce((m, t) => Math.max(m, t.number || 0), 0);
          // Ensure grid is large enough to contain legacy content (plus padding)
          const maxX = tables.reduce((m, t) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w), 0);
          const maxY = tables.reduce((m, t) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h), 0);
          const cols = Math.max(DEFAULT_GRID_COLS, maxX + 6);
          const rows = Math.max(DEFAULT_GRID_ROWS, maxY + 6);
          savedSnapshotRef.current = toSnapshot({
            gridCols: cols,
            gridRows: rows,
            tables,
            zones: [],
            labels: [],
            tableCounter: maxNum + 1,
          });

          api.hydrate({
            gridCols: cols,
            gridRows: rows,
            tables,
            zones: [],
            labels: [],
            tableCounter: maxNum + 1,
            selectedIds: new Set(),
          } as any);
        }
      } catch (e) {
        console.error('SeatingMapWeb load error:', e);
        if (!active) return;
        Alert.alert('שגיאה', 'לא ניתן לטעון את מפת ההושבה');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const centerCell = useMemo(
    () => ({ x: Math.floor(api.gridCols / 2), y: Math.floor(api.gridRows / 2) }),
    [api.gridCols, api.gridRows]
  );

  const ensureGridMin = useCallback(
    (minCols: number, minRows: number) => {
      const nextCols = Math.max(api.gridCols, Math.round(minCols));
      const nextRows = Math.max(api.gridRows, Math.round(minRows));
      if (nextCols !== api.gridCols || nextRows !== api.gridRows) {
        api.setGrid(nextCols, nextRows);
      }
    },
    [api]
  );

  const onAddTable = useCallback(
    (config: TableConfig) => {
      const seats = config.seats;
      const sz = tableCellSize(config.type, seats, config.orientation);
      const gap = 1;
      const stepX = config.orientation === 'row' ? sz.w + gap : 0;
      const stepY = config.orientation === 'column' ? sz.h + gap : 0;
      const groupW = sz.w + (Math.max(1, config.quantity) - 1) * stepX;
      const groupH = sz.h + (Math.max(1, config.quantity) - 1) * stepY;

      // Auto-expand grid if the group wouldn't comfortably fit.
      // Keep some padding so adding multiple times doesn't instantly re-expand.
      ensureGridMin(groupW + 12, groupH + 12);

      const startX = centerCell.x - Math.floor(groupW / 2);
      const startY = centerCell.y - Math.floor(groupH / 2);
      api.addTable(config, startX, startY);
    },
    [api, centerCell.x, centerCell.y, ensureGridMin]
  );

  const onAddZone = useCallback(
    (name: string, widthCells: number, heightCells: number) => {
      ensureGridMin(widthCells + 12, heightCells + 12);
      const startX = centerCell.x - Math.floor(widthCells / 2);
      const startY = centerCell.y - Math.floor(heightCells / 2);
      api.addZone(name, startX, startY, widthCells, heightCells);
    },
    [api, centerCell.x, centerCell.y, ensureGridMin]
  );

  const onAddLabel = useCallback(
    (text: string) => {
      ensureGridMin(30, 20);
      api.addLabel(text, centerCell.x, centerCell.y);
    },
    [api, centerCell.x, centerCell.y, ensureGridMin]
  );

  const onDeleteSelected = useCallback(() => {
    if (!api.selectedIds.size) return;
    api.removeSelected();
  }, [api]);

  const saveMap = useCallback(async () => {
    if (!eventId) {
      Alert.alert('שגיאה', 'חסר eventId');
      return false;
    }
    setSaving(true);
    try {
      const webV2 = {
        type: 'web_v2',
        version: 2,
        grid: { cols: api.gridCols, rows: api.gridRows, cellSize: CELL_SIZE },
        tables: api.tables,
        zones: api.zones,
        labels: api.labels,
        tableCounter: api.tableCounter,
        updatedAt: new Date().toISOString(),
      };

      const prevAnnotations = existingRow?.annotations;
      const nextAnnotations = mergeWebV2IntoAnnotations(prevAnnotations, webV2);

      // Compatibility layer: also write legacy seating_maps.tables + public.tables records
      // so the rest of the app keeps working (mobile/other screens).
      const legacyTables = api.tables.map((t, idx) => {
        const num = typeof t.number === 'number' ? t.number : idx + 1;
        const isKnight = t.type === 'knight';
        const isReserve = t.type === 'reserve';
        const x = Math.round(t.gridX * 40);
        const y = Math.round(t.gridY * 40);
        return {
          id: num,
          x,
          y,
          isKnight,
          isReserve,
          rotation: 0,
          seats: t.seats,
          seated_guests: 0,
        };
      });

      const { error: seatingMapError } = await supabase
        .from('seating_maps')
        .upsert(
          {
            event_id: eventId,
            num_tables: legacyTables.length,
            tables: legacyTables,
            annotations: nextAnnotations,
            map_cols: 10,
            map_rows: 10,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'event_id' }
        );
      if (seatingMapError && (seatingMapError as any).code !== 'PGRST205') throw seatingMapError;

      // Replace public.tables records (idempotent)
      const { error: deleteError } = await supabase.from('tables').delete().eq('event_id', eventId);
      if (deleteError) throw deleteError;

      const tableRecords = legacyTables.map((t) => {
        const shape = t.isKnight ? 'rectangle' : t.isReserve ? 'reserve' : 'square';
        return {
          event_id: eventId,
          number: t.id,
          capacity: t.seats,
          shape,
          name: `שולחן ${t.id}`,
          x: t.x,
          y: t.y,
          seated_guests: 0,
        };
      });
      if (tableRecords.length) {
        const { error: insertError } = await supabase.from('tables').insert(tableRecords);
        if (insertError) throw insertError;
      }

      Alert.alert('נשמר', 'מפת ההושבה נשמרה בהצלחה');
      savedSnapshotRef.current = currentSnapshot;
      return true;
    } catch (e) {
      console.error('SeatingMapWeb save error:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את המפה');
      return false;
    } finally {
      setSaving(false);
    }
  }, [api.gridCols, api.gridRows, api.labels, api.tableCounter, api.tables, api.zones, currentSnapshot, eventId, existingRow?.annotations]);

  const onSave = useCallback(async () => {
    await saveMap();
  }, [saveMap]);

  const goBackToEvent = useCallback(() => {
    const r: any = router as any;
    if (typeof r?.canGoBack === 'function' && r.canGoBack()) {
      router.back();
      return;
    }
    if (eventId) {
      if (userType === 'admin') {
        router.replace(`/(admin)/admin-event-details?id=${encodeURIComponent(eventId)}`);
        return;
      }
      if (userType === 'employee') {
        router.replace(`/(employee)/employee-event-details?id=${encodeURIComponent(eventId)}`);
        return;
      }
      router.replace(`/(couple)?eventId=${encodeURIComponent(eventId)}` as any);
      return;
    }
    router.replace('/(tabs)');
  }, [eventId, router, userType]);

  const onBack = useCallback(() => {
    if (isDirty) {
      setLeaveDialogOpen(true);
      return;
    }
    goBackToEvent();
  }, [goBackToEvent, isDirty]);

  const onLeaveWithoutSaving = useCallback(() => {
    setLeaveDialogOpen(false);
    goBackToEvent();
  }, [goBackToEvent]);

  const onSaveAndLeave = useCallback(async () => {
    const ok = await saveMap();
    if (!ok) return;
    setLeaveDialogOpen(false);
    goBackToEvent();
  }, [goBackToEvent, saveMap]);

  return (
    <View style={styles.root}>
      {leaveDialogOpen ? (
        <View style={styles.leaveOverlay}>
          <Pressable style={StyleSheet.absoluteFill as any} onPress={() => setLeaveDialogOpen(false)} />
          <View style={styles.leaveCard}>
            <Text style={styles.leaveTitle}>לא שמרת את השינויים שלך</Text>
            <Text style={styles.leaveSubtitle}>אפשר לשמור שינויים או לצאת בלי לשמור.</Text>
            <View style={styles.leaveActions}>
              <Pressable
                onPress={onLeaveWithoutSaving}
                style={({ pressed }) => [styles.leaveBtn, styles.leaveBtnGhost, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.leaveGhostText}>צא</Text>
              </Pressable>
              <Pressable
                onPress={onSaveAndLeave}
                disabled={saving}
                style={({ pressed }) => [
                  styles.leaveBtn,
                  styles.leaveBtnPrimary,
                  pressed && !saving && { opacity: 0.92 },
                  saving && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.leavePrimaryText}>{saving ? 'שומר...' : 'שמור שינויים'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      <View style={styles.row}>
        <TableSidebar
          onBack={onBack}
          onAddTable={onAddTable}
          onAddZone={onAddZone}
          onAddLabel={onAddLabel}
          onSave={onSave}
          onDeleteSelected={onDeleteSelected}
          hasSelection={api.selectedIds.size > 0}
          saving={saving}
          gridCols={api.gridCols}
          gridRows={api.gridRows}
          onSetGrid={(cols, rows) => api.setGrid(cols, rows)}
        />

        <View style={styles.canvas}>
          <SeatingGrid api={api} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e5e7eb' },
  // In RTL, `row` already lays out right-to-left. Using `row-reverse` would put the sidebar on the left.
  row: { flex: 1, flexDirection: 'row' },
  canvas: { flex: 1 },

  leaveOverlay: {
    ...(StyleSheet.absoluteFill as any),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.35)',
    padding: 18,
    zIndex: 1000,
  },
  leaveCard: {
    width: 380,
    maxWidth: '92%',
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    padding: 14,
  },
  leaveTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111418',
    textAlign: 'right',
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  leaveSubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(17,24,39,0.60)',
    textAlign: 'right',
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  leaveActions: { marginTop: 12, flexDirection: 'row-reverse', gap: 10 },
  leaveBtn: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  leaveBtnPrimary: { backgroundColor: '#2b8cee' },
  leavePrimaryText: { color: '#fff', fontWeight: '900', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  leaveBtnGhost: { backgroundColor: 'rgba(17,24,39,0.04)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)' },
  leaveGhostText: { color: 'rgba(17,24,39,0.75)', fontWeight: '900', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
});

