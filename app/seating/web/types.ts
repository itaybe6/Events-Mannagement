export type TableType = 'regular' | 'reserve' | 'knight';
export type Orientation = 'row' | 'column';

export const FIXED_SEATS: Record<TableType, number> = {
  regular: 12,
  knight: 20,
  reserve: 8,
};

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
}

export interface PlacedTable {
  id: string;
  type: TableType;
  seats: number;
  orientation: Orientation;
  gridX: number;
  gridY: number;
  number?: number;
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

export const CELL_SIZE = 24;
export const GRID_COLS = 50;
export const GRID_ROWS = 35;

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

export function tableCellSize(type: TableType, seats: number, orientation: Orientation): { w: number; h: number } {
  if (type === 'knight') {
    const long = Math.max(Math.ceil((seats || 20) / 2), 3);
    return orientation === 'row' ? { w: long, h: 2 } : { w: 2, h: long };
  }
  // regular + reserve
  return { w: 3, h: 3 };
}

