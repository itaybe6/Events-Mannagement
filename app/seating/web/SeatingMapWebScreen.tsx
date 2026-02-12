import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { SeatingGrid } from './SeatingGrid';
import { TableSidebar } from './TableSidebar';
import { useSeatingState } from './useSeatingState';
import { CELL_SIZE, GRID_COLS, GRID_ROWS, tableCellSize, type TableConfig, type PlacedTable, type Zone, type TextLabel } from './types';

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
  const api = useSeatingState();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingRow, setExistingRow] = useState<SeatingMapsRow | null>(null);

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
          api.hydrate({
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
                seats: Number(t.seats) || (type === 'knight' ? 20 : type === 'reserve' ? 8 : 12),
                orientation: 'row',
                gridX,
                gridY,
                number: num,
              } as PlacedTable;
            });

          const maxNum = tables.reduce((m, t) => Math.max(m, t.number || 0), 0);
          api.hydrate({ tables, zones: [], labels: [], tableCounter: maxNum + 1, selectedIds: new Set() } as any);
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

  const centerCell = useMemo(() => ({ x: Math.floor(GRID_COLS / 2), y: Math.floor(GRID_ROWS / 2) }), []);

  const onAddTable = useCallback(
    (config: TableConfig) => {
      const seats = config.seats;
      const sz = tableCellSize(config.type, seats, config.orientation);
      const gap = 1;
      const stepX = config.orientation === 'row' ? sz.w + gap : 0;
      const stepY = config.orientation === 'column' ? sz.h + gap : 0;
      const groupW = sz.w + (Math.max(1, config.quantity) - 1) * stepX;
      const groupH = sz.h + (Math.max(1, config.quantity) - 1) * stepY;
      const startX = centerCell.x - Math.floor(groupW / 2);
      const startY = centerCell.y - Math.floor(groupH / 2);
      api.addTable(config, startX, startY);
    },
    [api, centerCell.x, centerCell.y]
  );

  const onAddZone = useCallback(
    (name: string, widthCells: number, heightCells: number) => {
      const startX = centerCell.x - Math.floor(widthCells / 2);
      const startY = centerCell.y - Math.floor(heightCells / 2);
      api.addZone(name, startX, startY, widthCells, heightCells);
    },
    [api, centerCell.x, centerCell.y]
  );

  const onAddLabel = useCallback(
    (text: string) => {
      api.addLabel(text, centerCell.x, centerCell.y);
    },
    [api, centerCell.x, centerCell.y]
  );

  const onDeleteSelected = useCallback(() => {
    if (!api.selectedIds.size) return;
    api.removeSelected();
  }, [api]);

  const onSave = useCallback(async () => {
    if (!eventId) {
      Alert.alert('שגיאה', 'חסר eventId');
      return;
    }
    setSaving(true);
    try {
      const webV2 = {
        type: 'web_v2',
        version: 2,
        grid: { cols: GRID_COLS, rows: GRID_ROWS, cellSize: CELL_SIZE },
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
    } catch (e) {
      console.error('SeatingMapWeb save error:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את המפה');
    } finally {
      setSaving(false);
    }
  }, [api.labels, api.tableCounter, api.tables, api.zones, eventId, existingRow?.annotations]);

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <TableSidebar
          onAddTable={onAddTable}
          onAddZone={onAddZone}
          onAddLabel={onAddLabel}
          onSave={onSave}
          onDeleteSelected={onDeleteSelected}
          hasSelection={api.selectedIds.size > 0}
          saving={saving}
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
  row: { flex: 1, flexDirection: 'row-reverse' },
  canvas: { flex: 1 },
});

