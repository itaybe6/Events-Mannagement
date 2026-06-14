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

    if (data?.ok === true) {
      return {
        ok: true,
        sent: data.sent,
        upstreamStatus: data.upstreamStatus,
        upstreamBody: data.upstreamBody,
      };
    }

    const bodyError = data?.error ? String(data.error) : '';
    const invokeError = error?.message ? String(error.message) : '';
    const friendlyError =
      bodyError ||
      (invokeError.includes('non-2xx') ? 'שגיאה בשרת. נסו שוב או פנו למנהל המערכת.' : invokeError) ||
      'שגיאה בשליחת הבקשה';

    return {
      ok: false,
      error: friendlyError,
      sent: data?.sent,
      upstreamStatus: data?.upstreamStatus,
      upstreamBody: data?.upstreamBody,
    };
  },
};
