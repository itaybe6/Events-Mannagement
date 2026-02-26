import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { CELL_SIZE, TABLE_LABELS, clamp, tableCellSize, type Orientation, type TableType } from './_types';

function hexToRgba(hex: string, alpha: number) {
  const raw = String(hex || '').trim().replace('#', '');
  if (raw.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function isHex6(color: string) {
  return typeof color === 'string' && color.startsWith('#') && color.length === 7;
}

function clampAlpha(a: number) {
  if (!Number.isFinite(a)) return 0;
  return Math.max(0, Math.min(1, a));
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
  getTableSubLabel,
  hideTableType,
  getTableBaseColor,
  getTableBackgroundAlpha,
  getTableBorderAlpha,
  showTableBorder,
  isTableSelected,
  selectedRingColor,
}: {
  gridCols: number;
  gridRows: number;
  tables: TableItem[];
  zones: ZoneItem[];
  labels: LabelItem[];
  onPressTableNumber?: (num: number | undefined) => void;
  getTableTooltip?: (t: TableItem) => string | null;
  getTableSubLabel?: (t: TableItem) => string | null;
  hideTableType?: boolean;
  getTableBaseColor?: (t: TableItem) => string | null;
  getTableBackgroundAlpha?: (t: TableItem) => number | null;
  getTableBorderAlpha?: (t: TableItem) => number | null;
  showTableBorder?: boolean;
  isTableSelected?: (t: TableItem) => boolean;
  selectedRingColor?: string;
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

    const pad = 1;
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
  const stageRef = useRef<any>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  const fitZoom = useMemo(() => {
    const vw = viewport?.w ?? 0;
    const vh = viewport?.h ?? 0;
    if (!vw || !vh) return 1;
    const pad = 0;
    const sx = (vw - pad * 2) / Math.max(1, baseW);
    const sy = (vh - pad * 2) / Math.max(1, baseH);
    // Allow zoom-in so the map can fill the available window space.
    return clamp(Math.min(sx, sy), 0.2, 12);
  }, [baseH, baseW, viewport?.h, viewport?.w]);

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const fitZoomRef = useRef(1);
  const lastAutoFitTokenRef = useRef<string>('');
  const wheelRafRef = useRef<number | null>(null);
  const pendingZoomAnchorRef = useRef<null | { clientX: number; clientY: number; contentX: number; contentY: number; zoom: number }>(
    null
  );

  useEffect(() => {
    fitZoomRef.current = fitZoom;
  }, [fitZoom]);

  // Auto-fit when content OR viewport changes so the map fills the window.
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
        Math.round(viewport?.w ?? 0),
        Math.round(viewport?.h ?? 0),
      ].join('|'),
    [
      contentRect.cols,
      contentRect.originX,
      contentRect.originY,
      contentRect.rows,
      labels.length,
      tables.length,
      zones.length,
      viewport?.h,
      viewport?.w,
    ]
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

  const getStageEl = useCallback(() => {
    const refEl = stageRef.current as any;
    if (refEl?.getBoundingClientRect) return refEl;
    const wa = workAreaRef.current as any;
    const q = wa?.querySelector?.('[data-seating-stage="1"]');
    return q || null;
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

      e?.preventDefault?.();
      e?.stopPropagation?.();

      const el = workAreaRef.current as any;
      if (!el) return;

      const cur = zoomRef.current || 1;
      const factor = dy < 0 ? 1.06 : 1 / 1.06;
      const minZoom = fitZoomRef.current || 0.2;
      const maxZoom = Math.max(minZoom, Math.min(12, minZoom * 2.2));
      const next = clamp(cur * factor, minZoom, maxZoom);
      if (next === cur) return;

      const cx = e?.clientX ?? e?.nativeEvent?.clientX ?? 0;
      const cy = e?.clientY ?? e?.nativeEvent?.clientY ?? 0;

      // Measure actual DOM positions to find the content coordinate under the cursor.
      // This is robust to padding + horizontal centering (alignSelf: 'center') and scroll.
      const stageEl = getStageEl();
      const workRect = el?.getBoundingClientRect?.() ?? null;
      const stageRect = stageEl?.getBoundingClientRect?.() ?? null;
      if (!workRect) return;

      // Mouse inside the scroll container's viewport
      const mouseX = cx - workRect.left;
      const mouseY = cy - workRect.top;

      // Content coordinate (unscaled) under the cursor
      let contentX = (mouseX + (Number(el.scrollLeft) || 0)) / cur;
      let contentY = (mouseY + (Number(el.scrollTop) || 0)) / cur;
      if (stageRect) {
        // stageRect.left/top already include scroll; convert to content coordinate:
        // x_in_stage_px = (cx - stageRect.left)
        contentX = (cx - stageRect.left) / cur;
        contentY = (cy - stageRect.top) / cur;
      }

      zoomRef.current = next;
      setZoom(next);

      // Apply scroll in a rAF so DOM updates for new zoom.
      pendingZoomAnchorRef.current = { clientX: cx, clientY: cy, contentX, contentY, zoom: next };
      if (wheelRafRef.current == null && typeof requestAnimationFrame === 'function') {
        // Double rAF to ensure React commit + layout are complete.
        wheelRafRef.current = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            wheelRafRef.current = null;
            const a = pendingZoomAnchorRef.current;
            pendingZoomAnchorRef.current = null;
            if (!a) return;
            try {
              const el2 = workAreaRef.current as any;
              if (!el2) return;
              const stage2 = getStageEl();
              const workRect2 = el2?.getBoundingClientRect?.() ?? null;
              const stageRect2 = stage2?.getBoundingClientRect?.() ?? null;
              if (!workRect2) return;

              const mouseX2 = a.clientX - workRect2.left;
              const mouseY2 = a.clientY - workRect2.top;

              // stage offset in scroll-content coordinates (independent of scroll position)
              const stageOffsetX = stageRect2 ? stageRect2.left - workRect2.left + (Number(el2.scrollLeft) || 0) : 0;
              const stageOffsetY = stageRect2 ? stageRect2.top - workRect2.top + (Number(el2.scrollTop) || 0) : 0;

              const desiredLeft = a.contentX * a.zoom + stageOffsetX - mouseX2;
              const desiredTop = a.contentY * a.zoom + stageOffsetY - mouseY2;

              const maxLeft = Math.max(0, (Number(el2.scrollWidth) || 0) - (Number(el2.clientWidth) || 0));
              const maxTop = Math.max(0, (Number(el2.scrollHeight) || 0) - (Number(el2.clientHeight) || 0));

              const clampedLeft = clamp(desiredLeft, 0, maxLeft);
              const clampedTop = clamp(desiredTop, 0, maxTop);

              if (el2?.scrollTo) el2.scrollTo({ left: clampedLeft, top: clampedTop, behavior: 'auto' });
              else {
                if (typeof el2?.scrollLeft === 'number') el2.scrollLeft = clampedLeft;
                if (typeof el2?.scrollTop === 'number') el2.scrollTop = clampedTop;
              }
            } catch {
              // ignore
            }
          });
        });
      }
    },
    [getStageEl, isWeb]
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

  return (
    <View style={styles.root}>
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

        <View
          ref={stageRef}
          {...({ 'data-seating-stage': '1' } as any)}
          style={[styles.gridWrap, { width: stageW, height: stageH }]}
        >
          <View style={[styles.gridInner, { width: baseW, height: baseH, transform: [{ scale: zoom }] }]}>
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
              const baseDefault = t.type === 'reserve' ? '#F59E0B' : t.type === 'knight' ? '#7C3AED' : '#2563EB';
              const base = (getTableBaseColor?.(t) ?? baseDefault) || baseDefault;
              const selected = Boolean(isTableSelected?.(t));
              const ringBase = selectedRingColor && String(selectedRingColor).trim() ? String(selectedRingColor).trim() : base;

              const bgAlpha = getTableBackgroundAlpha?.(t);
              const borderAlpha = getTableBorderAlpha?.(t);
              const borderOn = showTableBorder !== false;

              const bg =
                typeof bgAlpha === 'number' && isHex6(base)
                  ? hexToRgba(base, clampAlpha(bgAlpha))
                  : isHex6(base)
                    ? `${base}22`
                    : base;

              const borderColor =
                typeof borderAlpha === 'number' && isHex6(base)
                  ? hexToRgba(base, clampAlpha(borderAlpha))
                  : isHex6(base)
                    ? `${base}55`
                    : 'rgba(15,23,42,0.18)';

              const tip = getTableTooltip?.(t) ?? null;
              const sub = getTableSubLabel?.(t) ?? null;
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
                    selected ? styles.tableSelected : null,
                    selected
                      ? ({
                          borderWidth: 0,
                          ...(Platform.OS === 'web'
                            ? ({ boxShadow: `0 0 0 3px ${hexToRgba(isHex6(ringBase) ? ringBase : '#06173e', 0.35)}` } as any)
                            : null),
                        } as any)
                      : null,
                    {
                      left: (t.gridX - contentRect.originX) * CELL_SIZE,
                      top: (t.gridY - contentRect.originY) * CELL_SIZE,
                      width: sz.w * CELL_SIZE,
                      height: sz.h * CELL_SIZE,
                      backgroundColor: bg,
                      borderWidth: borderOn ? 1 : 0,
                      borderColor: borderOn ? borderColor : 'transparent',
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.tableNum, { color: base }]}>{t.number ?? ''}</Text>
                  {!hideTableType ? <Text style={styles.tableType}>{TABLE_LABELS[t.type]}</Text> : null}
                  {sub ? <Text style={styles.tableSub}>{sub}</Text> : null}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  workArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 0,
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
  },
  gridWrap: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.55)',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  gridInner: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: '0 0' as any,
  },

  table: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableSelected: {
    transform: [{ scale: 1.02 }],
    shadowColor: '#06173e',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  tableNum: { fontSize: 16, fontWeight: '900' },
  tableType: { marginTop: 2, fontSize: 11, fontWeight: '800', color: 'rgba(17,24,39,0.60)' },
  tableSub: { marginTop: 3, fontSize: 11, fontWeight: '900', color: 'rgba(17,24,39,0.78)' },

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
  zoneText: { fontWeight: '900', color: 'rgba(17,24,39,0.65)' },

  labelWrap: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(17,24,39,0.02)',
  },
  labelText: { fontWeight: '800', color: 'rgba(17,24,39,0.62)' },
});

// expo-router treats files under `app/` as routes on web; provide a default export.
export default SeatingGridReadonly;
