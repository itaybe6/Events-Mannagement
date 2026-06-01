import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { TABLE_LABELS, tableCellSize, type Orientation, type TableType } from '../../app/seating/web/_types';
import { colors } from '@/constants/colors';
import {
  TableSeatRing,
  getTableSeatBorderColor,
  getTableSeatFillColor,
} from '@/components/couple/TableSeatRing';

export type SeatingGridTableItem = {
  id: string;
  type: TableType;
  seats: number;
  orientation?: Orientation;
  gridX?: number;
  gridY?: number;
  number?: number;
  name?: string | null;
  area?: string | null;
};

type ZoneItem = {
  id: string;
  name: string;
  gridX: number;
  gridY: number;
  widthCells: number;
  heightCells: number;
};

type SeatingTablesGridViewProps = {
  tables: SeatingGridTableItem[];
  zones?: ZoneItem[];
  getOccupancy: (t: SeatingGridTableItem) => { seated: number; capacity: number };
  onPressTable: (tableNumber: number | undefined) => void;
};

function zoneNameForTable(t: SeatingGridTableItem, zones: ZoneItem[]): string | null {
  const gx = Number(t.gridX);
  const gy = Number(t.gridY);
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !zones.length) return null;

  const sz = tableCellSize(t.type, t.seats, t.orientation ?? 'column');
  const cx = gx + sz.w / 2;
  const cy = gy + sz.h / 2;

  for (const z of zones) {
    const x0 = Number(z.gridX);
    const y0 = Number(z.gridY);
    const x1 = x0 + (Number(z.widthCells) || 1);
    const y1 = y0 + (Number(z.heightCells) || 1);
    if (cx >= x0 && cx < x1 && cy >= y0 && cy < y1) {
      const name = String(z.name ?? '').trim();
      if (name) return name;
    }
  }
  return null;
}

function tableCardCaption(t: SeatingGridTableItem, zoneName: string | null): string {
  const num = t.number;
  const customName = String(t.name ?? '').trim();
  const typeLabel = t.type === 'knight' ? 'אביר' : t.type === 'reserve' ? 'רזרבה' : null;

  let base = customName;
  if (!base) {
    if (typeLabel && num) base = `שולחן ${typeLabel} ${num}`;
    else if (typeLabel) base = `שולחן ${typeLabel}`;
    else if (num) base = `שולחן ${num}`;
    else base = 'שולחן';
  }

  const zone = zoneName || String(t.area ?? '').trim() || (t.type !== 'regular' ? TABLE_LABELS[t.type] : '');
  return zone ? `${base} • ${zone}` : base;
}

function TableGridCard({
  item,
  cardWidth,
  zoneName,
  occupancy,
  onPress,
}: {
  item: SeatingGridTableItem;
  cardWidth: number;
  zoneName: string | null;
  occupancy: { seated: number; capacity: number };
  onPress: () => void;
}) {
  const cap = occupancy.capacity;
  const seated = occupancy.seated;
  const isReserve = item.type === 'reserve';
  const isKnight = item.type === 'knight';
  const ringBox = Math.max(88, Math.min(cardWidth - 20, 132));
  const ringW = isKnight ? ringBox * 0.92 : ringBox;
  const ringH = isKnight ? ringBox * 0.72 : ringBox;
  const ringSize = isKnight ? Math.min(ringW, ringH) : ringBox;
  const filledColor = getTableSeatFillColor(seated, cap);
  const borderColor = getTableSeatBorderColor(
    seated,
    cap,
    isReserve ? 'rgba(245, 158, 11, 0.55)' : 'rgba(203, 213, 225, 0.85)',
  );

  return (
    <View style={[styles.cardCol, { width: cardWidth }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tableCardCaption(item, zoneName)}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          isReserve && styles.cardReserve,
          { borderColor, opacity: pressed ? 0.92 : 1 },
        ]}
      >
        <TableSeatRing
          layout={isKnight ? 'knight' : 'round'}
          tableNumber={item.number ?? ''}
          seated={seated}
          capacity={cap}
          size={ringSize}
          width={isKnight ? ringW : undefined}
          height={isKnight ? ringH : undefined}
          orientation={item.orientation ?? 'column'}
          showRatio
          filledColor={filledColor}
          numberColor={isReserve ? '#B45309' : colors.primary}
        />
      </Pressable>
      <Text style={styles.caption} numberOfLines={2}>
        {tableCardCaption(item, zoneName)}
      </Text>
    </View>
  );
}

export function SeatingTablesGridView({
  tables,
  zones = [],
  getOccupancy,
  onPressTable,
}: SeatingTablesGridViewProps) {
  const { width } = useWindowDimensions();
  const horizontalPad = 14;
  const gap = 10;
  const cardWidth = (width - horizontalPad * 2 - gap) / 2;

  const sortedTables = useMemo(() => {
    return [...tables].sort((a, b) => {
      const na = Number(a.number);
      const nb = Number(b.number);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      if (Number.isFinite(na)) return -1;
      if (Number.isFinite(nb)) return 1;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [tables]);

  const zoneByTableId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of sortedTables) {
      map.set(t.id, zoneNameForTable(t, zones));
    }
    return map;
  }, [sortedTables, zones]);

  return (
    <FlatList
      data={sortedTables}
      keyExtractor={(item) => String(item.id)}
      numColumns={2}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.listContent, { paddingHorizontal: horizontalPad }]}
      columnWrapperStyle={{ gap }}
      ItemSeparatorComponent={() => <View style={{ height: gap }} />}
      renderItem={({ item }) => (
        <TableGridCard
          item={item}
          cardWidth={cardWidth}
          zoneName={zoneByTableId.get(item.id) ?? null}
          occupancy={getOccupancy(item)}
          onPress={() => onPressTable(item.number)}
        />
      )}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>אין שולחנות להצגה</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#F8F6F2',
  },
  cardCol: {
    alignItems: 'center',
  },
  card: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardReserve: {
    borderTopWidth: 3,
    borderTopColor: colors.gold,
  },
  caption: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 2,
    minHeight: 32,
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textLight,
  },
});
