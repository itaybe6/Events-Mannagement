import { supabase } from '../supabase';
import type {
  WhatsAppSettings,
  WhatsAppTemplate,
  WhatsAppTemplateButton,
  WhatsAppTemplateVariable,
} from '@/types';

function mapTemplateRow(row: any): WhatsAppTemplate {
  return {
    id: String(row.id),
    label: String(row.label ?? ''),
    templateName: String(row.template_name ?? ''),
    languageCode: String(row.language_code ?? 'he'),
    category: row.category ?? null,
    headerType: (String(row.header_type ?? 'none') as WhatsAppTemplate['headerType']) || 'none',
    bodyText: String(row.body_text ?? ''),
    variables: Array.isArray(row.variables) ? (row.variables as WhatsAppTemplateVariable[]) : [],
    buttons: Array.isArray(row.buttons) ? (row.buttons as WhatsAppTemplateButton[]) : [],
    isActive: row.is_active !== false,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  };
}

export type WhatsAppTemplateInput = {
  label: string;
  templateName: string;
  languageCode: string;
  category?: string | null;
  headerType: 'none' | 'image' | 'text';
  bodyText: string;
  variables: WhatsAppTemplateVariable[];
  buttons: WhatsAppTemplateButton[];
  isActive?: boolean;
};

function toRow(input: Partial<WhatsAppTemplateInput>) {
  const row: any = {};
  if (input.label !== undefined) row.label = input.label;
  if (input.templateName !== undefined) row.template_name = input.templateName;
  if (input.languageCode !== undefined) row.language_code = input.languageCode;
  if (input.category !== undefined) row.category = input.category;
  if (input.headerType !== undefined) row.header_type = input.headerType;
  if (input.bodyText !== undefined) row.body_text = input.bodyText;
  if (input.variables !== undefined) row.variables = input.variables;
  if (input.buttons !== undefined) row.buttons = input.buttons;
  if (input.isActive !== undefined) row.is_active = input.isActive;
  return row;
}

export const whatsappTemplateService = {
  list: async (opts?: { includeInactive?: boolean }): Promise<WhatsAppTemplate[]> => {
    let q = supabase.from('whatsapp_templates').select('*').order('created_at', { ascending: false });
    if (!opts?.includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return ((data as any[]) || []).map(mapTemplateRow);
  },

  create: async (input: WhatsAppTemplateInput): Promise<WhatsAppTemplate> => {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .insert(toRow(input))
      .select()
      .single();
    if (error) throw error;
    return mapTemplateRow(data);
  },

  update: async (id: string, input: Partial<WhatsAppTemplateInput>): Promise<WhatsAppTemplate> => {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .update({ ...toRow(input), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapTemplateRow(data);
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
    if (error) throw error;
  },

  getSettings: async (): Promise<WhatsAppSettings> => {
    const { data, error } = await supabase
      .from('whatsapp_settings')
      .select('daily_quota')
      .eq('id', true)
      .maybeSingle();
    if (error) throw error;
    return { dailyQuota: Number((data as any)?.daily_quota) || 0 };
  },

  updateSettings: async (settings: WhatsAppSettings): Promise<WhatsAppSettings> => {
    const { data, error } = await supabase
      .from('whatsapp_settings')
      .update({ daily_quota: settings.dailyQuota, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select('daily_quota')
      .single();
    if (error) throw error;
    return { dailyQuota: Number((data as any)?.daily_quota) || 0 };
  },

  /** WhatsApp messages already sent today (Asia/Jerusalem), for quota display. */
  sentToday: async (): Promise<number> => {
    const { data, error } = await supabase.rpc('whatsapp_sends_today');
    if (error) throw error;
    return Number(data) || 0;
  },

  /** Status of the dynamic access token (no secret value is ever returned). */
  getTokenStatus: async (): Promise<{ hasToken: boolean; hint: string | null; updatedAt: Date | null }> => {
    const { data, error } = await supabase
      .from('whatsapp_settings')
      .select('access_token_hint, access_token_updated_at')
      .eq('id', true)
      .maybeSingle();
    if (error) throw error;
    const hint = (data as any)?.access_token_hint ? String((data as any).access_token_hint) : null;
    const updatedRaw = (data as any)?.access_token_updated_at;
    return {
      hasToken: Boolean(hint),
      hint,
      updatedAt: updatedRaw ? new Date(updatedRaw) : null,
    };
  },

  /** Upload (encrypt + store) or clear the dynamic WhatsApp access token. Admin only. */
  setToken: async (token: string): Promise<{ ok: boolean; hint?: string; cleared?: boolean }> => {
    const sessionRes = await supabase.auth.getSession();
    const accessToken = sessionRes.data.session?.access_token;
    if (!accessToken) throw new Error('לא נמצא חיבור משתמש (נא להתחבר מחדש)');
    const { data, error } = await supabase.functions.invoke('set-whatsapp-token', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { token: String(token ?? '') },
    });
    if (error) throw error;
    return (data as any) || { ok: true };
  },
};
