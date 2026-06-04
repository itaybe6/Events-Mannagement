import { supabase } from '../supabase';
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

  // Count tables for an event without pulling rows or the guests join.
  // The couple home screen only needs the number of tables, so a head/count
  // query is dramatically cheaper than `getTables` (which joins every guest).
  getTablesCount: async (eventId: string): Promise<number> => {
    try {
      const cleanId = String(eventId || '').trim();
      if (!cleanId) return 0;

      const { count, error } = await supabase
        .from('tables')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', cleanId);

      if (error) throw error;
      return count ?? 0;
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