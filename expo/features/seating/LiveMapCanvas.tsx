import React, { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors } from '@/constants/colors';
import { ROW_DIR } from '@/lib/rtl';
import { buildLiveMapLayout } from '@/features/seating/liveSeatingLayout';
import type { LiveSeatingTable, LiveTableStatus } from '@/features/seating/useLiveSeatingModel';

/**
 * The spatial half of the live map: the hall drawn to scale, one tile per table,
 * coloured by how full it is right now.
 *
 * Two rendering paths, deliberately:
 *
 * - The sketch layout needs absolute placement, and mirrors the structure the
 *   existing seating-map screen already renders correctly on device (sized
 *   canvas inside a sized scroll container, `TouchableOpacity` tiles).
 * - The grid fallback has no coordinates to honour, so it flows with flexbox
 *   instead. An absolutely positioned child that loses its size collapses into
 *   a column of bare text; a wrapped flex row cannot.
 *
 * Shared by the native and web screens so the two can't drift apart.
 */

const INK = '#06173e';

export const LIVE_STATUS_STYLE: Record<
  LiveTableStatus,
  { bar: string; tint: string; border: string; label: string }
> = {
  empty: { bar: '#94A3B8', tint: '#EEF2F7', border: 'rgba(100,116,139,0.30)', label: 'ריק' },
  partial: { bar: '#3B82F6', tint: '#E6F0FF', border: 'rgba(59,130,246,0.40)', label: 'חלקי' },
  full: { bar: '#16A34A', tint: '#DCFCE7', border: 'rgba(22,163,74,0.44)', label: 'מלא' },
  over: { bar: '#F59E0B', tint: '#FEF3C7', border: 'rgba(245,158,11,0.50)', label: 'מעל תפוסה' },
};

const CARD_PADDING = 10;

function tableShortLabel(table: Pick<LiveSeatingTable, 'number' | 'name'>) {
  if (typeof table.number === 'number') return String(table.number);
  return String(table.name || '?').trim().slice(0, 4) || '?';
}

