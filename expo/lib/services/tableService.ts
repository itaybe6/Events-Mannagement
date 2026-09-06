import { supabase } from '../supabase';
import { cachedQuery } from '../queryCache';
import { Table } from '@/types';

export const tableService = {
  // Get all tables for an event
  getTables: async (eventId: string): Promise<Table[]> => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select(`
          *,
          guests:guests(id)
        `)
        .eq('event_id', eventId)
        .order('name');

      if (error) throw error;

      return data.map(table => ({
        id: table.id,
        name: table.name,
        number: table.number ?? undefined,
        capacity: table.capacity,
        area: table.area || '',
        shape: table.shape as Table['shape'] || 'square',
        guests: table.guests.map((guest: any) => guest.id) || [],
        x: table.x ?? undefined,
        y: table.y ?? undefined,
        seated_guests: table.seated_guests ?? undefined,
      }));
    } catch (error) {
      console.error('Get tables error:', error);
      throw error;
    }
  },

  // Tables without the guests join. Check-in already has the guest list, so
  // pulling every guest id again on this query doubled the payload.
  getTablesLite: async (eventId: string): Promise<Table[]> => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('id,name,number,capacity,area,shape,x,y,seated_guests')
        .eq('event_id', eventId)
        .order('number');

      if (error) throw error;

      return (data || []).map((table) => ({
        id: table.id,
        name: table.name,
        number: table.number ?? undefined,
        capacity: table.capacity,
        area: table.area || '',
        shape: (table.shape as Table['shape']) || 'square',
        guests: [],
        x: table.x ?? undefined,
        y: table.y ?? undefined,
        seated_guests: table.seated_guests ?? undefined,
      }));
    } catch (error) {
      console.error('Get tables (lite) error:', error);
      throw error;
    }
  },

  // Count tables for an event without pulling rows or the guests join.
  // The couple home screen only needs the number of tables, so a head/count
  // query is dramatically cheaper than `getTables` (which joins every guest).
  getTablesCount: async (eventId: string): Promise<number> => {
    try {
      const cleanId = String(eventId || '').trim();
      if (!cleanId) return 0;

      return cachedQuery(
        `tables:count:${cleanId}`,
        async () => {
          const { count, error } = await supabase
            .from('tables')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', cleanId);

          if (error) throw error;
          return count ?? 0;
        },
        { maxAgeMs: 30_000 }
      );
    } catch (error) {
      console.error('Get tables count error:', error);
      throw error;
    }
  },

  // Add new table
  addTable: async (eventId: string, table: Omit<Table, 'id' | 'guests'>): Promise<Table> => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .insert({
          event_id: eventId,
          name: table.name,
          number: table.number ?? null,
          capacity: table.capacity,
          area: table.area,
          shape: table.shape || 'square',
          x: table.x ?? null,
          y: table.y ?? null,
          seated_guests: table.seated_guests ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        number: data.number ?? undefined,
        capacity: data.capacity,
        area: data.area || '',
        shape: data.shape as Table['shape'] || 'square',
        guests: [],
        x: data.x ?? undefined,
        y: data.y ?? undefined,
        seated_guests: data.seated_guests ?? undefined,
      };
    } catch (error) {
      console.error('Add table error:', error);
      throw error;
    }
  },

  // Update table
  updateTable: async (tableId: string, updates: Partial<Omit<Table, 'id' | 'guests'>>): Promise<Table> => {
    try {
      const updateData: any = {};
      
      if (updates.name) updateData.name = updates.name;
      if (updates.number !== undefined) updateData.number = updates.number;
      if (updates.capacity !== undefined) updateData.capacity = updates.capacity;
      if (updates.area !== undefined) updateData.area = updates.area;
      if (updates.shape) updateData.shape = updates.shape;
      if (updates.x !== undefined) updateData.x = updates.x;
      if (updates.y !== undefined) updateData.y = updates.y;
      if (updates.seated_guests !== undefined) updateData.seated_guests = updates.seated_guests;

      const { data, error } = await supabase
        .from('tables')
        .update(updateData)
        .eq('id', tableId)
        .select(`
          *,
          guests:guests(id)
        `)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        number: data.number ?? undefined,
        capacity: data.capacity,
        area: data.area || '',
        shape: data.shape as Table['shape'] || 'square',
        guests: data.guests.map((guest: any) => guest.id) || [],
        x: data.x ?? undefined,
        y: data.y ?? undefined,
        seated_guests: data.seated_guests ?? undefined,
      };
    } catch (error) {
      console.error('Update table error:', error);
      throw error;
    }
  },

  // Delete table
  deleteTable: async (tableId: string): Promise<void> => {
    try {
      // First, remove all guests from this table
      await supabase
        .from('guests')
        .update({ table_id: null })
        .eq('table_id', tableId);

      // Then delete the table
      const { error } = await supabase
        .from('tables')
        .delete()
        .eq('id', tableId);

      if (error) throw error;
    } catch (error) {
      console.error('Delete table error:', error);
      throw error;
    }
  },

  // Get table with guests
  getTableWithGuests: async (tableId: string): Promise<Table | null> => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select(`
          *,
          guests:guests(id, name, phone, status)
        `)
        .eq('id', tableId)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        number: data.number ?? undefined,
        capacity: data.capacity,
        area: data.area || '',
        shape: data.shape as Table['shape'] || 'square',
        guests: data.guests.map((guest: any) => guest.id) || [],
        x: data.x ?? undefined,
        y: data.y ?? undefined,
        seated_guests: data.seated_guests ?? undefined,
      };
    } catch (error) {
      console.error('Get table with guests error:', error);
      throw error;
    }
  },
}; 
/** One table as the live map reads it: layout plus the manual headcount correction. */
export type LiveSeatingTableRow = {
  id: string;
  number: number | null;
  name: string | null;
  capacity: number;
  area: string;
  shape: Table['shape'] | null;
  x: number | null;
  y: number | null;
  /** Signed correction on top of check-in. 0 when the migration hasn't run yet. */
  liveExtraSeated: number;
};

