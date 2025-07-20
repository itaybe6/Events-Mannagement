import { supabase } from '../supabase';
import { Gift } from '@/types';

export const giftService = {
  // Get all gifts for an event
  getGifts: async (eventId: string): Promise<Gift[]> => {
    try {
      const { data, error } = await supabase
        .from('gifts')
        .select('*')
        .eq('event_id', eventId)
        .order('date', { ascending: false });

      if (error) throw error;

      return data.map(gift => ({
        id: gift.id,
        guestName: gift.guest_name,
        amount: Number(gift.amount),
        message: gift.message || '',
        date: new Date(gift.date),
        status: gift.status as Gift['status'],
      }));
    } catch (error) {
      console.error('Get gifts error:', error);
      throw error;
    }
  },

  // Add new gift
  addGift: async (eventId: string, gift: Omit<Gift, 'id' | 'date'>): Promise<Gift> => {
    try {
      const { data, error } = await supabase
        .from('gifts')
        .insert({
          event_id: eventId,
          guest_name: gift.guestName,
          amount: gift.amount,
          message: gift.message,
          status: gift.status,
          date: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        guestName: data.guest_name,
        amount: Number(data.amount),
        message: data.message || '',
        date: new Date(data.date),
        status: data.status as Gift['status'],
      };
    } catch (error) {
      console.error('Add gift error:', error);
      throw error;
    }
  },

  // Update gift
  updateGift: async (giftId: string, updates: Partial<Omit<Gift, 'id' | 'date'>>): Promise<Gift> => {
    try {
      const updateData: any = {};
      
      if (updates.guestName) updateData.guest_name = updates.guestName;
      if (updates.amount !== undefined) updateData.amount = updates.amount;
      if (updates.message !== undefined) updateData.message = updates.message;
      if (updates.status) updateData.status = updates.status;

      const { data, error } = await supabase
        .from('gifts')
        .update(updateData)
        .eq('id', giftId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        guestName: data.guest_name,
        amount: Number(data.amount),
        message: data.message || '',
        date: new Date(data.date),
        status: data.status as Gift['status'],
      };
    } catch (error) {
      console.error('Update gift error:', error);
      throw error;
    }
  },

  // Update gift status
  updateGiftStatus: async (giftId: string, status: Gift['status']): Promise<Gift> => {
    try {
      const { data, error } = await supabase
        .from('gifts')
        .update({ status })
        .eq('id', giftId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        guestName: data.guest_name,
        amount: Number(data.amount),
        message: data.message || '',
        date: new Date(data.date),
        status: data.status as Gift['status'],
      };
    } catch (error) {
      console.error('Update gift status error:', error);
      throw error;
    }
  },

  // Delete gift
  deleteGift: async (giftId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('gifts')
        .delete()
        .eq('id', giftId);

      if (error) throw error;
    } catch (error) {
      console.error('Delete gift error:', error);
      throw error;
    }
  },

  // Get total gifts amount for event
  getTotalGiftsAmount: async (eventId: string): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('gifts')
        .select('amount')
        .eq('event_id', eventId)
        .eq('status', 'התקבל');

      if (error) throw error;

      return data.reduce((total, gift) => total + Number(gift.amount), 0);
    } catch (error) {
      console.error('Get total gifts amount error:', error);
      throw error;
    }
  },
}; 