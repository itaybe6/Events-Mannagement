import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { GestureHandlerRootView, PinchGestureHandler, State as GHState } from 'react-native-gesture-handler';
import { CELL_SIZE, TABLE_LABELS, clamp, tableCellSize, type Orientation, type TableType } from './types';

function hexToRgba(hex: string, alpha: number) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

type TableItem = {
  id: string;
  type: TableType;
  seats: number;
  orientation: Orientation;
  gridX: number;
  gridY: number;
  number?: number;
};

type ZoneItem = {
  id: string;
  name: string;
  gridX: number;
  gridY: number;
  widthCells: number;
  heightCells: number;
};

type LabelItem = {
  id: string;
  text: string;
  gridX: number;
  gridY: number;
};

export function SeatingGridReadonly({
  gridCols,
  gridRows,
  tables,
  zones,
  labels,
  onPressTableNumber,
  getTableTooltip,
}: {
  gridCols: number;
  gridRows: number;
  tables: TableItem[];
  zones: ZoneItem[];
  labels: LabelItem[];
  onPressTableNumber?: (num: number | undefined) => void;
  getTableTooltip?: (t: TableItem) => string | null;
}) {
  const isWeb = Platform.OS === 'web';

  // Compute content bounds so we "fit" to content, not to an oversized empty grid.
  const contentRect = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = 0;
    let maxY = 0;

    const include = (x0: number, y0: number, x1: number, y1: number) => {
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    };

    for (const t of tables) {
      const sz = tableCellSize(t.type, t.seats, t.orientation);
      include(t.gridX, t.gridY, t.gridX + sz.w, t.gridY + sz.h);
    }
    for (const z of zones) {
      include(z.gridX, z.gridY, z.gridX + z.widthCells, z.gridY + z.heightCells);
    }
    for (const l of labels) {
      include(l.gridX, l.gridY, l.gridX + 1, l.gridY + 1);
    }

    const hasAny = Number.isFinite(minX) && Number.isFinite(minY);
    if (!hasAny) {
      // No content: fall back to full grid
      return { originX: 0, originY: 0, cols: Math.max(1, gridCols), rows: Math.max(1, gridRows) };
    }

    const pad = 4;
    const ox = clamp(Math.floor(minX) - pad, 0, Math.max(0, gridCols - 1));
    const oy = clamp(Math.floor(minY) - pad, 0, Math.max(0, gridRows - 1));
    const ex = clamp(Math.ceil(maxX) + pad, 1, Math.max(1, gridCols));
    const ey = clamp(Math.ceil(maxY) + pad, 1, Math.max(1, gridRows));
    const cols = Math.max(1, ex - ox);
    const rows = Math.max(1, ey - oy);
    return { originX: ox, originY: oy, cols, rows };
  }, [gridCols, gridRows, labels, tables, zones]);

  const baseW = contentRect.cols * CELL_SIZE;
  const baseH = contentRect.rows * CELL_SIZE;

  const workAreaRef = useRef<any>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  const fitZoom = useMemo(() => {
    const vw = viewport?.w ?? 0;
    const vh = viewport?.h ?? 0;
    if (!vw || !vh) return 1;
    const pad = isWeb ? 44 : 18;
    const sx = (vw - pad * 2) / Math.max(1, baseW);
    const sy = (vh - pad * 2) / Math.max(1, baseH);
    // Initial view should be "max zoom-out": fit to viewport (no upscaling).
    const maxFit = 1;
    return clamp(Math.min(maxFit, sx, sy), 0.2, maxFit);
  }, [baseH, baseW, isWeb, viewport?.h, viewport?.w]);

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const fitZoomRef = useRef(1);
  const lastAutoFitTokenRef = useRef<string>('');
  const minZoomRef = useRef(0.2);
  const maxZoomRef = useRef(3);
  const pinchStartZoomRef = useRef(1);

  useEffect(() => {
    fitZoomRef.current = fitZoom;
    // Don't allow zoom-out smaller than initial fit.
    minZoomRef.current = fitZoom;
    maxZoomRef.current = Math.min(3, Math.max(fitZoom, fitZoom * 3));
  }, [fitZoom]);

  // Auto-fit only when the CONTENT changes (not on every viewport/layout change),
  // otherwise the map can "shrink" after a late layout re-measure.
  const autoFitToken = useMemo(
    () =>
      [
        contentRect.originX,
        contentRect.originY,
        contentRect.cols,
        contentRect.rows,
        tables.length,
        zones.length,
        labels.length,
      ].join('|'),
    [contentRect.cols, contentRect.originX, contentRect.originY, contentRect.rows, labels.length, tables.length, zones.length]
  );

  useEffect(() => {
    if (!viewport?.w || !viewport?.h) return;
    if (lastAutoFitTokenRef.current === autoFitToken) return;
    lastAutoFitTokenRef.current = autoFitToken;

    setZoom(fitZoom);
    zoomRef.current = fitZoom;

    if (isWeb) {
      const el = workAreaRef.current as any;
      try {
        if (el?.scrollTo) el.scrollTo({ left: 0, top: 0, behavior: 'auto' });
        else {
          if (typeof el?.scrollLeft === 'number') el.scrollLeft = 0;
          if (typeof el?.scrollTop === 'number') el.scrollTop = 0;
        }
      } catch {
        // ignore
      }
    }
  }, [autoFitToken, fitZoom, isWeb, viewport?.h, viewport?.w]);

  const stageW = baseW * zoom;
  const stageH = baseH * zoom;

  const [tooltip, setTooltip] = useState<null | { text: string; x: number; y: number }>(null);
  const [tooltipSize, setTooltipSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const innerTransform = useMemo(() => {
    // Keep scaling centered (better for viewer), and center the content via layout.
    return [{ scale: zoom }] as any;
  }, [baseH, baseW, isWeb, zoom]);

  const onPinchGestureEvent = useCallback((e: any) => {
    const scale = e?.nativeEvent?.scale ?? 1;
    const min = minZoomRef.current || 0.2;
    const max = maxZoomRef.current || 3;
    const next = clamp((pinchStartZoomRef.current || 1) * scale, min, max);
    zoomRef.current = next;
    setZoom(next);
  }, []);

  const onPinchStateChange = useCallback((e: any) => {
    const state = e?.nativeEvent?.state;
    if (state === GHState.BEGAN || state === GHState.ACTIVE) {
      pinchStartZoomRef.current = zoomRef.current || 1;
    }
    if (state === GHState.END || state === GHState.CANCELLED || state === GHState.FAILED) {
      pinchStartZoomRef.current = zoomRef.current || 1;
    }
  }, []);

  const handleWheel = useCallback(
    (e: any) => {
      if (!isWeb) return;
      const dy = e?.deltaY ?? e?.nativeEvent?.deltaY ?? 0;

      // Shift + wheel = scroll (vertical)
      if (e?.shiftKey) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        try {
          const el = workAreaRef.current as any;
          if (el) el.scrollTop = (el.scrollTop || 0) + dy;
        } catch {
          // ignore
        }
        return;
      }

      // Wheel (no Shift) = zoom only
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const cur = zoomRef.current || 1;
      const factor = dy < 0 ? 1.06 : 1 / 1.06;
      // Limit zoom-in so users can't zoom excessively.
      const minZoom = fitZoomRef.current || 0.2;
      const maxZoom = Math.min(2, Math.max(minZoom, minZoom * 1.7));
      const next = clamp(cur * factor, minZoom, maxZoom);
      zoomRef.current = next;
      setZoom(next);
    },
    [isWeb]
  );

  // Attach a non-passive wheel listener so preventDefault blocks scroll on web.
  useEffect(() => {
    if (!isWeb) return;
    const el = workAreaRef.current as any;
    if (!el?.addEventListener) return;
    const listener = (ev: WheelEvent) => handleWheel(ev);
    el.addEventListener('wheel', listener, { passive: false });
    return () => el.removeEventListener('wheel', listener as any);
  }, [handleWheel, isWeb]);

  const Root = isWeb ? View : GestureHandlerRootView;

  return (
    <Root style={styles.root}>
      <View
        ref={workAreaRef}
        style={styles.workArea}
        onLayout={(e) => {
          const w = e?.nativeEvent?.layout?.width;
          const h = e?.nativeEvent?.layout?.height;
          if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) setViewport({ w, h });
        }}
      >
        {isWeb && tooltip ? (
          <View
            pointerEvents="none"
            onLayout={(e) => {
              const w = e?.nativeEvent?.layout?.width;
              const h = e?.nativeEvent?.layout?.height;
              if (typeof w === 'number' && typeof h === 'number' && (w !== tooltipSize.w || h !== tooltipSize.h)) {
                setTooltipSize({ w, h });
              }
            }}
            style={[
              styles.tooltip,
              {
                left: tooltip.x,
                top: tooltip.y,
                transform: [
                  { translateX: -(tooltipSize.w || 0) / 2 },
                  { translateY: -((tooltipSize.h || 0) + 10) },
                ],
              },
            ]}
          >
            <Text style={styles.tooltipText}>{tooltip.text}</Text>
          </View>
        ) : null}

        {/* Native: allow panning by scrollviews. Web: overflow is already handled via CSS. */}
        {!isWeb ? (
          <ScrollView
            style={{ flex: 1, alignSelf: 'stretch' }}
            contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }}
            showsVerticalScrollIndicator={false}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <PinchGestureHandler onGestureEvent={onPinchGestureEvent} onHandlerStateChange={onPinchStateChange}>
                <View collapsable={false} style={[styles.gridWrap, styles.gridWrapNative, { width: stageW, height: stageH }]}>
                  <View style={[styles.gridInnerNative, { width: baseW, height: baseH, transform: innerTransform }]}>
                  <Svg width={baseW} height={baseH} style={StyleSheet.absoluteFill as any}>
                    <Defs>
                      <Pattern id="minor" x="0" y="0" width={CELL_SIZE} height={CELL_SIZE} patternUnits="userSpaceOnUse">
                        <Rect x="0" y="0" width={CELL_SIZE} height={CELL_SIZE} fill="transparent" />
                        <Line x1={CELL_SIZE} y1="0" x2="0" y2="0" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                        <Line x1="0" y1={CELL_SIZE} x2="0" y2="0" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                      </Pattern>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#minor)" />
                  </Svg>

                  {/* Zones */}
                  {zones.map(z => {
                    const left = (z.gridX - contentRect.originX) * CELL_SIZE;
                    const top = (z.gridY - contentRect.originY) * CELL_SIZE;
                    const w = z.widthCells * CELL_SIZE;
                    const h = z.heightCells * CELL_SIZE;
                    return (
                      <View key={z.id} style={[styles.zone, { left, top, width: w, height: h }]}>
                        <Text style={styles.zoneText}>{z.name}</Text>
                      </View>
                    );
                  })}

                  {/* Tables */}
                  {tables.map(t => {
                    const sz = tableCellSize(t.type, t.seats, t.orientation);
                    const color = t.type === 'reserve' ? '#F59E0B' : t.type === 'knight' ? '#7C3AED' : '#2563EB';
                    const bg = hexToRgba(color, 0.13);
                    const border = hexToRgba(color, 0.35);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => onPressTableNumber?.(t.number)}
                        style={[
                          styles.table,
                          {
                            left: (t.gridX - contentRect.originX) * CELL_SIZE,
                            top: (t.gridY - contentRect.originY) * CELL_SIZE,
                            width: sz.w * CELL_SIZE,
                            height: sz.h * CELL_SIZE,
                            backgroundColor: bg,
                            borderColor: border,
                          },
                        ]}
                      >
                        <Text style={[styles.tableNum, { color }]}>{t.number ?? ''}</Text>
                        <Text style={styles.tableType}>{TABLE_LABELS[t.type]}</Text>
                      </Pressable>
                    );
                  })}

                  {/* Labels */}
                  {labels.map(l => (
                    <View
                      key={l.id}
                      style={[
                        styles.labelWrap,
                        { left: (l.gridX - contentRect.originX) * CELL_SIZE, top: (l.gridY - contentRect.originY) * CELL_SIZE },
                      ]}
                    >
                      <Text style={styles.labelText}>{l.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
              </PinchGestureHandler>
            </ScrollView>
          </ScrollView>
        ) : (
          <View style={[styles.gridWrap, { width: stageW, height: stageH }]}>
            <View style={[styles.gridInnerWeb, { width: baseW, height: baseH, transform: innerTransform }]}>
            <Svg width={baseW} height={baseH} style={StyleSheet.absoluteFill as any}>
              <Defs>
                <Pattern id="minor" x="0" y="0" width={CELL_SIZE} height={CELL_SIZE} patternUnits="userSpaceOnUse">
                  <Rect x="0" y="0" width={CELL_SIZE} height={CELL_SIZE} fill="transparent" />
                  <Line x1={CELL_SIZE} y1="0" x2="0" y2="0" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                  <Line x1="0" y1={CELL_SIZE} x2="0" y2="0" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                </Pattern>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#minor)" />
            </Svg>

            {/* Zones */}
            {zones.map(z => {
              const left = (z.gridX - contentRect.originX) * CELL_SIZE;
              const top = (z.gridY - contentRect.originY) * CELL_SIZE;
              const w = z.widthCells * CELL_SIZE;
              const h = z.heightCells * CELL_SIZE;
              return (
                <View
                  key={z.id}
                  style={[
                    styles.zone,
                    { left, top, width: w, height: h },
                  ]}
                >
                  <Text style={styles.zoneText}>{z.name}</Text>
                </View>
              );
            })}

            {/* Tables */}
            {tables.map(t => {
              const sz = tableCellSize(t.type, t.seats, t.orientation);
              const color = t.type === 'reserve' ? '#F59E0B' : t.type === 'knight' ? '#7C3AED' : '#2563EB';
              const tip = getTableTooltip?.(t) ?? null;
              // Use rgba (instead of 8-digit hex) for consistent native rendering.
              const bg = hexToRgba(color, 0.13);
              const border = hexToRgba(color, 0.35);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => onPressTableNumber?.(t.number)}
                  {...(isWeb
                    ? ({
                        onHoverIn: (e: any) => {
                          if (!tip) return;
                          try {
                            const wa = (workAreaRef.current as any)?.getBoundingClientRect?.();
                            const tr = (e?.currentTarget as any)?.getBoundingClientRect?.();
                            if (wa && tr) {
                              const x = tr.left - wa.left + tr.width / 2;
                              const y = tr.top - wa.top; // anchor to top edge of table
                              setTooltip({ text: tip, x, y });
                              return;
                            }
                          } catch {
                            // ignore
                          }
                          // Fallback: use pointer position relative to work area
                          const x = e?.clientX ?? e?.nativeEvent?.clientX ?? 0;
                          const y = e?.clientY ?? e?.nativeEvent?.clientY ?? 0;
                          setTooltip({ text: tip, x, y });
                        },
                        onHoverOut: () => setTooltip(null),
                      } as any)
                    : null)}
                  style={({ pressed }) => [
                    styles.table,
                    {
                      left: (t.gridX - contentRect.originX) * CELL_SIZE,
                      top: (t.gridY - contentRect.originY) * CELL_SIZE,
                      width: sz.w * CELL_SIZE,
                      height: sz.h * CELL_SIZE,
                      backgroundColor: bg,
                      borderColor: border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.tableNum, { color }]}>{t.number ?? ''}</Text>
                  <Text style={styles.tableType}>{TABLE_LABELS[t.type]}</Text>
                </Pressable>
              );
            })}

            {/* Labels */}
            {labels.map(l => (
              <View
                key={l.id}
                style={[
                  styles.labelWrap,
                  { left: (l.gridX - contentRect.originX) * CELL_SIZE, top: (l.gridY - contentRect.originY) * CELL_SIZE },
                ]}
              >
                <Text style={styles.labelText}>{l.text}</Text>
              </View>
            ))}
          </View>
        </View>
        )}
      </View>
    </Root>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  workArea: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    ...(Platform.OS === 'web' ? ({ overflow: 'auto', userSelect: 'none', WebkitUserSelect: 'none' } as any) : null),
  },
  tooltip: {
    position: 'absolute',
    zIndex: 2000,
    maxWidth: 220,
    borderRadius: 10,
    backgroundColor: 'rgba(17,24,39,0.86)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  gridWrap: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.55)',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  gridWrapNative: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridInnerWeb: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: '0 0' as any,
  },
  gridInnerNative: {
    position: 'relative',
  },

  table: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableNum: { fontSize: 16, fontWeight: '900', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  tableType: { marginTop: 2, fontSize: 11, fontWeight: '800', color: 'rgba(17,24,39,0.60)', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  zone: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed' as any,
    borderColor: 'rgba(148,163,184,0.65)',
    backgroundColor: 'rgba(43,140,238,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneText: { fontWeight: '900', color: 'rgba(17,24,39,0.65)', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  labelWrap: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(17,24,39,0.02)',
  },
  labelText: { fontWeight: '800', color: 'rgba(17,24,39,0.62)', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
});