const LIVE_SEATING_COLUMNS = 'id,number,name,capacity,area,shape,x,y,live_extra_seated';
const LIVE_SEATING_COLUMNS_LEGACY = 'id,number,name,capacity,area,shape,x,y';

/** True when the database predates the live-seating migration. */
function isMissingLiveColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return String(error.message || '').includes('live_extra_seated');
}

/** True when the database predates the live-seating migration's RPCs. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('does not exist') && message.includes('function');
}

function mapLiveSeatingRow(row: Record<string, any>): LiveSeatingTableRow {
  return {
    id: String(row.id),
    number: row.number ?? null,
    name: row.name ?? null,
    capacity: Number(row.capacity) || 0,
    area: String(row.area || ''),
    shape: (row.shape as Table['shape']) ?? null,
    x: row.x ?? null,
    y: row.y ?? null,
    liveExtraSeated: Number(row.live_extra_seated) || 0,
  };
}

/**
 * Merge a realtime `tables` row into local state without wiping fields the
 * payload omitted (or temporarily nulled, e.g. number during a sketch save).
 */
export function applyLiveSeatingRealtimeRow(
  current: LiveSeatingTableRow | null,
  row: Record<string, any>
): LiveSeatingTableRow {
  const mapped = mapLiveSeatingRow(row);
  if (!current) return mapped;

  const has = (key: string) => Object.prototype.hasOwnProperty.call(row, key);

  return {
    id: mapped.id,
    number: has('number') ? (mapped.number ?? current.number) : current.number,
    name: has('name') ? (mapped.name ?? current.name) : current.name,
    capacity: has('capacity') && mapped.capacity > 0 ? mapped.capacity : current.capacity,
    area: has('area') ? mapped.area : current.area,
    shape: has('shape') ? mapped.shape : current.shape,
    x: has('x') && row.x != null ? mapped.x : current.x,
    y: has('y') && row.y != null ? mapped.y : current.y,
    liveExtraSeated: has('live_extra_seated') ? mapped.liveExtraSeated : current.liveExtraSeated,
  };
}

