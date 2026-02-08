import { supabase } from '../supabase';
import { Notification } from '@/types';

type DbNotification = {
  id: string;
  recipient_user_id: string;
  event_owner_id: string;
  event_id: string | null;
  type: string;
  title: string;
  body: string;
  metadata: any;
  created_at: string;
  read_at: string | null;
};

export const notificationService = {
  getMyNotifications: async (limit = 50): Promise<Notification[]> => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error('No authenticated user');

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const rows = (data ?? []) as DbNotification[];
      return rows.map((n) => ({
        id: n.id,
        recipientUserId: n.recipient_user_id,
        eventOwnerId: n.event_owner_id,
        eventId: n.event_id,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata ?? {},
        createdAt: new Date(n.created_at),
        readAt: n.read_at ? new Date(n.read_at) : null,
      }));
    } catch (error) {
      console.error('Get notifications error:', error);
      throw error;
    }
  },

  markAsRead: async (notificationId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Mark notification as read error:', error);
      throw error;
    }
  },
};