function tableLabel(table: Pick<LiveSeatingTable, 'number' | 'name'>) {
  if (typeof table.number === 'number') return `שולחן ${table.number}`;
  return String(table.name || '').trim() || 'שולחן';
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export type LiveMapCanvasProps = {
  tables: LiveSeatingTable[];
  /** Space the hall is scaled into, excluding the card's own padding. */
  viewport: { width: number; height: number };
  selectedId?: string | null;
  onSelectTable: (tableId: string) => void;
};

export default function LiveMapCanvas({
  tables,
  viewport,
  selectedId,
  onSelectTable,
}: LiveMapCanvasProps) {
  const layout = useMemo(() => buildLiveMapLayout(tables, viewport), [tables, viewport]);

  const cardHeight = viewport.height + CARD_PADDING * 2;

  // Tables exist but nothing could be drawn — never leave a blank canvas.
  if (tables.length > 0 && layout.placed.length === 0) {
    return (
      <View style={[styles.card, styles.cardFallback, { height: cardHeight }]}>
        <Text style={styles.fallbackTitle}>לא ניתן לצייר את המפה</Text>
        <Text style={styles.fallbackText}>עברו לתצוגת רשימה כדי לראות ולעדכן את השולחנות</Text>
      </View>
    );
  }

  if (layout.mode === 'grid') {
    // Reading order: a wrapped flex row, sized to fit. No absolute placement.
    return (
      <View style={[styles.card, { height: cardHeight }]}>
        <ScrollView
          style={styles.flowScroll}
          contentContainerStyle={[styles.flowContent, { gap: layout.gap }]}
          showsVerticalScrollIndicator={false}
        >
          {layout.placed.map(({ table }) => (
            <MapTile
              key={table.id}
              table={table}
              width={layout.tile}
              height={layout.tile}
              selected={table.id === selectedId}
              onPress={() => onSelectTable(table.id)}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  // The sketch at its real scale, panned in both directions when it is
  // larger than the screen, centred when it is smaller. Every level carries
  // an explicit size — an unsized scroll container collapses and takes the
  // canvas with it.
  return (
    <View style={[styles.card, styles.cardMap, { height: cardHeight }]}>
      <ScrollView
        style={styles.mapScrollY}
        contentContainerStyle={styles.mapScrollYContent}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled
      >
        <ScrollView
          horizontal
          style={{ height: layout.height }}
          contentContainerStyle={[styles.mapScrollXContent, { height: layout.height }]}
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
        >
          <View style={[styles.canvas, { width: layout.width, height: layout.height }]}>
            {layout.placed.map((placed) => (
              <MapTile
                key={placed.table.id}
                table={placed.table}
                width={placed.width}
                height={placed.height}
                left={placed.left}
                top={placed.top}
                selected={placed.table.id === selectedId}
                onPress={() => onSelectTable(placed.table.id)}
              />
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

/**
 * One table. `left`/`top` are supplied only in positioned mode; without them the
 * tile is an ordinary flex child, which is what keeps the grid path robust.
 */
function MapTile({
  table,
  width,
  height,
  left,
  top,
  selected,
  onPress,
}: {
  table: LiveSeatingTable;
  width: number;
  height: number;
  left?: number;
  top?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = LIVE_STATUS_STYLE[table.status];
  const short = Math.max(12, Math.min(width, height));

  const showCount = short >= 38;
  const numberSize = short >= 58 ? 16 : short >= 44 ? 13 : short >= 30 ? 11 : 9;
  const countSize = short >= 58 ? 12 : 10;
  const isReserve = table.shape === 'reserve';
  const positioned = typeof left === 'number' && typeof top === 'number';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={[
        styles.tile,
        {
          width,
          height,
          borderRadius: Math.max(5, Math.min(16, short * 0.22)),
          backgroundColor: isReserve ? 'rgba(6,23,62,0.82)' : palette.tint,
          borderColor: isReserve ? 'rgba(6,23,62,0.9)' : palette.border,
        },
        positioned ? { position: 'absolute', left, top } : null,
        selected ? styles.tileSelected : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${tableLabel(table)}, ${table.livePeople} מתוך ${table.capacity} יושבים`}
    >
      <Text
        style={[styles.tileNumber, { fontSize: numberSize }, isReserve && styles.tileNumberReserve]}
        numberOfLines={1}
      >
        {tableShortLabel(table)}
      </Text>
      {showCount ? (
        <Text
          style={[
            styles.tileCount,
            { fontSize: countSize, color: isReserve ? 'rgba(255,255,255,0.72)' : palette.bar },
          ]}
          numberOfLines={1}
        >
          {`${table.livePeople}/${table.capacity}`}
        </Text>
      ) : null}
      {table.manualExtra !== 0 && short >= 26 ? (
        <View style={styles.tileFlag} accessibilityLabel={`תוספת ידנית ${signed(table.manualExtra)}`} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    padding: CARD_PADDING,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: INK,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardMap: { alignItems: 'stretch', justifyContent: 'flex-start' },
  mapScrollY: { alignSelf: 'stretch' },
  // flexGrow + centring floats a small hall in the middle of the card instead
  // of pinning it to a corner; a large hall still scrolls normally.
  mapScrollYContent: { flexGrow: 1, justifyContent: 'center' },
  mapScrollXContent: { flexGrow: 1, justifyContent: 'center' },
  cardFallback: { gap: 6, paddingHorizontal: 24 },
  fallbackTitle: { fontSize: 15, fontWeight: '900', color: INK, textAlign: 'center' },
  fallbackText: { fontSize: 12.5, fontWeight: '700', color: 'rgba(6,23,62,0.48)', textAlign: 'center' },

  flowScroll: { alignSelf: 'stretch' },
  flowContent: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  canvas: { position: 'relative' },

  tile: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: INK,
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tileSelected: { borderColor: INK, borderWidth: 2.5 },
  tileNumber: { fontWeight: '900', color: INK },
  tileNumberReserve: { color: colors.white },
  tileCount: { fontWeight: '900', marginTop: 1 },
  tileFlag: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
});
