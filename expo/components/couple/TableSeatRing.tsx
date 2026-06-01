import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export const TABLE_SEAT_COLORS = {
  default: '#06173d',
  full: '#4ADE80',
  fullBorder: 'rgba(74, 222, 128, 0.72)',
  over: '#047857',
  overBorder: 'rgba(4, 120, 87, 0.88)',
} as const;

export function getTableSeatFillColor(seated: number, capacity: number) {
  if (capacity <= 0) return TABLE_SEAT_COLORS.default;
  if (seated > capacity) return TABLE_SEAT_COLORS.over;
  if (seated === capacity) return TABLE_SEAT_COLORS.full;
  return TABLE_SEAT_COLORS.default;
}

export function getTableSeatBorderColor(seated: number, capacity: number, fallback: string) {
  if (capacity <= 0) return fallback;
  if (seated > capacity) return TABLE_SEAT_COLORS.overBorder;
  if (seated === capacity) return TABLE_SEAT_COLORS.fullBorder;
  return fallback;
}

type TableSeatRingProps = {
  tableNumber: number | string;
  seated: number;
  capacity: number;
  size: number;
  width?: number;
  height?: number;
  layout?: 'round' | 'knight';
  orientation?: 'row' | 'column';
  filledColor?: string;
  emptyColor?: string;
  emptyBorderColor?: string;
  centerBgColor?: string;
  numberColor?: string;
  showRatio?: boolean;
};

function seatDotPositions(count: number, ringRadius: number, cx: number, cy: number) {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: cx + ringRadius * Math.cos(angle),
      y: cy + ringRadius * Math.sin(angle),
    };
  });
}

function distributeAlongAxis(count: number, start: number, end: number) {
  if (count <= 0) return [];
  if (count === 1) return [(start + end) / 2];
  return Array.from({ length: count }, (_, i) => start + (i / (count - 1)) * (end - start));
}

function knightSeatPositions(
  capacity: number,
  width: number,
  height: number,
  orientation: 'row' | 'column',
  dotR: number,
) {
  if (capacity <= 0) return [];

  const ratioPad = 10;
  const sideA = Math.ceil(capacity / 2);
  const sideB = capacity - sideA;
  const gap = dotR + 1;

  const positions: { x: number; y: number }[] = [];

  if (orientation === 'column') {
    const centerBarW = width * 0.28;
    const leftX = (width - centerBarW) / 2 - gap;
    const rightX = (width + centerBarW) / 2 + gap;
    const startY = ratioPad + height * 0.05;
    const endY = height * 0.9;
    for (const y of distributeAlongAxis(sideA, startY, endY)) {
      positions.push({ x: leftX, y });
    }
    for (const y of distributeAlongAxis(sideB, startY, endY)) {
      positions.push({ x: rightX, y });
    }
  } else {
    const centerBarH = height * 0.28;
    const topY = (height - centerBarH) / 2 - gap;
    const bottomY = (height + centerBarH) / 2 + gap;
    const startX = width * 0.08;
    const endX = width * 0.92;
    for (const x of distributeAlongAxis(sideA, startX, endX)) {
      positions.push({ x, y: topY });
    }
    for (const x of distributeAlongAxis(sideB, startX, endX)) {
      positions.push({ x, y: bottomY });
    }
  }

  return positions;
}

function dotRadiusForCount(count: number, containerSize: number, boost = 1) {
  const base = containerSize * 0.055 * boost;
  if (count <= 8) return Math.max(3.5, base);
  if (count <= 12) return Math.max(3.2, base * 0.95);
  if (count <= 16) return Math.max(2.8, base * 0.88);
  if (count <= 20) return Math.max(2.5, base * 0.82);
  return Math.max(2.2, base * 0.76);
}

function knightDotRadius(capacity: number, width: number, height: number) {
  return dotRadiusForCount(capacity, Math.min(width, height), 1.58);
}

function SeatDot({
  x,
  y,
  dotR,
  filled,
  filledColor,
  emptyColor,
  emptyBorderColor,
}: {
  x: number;
  y: number;
  dotR: number;
  filled: boolean;
  filledColor: string;
  emptyColor: string;
  emptyBorderColor: string;
}) {
  return (
    <View
      style={[
        styles.dot,
        {
          width: dotR * 2,
          height: dotR * 2,
          borderRadius: dotR,
          left: x - dotR,
          top: y - dotR,
          backgroundColor: filled ? filledColor : emptyColor,
          borderColor: filled ? filledColor : emptyBorderColor,
          borderWidth: filled ? 0 : 1,
        },
      ]}
    />
  );
}

