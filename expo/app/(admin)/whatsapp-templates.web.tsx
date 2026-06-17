import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';
import { useLayoutStore } from '@/store/layoutStore';
import {
  whatsappTemplateService,
  type WhatsAppTemplateInput,
} from '@/lib/services/whatsappTemplateService';
import type {
  WhatsAppTemplate,
  WhatsAppTemplateButton,
  WhatsAppTemplateVariable,
} from '@/types';

const ui = {
  primary: '#1d4ed8',
  whatsapp: '#25D366',
  bg: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  text: '#111827',
  sub: '#6B7280',
  border: '#E5E7EB',
  danger: '#EF4444',
};

type EditorState = {
  id?: string;
  label: string;
  templateName: string;
  languageCode: string;
  headerType: 'none' | 'image' | 'text';
  bodyText: string;
  variables: WhatsAppTemplateVariable[];
  buttons: WhatsAppTemplateButton[];
  isActive: boolean;
};

const emptyEditor = (): EditorState => ({
  label: '',
  templateName: '',
  languageCode: 'he',
  headerType: 'none',
  bodyText: '',
  variables: [],
  buttons: [],
  isActive: true,
});

export default function WhatsappTemplatesWebScreen() {
  const router = useRouter();
  const { setTabBarVisible } = useLayoutStore();

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [dailyQuota, setDailyQuota] = useState<string>('1000');
  const [sentToday, setSentToday] = useState<number>(0);
  const [savingQuota, setSavingQuota] = useState(false);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, settings, today] = await Promise.all([
        whatsappTemplateService.list({ includeInactive: true }),
        whatsappTemplateService.getSettings().catch(() => ({ dailyQuota: 0 })),
        whatsappTemplateService.sentToday().catch(() => 0),
      ]);
      setTemplates(list);
      setDailyQuota(String(settings.dailyQuota || 0));
      setSentToday(today);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveQuota = useCallback(async () => {
    if (savingQuota) return;
    const n = Math.max(0, Math.floor(Number(dailyQuota) || 0));
    setSavingQuota(true);
    setError(null);
    try {
      const res = await whatsappTemplateService.updateSettings({ dailyQuota: n });
      setDailyQuota(String(res.dailyQuota));
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'שמירת המכסה נכשלה');
    } finally {
      setSavingQuota(false);
    }
  }, [dailyQuota, savingQuota]);

  const openCreate = () => setEditor(emptyEditor());
  const openEdit = (t: WhatsAppTemplate) =>
    setEditor({
      id: t.id,
      label: t.label,
      templateName: t.templateName,
      languageCode: t.languageCode,
      headerType: t.headerType,
      bodyText: t.bodyText,
      variables: t.variables.map((v) => ({ ...v })),
      buttons: t.buttons.map((b) => ({ ...b })),
      isActive: t.isActive,
    });

  const saveTemplate = useCallback(async () => {
    if (!editor || savingTemplate) return;
    if (!editor.label.trim()) {
      setError('יש להזין שם תצוגה לתבנית');
      return;
    }
    if (!editor.templateName.trim()) {
      setError('יש להזין את שם התבנית כפי שמופיע בוואטסאפ (template name)');
      return;
    }
    setSavingTemplate(true);
    setError(null);
    const payload: WhatsAppTemplateInput = {
      label: editor.label.trim(),
      templateName: editor.templateName.trim(),
      languageCode: editor.languageCode.trim() || 'he',
      headerType: editor.headerType,
      bodyText: editor.bodyText,
      variables: editor.variables.map((v, i) => ({
        index: i + 1,
        label: v.label || '',
        sample: v.sample || '',
      })),
      buttons: editor.buttons.map((b, i) => ({
        index: i,
        label: b.label || '',
        kind: b.kind || 'fixed',
        base_url: b.base_url || '',
        suffix: b.suffix || '',
      })),
      isActive: editor.isActive,
    };
    try {
      if (editor.id) await whatsappTemplateService.update(editor.id, payload);
      else await whatsappTemplateService.create(payload);
      setEditor(null);
      await reload();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'שמירת התבנית נכשלה');
    } finally {
      setSavingTemplate(false);
    }
  }, [editor, savingTemplate, reload]);

  const deleteTemplate = useCallback(
    async (t: WhatsAppTemplate) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const ok = window.confirm(`למחוק את התבנית "${t.label}"?`);
        if (!ok) return;
      }
      try {
        await whatsappTemplateService.remove(t.id);
        await reload();
      } catch (e: any) {
        setError(e?.message ? String(e.message) : 'מחיקת התבנית נכשלה');
      }
    },
    [reload]
  );

  const quotaNum = Math.max(0, Math.floor(Number(dailyQuota) || 0));
  const remaining = Math.max(0, quotaNum - sentToday);

  if (loading) {
    return (
      <View style={[styles.page, styles.center]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={ui.primary} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-forward" size={20} color={ui.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>תבניות וואטסאפ ומכסה יומית</Text>
            <Text style={styles.subtitle}>נהל את התבניות שהמנהל יכול לבחור מהן, והגדר מכסת שליחה יומית</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={ui.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Daily quota */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="speedometer-outline" size={20} color={ui.primary} />
            <Text style={styles.cardTitle}>מכסת הודעות וואטסאפ יומית</Text>
          </View>
          <Text style={styles.helper}>
            הודעות הוואטסאפ לא יעברו את המכסה הזו ביום. נשלחו היום {sentToday} מתוך {quotaNum} · נותרו {remaining}
          </Text>
          <View style={styles.quotaRow}>
            <TextInput
              value={dailyQuota}
              onChangeText={(t) => setDailyQuota(t.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              style={styles.quotaInput}
              placeholder="לדוגמה 250"
              placeholderTextColor={ui.sub}
              textAlign="right"
            />
            <Pressable
              style={[styles.primaryBtn, savingQuota ? { opacity: 0.6 } : null]}
              onPress={() => void saveQuota()}
              disabled={savingQuota}
            >
              {savingQuota ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>שמור מכסה</Text>}
            </Pressable>
          </View>
        </View>

        {/* Templates */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>התבניות שלי ({templates.length})</Text>
          <Pressable style={styles.addBtn} onPress={openCreate}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>הוסף תבנית</Text>
          </Pressable>
        </View>

        {templates.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="logo-whatsapp" size={28} color={ui.whatsapp} />
            <Text style={styles.emptyText}>עדיין לא הוספת תבניות וואטסאפ.</Text>
            <Text style={styles.emptySub}>לחץ על "הוסף תבנית" כדי להוסיף את התבניות המאושרות שלך.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {templates.map((t) => (
              <View key={t.id} style={styles.templateCard}>
                <View style={styles.templateTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.templateTitleRow}>
                      <Ionicons name="logo-whatsapp" size={18} color={ui.whatsapp} />
                      <Text style={styles.templateLabel} numberOfLines={1}>
                        {t.label}
                      </Text>
                      {!t.isActive ? <View style={styles.inactivePill}><Text style={styles.inactivePillText}>לא פעיל</Text></View> : null}
                    </View>
                    <Text style={styles.templateMeta} numberOfLines={1}>
                      {t.templateName} · {t.languageCode} · כותרת: {headerLabel(t.headerType)} · {t.variables.length} שדות · {t.buttons.length} כפתורים
                    </Text>
                    {t.bodyText ? (
                      <Text style={styles.templateBody} numberOfLines={3}>
                        {t.bodyText}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.templateActions}>
                  <Pressable style={styles.ghostBtn} onPress={() => openEdit(t)}>
                    <Ionicons name="create-outline" size={16} color={ui.primary} />
                    <Text style={styles.ghostBtnText}>עריכה</Text>
                  </Pressable>
                  <Pressable style={styles.ghostBtnDanger} onPress={() => void deleteTemplate(t)}>
                    <Ionicons name="trash-outline" size={16} color={ui.danger} />
                    <Text style={[styles.ghostBtnText, { color: ui.danger }]}>מחיקה</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {editor ? (
        <TemplateEditor
          state={editor}
          onChange={setEditor}
          onCancel={() => setEditor(null)}
          onSave={() => void saveTemplate()}
          saving={savingTemplate}
        />
      ) : null}
    </View>
  );
}

function headerLabel(t: string) {
  if (t === 'image') return 'תמונה';
  if (t === 'text') return 'טקסט';
  return 'ללא';
}

function TemplateEditor(props: {
  state: EditorState;
  onChange: (s: EditorState) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { state, onChange, onCancel, onSave, saving } = props;

  const set = (patch: Partial<EditorState>) => onChange({ ...state, ...patch });

  const addVariable = () =>
    set({ variables: [...state.variables, { index: state.variables.length + 1, label: '', sample: '' }] });
  const updateVariable = (i: number, patch: Partial<WhatsAppTemplateVariable>) =>
    set({ variables: state.variables.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  const removeVariable = (i: number) => set({ variables: state.variables.filter((_, idx) => idx !== i) });

  const addButton = () =>
    set({
      buttons: [...state.buttons, { index: state.buttons.length, label: '', kind: 'fixed', base_url: '', suffix: '' }],
    });
  const updateButton = (i: number, patch: Partial<WhatsAppTemplateButton>) =>
    set({ buttons: state.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  const removeButton = (i: number) => set({ buttons: state.buttons.filter((_, idx) => idx !== i) });

  return (
    <View style={styles.modalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={onCancel} />
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{state.id ? 'עריכת תבנית' : 'תבנית חדשה'}</Text>
          <Pressable onPress={onCancel} style={styles.modalClose}>
            <Ionicons name="close" size={20} color={ui.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
          <Field label="שם תצוגה (למנהל)">
            <TextInput style={styles.input} value={state.label} onChangeText={(t) => set({ label: t })} placeholder="לדוגמה: תזכורת יום האירוע" placeholderTextColor={ui.sub} textAlign="right" />
          </Field>

          <View style={styles.row2}>
            <Field label="שם התבנית בוואטסאפ" flex>
              <TextInput style={styles.input} value={state.templateName} onChangeText={(t) => set({ templateName: t })} placeholder="event_day_reminder_credit" placeholderTextColor={ui.sub} textAlign="left" autoCapitalize="none" />
            </Field>
            <Field label="שפה">
              <TextInput style={[styles.input, { width: 90 }]} value={state.languageCode} onChangeText={(t) => set({ languageCode: t })} placeholder="he" placeholderTextColor={ui.sub} textAlign="left" autoCapitalize="none" />
            </Field>
          </View>

          <Field label="סוג כותרת (Header)">
            <View style={styles.segment}>
              {(['none', 'image', 'text'] as const).map((h) => (
                <Pressable key={h} onPress={() => set({ headerType: h })} style={[styles.segmentBtn, state.headerType === h ? styles.segmentBtnActive : null]}>
                  <Text style={[styles.segmentText, state.headerType === h ? styles.segmentTextActive : null]}>{headerLabel(h)}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="טקסט גוף ההודעה (לתצוגה מקדימה, עם {{1}} {{2}})">
            <TextInput style={[styles.input, styles.textarea]} value={state.bodyText} onChangeText={(t) => set({ bodyText: t })} placeholder={'שלום {{1}}, האירוע יתקיים ב-{{2}}'} placeholderTextColor={ui.sub} textAlign="right" multiline />
          </Field>

          {/* Variables */}
          <View style={styles.subSection}>
            <View style={styles.subSectionHeader}>
              <Text style={styles.subSectionTitle}>שדות דינמיים בגוף ההודעה</Text>
              <Pressable style={styles.miniAddBtn} onPress={addVariable}>
                <Ionicons name="add" size={16} color={ui.primary} />
                <Text style={styles.miniAddText}>הוסף שדה</Text>
              </Pressable>
            </View>
            {state.variables.length === 0 ? (
              <Text style={styles.helper}>אם בתבנית יש משתנים (כמו {'{{1}}'}), הוסף כאן שדה לכל אחד לפי הסדר.</Text>
            ) : (
              state.variables.map((v, i) => (
                <View key={i} style={styles.repeatRow}>
                  <View style={styles.indexBadge}><Text style={styles.indexBadgeText}>{`{{${i + 1}}}`}</Text></View>
                  <TextInput style={[styles.input, { flex: 1 }]} value={v.label} onChangeText={(t) => updateVariable(i, { label: t })} placeholder="כינוי השדה (לדוגמה: שמות בני הזוג)" placeholderTextColor={ui.sub} textAlign="right" />
                  <Pressable style={styles.removeBtn} onPress={() => removeVariable(i)}>
                    <Ionicons name="trash-outline" size={16} color={ui.danger} />
                  </Pressable>
                </View>
              ))
            )}
          </View>

          {/* Buttons */}
          <View style={styles.subSection}>
            <View style={styles.subSectionHeader}>
              <Text style={styles.subSectionTitle}>כפתורי קישור (URL)</Text>
              <Pressable style={styles.miniAddBtn} onPress={addButton}>
                <Ionicons name="add" size={16} color={ui.primary} />
                <Text style={styles.miniAddText}>הוסף כפתור</Text>
              </Pressable>
            </View>
            {state.buttons.length === 0 ? (
              <Text style={styles.helper}>כפתורי קישור עם חלק דינמי ({'{{1}}'}). "הזמנה אישית" משלים אוטומטית את קוד ההזמנה של כל אורח.</Text>
            ) : (
              state.buttons.map((b, i) => (
                <View key={i} style={styles.buttonEditRow}>
                  <View style={styles.repeatRow}>
                    <View style={styles.indexBadge}><Text style={styles.indexBadgeText}>{`#${i}`}</Text></View>
                    <TextInput style={[styles.input, { flex: 1 }]} value={b.label} onChangeText={(t) => updateButton(i, { label: t })} placeholder="שם הכפתור (לדוגמה: אישור הגעה)" placeholderTextColor={ui.sub} textAlign="right" />
                    <Pressable style={styles.removeBtn} onPress={() => removeButton(i)}>
                      <Ionicons name="trash-outline" size={16} color={ui.danger} />
                    </Pressable>
                  </View>
                  <View style={styles.segment}>
                    {(['invitation', 'fixed'] as const).map((k) => (
                      <Pressable key={k} onPress={() => updateButton(i, { kind: k })} style={[styles.segmentBtn, b.kind === k ? styles.segmentBtnActive : null]}>
                        <Text style={[styles.segmentText, b.kind === k ? styles.segmentTextActive : null]}>{k === 'invitation' ? 'הזמנה אישית (אוטומטי)' : 'ערך קבוע'}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {b.kind === 'fixed' ? (
                    <TextInput style={styles.input} value={b.suffix} onChangeText={(t) => updateButton(i, { suffix: t })} placeholder="הסיומת הקבועה של הקישור ({{1}})" placeholderTextColor={ui.sub} textAlign="left" autoCapitalize="none" />
                  ) : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.activeRow}>
            <Text style={styles.fieldLabel}>תבנית פעילה</Text>
            <Switch value={state.isActive} onValueChange={(v) => set({ isActive: v })} trackColor={{ true: ui.whatsapp }} />
          </View>
        </ScrollView>

        <View style={styles.modalFooter}>
          <Pressable style={styles.secondaryBtn} onPress={onCancel}>
            <Text style={styles.secondaryBtnText}>ביטול</Text>
          </Pressable>
          <Pressable style={[styles.primaryBtn, { flex: 1 }, saving ? { opacity: 0.6 } : null]} onPress={onSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>שמור תבנית</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Field(props: { label: string; flex?: boolean; children: React.ReactNode }) {
  return (
    <View style={[{ gap: 6 }, props.flex ? { flex: 1 } : null]}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 24, gap: 18, maxWidth: 860, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: ui.surface, borderWidth: 1, borderColor: ui.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: ui.text, textAlign: 'right' },
  subtitle: { marginTop: 4, fontSize: 13, fontWeight: '600', color: ui.sub, textAlign: 'right' },

  errorBox: { flexDirection: ROW_DIR, alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { flex: 1, color: ui.danger, fontSize: 13, fontWeight: '700', textAlign: 'right' },

  card: { backgroundColor: ui.surface, borderRadius: 18, borderWidth: 1, borderColor: ui.border, padding: 18, gap: 12 },
  cardHeader: { flexDirection: ROW_DIR, alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: ui.text, textAlign: 'right' },
  helper: { fontSize: 12.5, fontWeight: '600', color: ui.sub, textAlign: 'right', lineHeight: 18 },
  quotaRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 12 },
  quotaInput: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.surfaceMuted, paddingHorizontal: 14, fontSize: 16, fontWeight: '800', color: ui.text },

  sectionHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: ui.text, textAlign: 'right' },
  addBtn: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, backgroundColor: ui.whatsapp, paddingHorizontal: 16, height: 44, borderRadius: 12, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 40, backgroundColor: ui.surface, borderRadius: 18, borderWidth: 1, borderColor: ui.border },
  emptyText: { fontSize: 15, fontWeight: '800', color: ui.text },
  emptySub: { fontSize: 13, fontWeight: '600', color: ui.sub },

  templateCard: { backgroundColor: ui.surface, borderRadius: 16, borderWidth: 1, borderColor: ui.border, padding: 16, gap: 12 },
  templateTop: { flexDirection: ROW_DIR, alignItems: 'flex-start', gap: 12 },
  templateTitleRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 8 },
  templateLabel: { fontSize: 16, fontWeight: '900', color: ui.text, textAlign: 'right' },
  inactivePill: { backgroundColor: 'rgba(107,114,128,0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  inactivePillText: { fontSize: 11, fontWeight: '800', color: ui.sub },
  templateMeta: { marginTop: 4, fontSize: 12, fontWeight: '600', color: ui.sub, textAlign: 'right' },
  templateBody: { marginTop: 8, fontSize: 13, fontWeight: '600', color: ui.text, textAlign: 'right', lineHeight: 19 },
  templateActions: { flexDirection: ROW_DIR, gap: 10 },
  ghostBtn: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(29,78,216,0.25)', backgroundColor: 'rgba(29,78,216,0.06)' },
  ghostBtnDanger: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.06)' },
  ghostBtnText: { fontSize: 13, fontWeight: '800', color: ui.primary },

  primaryBtn: { backgroundColor: ui.primary, paddingHorizontal: 20, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  secondaryBtn: { paddingHorizontal: 20, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ui.border, backgroundColor: ui.surface },
  secondaryBtnText: { color: ui.text, fontSize: 15, fontWeight: '800' },

  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: { width: '100%', maxWidth: 640, maxHeight: '88%', backgroundColor: ui.surface, borderRadius: 20, overflow: 'hidden' },
  modalHeader: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: ui.border },
  modalTitle: { fontSize: 18, fontWeight: '900', color: ui.text },
  modalClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.surfaceMuted },
  modalScroll: { paddingHorizontal: 18, paddingVertical: 16 },
  modalFooter: { flexDirection: ROW_DIR, gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: ui.border },

  fieldLabel: { fontSize: 13, fontWeight: '800', color: ui.text, textAlign: 'right' },
  input: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.surfaceMuted, paddingHorizontal: 14, fontSize: 14, fontWeight: '600', color: ui.text },
  textarea: { height: 110, paddingTop: 12, textAlignVertical: 'top' },
  row2: { flexDirection: ROW_DIR, gap: 12, alignItems: 'flex-end' },

  segment: { flexDirection: ROW_DIR, backgroundColor: ui.surfaceMuted, borderRadius: 12, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: ui.surface, borderWidth: 1, borderColor: ui.border },
  segmentText: { fontSize: 12.5, fontWeight: '800', color: ui.sub, textAlign: 'center' },
  segmentTextActive: { color: ui.primary },

  subSection: { gap: 10, backgroundColor: ui.surfaceMuted, borderRadius: 14, padding: 14 },
  subSectionHeader: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  subSectionTitle: { fontSize: 14, fontWeight: '900', color: ui.text, textAlign: 'right' },
  miniAddBtn: { flexDirection: ROW_DIR, alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 8, backgroundColor: 'rgba(29,78,216,0.08)' },
  miniAddText: { fontSize: 12, fontWeight: '800', color: ui.primary },
  repeatRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 8 },
  buttonEditRow: { gap: 8, backgroundColor: ui.surface, borderRadius: 12, borderWidth: 1, borderColor: ui.border, padding: 10 },
  indexBadge: { paddingHorizontal: 8, height: 30, borderRadius: 8, backgroundColor: 'rgba(29,78,216,0.10)', alignItems: 'center', justifyContent: 'center' },
  indexBadgeText: { fontSize: 12, fontWeight: '900', color: ui.primary },
  removeBtn: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,68,68,0.08)' },
  activeRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
});
