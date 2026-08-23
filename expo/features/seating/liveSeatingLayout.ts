import type { LiveSeatingTable } from '@/features/seating/useLiveSeatingModel';

/**
 * Places tables on the live map canvas, scaled to fit the screen.
 *
 * Coordinates in `tables.x/y` have no fixed unit. The web sketch editor saves
 * them as `gridX * 40`, older maps were dragged around in raw screen points,
 * and some events hold plain grid indices — so a tile size assumed from any one
 * of those schemes lands wrong on the others, piling tables on top of each
 * other or scattering them off-canvas.
 *
 * So the tile size is measured from the data rather than assumed: take how far
 * apart neighbouring tables actually are, and make a tile slightly smaller than
 * that. Whatever the unit, tables come out adjacent but never overlapping. The
 * hall is then scaled to fit the viewport, the way a floor plan is printed to a
 * page, so it reads at a glance without panning.
 *
 * When the stored positions can't produce a readable map — every table on one
 * spot, or strung out in a line so thin the tiles shrink to slivers — they are
 * not real positions worth honouring, and the tables fall back to a plain grid.
 */

/** Tile size relative to the gap between neighbouring tables. */
const TILE_TO_SPACING = 0.82;

/** Long "knight" tables are drawn as a bar, still inside their spacing cell. */
const RECTANGLE_HEIGHT_RATIO = 0.58;

/** Spacing to assume when positions can't tell us anything (a single table). */
const FALLBACK_SPACING = 100;

/** Cap so a three-table event doesn't render as screen-filling blocks. */
const MAX_TILE = 92;

/**
 * Smallest tile the sketch is allowed to draw. Squeezing a wide hall into the
 * screen width turns the tables into unreadable dots, so below this the map
 * keeps its real scale and scrolls instead — the same trade the seating-map
 * screen makes.
 */
const MIN_COMFORT_TILE = 46;

/**
 * Longest empty stretch kept between neighbouring rows/columns, in spacing
 * units. Sketches often hold a dance floor or a stage as a huge blank area;
 * drawn at scale it pushes tables off-screen and leaves the map mostly white.
 * Capping the gap keeps the hall's structure (order and grouping) while
 * pulling everything into view.
 */
const MAX_GAP_IN_CELLS = 1.6;

/** Breathing room around the hall inside the canvas. */
const CANVAS_PADDING = 14;

/**
 * Remaps one axis so runs of empty space wider than `MAX_GAP_IN_CELLS` cells
 * shrink to that cap. Order is preserved; close neighbours are untouched.
 */
function collapseAxis(values: number[], spacing: number): Map<number, number> {
  const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
  const maxDelta = spacing * MAX_GAP_IN_CELLS;

  const mapped = new Map<number, number>();
  let prevOriginal = sorted[0] ?? 0;
  let prevMapped = 0;
  if (sorted.length) mapped.set(sorted[0], 0);

  for (let i = 1; i < sorted.length; i += 1) {
    prevMapped += Math.min(sorted[i] - prevOriginal, maxDelta);
    mapped.set(sorted[i], prevMapped);
    prevOriginal = sorted[i];
  }

  return mapped;
}

export type PlacedTable = {
  table: LiveSeatingTable;
  left: number;
  top: number;
  width: number;
  height: number;
  /** True when the position was invented rather than read from the sketch. */
  auto: boolean;
};

export type LiveMapLayout = {
  /**
   * 'positioned' honours the sketch and needs absolute placement.
   * 'grid' is plain reading order, which flows with flexbox — no absolute
   * positioning, so it cannot collapse the way an unsized absolute child can.
   */
  mode: 'positioned' | 'grid';
  placed: PlacedTable[];
  /** Canvas size after scaling. */
  width: number;
  height: number;
  /** Length of a square tile's side, for callers that size text by it. */
  tile: number;
  /** Space between tiles in grid mode. */
  gap: number;
  /** How many tables had no usable coordinates of their own. */
  autoPlacedCount: number;
  /** True when stored positions were unusable and everything fell back to a grid. */
  usedFallbackGrid: boolean;
};

