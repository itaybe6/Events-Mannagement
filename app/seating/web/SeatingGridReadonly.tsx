import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { GestureHandlerRootView, PinchGestureHandler, State as GHState } from 'react-native-gesture-handler';
import { CELL_SIZE, clamp, tableCellSize, type Orientation, type TableType } from './types';
import { colors } from '@/constants/colors';

function hexToRgba(hex: string, alpha: number) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function getWebScroller(start: any) {
  // react-native-web sometimes nests the actual scrolling element.
  // We climb a few levels to find an element with scrollTop/scrollLeft.
  let el = start;
  for (let i = 0; i < 5 && el; i++) {
    if (typeof el.scrollTop === 'number' && typeof el.scrollLeft === 'number') return el;
    el = el.parentElement || el.parentNode;
  }
  return start;
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
  getTableSeatedCount,
}: {
  gridCols: number;
  gridRows: number;
  tables: TableItem[];
  zones: ZoneItem[];
  labels: LabelItem[];
  onPressTableNumber?: (num: number | undefined) => void;
  getTableTooltip?: (t: TableItem) => string | null;
  getTableSubLabel?: (t: TableItem) => string | null;
  getTableSeatedCount?: (t: TableItem) => number | null;
}) {
  const isWeb = Platform.OS === 'web';
  const vScrollRef = useRef<ScrollView>(null);
  const hScrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const scrollYRef = useRef(0);
  const rafScrollRef = useRef<number | null>(null);

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

    // Cell padding around content: keep some breathing room, but not so much
    // that the initial "fit" feels overly zoomed-out (especially on web).
    const pad = isWeb ? 2 : 3;
    const ox = clamp(Math.floor(minX) - pad, 0, Math.max(0, gridCols - 1));
    const oy = clamp(Math.floor(minY) - pad, 0, Math.max(0, gridRows - 1));
    const ex = clamp(Math.ceil(maxX) + pad, 1, Math.max(1, gridCols));
    const ey = clamp(Math.ceil(maxY) + pad, 1, Math.max(1, gridRows));
    const cols = Math.max(1, ex - ox);
    const rows = Math.max(1, ey - oy);
    return { originX: ox, originY: oy, cols, rows };
  }, [gridCols, gridRows, isWeb, labels, tables, zones]);

  const baseW = contentRect.cols * CELL_SIZE;
  const baseH = contentRect.rows * CELL_SIZE;

  const workAreaRef = useRef<any>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  const fitZoom = useMemo(() => {
    const vw = viewport?.w ?? 0;
    const vh = viewport?.h ?? 0;
    if (!vw || !vh) return 1;
    // Smaller padding on web so the initial view feels more "zoomed in".
    const pad = isWeb ? 28 : 10;
    const sx = (vw - pad * 2) / Math.max(1, baseW);
    const sy = (vh - pad * 2) / Math.max(1, baseH);
    // Initial view should fit to viewport.
    // On web/desktop we allow a *controlled* upscale so the map doesn't look tiny
    // on large screens (while still clamping to a sensible max).
    // Note: content can be very small (few tables), so we allow controlled upscale.
    // This is especially important on native landscape, otherwise the map can look "zoomed out".
    const maxFit = isWeb ? 8.0 : 3.0;
    const fit = Math.min(maxFit, sx, sy);
    // Web default: start slightly closer than "perfect fit".
    const boost = isWeb ? 1.085 : 1.28;
    return clamp(fit * boost, 0.2, maxFit);
  }, [baseH, baseW, isWeb, viewport?.h, viewport?.w]);

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const fitZoomRef = useRef(1);
  const userAdjustedZoomRef = useRef(false);
  const lastAutoFitTokenRef = useRef<string>('');
  const minZoomRef = useRef(0.2);
  const maxZoomRef = useRef(3);
  const pinchStartZoomRef = useRef(1);
  const pendingWebScrollRef = useRef<null | { left: number; top: number }>(null);

  useEffect(() => {
    fitZoomRef.current = fitZoom;
    // Allow zoom-out smaller than the initial fit.
    minZoomRef.current = 0.2;
    // Allow higher zoom ceilings, otherwise the initial "fit" (which can upscale)
    // could exceed maxZoom on native landscape.
    maxZoomRef.current = clamp(fitZoom * 2.2, Math.max(3, fitZoom), 10);
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

    // Content changed => reset to "fit" and consider this as a fresh view.
    userAdjustedZoomRef.current = false;
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

  // Responsive behavior:
  // When only the viewport changes (window resize / layout), re-fit *only if*
  // the user has not manually zoomed since the last auto-fit.
  useEffect(() => {
    if (!viewport?.w || !viewport?.h) return;
    if (userAdjustedZoomRef.current) return;
    const next = fitZoom;
    const cur = zoomRef.current || 1;
    if (Math.abs(cur - next) < 0.001) return;
    setZoom(next);
    zoomRef.current = next;
  }, [fitZoom, isWeb, viewport?.h, viewport?.w]);

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
    const cur = zoomRef.current || 1;
    const next = clamp((pinchStartZoomRef.current || 1) * scale, min, max);

    // Keep the zoom anchored under the pinch focal point (native).
    // Without this, zoom feels like it always “pulls” toward the same place.
    if (!isWeb) {
      const fx = Number(e?.nativeEvent?.focalX ?? 0) || 0;
      const fy = Number(e?.nativeEvent?.focalY ?? 0) || 0;
      const baseX = (scrollXRef.current + fx) / Math.max(0.0001, cur);
      const baseY = (scrollYRef.current + fy) / Math.max(0.0001, cur);
      const nextX = baseX * next - fx;
      const nextY = baseY * next - fy;

      if (rafScrollRef.current != null) cancelAnimationFrame(rafScrollRef.current);
      rafScrollRef.current = requestAnimationFrame(() => {
        rafScrollRef.current = null;
        try {
          hScrollRef.current?.scrollTo({ x: Math.max(0, nextX), animated: false });
          vScrollRef.current?.scrollTo({ y: Math.max(0, nextY), animated: false });
        } catch {
          // ignore
        }
      });
    }

    userAdjustedZoomRef.current = true;
    zoomRef.current = next;
    setZoom(next);
  }, [isWeb]);

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
      const rawEl = workAreaRef.current as any;
      const el = getWebScroller(rawEl);

      // Shift + wheel = scroll (vertical)
      if (e?.shiftKey) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        try {
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
      const minZoom = 0.2;
      const base = Math.max(1, fitZoomRef.current || 1);
      const maxZoom = isWeb ? clamp(base * 2.2, Math.max(3, base), 10) : Math.min(3, Math.max(base, base * 1.7));
      const next = clamp(cur * factor, minZoom, maxZoom);

      // Keep the zoom anchored under the mouse cursor (web).
      // Without this, zoom feels like it always pulls toward a fixed corner.
      const clientX = e?.clientX ?? e?.nativeEvent?.clientX;
      const clientY = e?.clientY ?? e?.nativeEvent?.clientY;
      let px = (viewport?.w ?? 0) / 2;
      let py = (viewport?.h ?? 0) / 2;
      try {
        const r = el?.getBoundingClientRect?.();
        if (r && typeof clientX === 'number' && typeof clientY === 'number') {
          px = clientX - r.left;
          py = clientY - r.top;
        }
      } catch {
        // ignore
      }

      const scrollLeft = Number(el?.scrollLeft ?? 0) || 0;
      const scrollTop = Number(el?.scrollTop ?? 0) || 0;
      const baseX = (scrollLeft + px) / Math.max(0.0001, cur);
      const baseY = (scrollTop + py) / Math.max(0.0001, cur);
      const nextLeft = baseX * next - px;
      const nextTop = baseY * next - py;

      userAdjustedZoomRef.current = true;
      zoomRef.current = next;
      pendingWebScrollRef.current = { left: nextLeft, top: nextTop };
      setZoom(next);
    },
    [isWeb, viewport?.h, viewport?.w]
  );

  // After zoom updates the layout (stageW/H), apply the pending scroll so the cursor anchor sticks.
  useEffect(() => {
    if (!isWeb) return;
    const pending = pendingWebScrollRef.current;
    if (!pending) return;
    const el = getWebScroller(workAreaRef.current as any);
    if (!el) return;

    if (rafScrollRef.current != null) cancelAnimationFrame(rafScrollRef.current);
    rafScrollRef.current = requestAnimationFrame(() => {
      rafScrollRef.current = null;
      // One extra frame helps ensure layout has applied (scrollWidth/Height updated).
      requestAnimationFrame(() => {
        try {
          const el2 = getWebScroller(workAreaRef.current as any);
          if (!el2) return;
          const maxLeft = Math.max(0, Number(el2.scrollWidth ?? 0) - Number(el2.clientWidth ?? 0));
          const maxTop = Math.max(0, Number(el2.scrollHeight ?? 0) - Number(el2.clientHeight ?? 0));
          el2.scrollLeft = clamp(pending.left, 0, maxLeft);
          el2.scrollTop = clamp(pending.top, 0, maxTop);
        } catch {
          // ignore
        } finally {
          // Clear after attempt (avoid re-applying on unrelated zoom changes)
          if (pendingWebScrollRef.current === pending) pendingWebScrollRef.current = null;
        }
      });
    });
  }, [isWeb, zoom]);

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
            ref={vScrollRef}
            style={{ flex: 1, alignSelf: 'stretch' }}
            onScroll={(ev) => {
              const y = ev?.nativeEvent?.contentOffset?.y;
              if (typeof y === 'number') scrollYRef.current = y;
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            <ScrollView
              ref={hScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={(ev) => {
                const x = ev?.nativeEvent?.contentOffset?.x;
                if (typeof x === 'number') scrollXRef.current = x;
              }}
              scrollEventThrottle={16}
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
                    const isReserve = t.type === 'reserve';
                    const seated = getTableSeatedCount?.(t);
                    const cap = Number(t.seats ?? 0) || 0;
                    const isFull = !isReserve && seated != null && cap > 0 && seated >= cap;
                    // Dark-blue translucent by default, turn FULL tables to translucent green.
                    const color = isReserve ? '#F59E0B' : isFull ? '#16A34A' : colors.yaleBlue;
                    const bg = hexToRgba(color, isReserve ? 0.13 : isFull ? 0.24 : 0.30);
                    const border = hexToRgba(color, isReserve ? 0.35 : isFull ? 0.44 : 0.40);
                    const sub = getTableSubLabel?.(t) ?? null;
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
              const isReserve = t.type === 'reserve';
              const seated = getTableSeatedCount?.(t);
              const cap = Number(t.seats ?? 0) || 0;
              const isFull = !isReserve && seated != null && cap > 0 && seated >= cap;
              // Use a visible brand blue for fills (primary is very dark and looks gray when translucent)
              // FULL tables become translucent green.
              const fillColor = isReserve ? '#F59E0B' : isFull ? '#16A34A' : colors.yaleBlue;
              const textColor = isReserve ? '#F59E0B' : isFull ? '#166534' : colors.primary;
              const tip = getTableTooltip?.(t) ?? null;
              const sub = getTableSubLabel?.(t) ?? null;
              // Use rgba (instead of 8-digit hex) for consistent native rendering.
              // Make non-reserve tables visibly "brand blue" (not gray).
              // Dark-blue translucent: keep it transparent but push saturation so it doesn't read as gray.
              const bg = hexToRgba(fillColor, isReserve ? 0.16 : isFull ? 0.24 : 0.30);
              const border = hexToRgba(fillColor, isReserve ? 0.35 : isFull ? 0.44 : 0.40);
              const glow = hexToRgba(fillColor, isReserve ? 0.28 : isFull ? 0.24 : 0.26);
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
                  style={({ hovered, pressed }: any) => [
                    styles.table,
                    {
                      left: (t.gridX - contentRect.originX) * CELL_SIZE,
                      top: (t.gridY - contentRect.originY) * CELL_SIZE,
                      width: sz.w * CELL_SIZE,
                      height: sz.h * CELL_SIZE,
                      backgroundColor: bg,
                      borderColor: border,
                      opacity: pressed ? 0.9 : 1,
                      ...(Platform.OS === 'web'
                        ? ({
                            transform: [
                              { translateY: pressed ? 0 : hovered ? -1 : 0 },
                              { scale: pressed ? 0.99 : hovered ? 1.03 : 1 },
                            ],
                            transitionProperty: 'transform, box-shadow, filter, background-color',
                            transitionDuration: '520ms',
                            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                            boxShadow: hovered
                              ? `0 0 0 1px ${glow}, 0 14px 30px ${hexToRgba(fillColor, 0.16)}`
                              : `0 10px 22px ${hexToRgba(fillColor, 0.10)}`,
                            filter: isFull
                              ? hovered
                                ? 'saturate(1.25) brightness(1.03)'
                                : 'saturate(1.18) brightness(1.01)'
                              : hovered
                                ? 'saturate(1.42) brightness(1.03)'
                                : 'saturate(1.35) brightness(1.01)',
                          } as any)
                        : null),
                    },
                  ]}
                >
                  {({ hovered, pressed }: any) => (
                    <>
                      {/* Web-only shine layer */}
                      {Platform.OS === 'web' ? (
                        <View
                          pointerEvents="none"
                          style={[
                            styles.tableShine,
                            hovered && !pressed ? styles.tableShineOn : null,
                            ({
                              // A subtle highlight that feels "glassy"
                              backgroundImage:
                                'linear-gradient(135deg, rgba(255,255,255,0.46) 0%, rgba(255,255,255,0.0) 45%), radial-gradient(circle at 18% 22%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.0) 55%)',
                            } as any),
                          ]}
                        />
                      ) : null}

                      <Text style={[styles.tableNum, { color: textColor }]}>{t.number ?? ''}</Text>
                      {sub ? <Text style={styles.tableSub}>{sub}</Text> : null}
                    </>
                  )}
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
    fontFamily: 'Rubik_800ExtraBold' as any,
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
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableShine: {
    ...(StyleSheet.absoluteFill as any),
    borderRadius: 14,
    opacity: 0,
    ...(Platform.OS === 'web'
      ? ({
          transitionProperty: 'opacity',
          transitionDuration: '420ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        } as any)
      : null),
  },
  tableShineOn: { opacity: 0.55 },
  tableNum: { fontSize: 16, fontWeight: '700', fontFamily: 'Rubik_500Medium' as any },
  tableSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(17,24,39,0.70)',
    fontFamily: 'Rubik_900Black' as any,
  },
  tableType: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.60)',
    fontFamily: 'Rubik_800ExtraBold' as any,
  },

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
  zoneText: { fontWeight: '900', color: 'rgba(17,24,39,0.65)', fontFamily: 'Rubik_900Black' as any },

  labelWrap: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(17,24,39,0.02)',
  },
  labelText: { fontWeight: '800', color: 'rgba(17,24,39,0.62)', fontFamily: 'Rubik_800ExtraBold' as any },
});

