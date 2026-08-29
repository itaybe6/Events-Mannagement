export type TableType = 'regular' | 'reserve' | 'knight';
export type Orientation = 'row' | 'column';
/** Where the first table number sits along the placement axis */
export type NumberingAnchor = 'start' | 'end';

export const FIXED_SEATS: Record<TableType, number> = {
  regular: 12,
  knight: 20,
  reserve: 12,
};

/** Common seat counts used in event floor plans */
export const SEAT_PRESETS = [12, 14, 20, 24, 30] as const;

export const MIN_TABLE_SEATS = 2;
export const MAX_TABLE_SEATS = 60;
export const MIN_TABLE_NUMBER = 1;
export const MAX_TABLE_NUMBER = 999;

export function clampTableNumber(n: number): number {
  return clamp(Math.round(n), MIN_TABLE_NUMBER, MAX_TABLE_NUMBER);
}

export function defaultSeatsForType(type: TableType): number {
  return FIXED_SEATS[type];
}

export function clampTableSeats(seats: number): number {
  return clamp(Math.round(seats), MIN_TABLE_SEATS, MAX_TABLE_SEATS);
}

export const TABLE_LABELS: Record<TableType, string> = {
  regular: 'רגיל',
  reserve: 'רזרבה',
  knight: 'אביר',
};

export interface TableConfig {
  type: TableType;
  seats: number;
  orientation: Orientation;
  quantity: number;
  startNumber?: number;
  numberingAnchor?: NumberingAnchor;
}

export interface PlacedTable {
  id: string;
  type: TableType;
  seats: number;
  orientation: Orientation;
  gridX: number;
  gridY: number;
  number?: number;
  /** Stable `public.tables.id`. Kept across sketch saves so guest seating is not wiped. */
  dbId?: string;
}

export interface Zone {
  id: string;
  name: string;
  gridX: number;
  gridY: number;
  widthCells: number;
  heightCells: number;
}

export interface TextLabel {
  id: string;
  text: string;
  gridX: number;
  gridY: number;
}

export type SeatingItemKind = 'table' | 'zone' | 'label';

export type SeatingItem =
  | ({ kind: 'table' } & PlacedTable)
  | ({ kind: 'zone' } & Zone)
  | ({ kind: 'label' } & TextLabel);

// Visual density of the web seating grid (px per cell).
// Smaller value => smaller tables on screen => easier to fit many tables in the viewport.
export const CELL_SIZE = 18;

export const DEFAULT_GRID_COLS = 50;
export const DEFAULT_GRID_ROWS = 35;

export type GridRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function makeId(prefix: 'table' | 'zone' | 'label') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function squareSideForSeats(seats: number): number {
  const s = clampTableSeats(seats || 12);
  if (s <= 12) return 3;
  if (s <= 14) return 3;
  if (s <= 20) return 4;
  if (s <= 24) return 5;
  if (s <= 30) return 5;
  return Math.max(3, Math.ceil(Math.sqrt(s * 0.8)));
}

export function tableCellSize(type: TableType, seats: number, orientation: Orientation): { w: number; h: number } {
  if (type === 'knight') {
    const long = Math.max(Math.ceil((seats || 20) / 2), 3);
    return orientation === 'row' ? { w: long, h: 2 } : { w: 2, h: long };
  }
  const side = squareSideForSeats(seats);
  return { w: side, h: side };
}

export function tableShape(type: TableType): 'square' | 'rectangle' | 'reserve' {
  if (type === 'knight') return 'rectangle';
  if (type === 'reserve') return 'reserve';
  return 'square';
}

export function tableFillColor(type: TableType, seats: number): { fill: string; border: string } {
  if (type === 'reserve') {
    return { fill: 'rgba(240,203,70,0.72)', border: '#F0CB46' };
  }
  if (type === 'knight') {
    return { fill: 'rgba(124,58,237,0.90)', border: '#C4B5FD' };
  }
  const s = clampTableSeats(seats || 12);
  if (s >= 30) return { fill: 'rgba(168,85,247,0.90)', border: '#E9D5FF' };
  if (s >= 24) return { fill: 'rgba(34,197,94,0.90)', border: '#BBF7D0' };
  if (s >= 20) return { fill: 'rgba(234,179,8,0.90)', border: '#FEF08A' };
  if (s >= 14) return { fill: 'rgba(56,189,248,0.90)', border: '#BAE6FD' };
  return { fill: 'rgba(6,23,62,0.90)', border: '#FFFFFF' };
}

// expo-router treats files under `app/` as routes on web; provide a default export.
export default function SeatingTypesRouteShim() {
  return null;
}