type Point = { table: LiveSeatingTable; x: number; y: number };
type Viewport = { width: number; height: number };

/** Numbers only — `Number(null)` is 0, which would place unpositioned tables at the origin. */
function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tileSizeFor(table: LiveSeatingTable, base: number): { width: number; height: number } {
  if (table.shape === 'rectangle') {
    return { width: base, height: base * RECTANGLE_HEIGHT_RATIO };
  }
  return { width: base, height: base };
}

/**
 * Median distance from each table to its nearest neighbour.
 *
 * The median rather than the minimum, so one pair of tables drawn unusually
 * close together doesn't shrink every tile on the map.
 */
function measureSpacing(points: Point[]): number {
  if (points.length < 2) return FALLBACK_SPACING;

  const nearest: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    let best = Infinity;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const dist = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      // Tables sharing an exact position carry no spacing information.
      if (dist > 0 && dist < best) best = dist;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }

  if (!nearest.length) return FALLBACK_SPACING;

  nearest.sort((a, b) => a - b);
  const mid = Math.floor(nearest.length / 2);
  const median = nearest.length % 2 === 0 ? (nearest[mid - 1] + nearest[mid]) / 2 : nearest[mid];

  return median > 0 ? median : FALLBACK_SPACING;
}

/** Rows and columns shaped to the viewport, sized to fill it. */
function gridLayout(tables: LiveSeatingTable[], viewport: Viewport, auto: boolean): LiveMapLayout {
  const aspect = viewport.width / viewport.height;
  const columns = Math.max(1, Math.ceil(Math.sqrt(tables.length * aspect)));
  const rows = Math.max(1, Math.ceil(tables.length / columns));

  const step = Math.min(viewport.width / columns, viewport.height / rows);
  const tile = Math.min(step * TILE_TO_SPACING, MAX_TILE);
  const gap = step - tile;

  const placed = tables.map((table, index) => {
    const size = tileSizeFor(table, tile);
    return {
      table,
      left: (index % columns) * (tile + gap),
      top: Math.floor(index / columns) * (tile + gap),
      width: size.width,
      height: size.height,
      auto,
    };
  });

  return {
    mode: 'grid',
    placed,
    width: Math.max(columns * tile + Math.max(0, columns - 1) * gap, 1),
    height: Math.max(rows * tile + Math.max(0, rows - 1) * gap, 1),
    tile,
    gap,
    autoPlacedCount: auto ? tables.length : 0,
    usedFallbackGrid: false,
  };
}