export const liveSeatingService = {
  /**
   * Tables of an event with their manual live corrections.
   *
   * `supportsLiveExtra` is false on databases where the live-seating migration
   * hasn't been applied — the map still renders check-in numbers, it just can't
   * be corrected by hand.
   */
  getTables: async (
    eventId: string
  ): Promise<{ tables: LiveSeatingTableRow[]; supportsLiveExtra: boolean }> => {
    const cleanId = String(eventId || '').trim();
    if (!cleanId) return { tables: [], supportsLiveExtra: true };

    const { data, error } = await supabase
      .from('tables')
      .select(LIVE_SEATING_COLUMNS)
      .eq('event_id', cleanId)
      .order('number');

    if (!error) {
      return { tables: ((data as any[]) || []).map(mapLiveSeatingRow), supportsLiveExtra: true };
    }

    if (!isMissingLiveColumn(error)) throw error;

    const legacy = await supabase
      .from('tables')
      .select(LIVE_SEATING_COLUMNS_LEGACY)
      .eq('event_id', cleanId)
      .order('number');

    if (legacy.error) throw legacy.error;
    return { tables: ((legacy.data as any[]) || []).map(mapLiveSeatingRow), supportsLiveExtra: false };
  },

  /**
   * Moves one table's manual correction by `delta` and returns the stored value.
   *
   * Prefers the `adjust_table_live_seated` RPC, which applies the delta inside
   * the database so simultaneous taps from two usher stations both land, and
   * clamps the result so the live total never drops below zero. Falls back to a
   * read-modify-write where the RPC is missing.
   *
   * `checkedInPeople` is the arrived headcount the caller already computed; it
   * only bounds the fallback path.
   */
  adjustLiveExtra: async (
    tableId: string,
    delta: number,
    checkedInPeople: number
  ): Promise<number> => {
    const cleanId = String(tableId || '').trim();
    const step = Math.trunc(Number(delta) || 0);
    if (!cleanId || step === 0) throw new Error('Invalid live seating adjustment');

    const { data, error } = await supabase.rpc('adjust_table_live_seated', {
      p_table_id: cleanId,
      p_delta: step,
    });

    if (!error) return Number(data) || 0;
    if (!isMissingFunction(error)) throw error;

    const current = await supabase
      .from('tables')
      .select('live_extra_seated')
      .eq('id', cleanId)
      .single();

    if (current.error) throw current.error;

    const floor = -Math.max(0, Math.floor(Number(checkedInPeople) || 0));
    const next = Math.max((Number((current.data as any)?.live_extra_seated) || 0) + step, floor);

    const { data: updated, error: updateError } = await supabase
      .from('tables')
      .update({ live_extra_seated: next, live_extra_updated_at: new Date().toISOString() })
      .eq('id', cleanId)
      .select('live_extra_seated')
      .single();

    if (updateError) throw updateError;
    return Number((updated as any)?.live_extra_seated) || 0;
  },

  /** Clears the manual correction on a single table. */
  clearLiveExtra: async (tableId: string): Promise<void> => {
    const cleanId = String(tableId || '').trim();
    if (!cleanId) return;

    const { error } = await supabase
      .from('tables')
      .update({ live_extra_seated: 0, live_extra_updated_at: new Date().toISOString() })
      .eq('id', cleanId);

    if (error) throw error;
  },

  /** Clears every manual correction in the event. Returns how many tables changed. */
  clearEventLiveExtra: async (eventId: string): Promise<number> => {
    const cleanId = String(eventId || '').trim();
    if (!cleanId) return 0;

    const { data, error } = await supabase.rpc('reset_event_live_seated', { p_event_id: cleanId });
    if (!error) return Number(data) || 0;
    if (!isMissingFunction(error)) throw error;

    const { error: updateError } = await supabase
      .from('tables')
      .update({ live_extra_seated: 0, live_extra_updated_at: new Date().toISOString() })
      .eq('event_id', cleanId)
      .neq('live_extra_seated', 0);

    if (updateError) throw updateError;
    return 0;
  },
};
