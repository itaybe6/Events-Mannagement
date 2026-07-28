import type { SupabaseClient } from '@supabase/supabase-js';

/** Dynamic placeholder inserted into SMS / WhatsApp message bodies. */
export const TABLE_NUMBER_TOKEN = '{מספר_שולחן}';

/** Sample value shown in message previews. */
export const TABLE_NUMBER_PREVIEW = '12';

export async function fetchEventHasSeating(supabase: SupabaseClient, eventId: string): Promise<boolean> {
  const id = String(eventId || '').trim();
  if (!id) return false;
  const { count, error } = await supabase.from('tables').select('id', { count: 'exact', head: true }).eq('event_id', id);
  if (error) {
    console.warn('Failed to check seating map:', error);
    return false;
  }
  return (count ?? 0) > 0;
}