/** Tables at their stored positions, scaled to fit; null when unusable. */
function positionedLayout(
  points: Point[],
  loose: LiveSeatingTable[],
  viewport: Viewport
): LiveMapLayout | null {
  if (!points.length) return null;

  const spacing = measureSpacing(points);
  const tile = spacing * TILE_TO_SPACING;
  if (!Number.isFinite(tile) || tile <= 0) return null;

  // Collapse oversized blank stretches on each axis independently. This keeps
  // rows as rows and columns as columns while pulling distant groups (tables
  // around a dance floor, a lone head table) close enough to read together.
  const xMap = collapseAxis(points.map((p) => p.x), spacing);
  const yMap = collapseAxis(points.map((p) => p.y), spacing);

  const raw: PlacedTable[] = points.map((point) => {
    const size = tileSizeFor(point.table, tile);
    return {
      table: point.table,
      left: xMap.get(point.x) ?? 0,
      top: yMap.get(point.y) ?? 0,
      width: size.width,
      height: size.height,
      auto: false,
    };
  });

  if (loose.length) {
    // Flow the unpositioned ones in rows underneath the hall.
    const step = tile * 1.28;
    const hallWidth = raw.reduce((max, p) => Math.max(max, p.left + p.width), 0);
    const columns = Math.max(1, Math.round(hallWidth / step) || 1);
    const looseTop = raw.reduce((max, p) => Math.max(max, p.top + p.height), 0) + step;

    loose.forEach((table, index) => {
      const size = tileSizeFor(table, tile);
      raw.push({
        table,
        left: (index % columns) * step,
        top: looseTop + Math.floor(index / columns) * step,
        width: size.width,
        height: size.height,
        auto: true,
      });
    });
  }

  const rawWidth = Math.max(raw.reduce((max, p) => Math.max(max, p.left + p.width), 0), 1);
  const rawHeight = Math.max(raw.reduce((max, p) => Math.max(max, p.top + p.height), 0), 1);

  // Fit the hall to the width when that leaves the tables readable, and keep
  // the real scale (letting the canvas scroll) when it doesn't. Accuracy beats
  // fitting everything on screen: staff recognise their own floor plan, and a
  // hall squeezed to thumbnail dots is no longer that plan. One uniform scale
  // throughout — clamping tiles individually would break the no-overlap
  // guarantee and push the outer ones past the canvas edge.
  const widthFit = Math.max(viewport.width - CANVAS_PADDING * 2, 120) / rawWidth;
  const comfortScale = MIN_COMFORT_TILE / tile;
  const maxScale = MAX_TILE / tile;
  const chosen = Math.min(Math.max(widthFit, comfortScale), maxScale);
  const scale = Number.isFinite(chosen) && chosen > 0 ? chosen : 1;
  if (!Number.isFinite(scale) || scale <= 0) return null;

  return {
    mode: 'positioned',
    placed: raw.map((p) => ({
      ...p,
      left: p.left * scale + CANVAS_PADDING,
      top: p.top * scale + CANVAS_PADDING,
      width: p.width * scale,
      height: p.height * scale,
    })),
    width: Math.max(rawWidth * scale, 1) + CANVAS_PADDING * 2,
    height: Math.max(rawHeight * scale, 1) + CANVAS_PADDING * 2,
    tile: tile * scale,
    gap: tile * scale * 0.28,
    autoPlacedCount: loose.length,
    usedFallbackGrid: false,
  };
}

export function buildLiveMapLayout(tables: LiveSeatingTable[], viewport: Viewport): LiveMapLayout {
  const safeViewport: Viewport = {
    width: Math.max(160, finite(viewport?.width) ?? 320),
    height: Math.max(160, finite(viewport?.height) ?? 320),
  };

  if (!tables.length) {
    return {
      mode: 'grid',
      placed: [],
      width: safeViewport.width,
      height: safeViewport.height,
      tile: 0,
      gap: 0,
      autoPlacedCount: 0,
      usedFallbackGrid: false,
    };
  }

  const points: Point[] = [];
  const loose: LiveSeatingTable[] = [];

  for (const table of tables) {
    const x = finite(table.x);
    const y = finite(table.y);
    if (x === null || y === null) loose.push(table);
    else points.push({ table, x, y });
  }

  // Tables the sketch genuinely never placed. Counted before the checks below
  // relocate anything, so the caller can say "5 tables have no position" without
  // that number swelling whenever the map falls back to a grid.
  const unplacedCount = loose.length;

  // Several tables sharing one spot carry no layout information at all. A lone
  // table trivially sits at a single point, which is fine to honour.
  if (points.length > 1 && new Set(points.map((p) => `${p.x}:${p.y}`)).size <= 1) {
    loose.push(...points.map((p) => p.table));
    points.length = 0;
  }

  const grid = gridLayout(tables, safeViewport, false);
  const positioned = positionedLayout(points, loose, safeViewport);

  // The sketch always wins when there is one. The grid is only for events whose
  // tables carry no usable coordinates at all.
  if (!positioned) {
    return {
      ...grid,
      autoPlacedCount: unplacedCount,
      // Only a fallback if real positions were thrown away; an event with no
      // sketch at all was never going to draw a hall.
      usedFallbackGrid: unplacedCount < tables.length,
    };
  }

  return { ...positioned, autoPlacedCount: unplacedCount };
}
