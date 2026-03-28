import { supabase } from '../supabase';
import { Message } from '@/types';

export const messageService = {
  // Get all messages for an event
  getMessages: async (eventId: string): Promise<Message[]> => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('event_id', eventId)
        .order('sent_date', { ascending: false });

      if (error) throw error;

      return data.map(message => ({
        id: message.id,
        type: message.type as Message['type'],
        recipient: message.recipient,
        phone: message.phone,
        sentDate: new Date(message.sent_date),
        status: message.status,
      }));
    } catch (error) {
      console.error('Get messages error:', error);
      throw error;
    }
  },

  // Add new message
  addMessage: async (eventId: string, message: Omit<Message, 'id' | 'sentDate'>): Promise<Message> => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          event_id: eventId,
          type: message.type,
          recipient: message.recipient,
          phone: message.phone,
          status: message.status,
          sent_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        type: data.type as Message['type'],
        recipient: data.recipient,
        phone: data.phone,
        sentDate: new Date(data.sent_date),
        status: data.status,
      };
    } catch (error) {
      console.error('Add message error:', error);
      throw error;
    }
  },

  // Update message status
  updateMessageStatus: async (messageId: string, status: string): Promise<Message> => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .update({ status })
        .eq('id', messageId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        type: data.type as Message['type'],
        recipient: data.recipient,
        phone: data.phone,
        sentDate: new Date(data.sent_date),
        status: data.status,
      };
    } catch (error) {
      console.error('Update message status error:', error);
      throw error;
    }
  },

  // Delete message
  deleteMessage: async (messageId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
    } catch (error) {
      console.error('Delete message error:', error);
      throw error;
    }
  },
}; 