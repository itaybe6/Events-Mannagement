import type { LiveSeatingTable } from '@/features/seating/useLiveSeatingModel';

/**
 * Places tables on the live map canvas, scaled to fit the screen.
 *
 * The sketch editor stores positions as `x = gridX * 40`, `y = gridY * 40`, and
 * a table's footprint is several grid cells wide — so a real hall spans roughly
 * 800x800 points. Drawing that at native size on a phone means scrolling around
 * a map you can never see at once, which defeats the point of a live view.
 * Instead the whole hall is scaled down to fit the viewport, the same way a
 * floor plan is printed to a page.
 *
 * Tables the sketch never positioned (added straight from the tables list) flow
 * into a grid underneath the positioned ones instead of stacking on 0,0.
 */

/** Points per sketch grid cell — matches `x = gridX * 40` in the editor. */
const GRID = 40;

/** Below this the numbers stop being readable, so the canvas scrolls instead. */
const MIN_SCALE = 0.26;

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
  placed: PlacedTable[];
  /** Canvas size after scaling. */
  width: number;
  height: number;
  scale: number;
  /** How many tables had no coordinates of their own. */
  autoPlacedCount: number;
};

/**
 * A table's footprint in grid cells, mirroring `tableCellSize` in the sketch
 * editor so the live map matches the plan the staff drew.
 */
function footprintCells(table: LiveSeatingTable): { w: number; h: number } {
  const seats = Math.max(1, Number(table.capacity) || 12);

  if (table.shape === 'rectangle') {
    // A long "knight" table: two rows of seats down its length.
    return { w: Math.max(Math.ceil(seats / 2), 3), h: 2 };
  }

  const side = seats <= 14 ? 3 : seats <= 20 ? 4 : seats <= 30 ? 5 : Math.max(3, Math.ceil(Math.sqrt(seats * 0.8)));
  return { w: side, h: side };
}

export function buildLiveMapLayout(
  tables: LiveSeatingTable[],
  viewport: { width: number; height: number }
): LiveMapLayout {
  const empty: LiveMapLayout = {
    placed: [],
    width: viewport.width,
    height: viewport.height,
    scale: 1,
    autoPlacedCount: 0,
  };
  if (!tables.length) return empty;

  const positioned = tables.filter((t) => typeof t.x === 'number' && typeof t.y === 'number');
  const loose = tables.filter((t) => typeof t.x !== 'number' || typeof t.y !== 'number');

  const minX = positioned.length ? Math.min(...positioned.map((t) => Number(t.x))) : 0;
  const minY = positioned.length ? Math.min(...positioned.map((t) => Number(t.y))) : 0;

  // Raw (unscaled) boxes first; scaling needs the full bounding box.
  const raw: PlacedTable[] = positioned.map((table) => {
    const cells = footprintCells(table);
    return {
      table,
      left: Number(table.x) - minX,
      top: Number(table.y) - minY,
      width: cells.w * GRID,
      height: cells.h * GRID,
      auto: false,
    };
  });

  const positionedRight = raw.reduce((max, p) => Math.max(max, p.left + p.width), 0);
  const positionedBottom = raw.reduce((max, p) => Math.max(max, p.top + p.height), 0);

  if (loose.length) {
    // Flow the unpositioned ones in rows under the hall. With no hall to sit
    // under, shape the block to the viewport's aspect ratio instead — a tall
    // thin column would force the scale-to-fit down and shrink every tile.
    const looseSide = footprintCells(loose[0]).w * GRID;
    const viewportAspect = viewport.height > 0 ? viewport.width / viewport.height : 1;
    const idealCols = Math.max(1, Math.ceil(Math.sqrt(loose.length * viewportAspect)));
    const rowWidth = positioned.length
      ? Math.max(positionedRight, GRID * 12)
      : idealCols * (looseSide + GRID);
    const looseTop = positioned.length ? positionedBottom + GRID * 2 : 0;

    let cursorX = 0;
    let cursorY = looseTop;
    let rowHeight = 0;

    loose.forEach((table) => {
      const cells = footprintCells(table);
      const width = cells.w * GRID;
      const height = cells.h * GRID;

      if (cursorX > 0 && cursorX + width > rowWidth) {
        cursorX = 0;
        cursorY += rowHeight + GRID;
        rowHeight = 0;
      }

      raw.push({ table, left: cursorX, top: cursorY, width, height, auto: true });
      cursorX += width + GRID;
      rowHeight = Math.max(rowHeight, height);
    });
  }

  const rawWidth = raw.reduce((max, p) => Math.max(max, p.left + p.width), 0) || 1;
  const rawHeight = raw.reduce((max, p) => Math.max(max, p.top + p.height), 0) || 1;

  // Contain: the whole hall visible at once, never blown up past native size.
  const fit = Math.min(viewport.width / rawWidth, viewport.height / rawHeight);
  const scale = Math.min(1, Math.max(MIN_SCALE, fit));

  const placed = raw.map((p) => ({
    ...p,
    left: p.left * scale,
    top: p.top * scale,
    width: p.width * scale,
    height: p.height * scale,
  }));

  return {
    placed,
    width: Math.max(rawWidth * scale, viewport.width),
    height: Math.max(rawHeight * scale, 200),
    scale,
    autoPlacedCount: loose.length,
  };
}