function RoundSeatRing({
  tableNumber,
  seated,
  capacity,
  size,
  filledColor,
  emptyColor,
  emptyBorderColor,
  centerBgColor,
  numberColor,
  showRatio,
}: TableSeatRingProps) {
  const safeSize = Math.max(48, size);
  const cx = safeSize / 2;
  const verticalOffset = safeSize * 0.045;
  const cy = safeSize / 2 + verticalOffset;
  const centerR = safeSize * 0.22;
  const dotR = dotRadiusForCount(capacity, safeSize, 1.12);
  const ringR = centerR + dotR + safeSize * 0.035;
  const numFontSize = Math.max(14, Math.min(28, safeSize * 0.28));

  const dots = useMemo(
    () => seatDotPositions(capacity, ringR, cx, cy),
    [capacity, ringR, cx, cy],
  );

  const seatedDisplay = Math.max(0, seated);
  const isOver = capacity > 0 && seatedDisplay > capacity;
  const isFull = capacity > 0 && seatedDisplay === capacity;
  const filledDots = capacity > 0 ? Math.min(capacity, seatedDisplay) : 0;

  return (
    <View style={[styles.wrap, { width: safeSize, height: safeSize }]}>
      {showRatio && capacity > 0 ? (
        <Text style={[styles.ratio, isOver || isFull ? { color: filledColor } : null]}>
          {seatedDisplay}/{capacity}
        </Text>
      ) : null}

      {dots.map((pos, i) => (
        <SeatDot
          key={i}
          x={pos.x}
          y={pos.y}
          dotR={dotR}
          filled={i < filledDots}
          filledColor={filledColor!}
          emptyColor={emptyColor!}
          emptyBorderColor={emptyBorderColor!}
        />
      ))}

      <View
        style={[
          styles.center,
          {
            width: centerR * 2,
            height: centerR * 2,
            borderRadius: centerR,
            left: cx - centerR,
            top: cy - centerR,
            backgroundColor: centerBgColor,
          },
        ]}
      >
        <Text style={[styles.number, { fontSize: numFontSize, color: numberColor }]} numberOfLines={1}>
          {tableNumber}
        </Text>
      </View>
    </View>
  );
}

function KnightSeatRing({
  tableNumber,
  seated,
  capacity,
  width,
  height,
  orientation = 'column',
  filledColor,
  emptyColor,
  emptyBorderColor,
  centerBgColor,
  numberColor,
  showRatio,
}: TableSeatRingProps & { width: number; height: number }) {
  const safeW = Math.max(40, width);
  const safeH = Math.max(56, height);
  const dotR = knightDotRadius(capacity, safeW, safeH);
  const isVertical = orientation === 'column';
  const numFontSize = Math.max(10, Math.min(16, Math.min(safeW, safeH) * 0.2));

  const dots = useMemo(
    () => knightSeatPositions(capacity, safeW, safeH, orientation, dotR),
    [capacity, safeW, safeH, orientation, dotR],
  );

  const seatedDisplay = Math.max(0, seated);
  const isOver = capacity > 0 && seatedDisplay > capacity;
  const isFull = capacity > 0 && seatedDisplay === capacity;
  const filledDots = capacity > 0 ? Math.min(capacity, seatedDisplay) : 0;

  const centerW = isVertical ? safeW * 0.28 : safeW * 0.48;
  const centerH = isVertical ? safeH * 0.36 : safeH * 0.3;
  const centerLeft = (safeW - centerW) / 2;
  const centerTop = (safeH - centerH) / 2;

  return (
    <View style={[styles.wrap, { width: safeW, height: safeH }]}>
      {showRatio && capacity > 0 ? (
        <Text style={[styles.ratio, isOver || isFull ? { color: filledColor } : null]}>
          {seatedDisplay}/{capacity}
        </Text>
      ) : null}

      {dots.map((pos, i) => (
        <SeatDot
          key={i}
          x={pos.x}
          y={pos.y}
          dotR={dotR}
          filled={i < filledDots}
          filledColor={filledColor!}
          emptyColor={emptyColor!}
          emptyBorderColor={emptyBorderColor!}
        />
      ))}

      <View
        style={[
          styles.knightCenter,
          {
            width: centerW,
            height: centerH,
            left: centerLeft,
            top: centerTop,
            backgroundColor: centerBgColor,
          },
        ]}
      >
        <Text style={[styles.number, { fontSize: numFontSize, color: numberColor }]} numberOfLines={1}>
          {tableNumber}
        </Text>
      </View>
    </View>
  );
}

export function TableSeatRing({
  layout = 'round',
  width,
  height,
  size,
  orientation = 'column',
  filledColor = '#06173d',
  emptyColor = '#FFFFFF',
  emptyBorderColor = 'rgba(148,163,184,0.55)',
  centerBgColor = '#F3EDE4',
  numberColor = '#06173d',
  ...rest
}: TableSeatRingProps) {
  if (layout === 'knight') {
    const ringW = width ?? size;
    const ringH = height ?? size;
    return (
      <KnightSeatRing
        {...rest}
        size={size}
        width={ringW}
        height={ringH}
        orientation={orientation}
        filledColor={filledColor}
        emptyColor={emptyColor}
        emptyBorderColor={emptyBorderColor}
        centerBgColor={centerBgColor}
        numberColor={numberColor}
      />
    );
  }

  return (
    <RoundSeatRing
      {...rest}
      size={size}
      filledColor={filledColor}
      emptyColor={emptyColor}
      emptyBorderColor={emptyBorderColor}
      centerBgColor={centerBgColor ?? '#E8EDF3'}
      numberColor={numberColor}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratio: {
    position: 'absolute',
    top: 2,
    right: 2,
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(15,23,42,0.72)',
    zIndex: 2,
  },
  dot: {
    position: 'absolute',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  knightCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    zIndex: 1,
  },
  number: {
    fontWeight: '900',
    textAlign: 'center',
  },
});
