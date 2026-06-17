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
import { ROW_DIR } from '@/lib/rtl';
import { colors } from '@/constants/colors';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
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
  primary: '#4F46E5',
  whatsapp: '#25D366',
  bg: '#E8F1FF',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F6FB',
  text: '#0F172A',
  sub: '#64748B',
  border: 'rgba(6,23,62,0.08)',
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

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.push('/(admin)/automatic-notifications' as any);
  }, [router]);

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
      <View style={styles.bg} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={goBack}
          style={({ pressed }: any) => [styles.backPill, pressed ? { opacity: 0.9 } : null]}
          accessibilityRole="button"
          accessibilityLabel="חזור"
        >
          <Ionicons name="chevron-forward" size={18} color={ui.text} />
          <Text style={styles.backPillText}>חזור</Text>
        </Pressable>

        {/* Header */}
        <View style={styles.heroShell}>
          <AdminWebPageHeader
            eyebrow="ניהול וואטסאפ"
            title="תבניות וואטסאפ ומכסה יומית"
            subtitle="נהל את התבניות שהמנהל יכול לבחור מהן, והגדר מכסת שליחה יומית"
          />
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
          <View style={{ gap: 16 }}>
            {templates.map((t) => (
              <View key={t.id} style={styles.templateCard}>
                {/* Title + status */}
                <View style={styles.templateTitleRow}>
                  <View style={styles.templateWaIcon}>
                    <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                  </View>
                  <Text style={styles.templateLabel} numberOfLines={1}>
                    {t.label}
                  </Text>
                  <View style={{ flex: 1 }} />
                  {t.isActive ? (
                    <View style={styles.activePill}>
                      <Ionicons name="checkmark-circle" size={13} color="#0E7C46" />
                      <Text style={styles.activePillText}>פעיל</Text>
                    </View>
                  ) : (
                    <View style={styles.inactivePill}>
                      <Text style={styles.inactivePillText}>לא פעיל</Text>
                    </View>
                  )}
                </View>

                {/* Meta chips */}
                <View style={styles.metaChipsRow}>
                  <View style={styles.metaChip}>
                    <Ionicons name="pricetag-outline" size={12} color={ui.sub} />
                    <Text style={styles.metaChipText}>{t.templateName}</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Ionicons name="globe-outline" size={12} color={ui.sub} />
                    <Text style={styles.metaChipText}>{t.languageCode}</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Ionicons
                      name={t.headerType === 'image' ? 'image-outline' : t.headerType === 'text' ? 'text-outline' : 'remove-outline'}
                      size={12}
                      color={ui.sub}
                    />
                    <Text style={styles.metaChipText}>כותרת: {headerLabel(t.headerType)}</Text>
                  </View>
                </View>

                {/* WhatsApp-style preview with placeholders resolved to field labels */}
                <View style={styles.previewWrap}>
                  <Text style={styles.previewCaption}>תצוגה מקדימה</Text>
                  <View style={styles.previewBubble}>
                    {t.headerType === 'image' ? (
                      <View style={styles.previewImagePlaceholder}>
                        <Ionicons name="image-outline" size={18} color="#0E7C46" />
                        <Text style={styles.previewImageText}>תמונת כותרת</Text>
                      </View>
                    ) : null}
                    {t.bodyText ? (
                      <Text style={styles.previewBodyText}>{renderTemplateParts(t.bodyText, t.variables)}</Text>
                    ) : (
                      <Text style={styles.previewEmptyText}>לא הוגדר טקסט גוף לתבנית.</Text>
                    )}
                    {t.buttons.length > 0 ? (
                      <View style={styles.previewButtonsRow}>
                        {t.buttons.map((b, i) => (
                          <View key={i} style={styles.previewButtonChip}>
                            <Ionicons
                              name={b.kind === 'invitation' ? 'link-outline' : 'open-outline'}
                              size={13}
                              color={ui.primary}
                            />
                            <Text style={styles.previewButtonText}>{b.label || `כפתור ${i + 1}`}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Dynamic fields legend */}
                {t.variables.length > 0 ? (
                  <View style={styles.fieldsBlock}>
                    <Text style={styles.fieldsBlockTitle}>שדות דינמיים למילוי ({t.variables.length})</Text>
                    <View style={styles.fieldsRow}>
                      {[...t.variables]
                        .sort((a, b) => Number(a.index) - Number(b.index))
                        .map((v, i) => (
                          <View key={i} style={styles.fieldChip}>
                            <View style={styles.fieldChipNum}>
                              <Text style={styles.fieldChipNumText}>{Number(v.index) || i + 1}</Text>
                            </View>
                            <Text style={styles.fieldChipText}>{String(v.label || '').trim() || `שדה ${i + 1}`}</Text>
                          </View>
                        ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.templateDivider} />

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

// Renders the template body, replacing {{n}} placeholders with a highlighted
// field label so the manager clearly sees what each dynamic value means.
function renderTemplateParts(body: string, variables: WhatsAppTemplateVariable[]): React.ReactNode[] {
  const labelFor = (n: number) => {
    const v = variables.find((x) => Number(x.index) === n);
    const label = String(v?.label || '').trim();
    return label || `שדה ${n}`;
  };
  const parts: React.ReactNode[] = [];
  const regex = /\{\{\s*(\d+)\s*\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`t${key++}`}>{body.slice(lastIndex, match.index)}</Text>);
    }
    const n = Number(match[1]);
    parts.push(
      <Text key={`v${key++}`} style={styles.previewVarToken}>{`【${labelFor(n)}】`}</Text>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < body.length) {
    parts.push(<Text key={`t${key++}`}>{body.slice(lastIndex)}</Text>);
  }
  return parts;
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
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: ui.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48, gap: 18, maxWidth: 1040, width: '100%', alignSelf: 'center' },
  heroShell: { zIndex: 20 },
  backPill: {
    alignSelf: 'flex-end',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 999,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 2px 8px rgba(11,28,65,0.05)' } as any) : null),
  },
  backPillText: { fontSize: 13, fontWeight: '900', color: ui.text },
  title: { fontSize: 22, fontWeight: '900', color: ui.text, textAlign: 'right' },
  subtitle: { marginTop: 4, fontSize: 13, fontWeight: '600', color: ui.sub, textAlign: 'right' },

  errorBox: { flexDirection: ROW_DIR, alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { flex: 1, color: ui.danger, fontSize: 13, fontWeight: '700', textAlign: 'right' },

  card: {
    backgroundColor: ui.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 20,
    gap: 12,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 14px rgba(11,28,65,0.04)' } as any) : null),
  },
  cardHeader: { flexDirection: ROW_DIR, alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: ui.text, textAlign: 'right' },
  helper: { fontSize: 12.5, fontWeight: '600', color: ui.sub, textAlign: 'right', lineHeight: 18 },
  quotaRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 12 },
  quotaInput: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.surfaceMuted, paddingHorizontal: 14, fontSize: 16, fontWeight: '800', color: ui.text },

  sectionHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: ui.text, textAlign: 'right' },
  addBtn: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, backgroundColor: ui.whatsapp, paddingHorizontal: 16, height: 44, borderRadius: 12, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  emptyBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 44,
    backgroundColor: ui.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 14px rgba(11,28,65,0.04)' } as any) : null),
  },
  emptyText: { fontSize: 15, fontWeight: '800', color: ui.text },
  emptySub: { fontSize: 13, fontWeight: '600', color: ui.sub },

  templateCard: {
    backgroundColor: ui.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 18,
    gap: 14,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 14px rgba(11,28,65,0.04)' } as any) : null),
  },
  templateTitleRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 10 },
  templateWaIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: ui.whatsapp, alignItems: 'center', justifyContent: 'center' },
  templateLabel: { fontSize: 16, fontWeight: '900', color: ui.text, textAlign: 'right' },
  activePill: { flexDirection: ROW_DIR, alignItems: 'center', gap: 4, backgroundColor: 'rgba(37,211,102,0.12)', borderWidth: 1, borderColor: 'rgba(14,124,70,0.22)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  activePillText: { fontSize: 11, fontWeight: '900', color: '#0E7C46' },
  inactivePill: { backgroundColor: 'rgba(107,114,128,0.12)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  inactivePillText: { fontSize: 11, fontWeight: '800', color: ui.sub },

  metaChipsRow: { flexDirection: ROW_DIR, flexWrap: 'wrap', gap: 8 },
  metaChip: { flexDirection: ROW_DIR, alignItems: 'center', gap: 5, backgroundColor: ui.surfaceMuted, borderWidth: 1, borderColor: ui.border, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  metaChipText: { fontSize: 11.5, fontWeight: '800', color: ui.sub, textAlign: 'right' },

  previewWrap: { gap: 6 },
  previewCaption: { fontSize: 11, fontWeight: '800', color: ui.sub, textAlign: 'right' },
  previewBubble: {
    alignSelf: 'stretch',
    backgroundColor: '#F0FBF4',
    borderWidth: 1,
    borderColor: 'rgba(37,211,102,0.22)',
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 14,
    gap: 12,
  },
  previewImagePlaceholder: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(14,124,70,0.25)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(37,211,102,0.06)',
  },
  previewImageText: { fontSize: 12, fontWeight: '800', color: '#0E7C46' },
  previewBodyText: { fontSize: 14, fontWeight: '600', color: ui.text, textAlign: 'right', lineHeight: 22 },
  previewVarToken: { fontWeight: '900', color: ui.primary },
  previewEmptyText: { fontSize: 13, fontWeight: '600', color: ui.sub, textAlign: 'right' },
  previewButtonsRow: { flexDirection: ROW_DIR, flexWrap: 'wrap', gap: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: 'rgba(14,124,70,0.15)', paddingTop: 10 },
  previewButtonChip: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(79,70,229,0.22)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  previewButtonText: { fontSize: 12.5, fontWeight: '900', color: ui.primary },

  fieldsBlock: { gap: 8, backgroundColor: ui.surfaceMuted, borderRadius: 14, padding: 12 },
  fieldsBlockTitle: { fontSize: 12.5, fontWeight: '900', color: ui.text, textAlign: 'right' },
  fieldsRow: { flexDirection: ROW_DIR, flexWrap: 'wrap', gap: 8 },
  fieldChip: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: ui.border, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  fieldChipNum: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 999, backgroundColor: 'rgba(79,70,229,0.12)', alignItems: 'center', justifyContent: 'center' },
  fieldChipNumText: { fontSize: 11, fontWeight: '900', color: ui.primary },
  fieldChipText: { fontSize: 12, fontWeight: '800', color: ui.text, textAlign: 'right' },

  templateDivider: { height: 1, backgroundColor: ui.border },
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
