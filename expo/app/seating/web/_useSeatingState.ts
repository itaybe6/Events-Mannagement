import { useMemo, useReducer } from 'react';
import {
  clamp,
  clampTableNumber,
  clampTableSeats,
  FIXED_SEATS,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  makeId,
  type PlacedTable,
  type TableConfig,
  tableCellSize,
  type TextLabel,
  type Zone,
} from './_types';

type State = {
  gridCols: number;
  gridRows: number;
  tables: PlacedTable[];
  zones: Zone[];
  labels: TextLabel[];
  selectedIds: Set<string>;
  tableCounter: number;
};

type Action =
  | { type: 'hydrate'; state: Partial<State> }
  | { type: 'setGrid'; cols: number; rows: number }
  | { type: 'clearSelection' }
  | { type: 'toggleSelect'; id: string; multi: boolean }
  | { type: 'selectMultiple'; ids: string[] }
  | { type: 'removeSelected' }
  | { type: 'removeTable'; id: string }
  | { type: 'addTable'; config: TableConfig; gridX: number; gridY: number }
  | { type: 'addZone'; name: string; gridX: number; gridY: number; widthCells: number; heightCells: number }
  | { type: 'addLabel'; text: string; gridX: number; gridY: number }
  | { type: 'moveTable'; id: string; gridX: number; gridY: number }
  | { type: 'moveZone'; id: string; gridX: number; gridY: number }
  | { type: 'moveLabel'; id: string; gridX: number; gridY: number }
  | { type: 'resizeZone'; id: string; widthCells: number; heightCells: number }
  | { type: 'renameZone'; id: string; name: string }
  | { type: 'renameLabel'; id: string; text: string }
  | { type: 'renumberTable'; id: string; num: number | undefined }
  | { type: 'updateTable'; id: string; patch: Partial<Pick<PlacedTable, 'number' | 'seats' | 'type' | 'orientation' | 'dbId'>> }
  | { type: 'setTableDbIds'; ids: Record<string, string> }
  ;

const initialState: State = {
  gridCols: DEFAULT_GRID_COLS,
  gridRows: DEFAULT_GRID_ROWS,
  tables: [],
  zones: [],
  labels: [],
  selectedIds: new Set(),
  tableCounter: 1,
};

