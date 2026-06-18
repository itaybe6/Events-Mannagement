import { supabase } from '../supabase';

export type DirectSmsBalanceResult = {
  ok: boolean;
  directSmsCredits?: string;
  message?: string;
};

// There is a single Pulseem account for the whole app. The Edge Function
// `pulseem-admin-credentials` reads the balance using the server-side
// PULSEEM_API_KEY secret. It authorizes the logged-in admin via their JWT, so we
// invoke it through the regular `supabase` client (which automatically attaches
// the current user's session token). The service-role key is never sent from the
// browser.
export const pulseemBalanceService = {
  fetchDirectSmsBalance: async (subAccountName?: string): Promise<DirectSmsBalanceResult> => {
    const { data, error } = await supabase.functions.invoke('pulseem-admin-credentials', {
      body: {
        action: 'fetch_direct_sms_balance',
        ...(subAccountName ? { subAccountName } : {}),
      },
    });

    if (data && typeof data === 'object') {
      return data as DirectSmsBalanceResult;
    }

    return {
      ok: false,
      message: error?.message ? 'שגיאה בקריאת יתרת SMS' : 'לא ניתן לקרוא יתרת SMS API',
    };
  },
};
