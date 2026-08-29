import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { SeatingGrid } from './SeatingGrid';
import { TableSidebar } from './TableSidebar';
import { useSeatingState } from './_useSeatingState';
import { attachDbIdsToTables, findDuplicateTableNumbers, syncEventTables } from './_syncEventTables';
import { CELL_SIZE, DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type TableConfig, type PlacedTable } from './_types';

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
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingRow, setExistingRow] = useState<SeatingMapsRow | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [occupiedByDbId, setOccupiedByDbId] = useState<Record<string, number>>({});

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
        dbId: t.dbId || undefined,
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

  const [savedSnapshot, setSavedSnapshot] = useState('');
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
    if (!savedSnapshot) return false;
    return savedSnapshot !== currentSnapshot;
  }, [currentSnapshot, savedSnapshot]);

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
        const [mapRes, tablesRes, guestsRes] = await Promise.all([
          supabase.from('seating_maps').select('*').eq('event_id', eventId).maybeSingle(),
          supabase.from('tables').select('id,number,name,capacity').eq('event_id', eventId),
          supabase.from('guests').select('table_id,number_of_people').eq('event_id', eventId),
        ]);

        if (!active) return;
        if (mapRes.error) throw mapRes.error;
        if (tablesRes.error) throw tablesRes.error;

        const dbTables = ((tablesRes.data as any[]) || []).filter(Boolean);
        const occupied: Record<string, number> = {};
        if (!guestsRes.error) {
          for (const guest of (guestsRes.data as any[]) || []) {
            const tid = String(guest?.table_id || '').trim();
            if (!tid) continue;
            occupied[tid] = (occupied[tid] || 0) + (Number(guest?.number_of_people) || 1);
          }
        }
        setOccupiedByDbId(occupied);

        const row = (mapRes.data as any) as SeatingMapsRow | null;
        setExistingRow(row);

        const webV2 = getWebV2FromAnnotations(row?.annotations);
        if (webV2) {
          const cols =
            typeof webV2?.grid?.cols === 'number' && webV2.grid.cols > 0 ? Math.round(webV2.grid.cols) : DEFAULT_GRID_COLS;
          const rows =
            typeof webV2?.grid?.rows === 'number' && webV2.grid.rows > 0 ? Math.round(webV2.grid.rows) : DEFAULT_GRID_ROWS;
          const tables = attachDbIdsToTables(Array.isArray(webV2.tables) ? webV2.tables : [], dbTables);
          const snap = toSnapshot({
            gridCols: cols,
            gridRows: rows,
            tables,
            zones: Array.isArray(webV2.zones) ? webV2.zones : [],
            labels: Array.isArray(webV2.labels) ? webV2.labels : [],
            tableCounter: typeof webV2.tableCounter === 'number' ? webV2.tableCounter : 1,
          });
          setSavedSnapshot(snap);
          api.hydrate({
            gridCols: cols,
            gridRows: rows,
            tables,
            zones: Array.isArray(webV2.zones) ? webV2.zones : [],
            labels: Array.isArray(webV2.labels) ? webV2.labels : [],
            tableCounter: typeof webV2.tableCounter === 'number' ? webV2.tableCounter : 1,
            selectedIds: new Set(),
          } as any);
        } else if (Array.isArray(row?.tables) && row?.tables.length) {
          // Fallback: convert legacy pixel tables into grid cells (scale ~40px per cell)
          const legacy = row.tables as any[];
          const tables: PlacedTable[] = attachDbIdsToTables(
            legacy
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
              }),
            dbTables
          );

          const maxNum = tables.reduce((m, t) => Math.max(m, t.number || 0), 0);
          // Ensure grid is large enough to contain legacy content (plus padding)
          const maxX = tables.reduce((m, t) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w), 0);
          const maxY = tables.reduce((m, t) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h), 0);
          const cols = Math.max(DEFAULT_GRID_COLS, maxX + 6);
          const rows = Math.max(DEFAULT_GRID_ROWS, maxY + 6);
          setSavedSnapshot(toSnapshot({
            gridCols: cols,
            gridRows: rows,
            tables,
            zones: [],
            labels: [],
            tableCounter: maxNum + 1,
          }));

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
    const seatedCount = api.tables.reduce((sum, table) => {
      if (!api.selectedIds.has(table.id) || !table.dbId) return sum;
      return sum + (occupiedByDbId[table.dbId] || 0);
    }, 0);
    if (seatedCount > 0) {
      Alert.alert(
        'מחיקת שולחן',
        `בשולחנות שנבחרו יש ${seatedCount} מוזמנים משובצים. המחיקה תוריד אותם מהשולחן.`,
        [
          { text: 'ביטול', style: 'cancel' },
          { text: 'מחק', style: 'destructive', onPress: () => api.removeSelected() },
        ]
      );
      return;
    }
    api.removeSelected();
  }, [api, occupiedByDbId]);

  const selectedTable = useMemo(() => {
    if (api.selectedIds.size !== 1) return null;
    const id = Array.from(api.selectedIds)[0];
    return api.tables.find((t) => t.id === id) ?? null;
  }, [api.selectedIds, api.tables]);

  const selectedOccupied = selectedTable?.dbId ? occupiedByDbId[selectedTable.dbId] ?? 0 : 0;

  const onUpdateSelectedTable = useCallback(
    (patch: Partial<Pick<PlacedTable, 'number' | 'seats' | 'type' | 'orientation'>>) => {
      if (!selectedTable) return;
      const nextSeats = patch.seats ?? selectedTable.seats;
      const nextType = patch.type ?? selectedTable.type;
      const nextOrientation = patch.orientation ?? selectedTable.orientation;
      const sz = tableCellSize(nextType, nextSeats, nextOrientation);
      ensureGridMin(selectedTable.gridX + sz.w + 6, selectedTable.gridY + sz.h + 6);
      api.updateTable(selectedTable.id, patch);
    },
    [api, ensureGridMin, selectedTable]
  );

  const saveMap = useCallback(async (pendingGrid?: { cols: number; rows: number }) => {
    if (!eventId) {
      Alert.alert('שגיאה', 'חסר eventId');
      return false;
    }
    setSaving(true);
    try {
      const cols = pendingGrid ? Math.round(pendingGrid.cols) : api.gridCols;
      const rows = pendingGrid ? Math.round(pendingGrid.rows) : api.gridRows;

      if (cols !== api.gridCols || rows !== api.gridRows) {
        api.setGrid(cols, rows);
      }

      const duplicates = findDuplicateTableNumbers(api.tables);
      if (duplicates.length) {
        Alert.alert('מספר שולחן כפול', `אי אפשר לשמור: המספרים ${duplicates.join(', ')} מופיעים יותר מפעם אחת.`);
        return false;
      }

      const dbIdsByCanvasId = await syncEventTables(eventId, api.tables);
      const tablesWithIds = api.tables.map((t) => ({
        ...t,
        dbId: dbIdsByCanvasId[t.id] ?? t.dbId,
      }));

      const webV2 = {
        type: 'web_v2',
        version: 2,
        grid: { cols, rows, cellSize: CELL_SIZE },
        tables: tablesWithIds,
        zones: api.zones,
        labels: api.labels,
        tableCounter: api.tableCounter,
        updatedAt: new Date().toISOString(),
      };

      const prevAnnotations = existingRow?.annotations;
      const nextAnnotations = mergeWebV2IntoAnnotations(prevAnnotations, webV2);

      // Compatibility layer: also write legacy seating_maps.tables
      // so older mobile/viewers keep working.
      const legacyTables = tablesWithIds.map((t, idx) => {
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
            map_cols: cols,
            map_rows: rows,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'event_id' }
        );
      if (seatingMapError && (seatingMapError as any).code !== 'PGRST205') throw seatingMapError;

      api.setTableDbIds(dbIdsByCanvasId);
      setExistingRow((prev) => ({
        ...(prev || { event_id: eventId }),
        event_id: eventId,
        num_tables: legacyTables.length,
        tables: legacyTables,
        annotations: nextAnnotations,
        map_cols: cols,
        map_rows: rows,
      }));
      Alert.alert('נשמר', 'מפת ההושבה נשמרה. שיבוץ המוזמנים לשולחנות הקיימים נשמר.');
      setSavedSnapshot(
        toSnapshot({
          gridCols: cols,
          gridRows: rows,
          tableCounter: api.tableCounter,
          tables: tablesWithIds,
          zones: api.zones,
          labels: api.labels,
        })
      );
      return true;
    } catch (e) {
      console.error('SeatingMapWeb save error:', e);
      const message = e instanceof Error && e.message ? e.message : 'לא ניתן לשמור את המפה';
      Alert.alert('שגיאה', message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [api, eventId, existingRow?.annotations, toSnapshot]);

  const onSave = useCallback(
    async (pendingGrid?: { cols: number; rows: number }) => {
      await saveMap(pendingGrid);
    },
    [saveMap]
  );

  const goBackToEvent = useCallback(() => {
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

  const isLaptopCompact = width <= 1440;
  const selectionCount = api.selectedIds.size;
  const mapStatusLabel = api.tables.length ? 'מפה פעילה' : 'טיוטה ריקה';
  const headerMetaContent = useMemo(
    () => (
      <View style={styles.headerMetaRow}>
        <View style={styles.headerCountRow}>
          <View style={styles.headerCountChip}>
            <Text style={styles.headerCountText}>{`${api.tables.length} שולחנות`}</Text>
          </View>
          <View style={styles.headerCountChip}>
            <Text style={styles.headerCountText}>{`${api.zones.length} אזורים`}</Text>
          </View>
          <View style={styles.headerCountChip}>
            <Text style={styles.headerCountText}>{`${api.labels.length} תוויות`}</Text>
          </View>
        </View>

        <View style={styles.headerLegendRow}>
          <View style={styles.headerLegendItem}>
            <View style={[styles.headerLegendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.headerLegendText}>שולחן רגיל / אביר</Text>
          </View>
          <View style={styles.headerLegendItem}>
            <View style={[styles.headerLegendDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.headerLegendText}>שולחן רזרבה</Text>
          </View>
          <View style={styles.headerLegendItem}>
            <View style={[styles.headerLegendDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.headerLegendText}>פריט נבחר</Text>
          </View>
        </View>
      </View>
    ),
    [api.labels.length, api.tables.length, api.zones.length]
  );

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
      <View style={styles.page}>
        <View style={styles.heroShell}>
          <AdminWebPageHeader
            eyebrow="ניהול אירועים"
            title="עריכת סקיצה"
            subtitleContent={headerMetaContent}
            showNav={false}
            leading={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="חזרה לעמוד האירוע"
                onPress={onBack}
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
              <View style={styles.headerActions}>
                <View style={styles.headerBadge}>
                  <View style={[styles.headerBadgeDot, { backgroundColor: api.tables.length ? '#10B981' : 'rgba(148,163,184,0.8)' }]} />
                  <Text style={styles.headerBadgeText}>{mapStatusLabel}</Text>
                </View>
                {selectionCount ? (
                  <View style={styles.headerBadge}>
                    <Ionicons name="scan-outline" size={14} color={colors.primary} />
                    <Text style={styles.headerBadgeText}>{`${selectionCount} נבחרו`}</Text>
                  </View>
                ) : null}
              </View>
            }
          />
        </View>

        <View style={[styles.row, isLaptopCompact ? styles.rowCompact : null]}>
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
          nextTableNumber={api.tableCounter}
          selectedTable={selectedTable}
          selectedOccupied={selectedOccupied}
          usedNumbers={
            new Set(
              api.tables
                .filter((t) => t.id !== selectedTable?.id)
                .map((t) => t.number)
                .filter((n): n is number => typeof n === 'number')
            )
          }
          onUpdateSelectedTable={onUpdateSelectedTable}
          onSetGrid={(cols, rows) => {
            api.setGrid(cols, rows);
          }}
          compact={isLaptopCompact}
          hideHeader
        />

        <View style={[styles.canvasCard, isLaptopCompact ? styles.canvasCardCompact : null]}>
          <View style={styles.canvasCardHeader}>
            <View style={styles.panelHeaderCopy}>
              <Text style={styles.panelEyebrow}>סקיצה</Text>
              <Text style={styles.panelTitle}>עריכת סקיצה</Text>
            </View>

            <View style={styles.mapCardHeaderSide}>
              <View style={styles.mapStatusPill}>
                <View style={[styles.mapStatusDot, { backgroundColor: api.tables.length ? '#10B981' : 'rgba(107,114,128,0.65)' }]} />
                <Text style={styles.mapStatusPillText}>{mapStatusLabel}</Text>
              </View>
            </View>
          </View>

          <View style={styles.canvas}>
            <SeatingGrid api={api} fitToGrid onDeleteSelected={onDeleteSelected} />
          </View>
        </View>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7FAFF',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.14), rgba(25,93,230,0) 40%), radial-gradient(circle at top left, rgba(232,241,255,0.95), rgba(232,241,255,0) 34%), radial-gradient(circle at bottom left, rgba(242,224,186,0.24), rgba(242,224,186,0) 30%)',
        } as any)
      : null),
  },
  page: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
  },
  heroShell: { gap: 12 },
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
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  headerBadge: {
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
  headerBadgeDot: { width: 8, height: 8, borderRadius: 999 },
  headerBadgeText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerLegendRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  headerLegendItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  headerLegendDot: { width: 8, height: 8, borderRadius: 999 },
  headerLegendText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  headerCountRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  headerCountChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
  },
  headerCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  // In RTL, `row` already lays out right-to-left. Using `row-reverse` would put the sidebar on the left.
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 0,
  },
  rowCompact: {
    gap: 8,
  },
  canvasCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.06)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 8,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    gap: 6,
  },
  canvasCardCompact: {
    borderRadius: 22,
    padding: 6,
  },
  canvasCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  panelHeaderCopy: { flex: 1, minWidth: 0, gap: 4 },
  panelEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.gray[500],
    textAlign: 'right',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  panelSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    color: colors.gray[600],
    textAlign: 'right',
  },
  mapCardHeaderSide: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  mapStatusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  mapStatusDot: { width: 7, height: 7, borderRadius: 999 },
  mapStatusPillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  canvas: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 20,
    overflow: 'hidden',
  },

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
  },
  leaveSubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(17,24,39,0.60)',
    textAlign: 'right',
  },
  leaveActions: { marginTop: 12, flexDirection: 'row-reverse', gap: 10 },
  leaveBtn: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  leaveBtnPrimary: { backgroundColor: '#2b8cee' },
  leavePrimaryText: { color: '#fff', fontWeight: '900' },
  leaveBtnGhost: { backgroundColor: 'rgba(17,24,39,0.04)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)' },
  leaveGhostText: { color: 'rgba(17,24,39,0.75)', fontWeight: '900' },
});