function clampRectToGrid(cols: number, rows: number, x: number, y: number, w: number, h: number) {
  const nx = clamp(Math.round(x), 0, Math.max(0, cols - Math.max(1, w)));
  const ny = clamp(Math.round(y), 0, Math.max(0, rows - Math.max(1, h)));
  return { x: nx, y: ny };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate': {
      const merged: State = {
        ...state,
        ...action.state,
      } as any;
      // Ensure Set
      merged.selectedIds =
        action.state.selectedIds instanceof Set ? action.state.selectedIds : state.selectedIds;
      merged.tables = Array.isArray(action.state.tables) ? action.state.tables : state.tables;
      merged.zones = Array.isArray(action.state.zones) ? action.state.zones : state.zones;
      merged.labels = Array.isArray(action.state.labels) ? action.state.labels : state.labels;
      merged.tableCounter = typeof action.state.tableCounter === 'number' ? action.state.tableCounter : state.tableCounter;
      merged.gridCols = typeof action.state.gridCols === 'number' ? action.state.gridCols : state.gridCols;
      merged.gridRows = typeof action.state.gridRows === 'number' ? action.state.gridRows : state.gridRows;
      return merged;
    }

    case 'setGrid': {
      const cols = clamp(Math.round(action.cols), 20, 300);
      const rows = clamp(Math.round(action.rows), 20, 300);
      if (cols === state.gridCols && rows === state.gridRows) return state;
      return { ...state, gridCols: cols, gridRows: rows };
    }

    case 'clearSelection':
      return { ...state, selectedIds: new Set() };

    case 'toggleSelect': {
      const next = new Set(state.selectedIds);
      if (!action.multi) {
        next.clear();
        next.add(action.id);
        return { ...state, selectedIds: next };
      }
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, selectedIds: next };
    }

    case 'selectMultiple': {
      return { ...state, selectedIds: new Set(action.ids) };
    }

    case 'removeSelected': {
      const selected = state.selectedIds;
      if (selected.size === 0) return state;
      return {
        ...state,
        tables: state.tables.filter(t => !selected.has(t.id)),
        zones: state.zones.filter(z => !selected.has(z.id)),
        labels: state.labels.filter(l => !selected.has(l.id)),
        selectedIds: new Set(),
      };
    }

    case 'removeTable': {
      const nextTables = state.tables.filter(t => t.id !== action.id);
      const nextSelected = new Set(state.selectedIds);
      nextSelected.delete(action.id);
      return { ...state, tables: nextTables, selectedIds: nextSelected };
    }

    case 'addTable': {
      const seats = action.config.seats ?? FIXED_SEATS[action.config.type];
      const type = action.config.type;
      const orientation = action.config.orientation ?? 'row';
      const qty = clamp(Math.floor(action.config.quantity || 1), 1, 20);
      const gap = 1;
      const startNum = clamp(Math.round(action.config.startNumber ?? state.tableCounter), 1, 999);

      const { w, h } = tableCellSize(type, seats, orientation);

      const stepX = action.config.orientation === 'row' ? w + gap : 0;
      const stepY = action.config.orientation === 'column' ? h + gap : 0;
      const groupW = w + (qty - 1) * stepX;
      const groupH = h + (qty - 1) * stepY;
      const start = clampRectToGrid(state.gridCols, state.gridRows, action.gridX, action.gridY, groupW, groupH);

      const nextTables: PlacedTable[] = [];
      const anchorEnd = action.config.numberingAnchor === 'end';
      const usedNumbers = new Set(
        state.tables.map((t) => t.number).filter((n): n is number => typeof n === 'number')
      );

      const takeFreeNumber = (preferred: number) => {
        let n = clampTableNumber(preferred);
        while (usedNumbers.has(n) && n < 999) n += 1;
        usedNumbers.add(n);
        return n;
      };

      const numbers: number[] = [];
      for (let i = 0; i < qty; i++) {
        numbers.push(takeFreeNumber(startNum + i));
      }
      if (anchorEnd) numbers.reverse();

      for (let i = 0; i < qty; i++) {
        const p = clampRectToGrid(state.gridCols, state.gridRows, start.x + i * stepX, start.y + i * stepY, w, h);
        nextTables.push({
          id: makeId('table'),
          type,
          seats,
          orientation,
          gridX: p.x,
          gridY: p.y,
          number: numbers[i],
        });
      }

      const maxNumber = [...state.tables, ...nextTables].reduce(
        (m, t) => Math.max(m, typeof t.number === 'number' ? t.number : 0),
        0
      );

      return {
        ...state,
        tables: [...state.tables, ...nextTables],
        tableCounter: maxNumber + 1,
        selectedIds: new Set(nextTables.map(t => t.id)),
      };
    }

    case 'addZone': {
      const w = clamp(Math.round(action.widthCells), 2, 30);
      const h = clamp(Math.round(action.heightCells), 2, 20);
      const p = clampRectToGrid(state.gridCols, state.gridRows, action.gridX, action.gridY, w, h);
      const z: Zone = {
        id: makeId('zone'),
        name: action.name,
        gridX: p.x,
        gridY: p.y,
        widthCells: w,
        heightCells: h,
      };
      return { ...state, zones: [...state.zones, z], selectedIds: new Set([z.id]) };
    }

    case 'addLabel': {
      const p = clampRectToGrid(state.gridCols, state.gridRows, action.gridX, action.gridY, 1, 1);
      const l: TextLabel = {
        id: makeId('label'),
        text: action.text,
        gridX: p.x,
        gridY: p.y,
      };
      return { ...state, labels: [...state.labels, l], selectedIds: new Set([l.id]) };
    }

    case 'moveTable': {
      const idx = state.tables.findIndex(t => t.id === action.id);
      if (idx < 0) return state;
      const moving = state.tables[idx];
      const { w, h } = tableCellSize(moving.type, moving.seats, moving.orientation);

      // Group move (tables only): if the dragged id is in multi selection
      const selected = state.selectedIds;
      const isGroup = selected.size > 1 && selected.has(action.id);
      if (!isGroup) {
        const p = clampRectToGrid(state.gridCols, state.gridRows, action.gridX, action.gridY, w, h);
        const next = state.tables.slice();
        next[idx] = { ...moving, gridX: p.x, gridY: p.y };
        return { ...state, tables: next };
      }

      const selectedTables = state.tables.filter(t => selected.has(t.id));
      const minX = Math.min(...selectedTables.map(t => t.gridX));
      const minY = Math.min(...selectedTables.map(t => t.gridY));

      const maxX = Math.max(
        ...selectedTables.map(t => t.gridX + tableCellSize(t.type, t.seats, t.orientation).w)
      );
      const maxY = Math.max(
        ...selectedTables.map(t => t.gridY + tableCellSize(t.type, t.seats, t.orientation).h)
      );

      const bboxW = Math.max(1, maxX - minX);
      const bboxH = Math.max(1, maxY - minY);

      const dx = action.gridX - moving.gridX;
      const dy = action.gridY - moving.gridY;

      const clampedBox = clampRectToGrid(state.gridCols, state.gridRows, minX + dx, minY + dy, bboxW, bboxH);
      const cdx = clampedBox.x - minX;
      const cdy = clampedBox.y - minY;

      const next = state.tables.map(t => {
        if (!selected.has(t.id)) return t;
        const sz = tableCellSize(t.type, t.seats, t.orientation);
        const p = clampRectToGrid(state.gridCols, state.gridRows, t.gridX + cdx, t.gridY + cdy, sz.w, sz.h);
        return { ...t, gridX: p.x, gridY: p.y };
      });

      return { ...state, tables: next };
    }

    case 'moveZone': {
      const idx = state.zones.findIndex(z => z.id === action.id);
      if (idx < 0) return state;
      const z = state.zones[idx];
      const p = clampRectToGrid(state.gridCols, state.gridRows, action.gridX, action.gridY, z.widthCells, z.heightCells);
      const next = state.zones.slice();
      next[idx] = { ...z, gridX: p.x, gridY: p.y };
      return { ...state, zones: next };
    }

    case 'moveLabel': {
      const idx = state.labels.findIndex(l => l.id === action.id);
      if (idx < 0) return state;
      const l = state.labels[idx];
      const p = clampRectToGrid(state.gridCols, state.gridRows, action.gridX, action.gridY, 1, 1);
      const next = state.labels.slice();
      next[idx] = { ...l, gridX: p.x, gridY: p.y };
      return { ...state, labels: next };
    }

    case 'resizeZone': {
      const idx = state.zones.findIndex(z => z.id === action.id);
      if (idx < 0) return state;
      const z = state.zones[idx];
      const w = clamp(Math.round(action.widthCells), 2, state.gridCols);
      const h = clamp(Math.round(action.heightCells), 2, state.gridRows);
      const p = clampRectToGrid(state.gridCols, state.gridRows, z.gridX, z.gridY, w, h);
      const next = state.zones.slice();
      next[idx] = { ...z, gridX: p.x, gridY: p.y, widthCells: w, heightCells: h };
      return { ...state, zones: next };
    }

    case 'renameZone': {
      return { ...state, zones: state.zones.map(z => (z.id === action.id ? { ...z, name: action.name } : z)) };
    }

    case 'renameLabel': {
      return { ...state, labels: state.labels.map(l => (l.id === action.id ? { ...l, text: action.text } : l)) };
    }

    case 'renumberTable': {
      const nextTables = state.tables.map(t => (t.id === action.id ? { ...t, number: action.num } : t));
      const maxNumber = nextTables.reduce(
        (m, t) => Math.max(m, typeof t.number === 'number' ? t.number : 0),
        0
      );
      return { ...state, tables: nextTables, tableCounter: Math.max(state.tableCounter, maxNumber + 1) };
    }

    case 'updateTable': {
      const idx = state.tables.findIndex(t => t.id === action.id);
      if (idx < 0) return state;
      const prev = state.tables[idx];
      const nextSeats =
        action.patch.seats !== undefined ? clampTableSeats(action.patch.seats) : prev.seats;
      const nextType = action.patch.type ?? prev.type;
      const nextOrientation = action.patch.orientation ?? prev.orientation;
      const nextNumber =
        action.patch.number === undefined
          ? prev.number
          : action.patch.number == null
            ? undefined
            : clampTableNumber(action.patch.number);
      const { w, h } = tableCellSize(nextType, nextSeats, nextOrientation);
      const nextCols = clamp(Math.max(state.gridCols, prev.gridX + w + 2), 20, 300);
      const nextRows = clamp(Math.max(state.gridRows, prev.gridY + h + 2), 20, 300);
      const p = clampRectToGrid(nextCols, nextRows, prev.gridX, prev.gridY, w, h);
      const next: PlacedTable = {
        ...prev,
        ...action.patch,
        seats: nextSeats,
        type: nextType,
        orientation: nextOrientation,
        number: nextNumber,
        gridX: p.x,
        gridY: p.y,
      };
      const nextTables = state.tables.slice();
      nextTables[idx] = next;
      const maxNumber = nextTables.reduce(
        (m, t) => Math.max(m, typeof t.number === 'number' ? t.number : 0),
        0
      );
      return {
        ...state,
        gridCols: nextCols,
        gridRows: nextRows,
        tables: nextTables,
        tableCounter: Math.max(state.tableCounter, maxNumber + 1),
      };
    }

    case 'setTableDbIds': {
      const ids = action.ids;
      if (!ids || !Object.keys(ids).length) return state;
      let changed = false;
      const nextTables = state.tables.map((t) => {
        const dbId = ids[t.id];
        if (!dbId || t.dbId === dbId) return t;
        changed = true;
        return { ...t, dbId };
      });
      return changed ? { ...state, tables: nextTables } : state;
    }

    default:
      return state;
  }
}

