import { supabase } from '../supabase';

export type RegisterCreditTerminalResult = {
  ok: boolean;
  error?: string;
  sent?: {
    phone: string;
    uniqueDescription: string;
    eventDate: string;
    producer: string;
  };
  upstreamStatus?: number;
  upstreamBody?: unknown;
};

export const creditTerminalService = {
  registerTerminal: async (eventId: string): Promise<RegisterCreditTerminalResult> => {
    const cleanId = String(eventId || '').trim();
    if (!cleanId) {
      return { ok: false, error: 'חסר מזהה אירוע' };
    }

    const { data, error } = await supabase.functions.invoke('register-credit-terminal', {
      body: { eventId: cleanId },
    });

    if (error) {
      return { ok: false, error: error.message || 'שגיאה בשליחת הבקשה' };
    }

    if (data?.ok === true) {
      return {
        ok: true,
        sent: data.sent,
        upstreamStatus: data.upstreamStatus,
        upstreamBody: data.upstreamBody,
      };
    }

    return {
      ok: false,
      error: String(data?.error ?? 'שגיאה בשליחת הבקשה'),
      sent: data?.sent,
      upstreamStatus: data?.upstreamStatus,
      upstreamBody: data?.upstreamBody,
    };
  },
};
