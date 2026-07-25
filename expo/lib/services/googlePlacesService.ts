import { supabase } from '@/lib/supabase';

export type GooglePlacePrediction = {
  placeId: string;
  title: string;
  subtitle: string;
  description: string;
};

export type GooglePlaceDetails = {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string;
};

async function getAuthHeaders() {
  const sessionRes = await supabase.auth.getSession();
  const accessToken = sessionRes.data.session?.access_token;
  if (!accessToken) {
    throw new Error('לא נמצא חיבור משתמש. יש להתחבר מחדש.');
  }
  return { Authorization: `Bearer ${accessToken}` };
}
///asd
export const googlePlacesService = {
  async autocomplete(input: string): Promise<GooglePlacePrediction[]> {
    const query = String(input || '').trim();
    if (query.length < 2) return [];

    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('google-places', {
      headers,
      body: { action: 'autocomplete', input: query },
    });

    if (error) throw error;
    return Array.isArray((data as any)?.predictions) ? ((data as any).predictions as GooglePlacePrediction[]) : [];
  },
// asd
  async getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
    const cleanPlaceId = String(placeId || '').trim();
    if (!cleanPlaceId) throw new Error('Missing placeId');

    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('google-places', {
      headers,
      body: { action: 'details', placeId: cleanPlaceId },
    });

    if (error) throw error;
    const place = (data as any)?.place;
    if (!place) throw new Error('לא נמצאו פרטי מקום');
    return place as GooglePlaceDetails;
  },
};