export function useSeatingState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const selectedIds = state.selectedIds;

  const api = useMemo(
    () => ({
      gridCols: state.gridCols,
      gridRows: state.gridRows,
      tables: state.tables,
      zones: state.zones,
      labels: state.labels,
      selectedIds,
      tableCounter: state.tableCounter,

      hydrate: (partial: Partial<State>) => dispatch({ type: 'hydrate', state: partial }),
      setGrid: (cols: number, rows: number) => dispatch({ type: 'setGrid', cols, rows }),

      addTable: (config: TableConfig, gridX: number, gridY: number) =>
        dispatch({ type: 'addTable', config, gridX, gridY }),
      addZone: (name: string, gridX: number, gridY: number, widthCells: number, heightCells: number) =>
        dispatch({ type: 'addZone', name, gridX, gridY, widthCells, heightCells }),
      addLabel: (text: string, gridX: number, gridY: number) => dispatch({ type: 'addLabel', text, gridX, gridY }),

      moveTable: (id: string, gridX: number, gridY: number) => dispatch({ type: 'moveTable', id, gridX, gridY }),
      moveZone: (id: string, gridX: number, gridY: number) => dispatch({ type: 'moveZone', id, gridX, gridY }),
      moveLabel: (id: string, gridX: number, gridY: number) => dispatch({ type: 'moveLabel', id, gridX, gridY }),

      resizeZone: (id: string, widthCells: number, heightCells: number) =>
        dispatch({ type: 'resizeZone', id, widthCells, heightCells }),

      renameZone: (id: string, name: string) => dispatch({ type: 'renameZone', id, name }),
      renameLabel: (id: string, text: string) => dispatch({ type: 'renameLabel', id, text }),
      renumberTable: (id: string, num: number | undefined) => dispatch({ type: 'renumberTable', id, num }),
      updateTable: (
        id: string,
        patch: Partial<Pick<PlacedTable, 'number' | 'seats' | 'type' | 'orientation' | 'dbId'>>
      ) => dispatch({ type: 'updateTable', id, patch }),
      setTableDbIds: (ids: Record<string, string>) => dispatch({ type: 'setTableDbIds', ids }),

      toggleSelect: (id: string, multi: boolean) => dispatch({ type: 'toggleSelect', id, multi }),
      clearSelection: () => dispatch({ type: 'clearSelection' }),
      selectMultiple: (ids: string[]) => dispatch({ type: 'selectMultiple', ids }),

      removeSelected: () => dispatch({ type: 'removeSelected' }),
      removeTable: (id: string) => dispatch({ type: 'removeTable', id }),
    }),
    [selectedIds, state.gridCols, state.gridRows, state.labels, state.tableCounter, state.tables, state.zones]
  );

  return api;
}

export type UseSeatingStateApi = ReturnType<typeof useSeatingState>;
export type SeatingStateSnapshot = State;

// expo-router treats files under `app/` as routes on web; provide a default export.
export default function SeatingUseStateRouteShim() {
  return null;
}
