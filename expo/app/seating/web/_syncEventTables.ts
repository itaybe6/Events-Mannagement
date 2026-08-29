import { supabase } from '@/lib/supabase';
import { tableShape, type PlacedTable } from './_types';

type DbTableRow = {
  id: string;
  number: number | null;
  name: string | null;
  capacity: number | null;
};

function uniqueNumberError(error: { code?: string; message?: string } | null) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  if (code === '23505' || message.includes('idx_tables_event_number_unique')) {
    return new Error('מספר שולחן כפול. שנו מספרים כפולים לפני השמירה.');
  }
  return error instanceof Error ? error : new Error(message || 'לא ניתן לעדכן את השולחנות');
}

function defaultTableName(num: number | undefined) {
  return typeof num === 'number' ? `שולחן ${num}` : 'שולחן';
}

function isDefaultName(name: string | null | undefined, num: number | null | undefined) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return true;
  if (typeof num === 'number' && trimmed === `שולחן ${num}`) return true;
  return false;
}

export function attachDbIdsToTables(tables: PlacedTable[], dbRows: DbTableRow[]): PlacedTable[] {
  const used = new Set<string>();
  const byId = new Map(dbRows.map((row) => [String(row.id), row]));
  const byNumber = new Map<number, DbTableRow[]>();
  for (const row of dbRows) {
    if (typeof row.number !== 'number') continue;
    const list = byNumber.get(row.number) ?? [];
    list.push(row);
    byNumber.set(row.number, list);
  }

  return tables.map((table) => {
    const explicit = table.dbId ? byId.get(String(table.dbId)) : undefined;
    if (explicit && !used.has(explicit.id)) {
      used.add(explicit.id);
      return { ...table, dbId: explicit.id };
    }
    if (typeof table.number === 'number') {
      const match = (byNumber.get(table.number) ?? []).find((row) => !used.has(row.id));
      if (match) {
        used.add(match.id);
        return { ...table, dbId: match.id };
      }
    }
    return { ...table, dbId: undefined };
  });
}

export function findDuplicateTableNumbers(tables: PlacedTable[]): number[] {
  const counts = new Map<number, number>();
  for (const table of tables) {
    if (typeof table.number !== 'number') continue;
    counts.set(table.number, (counts.get(table.number) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([num]) => num)
    .sort((a, b) => a - b);
}

function toRecord(table: PlacedTable, eventId: string) {
  const number = typeof table.number === 'number' ? table.number : null;
  return {
    event_id: eventId,
    number,
    capacity: table.seats,
    shape: tableShape(table.type),
    name: defaultTableName(table.number),
    x: Math.round(table.gridX * 40),
    y: Math.round(table.gridY * 40),
  };
}

/**
 * Update / insert / delete `public.tables` in place.
 * Existing guest `table_id` assignments are kept for tables that remain on the sketch.
 */
export async function syncEventTables(
  eventId: string,
  canvasTables: PlacedTable[]
): Promise<Record<string, string>> {
  const duplicates = findDuplicateTableNumbers(canvasTables);
  if (duplicates.length) {
    throw new Error(`מספרי שולחן כפולים: ${duplicates.join(', ')}`);
  }

  const { data, error } = await supabase
    .from('tables')
    .select('id,number,name,capacity')
    .eq('event_id', eventId);
  if (error) throw error;

  const existing = ((data as DbTableRow[]) || []).filter(Boolean);
  const existingById = new Map(existing.map((row) => [String(row.id), row]));
  const canvasDbIds = new Set(
    canvasTables.map((table) => table.dbId).filter((id): id is string => Boolean(id) && existingById.has(id))
  );

  const toDelete = existing.filter((row) => !canvasDbIds.has(row.id));
  const toUpdate = canvasTables.filter((table) => table.dbId && existingById.has(table.dbId));
  const toInsert = canvasTables.filter((table) => !table.dbId || !existingById.has(table.dbId));

  const idsToClearNumber = [
    ...toDelete.map((row) => row.id),
    ...toUpdate
      .filter((table) => existingById.get(table.dbId as string)?.number !== table.number)
      .map((table) => table.dbId as string),
  ];

  if (idsToClearNumber.length) {
    const { error: clearError } = await supabase.from('tables').update({ number: null }).in('id', idsToClearNumber);
    if (clearError) throw uniqueNumberError(clearError);
  }

  if (toDelete.length) {
    const { error: deleteError } = await supabase
      .from('tables')
      .delete()
      .in(
        'id',
        toDelete.map((row) => row.id)
      );
    if (deleteError) throw deleteError;
  }

  if (toUpdate.length) {
    const chunkSize = 8;
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
      const chunk = toUpdate.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map((table) => {
          const prev = existingById.get(table.dbId as string);
          const number = typeof table.number === 'number' ? table.number : null;
          const patch: Record<string, unknown> = {
            number,
            capacity: table.seats,
            shape: tableShape(table.type),
            x: Math.round(table.gridX * 40),
            y: Math.round(table.gridY * 40),
          };
          if (isDefaultName(prev?.name, prev?.number)) {
            patch.name = defaultTableName(table.number);
          }
          return supabase.from('tables').update(patch).eq('id', table.dbId as string);
        })
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw uniqueNumberError(failed.error);
    }
  }

  const dbIdsByCanvasId: Record<string, string> = {};
  for (const table of toUpdate) {
    if (table.dbId) dbIdsByCanvasId[table.id] = table.dbId;
  }

  if (toInsert.length) {
    const records = toInsert.map((table) => toRecord(table, eventId));
    const { data: inserted, error: insertError } = await supabase.from('tables').insert(records).select('id,number');
    if (insertError) throw uniqueNumberError(insertError);

    const insertedRows = ((inserted as Array<{ id: string; number: number | null }>) || []).filter(Boolean);
    const unusedInserted = insertedRows.slice();
    for (const table of toInsert) {
      const idx = unusedInserted.findIndex((row) => row.number === table.number);
      if (idx < 0) continue;
      const [row] = unusedInserted.splice(idx, 1);
      dbIdsByCanvasId[table.id] = String(row.id);
    }
  }

  return dbIdsByCanvasId;
}

// expo-router treats files under `app/` as routes on web; provide a default export.
export default function SyncEventTablesRouteShim() {
  return null;
}
