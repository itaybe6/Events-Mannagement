import { supabase } from '../supabase';
import { Message } from '@/types';

export type MessageReportRow = {
  eventId: string;
  eventTitle: string;
  eventOwnerName: string;
  sendDate: string; // YYYY-MM-DD (Asia/Jerusalem)
  messageType: string; // 'SMS' | 'וואטסאפ'
  sentCount: number;
  failedCount: number;
  totalCount: number;
  lastSentAt: string | null; // ISO
};

function resolveEventDisplayName(event: {
  title?: unknown;
  groom_name?: unknown;
  bride_name?: unknown;
} | null): string {
  const groom = String(event?.groom_name ?? '').trim();
  const bride = String(event?.bride_name ?? '').trim();
  if (groom && bride) return `${groom} & ${bride}`;
  if (groom || bride) return groom || bride;

  const rawTitle = String(event?.title ?? '').trim();
  if (!rawTitle) return '';
  const parts = rawTitle.split(/(?:\s*[–—-]\s*)/g).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts.slice(1).join(' - ') || rawTitle;
  return rawTitle;
}

const localDateKey = (iso: string) => {
  // Group by the Israeli calendar day to match the SQL aggregation.
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
    return parts; // en-CA yields YYYY-MM-DD
  } catch {
    return String(iso).slice(0, 10);
  }
};

export const messageService = {
  // Aggregated send report for the admin reports page.
  //
  // Sourced from the scheduled-notification recipients ledger
  // (scheduled_notification_sms_run_recipients). Every automatic / immediate
  // notification send — SMS *and* WhatsApp — writes one row per recipient here,
  // and admins already have RLS read access to it. This means scheduled sends
  // show up in the report with no extra DB setup.
  //
  // One row per (event, calendar day in Asia/Jerusalem, channel) with
  // sent / failed / total counts.
  getMessageReports: async (range?: { from?: Date | null; to?: Date | null }): Promise<MessageReportRow[]> => {
    const fromIso = range?.from ? range.from.toISOString() : null;
    const toIso = range?.to ? range.to.toISOString() : null;

    // Embedded resources come back as a to-one object (sometimes wrapped in an
    // array depending on PostgREST inference) — unwrap defensively.
    const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;

    let query = supabase
      .from('scheduled_notification_sms_run_recipients')
      .select(
        `event_id,
         status,
         sent_at,
         created_at,
         run:run_id (
           notification_type,
           setting:notification_setting_id ( channel, title )
         ),
         event:event_id ( title, groom_name, bride_name, user:users ( name ) )`
      )
      .order('created_at', { ascending: false })
      .limit(50000);

    // created_at is always present and tracks the send time closely, so it is a
    // reliable column to range-filter on (sent_at is null for skipped rows).
    if (fromIso) query = query.gte('created_at', fromIso);
    if (toIso) query = query.lt('created_at', toIso);

    const { data: rows, error } = await query;
    if (error) throw error;

    const buckets = new Map<string, MessageReportRow>();
    for (const row of (rows as any[]) ?? []) {
      const eventId = String(row?.event_id ?? '').trim();
      if (!eventId) continue;

      const whenIso = String(row?.sent_at || row?.created_at || '');
      if (!whenIso) continue;
      const day = localDateKey(whenIso);

      const run = one(row?.run);
      const setting = one(run?.setting);
      const event = one(row?.event);

      const channelRaw = String(setting?.channel ?? 'SMS').toUpperCase();
      const messageType = channelRaw === 'WHATSAPP' ? 'וואטסאפ' : 'SMS';
      const eventTitle =
        resolveEventDisplayName(event) || String(setting?.title ?? '').trim() || 'ללא שם';
      const eventOwnerName = String(one(event?.user)?.name ?? '').trim();

      const key = `${eventId}|${day}|${messageType}`;
      const status = String(row?.status ?? '').trim();

      const prev =
        buckets.get(key) ||
        ({
          eventId,
          eventTitle,
          eventOwnerName,
          sendDate: day,
          messageType,
          sentCount: 0,
          failedCount: 0,
          totalCount: 0,
          lastSentAt: null,
        } as MessageReportRow);

      // "total" counts actual send attempts (sent + failed). Skipped rows
      // (missing/invalid phone) are excluded so the totals stay meaningful.
      if (status === 'sent') {
        prev.sentCount += 1;
        prev.totalCount += 1;
      } else if (status === 'failed') {
        prev.failedCount += 1;
        prev.totalCount += 1;
      }

      if (row?.sent_at) {
        const sa = String(row.sent_at);
        if (!prev.lastSentAt || new Date(sa).getTime() > new Date(prev.lastSentAt).getTime()) {
          prev.lastSentAt = sa;
        }
      }
      buckets.set(key, prev);
    }

    // Drop buckets that ended up with no real attempts (e.g. all-skipped runs).
    return Array.from(buckets.values())
      .filter((b) => b.totalCount > 0)
      .sort((a, b) => {
        if (a.sendDate !== b.sendDate) return a.sendDate < b.sendDate ? 1 : -1;
        return a.eventTitle.localeCompare(b.eventTitle, 'he');
      });
  },

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