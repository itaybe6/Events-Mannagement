import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  CELL_SIZE,
  GRID_COLS,
  GRID_ROWS,
  TABLE_LABELS,
  clamp,
  tableCellSize,
  type SeatingItemKind,
} from './types';
import type { UseSeatingStateApi } from './useSeatingState';

type Guides = {
  v: number[]; // x in cells
  h: number[]; // y in cells
};

type DragState =
  | null
  | {
      kind: SeatingItemKind;
      id: string;
      groupIds: string[];
      startById: Map<string, { x: number; y: number }>;
      startClient: { x: number; y: number };
      draftById: Map<string, { x: number; y: number }>;
    };

type ResizeState =
  | null
  | {
      id: string;
      handle: 'right' | 'bottom' | 'corner';
      startClient: { x: number; y: number };
      start: { w: number; h: number };
    };

type EditState =
  | null
  | { kind: SeatingItemKind; id: string; value: string; mode: 'number' | 'text' };

type ActiveEditState = NonNullable<EditState>;

export function SeatingGrid({ api }: { api: UseSeatingStateApi }) {
  const isWeb = Platform.OS === 'web';
  const gridW = GRID_COLS * CELL_SIZE;
  const gridH = GRID_ROWS * CELL_SIZE;

  const gridRef = useRef<any>(null);

  const [drag, setDrag] = useState<DragState>(null);
  const [resize, setResize] = useState<ResizeState>(null);
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] });
  const [marquee, setMarquee] = useState<null | { start: { x: number; y: number }; cur: { x: number; y: number } }>(null);
  const [edit, setEdit] = useState<EditState>(null);

  const selected = api.selectedIds;

  const getGridRect = useCallback(() => {
    const el = gridRef.current as any;
    if (!el?.getBoundingClientRect) return null;
    return el.getBoundingClientRect() as DOMRect;
  }, []);

  const clientToLocalPx = useCallback(
    (clientX: number, clientY: number) => {
      const rect = getGridRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [getGridRect]
  );

  const pxToCell = useCallback((px: number) => Math.round(px / CELL_SIZE), []);
  const clampCell = useCallback((x: number, y: number, w: number, h: number) => {
    return {
      x: clamp(x, 0, Math.max(0, GRID_COLS - w)),
      y: clamp(y, 0, Math.max(0, GRID_ROWS - h)),
    };
  }, []);

  const elementAtTargetIsItem = useCallback((e: any) => {
    try {
      const t = e?.target as any;
      return !!t?.closest?.('[data-seating-item="1"]');
    } catch {
      return false;
    }
  }, []);

  const computeTableGuides = useCallback(
    (activeId: string, draftX: number, draftY: number) => {
      const active = api.tables.find(t => t.id === activeId);
      if (!active) return { v: [], h: [] };
      const sz = tableCellSize(active.type, active.seats, active.orientation);

      const axL = draftX;
      const axR = draftX + sz.w;
      const axC = draftX + sz.w / 2;
      const ayT = draftY;
      const ayB = draftY + sz.h;
      const ayC = draftY + sz.h / 2;

      const tol = 2; // cells
      const v = new Set<number>();
      const h = new Set<number>();

      for (const t of api.tables) {
        if (t.id === activeId) continue;
        if (drag?.groupIds.includes(t.id)) continue;
        const s = tableCellSize(t.type, t.seats, t.orientation);
        const xL = t.gridX;
        const xR = t.gridX + s.w;
        const xC = t.gridX + s.w / 2;
        const yT = t.gridY;
        const yB = t.gridY + s.h;
        const yC = t.gridY + s.h / 2;

        const pairsX: Array<[number, number]> = [
          [axL, xL],
          [axL, xR],
          [axC, xC],
          [axR, xL],
          [axR, xR],
        ];
        for (const [a, b] of pairsX) {
          if (Math.abs(a - b) <= tol) v.add(b);
        }

        const pairsY: Array<[number, number]> = [
          [ayT, yT],
          [ayT, yB],
          [ayC, yC],
          [ayB, yT],
          [ayB, yB],
        ];
        for (const [a, b] of pairsY) {
          if (Math.abs(a - b) <= tol) h.add(b);
        }
      }

      return { v: Array.from(v).slice(0, 6), h: Array.from(h).slice(0, 6) };
    },
    [api.tables, drag?.groupIds]
  );

  const beginDrag = useCallback(
    (kind: SeatingItemKind, id: string, e: any) => {
      if (!isWeb) return;
      if (edit?.id === id) return;

      const groupIds =
        kind === 'table' && selected.size > 1 && selected.has(id) ? Array.from(selected) : [id];

      const startById = new Map<string, { x: number; y: number }>();
      if (kind === 'table') {
        for (const tid of groupIds) {
          const t = api.tables.find(tt => tt.id === tid);
          if (t) startById.set(tid, { x: t.gridX, y: t.gridY });
        }
      } else if (kind === 'zone') {
        const z = api.zones.find(zz => zz.id === id);
        if (z) startById.set(id, { x: z.gridX, y: z.gridY });
      } else {
        const l = api.labels.find(ll => ll.id === id);
        if (l) startById.set(id, { x: l.gridX, y: l.gridY });
      }

      const startClient = { x: e?.clientX ?? e?.nativeEvent?.clientX ?? 0, y: e?.clientY ?? e?.nativeEvent?.clientY ?? 0 };
      const draftById = new Map(startById);
      setDrag({ kind, id, groupIds, startById, startClient, draftById });

      // Selection behavior:
      // - Ctrl/Cmd click toggles item in multi-select.
      // - Plain click:
      //   - if item is already selected (esp. after marquee), keep selection so group-drag works
      //   - otherwise select only this item.
      const multiKey = !!(e?.ctrlKey || e?.metaKey);
      if (multiKey) {
        api.toggleSelect(id, true);
      } else if (!selected.has(id)) {
        api.toggleSelect(id, false);
      }
    },
    [api, edit?.id, isWeb, selected]
  );

  const onWindowMove = useCallback(
    (ev: PointerEvent) => {
      if (!drag && !resize && !marquee) return;

      // Resize
      if (resize) {
        const dxPx = ev.clientX - resize.startClient.x;
        const dyPx = ev.clientY - resize.startClient.y;
        const dx = Math.round(dxPx / CELL_SIZE);
        const dy = Math.round(dyPx / CELL_SIZE);
        const z = api.zones.find(zz => zz.id === resize.id);
        if (!z) return;
        const nextW =
          resize.handle === 'right' || resize.handle === 'corner' ? resize.start.w + dx : resize.start.w;
        const nextH =
          resize.handle === 'bottom' || resize.handle === 'corner' ? resize.start.h + dy : resize.start.h;
        api.resizeZone(resize.id, nextW, nextH);
        return;
      }

      // Marquee
      if (marquee) {
        const rect = getGridRect();
        if (!rect) return;
        const cur = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        setMarquee(prev => (prev ? { ...prev, cur } : prev));
        return;
      }

      if (!drag) return;
      const dxPx = ev.clientX - drag.startClient.x;
      const dyPx = ev.clientY - drag.startClient.y;
      const dx = Math.round(dxPx / CELL_SIZE);
      const dy = Math.round(dyPx / CELL_SIZE);

      const draftById = new Map<string, { x: number; y: number }>();

      for (const id of drag.groupIds) {
        const s = drag.startById.get(id);
        if (!s) continue;
        let nx = s.x + dx;
        let ny = s.y + dy;

        if (drag.kind === 'table') {
          const t = api.tables.find(tt => tt.id === id);
          if (!t) continue;
          const sz = tableCellSize(t.type, t.seats, t.orientation);
          const p = clampCell(nx, ny, sz.w, sz.h);
          nx = p.x;
          ny = p.y;
        } else if (drag.kind === 'zone') {
          const z = api.zones.find(zz => zz.id === id);
          if (!z) continue;
          const p = clampCell(nx, ny, z.widthCells, z.heightCells);
          nx = p.x;
          ny = p.y;
        } else {
          const p = clampCell(nx, ny, 1, 1);
          nx = p.x;
          ny = p.y;
        }

        draftById.set(id, { x: nx, y: ny });
      }

      setDrag(prev => (prev ? { ...prev, draftById } : prev));

      if (drag.kind === 'table') {
        const activeDraft = draftById.get(drag.id);
        if (activeDraft) setGuides(computeTableGuides(drag.id, activeDraft.x, activeDraft.y));
      } else {
        setGuides({ v: [], h: [] });
      }
    },
    [api, clampCell, computeTableGuides, drag, getGridRect, marquee, resize]
  );

  const onWindowUp = useCallback(
    (ev: PointerEvent) => {
      if (resize) {
        setResize(null);
        return;
      }

      if (marquee) {
        const dx = marquee.cur.x - marquee.start.x;
        const dy = marquee.cur.y - marquee.start.y;
        const moved = Math.hypot(dx, dy) >= 5;
        if (!moved) api.clearSelection();
        setMarquee(null);
        return;
      }

      if (!drag) return;

      // Commit positions
      const draft = drag.draftById;
      if (drag.kind === 'table') {
        const p = draft.get(drag.id);
        if (p) api.moveTable(drag.id, p.x, p.y);
      } else if (drag.kind === 'zone') {
        const p = draft.get(drag.id);
        if (p) api.moveZone(drag.id, p.x, p.y);
      } else {
        const p = draft.get(drag.id);
        if (p) api.moveLabel(drag.id, p.x, p.y);
      }

      setDrag(null);
      setGuides({ v: [], h: [] });
    },
    [api, drag, marquee, resize]
  );

  useEffect(() => {
    if (!isWeb) return;
    const move = (e: any) => onWindowMove(e as PointerEvent);
    const up = (e: any) => onWindowUp(e as PointerEvent);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [isWeb, onWindowMove, onWindowUp]);

  const onBackgroundPointerDown = useCallback(
    (e: any) => {
      if (!isWeb) return;
      if (edit) return;
      if (elementAtTargetIsItem(e)) return;

      const rect = getGridRect();
      if (!rect) return;
      const start = { x: (e.clientX ?? e.nativeEvent?.clientX) - rect.left, y: (e.clientY ?? e.nativeEvent?.clientY) - rect.top };
      setMarquee({ start, cur: start });
    },
    [edit, elementAtTargetIsItem, getGridRect, isWeb]
  );

  // Compute marquee selection IDs (updates while dragging)
  useEffect(() => {
    if (!marquee) return;
    const dx = marquee.cur.x - marquee.start.x;
    const dy = marquee.cur.y - marquee.start.y;
    const moved = Math.hypot(dx, dy) >= 5;
    if (!moved) return;

    const leftPx = Math.min(marquee.start.x, marquee.cur.x);
    const rightPx = Math.max(marquee.start.x, marquee.cur.x);
    const topPx = Math.min(marquee.start.y, marquee.cur.y);
    const bottomPx = Math.max(marquee.start.y, marquee.cur.y);

    const l = Math.floor(leftPx / CELL_SIZE);
    const r = Math.ceil(rightPx / CELL_SIZE);
    const t = Math.floor(topPx / CELL_SIZE);
    const b = Math.ceil(bottomPx / CELL_SIZE);

    const hit: string[] = [];

    for (const tb of api.tables) {
      const sz = tableCellSize(tb.type, tb.seats, tb.orientation);
      const x0 = tb.gridX;
      const y0 = tb.gridY;
      const x1 = x0 + sz.w;
      const y1 = y0 + sz.h;
      const intersects = x0 <= r && x1 >= l && y0 <= b && y1 >= t;
      if (intersects) hit.push(tb.id);
    }
    for (const z of api.zones) {
      const x0 = z.gridX;
      const y0 = z.gridY;
      const x1 = x0 + z.widthCells;
      const y1 = y0 + z.heightCells;
      const intersects = x0 <= r && x1 >= l && y0 <= b && y1 >= t;
      if (intersects) hit.push(z.id);
    }
    for (const lb of api.labels) {
      const x0 = lb.gridX;
      const y0 = lb.gridY;
      const intersects = x0 <= r && x0 + 1 >= l && y0 <= b && y0 + 1 >= t;
      if (intersects) hit.push(lb.id);
    }

    api.selectMultiple(hit);
  }, [api, marquee]);

  const onKeyDown = useCallback(
    (e: any) => {
      const key = e?.key;
      if (key === 'Delete' || key === 'Backspace') {
        if (api.selectedIds.size) {
          api.removeSelected();
          e?.preventDefault?.();
        }
      }
      if (key === 'Escape') {
        setEdit(null);
      }
    },
    [api]
  );

  const startResize = useCallback(
    (id: string, handle: 'right' | 'bottom' | 'corner', e: any) => {
      if (!isWeb) return;
      e?.stopPropagation?.();
      const z = api.zones.find(zz => zz.id === id);
      if (!z) return;
      const startClient = { x: e.clientX ?? e.nativeEvent?.clientX ?? 0, y: e.clientY ?? e.nativeEvent?.clientY ?? 0 };
      setResize({ id, handle, startClient, start: { w: z.widthCells, h: z.heightCells } });
    },
    [api.zones, isWeb]
  );

  const commitEdit = useCallback(() => {
    if (!edit) return;
    if (edit.kind === 'table') {
      const n = Number(edit.value);
      if (Number.isFinite(n) && n > 0) api.renumberTable(edit.id, Math.floor(n));
    } else if (edit.kind === 'zone') {
      api.renameZone(edit.id, edit.value.trim());
    } else {
      api.renameLabel(edit.id, edit.value.trim());
    }
    setEdit(null);
  }, [api, edit]);

  const cancelEdit = useCallback(() => setEdit(null), []);

  const startEdit = useCallback(
    (kind: SeatingItemKind, id: string) => {
      if (!isWeb) return;
      if (kind === 'table') {
        const t = api.tables.find(tt => tt.id === id);
        setEdit({ kind, id, value: String(t?.number ?? ''), mode: 'number' });
      } else if (kind === 'zone') {
        const z = api.zones.find(zz => zz.id === id);
        setEdit({ kind, id, value: String(z?.name ?? ''), mode: 'text' });
      } else {
        const l = api.labels.find(ll => ll.id === id);
        setEdit({ kind, id, value: String(l?.text ?? ''), mode: 'text' });
      }
    },
    [api.labels, api.tables, api.zones, isWeb]
  );

  const renderGhosts = useMemo(() => {
    if (!drag) return null;
    const draft = drag.draftById;
    if (drag.kind === 'table') {
      return drag.groupIds.map(id => {
        const t = api.tables.find(tt => tt.id === id);
        const p = draft.get(id);
        if (!t || !p) return null;
        const sz = tableCellSize(t.type, t.seats, t.orientation);
        return (
          <View
            key={`ghost-${id}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: p.x * CELL_SIZE,
              top: p.y * CELL_SIZE,
              width: sz.w * CELL_SIZE,
              height: sz.h * CELL_SIZE,
              borderRadius: 12,
              backgroundColor: 'rgba(43,140,238,0.22)',
              borderWidth: 1,
              borderColor: 'rgba(43,140,238,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontWeight: '900', color: '#1D4ED8' }}>{t.number ?? ''}</Text>
          </View>
        );
      });
    }
    if (drag.kind === 'zone') {
      const z = api.zones.find(zz => zz.id === drag.id);
      const p = draft.get(drag.id);
      if (!z || !p) return null;
      return (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: p.x * CELL_SIZE,
            top: p.y * CELL_SIZE,
            width: z.widthCells * CELL_SIZE,
            height: z.heightCells * CELL_SIZE,
            borderRadius: 12,
            borderWidth: 2,
            borderStyle: 'dashed' as any,
            borderColor: 'rgba(43,140,238,0.55)',
            backgroundColor: 'rgba(43,140,238,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontWeight: '900', color: 'rgba(17,24,39,0.65)' }}>{z.name}</Text>
        </View>
      );
    }
    const l = api.labels.find(ll => ll.id === drag.id);
    const p = draft.get(drag.id);
    if (!l || !p) return null;
    return (
      <Text
        style={{
          position: 'absolute',
          left: p.x * CELL_SIZE,
          top: p.y * CELL_SIZE,
          opacity: 0.6,
          fontWeight: '800',
          color: 'rgba(17,24,39,0.60)',
        }}
      >
        {l.text}
      </Text>
    );
  }, [api.labels, api.tables, api.zones, drag]);

  const marqueeRect = useMemo(() => {
    if (!marquee) return null;
    const dx = marquee.cur.x - marquee.start.x;
    const dy = marquee.cur.y - marquee.start.y;
    const moved = Math.hypot(dx, dy) >= 5;
    if (!moved) return null;
    const left = Math.min(marquee.start.x, marquee.cur.x);
    const top = Math.min(marquee.start.y, marquee.cur.y);
    const w = Math.abs(dx);
    const h = Math.abs(dy);
    return { left, top, w, h };
  }, [marquee]);

  return (
    <View style={styles.root}>
      <View
        // focusable for Delete key
        {...(isWeb ? ({ tabIndex: 0, onKeyDown } as any) : {})}
        style={styles.workArea}
      >
        <View
          ref={gridRef}
          style={[styles.gridWrap, { width: gridW, height: gridH }]}
          {...(isWeb ? ({ onPointerDown: onBackgroundPointerDown } as any) : {})}
        >
          {/* Grid lines */}
          <Svg width={gridW} height={gridH} style={StyleSheet.absoluteFill as any}>
            <Defs>
              <Pattern id="minor" x="0" y="0" width={CELL_SIZE} height={CELL_SIZE} patternUnits="userSpaceOnUse">
                <Rect x="0" y="0" width={CELL_SIZE} height={CELL_SIZE} fill="transparent" />
                <Line x1={CELL_SIZE} y1="0" x2="0" y2="0" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
                <Line x1="0" y1={CELL_SIZE} x2="0" y2="0" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
              </Pattern>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#minor)" />

            {/* Guides */}
            {guides.v.map((x, idx) => (
              <Line
                key={`gv-${idx}`}
                x1={x * CELL_SIZE}
                y1={0}
                x2={x * CELL_SIZE}
                y2={gridH}
                stroke="rgba(43,140,238,0.85)"
                strokeWidth={1}
                strokeDasharray="6 6"
              />
            ))}
            {guides.h.map((y, idx) => (
              <Line
                key={`gh-${idx}`}
                x1={0}
                y1={y * CELL_SIZE}
                x2={gridW}
                y2={y * CELL_SIZE}
                stroke="rgba(43,140,238,0.85)"
                strokeWidth={1}
                strokeDasharray="6 6"
              />
            ))}
          </Svg>

          {/* Zones */}
          {api.zones.map(z => {
            const isSelected = selected.has(z.id);
            const left = z.gridX * CELL_SIZE;
            const top = z.gridY * CELL_SIZE;
            const w = z.widthCells * CELL_SIZE;
            const h = z.heightCells * CELL_SIZE;
            return (
              <View
                key={z.id}
                dataSet={{ seatingItem: '1', seatingId: z.id, seatingKind: 'zone' } as any}
                style={[
                  styles.zone,
                  {
                    left,
                    top,
                    width: w,
                    height: h,
                    borderColor: isSelected ? 'rgba(43,140,238,0.95)' : 'rgba(148,163,184,0.65)',
                  },
                  isSelected ? styles.selectedRing : null,
                ]}
                {...(isWeb
                  ? ({
                      onPointerDown: (e: any) => beginDrag('zone', z.id, e),
                      onDoubleClick: () => startEdit('zone', z.id),
                    } as any)
                  : null)}
              >
                <Text style={styles.zoneText}>{z.name}</Text>

                {/* Resize handles (web) */}
                {isWeb ? (
                  <>
                    <Pressable
                      dataSet={{ seatingItem: '1' } as any}
                      style={[styles.handle, { right: -6, top: '50%', marginTop: -6 }]}
                      onPress={() => null}
                      {...({ onPointerDown: (e: any) => startResize(z.id, 'right', e) } as any)}
                    />
                    <Pressable
                      dataSet={{ seatingItem: '1' } as any}
                      style={[styles.handle, { bottom: -6, left: '50%', marginLeft: -6 }]}
                      onPress={() => null}
                      {...({ onPointerDown: (e: any) => startResize(z.id, 'bottom', e) } as any)}
                    />
                    <Pressable
                      dataSet={{ seatingItem: '1' } as any}
                      style={[styles.handle, { right: -6, bottom: -6 }]}
                      onPress={() => null}
                      {...({ onPointerDown: (e: any) => startResize(z.id, 'corner', e) } as any)}
                    />
                  </>
                ) : null}
              </View>
            );
          })}

          {/* Tables */}
          {api.tables.map(t => {
            const sz = tableCellSize(t.type, t.seats, t.orientation);
            const isSelected = selected.has(t.id);
            const color =
              t.type === 'reserve' ? '#F59E0B' : t.type === 'knight' ? '#7C3AED' : '#2563EB';
            return (
              <View
                key={t.id}
                dataSet={{ seatingItem: '1', seatingId: t.id, seatingKind: 'table' } as any}
                style={[
                  styles.table,
                  {
                    left: t.gridX * CELL_SIZE,
                    top: t.gridY * CELL_SIZE,
                    width: sz.w * CELL_SIZE,
                    height: sz.h * CELL_SIZE,
                    backgroundColor: `${color}22`,
                    borderColor: `${color}55`,
                  },
                  isSelected ? styles.selectedRing : null,
                ]}
                {...(isWeb
                  ? ({
                      onPointerDown: (e: any) => beginDrag('table', t.id, e),
                      onDoubleClick: () => startEdit('table', t.id),
                    } as any)
                  : null)}
              >
                <Text style={[styles.tableNum, { color }]}>{t.number ?? ''}</Text>
                <Text style={styles.tableType}>{TABLE_LABELS[t.type]}</Text>
              </View>
            );
          })}

          {/* Labels */}
          {api.labels.map(l => {
            const isSelected = selected.has(l.id);
            return (
              <View
                key={l.id}
                dataSet={{ seatingItem: '1', seatingId: l.id, seatingKind: 'label' } as any}
                style={[
                  styles.labelWrap,
                  { left: l.gridX * CELL_SIZE, top: l.gridY * CELL_SIZE },
                  isSelected ? styles.selectedRing : null,
                ]}
                {...(isWeb
                  ? ({
                      onPointerDown: (e: any) => beginDrag('label', l.id, e),
                      onDoubleClick: () => startEdit('label', l.id),
                    } as any)
                  : null)}
              >
                <Text style={styles.labelText}>{l.text}</Text>
              </View>
            );
          })}

          {/* Ghost preview */}
          {renderGhosts}

          {/* Marquee */}
          {marqueeRect ? (
            <View
              pointerEvents="none"
              style={[
                styles.marquee,
                { left: marqueeRect.left, top: marqueeRect.top, width: marqueeRect.w, height: marqueeRect.h },
              ]}
            />
          ) : null}

          {/* Inline editor */}
          {edit ? (
            <InlineEditor
              edit={edit as ActiveEditState}
              api={api}
              onChange={(next) => setEdit(next)}
              onCommit={commitEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function InlineEditor({
  edit,
  api,
  onChange,
  onCommit,
  onCancel,
}: {
  edit: ActiveEditState;
  api: UseSeatingStateApi;
  onChange: (e: ActiveEditState) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const isWeb = Platform.OS === 'web';

  const pos = useMemo(() => {
    if (edit.kind === 'table') {
      const t = api.tables.find(tt => tt.id === edit.id);
      if (!t) return null;
      return { x: t.gridX, y: t.gridY };
    }
    if (edit.kind === 'zone') {
      const z = api.zones.find(zz => zz.id === edit.id);
      if (!z) return null;
      return { x: z.gridX, y: z.gridY };
    }
    const l = api.labels.find(ll => ll.id === edit.id);
    if (!l) return null;
    return { x: l.gridX, y: l.gridY };
  }, [api.labels, api.tables, api.zones, edit.id, edit.kind]);

  if (!pos) return null;

  return (
    <TextInput
      autoFocus
      value={edit.value}
      onChangeText={(t) => onChange({ ...edit, value: t })}
      style={[
        styles.editor,
        { left: pos.x * CELL_SIZE, top: pos.y * CELL_SIZE },
      ]}
      keyboardType={edit.mode === 'number' ? 'numeric' : 'default'}
      {...(isWeb
        ? ({
            onKeyDown: (e: any) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            },
          } as any)
        : null)}
      onBlur={onCommit}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e5e7eb' },
  workArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    ...(Platform.OS === 'web' ? ({ overflow: 'auto' } as any) : null),
  },
  gridWrap: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.70)',
    overflow: 'hidden',
  },

  table: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  tableNum: { fontSize: 16, fontWeight: '900' },
  tableType: { marginTop: 2, fontSize: 11, fontWeight: '800', color: 'rgba(17,24,39,0.60)' },

  zone: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed' as any,
    backgroundColor: 'rgba(43,140,238,0.06)',
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

  selectedRing: {
    borderWidth: 2,
    borderColor: 'rgba(43,140,238,0.95)',
  },

  marquee: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(43,140,238,0.95)',
    backgroundColor: 'rgba(43,140,238,0.14)',
    borderRadius: 6,
  },

  handle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(43,140,238,0.95)',
    borderWidth: 2,
    borderColor: '#fff',
  },

  editor: {
    position: 'absolute',
    minWidth: 80,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(43,140,238,0.55)',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    fontWeight: '900',
    color: '#111418',
    textAlign: 'right',
  },
});

