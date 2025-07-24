import { supabase } from '../supabase';
import { Guest } from '@/types';

export const guestService = {
  // Get all guests for an event
  getGuests: async (eventId: string): Promise<Guest[]> => {
    try {
      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('event_id', eventId)
        .order('name');

      if (error) throw error;

      return data.map(guest => ({
        id: guest.id,
        name: guest.name,
        phone: guest.phone || '',
        status: guest.status as Guest['status'],
        tableId: guest.table_id,
        gift: Number(guest.gift_amount) || 0,
        message: guest.message || '',
        category_id: guest.category_id,
      }));
    } catch (error) {
      console.error('Get guests error:', error);
      throw error;
    }
  },

  // Add new guest
  addGuest: async (eventId: string, guest: Omit<Guest, 'id'>): Promise<Guest> => {
    try {
      const { data, error } = await supabase
        .from('guests')
        .insert({
          event_id: eventId,
          name: guest.name,
          phone: guest.phone,
          status: guest.status,
          table_id: guest.tableId,
          gift_amount: guest.gift,
          message: guest.message,
          category_id: guest.category_id,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
        category_id: data.category_id,
      };
    } catch (error) {
      console.error('Add guest error:', error);
      throw error;
    }
  },

  // Update guest
  updateGuest: async (guestId: string, updates: Partial<Omit<Guest, 'id'>>): Promise<Guest> => {
    try {
      const updateData: any = {};
      
      if (updates.name) updateData.name = updates.name;
      if (updates.phone) updateData.phone = updates.phone;
      if (updates.status) updateData.status = updates.status;
      if (updates.tableId !== undefined) updateData.table_id = updates.tableId;
      if (updates.gift !== undefined) updateData.gift_amount = updates.gift;
      if (updates.message !== undefined) updateData.message = updates.message;

      const { data, error } = await supabase
        .from('guests')
        .update(updateData)
        .eq('id', guestId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
        category_id: data.category_id,
      };
    } catch (error) {
      console.error('Update guest error:', error);
      throw error;
    }
  },

  // Delete guest
  deleteGuest: async (guestId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('guests')
        .delete()
        .eq('id', guestId);

      if (error) throw error;
    } catch (error) {
      console.error('Delete guest error:', error);
      throw error;
    }
  },

  // Update guest status
  updateGuestStatus: async (guestId: string, status: Guest['status']): Promise<Guest> => {
    try {
      const { data, error } = await supabase
        .from('guests')
        .update({ status })
        .eq('id', guestId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
      };
    } catch (error) {
      console.error('Update guest status error:', error);
      throw error;
    }
  },

  // Assign guest to table
  assignGuestToTable: async (guestId: string, tableId: string | null): Promise<Guest> => {
    try {
      const { data, error } = await supabase
        .from('guests')
        .update({ table_id: tableId })
        .eq('id', guestId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
      };
    } catch (error) {
      console.error('Assign guest to table error:', error);
      throw error;
    }
  },

  async getGuestCategories(eventId: string) {
    const { data, error } = await supabase
      .from('guest_categories')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(category => ({
      id: category.id,
      name: category.name,
      event_id: category.event_id,
      side: category.side || 'groom', // ברירת מחדל לחתן
    }));
  },

  async addGuestCategory(eventId: string, name: string, side: 'groom' | 'bride' = 'groom') {
    const { data, error } = await supabase
      .from('guest_categories')
      .insert({ event_id: eventId, name, side })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      event_id: data.event_id,
      side: data.side || 'groom',
    };
  },

  async getGuestCategoriesBySide(eventId: string, side: 'groom' | 'bride') {
    const { data, error } = await supabase
      .from('guest_categories')
      .select('*')
      .eq('event_id', eventId)
      .eq('side', side)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(category => ({
      id: category.id,
      name: category.name,
      event_id: category.event_id,
      side: category.side || 'groom',
    }));
  },

  async updateGuestCategory(categoryId: string, updates: { name?: string }) {
    const { data, error } = await supabase
      .from('guest_categories')
      .update(updates)
      .eq('id', categoryId)
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      event_id: data.event_id,
      side: data.side || 'groom',
    };
  },
}; 