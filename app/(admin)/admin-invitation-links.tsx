import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { useAdminEventDetailsModel } from '@/features/events/useAdminEventDetailsModel';
import { eventService } from '@/lib/services/eventService';
import { invitationAssetService } from '@/lib/services/invitationAssetService';
import { ROW_DIR } from '@/lib/rtl';

function getEventTypeLabel(rawTitle: string) {
  const raw = String(rawTitle ?? '').trim();
  if (!raw) return 'אירוע';
  const parts = raw.split(/(?:\s*[–—-]\s*)/g).map((p) => p.trim()).filter(Boolean);
  return parts[0] || raw;
}

function isWeddingEventTitle(rawTitle: string) {
  const label = getEventTypeLabel(rawTitle);
  return label === 'חתונה' || String(rawTitle ?? '').includes('חתונה');
}

function formatDateNumeric(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function buildInviteUrl(tokenOrCode: string) {
  const t = String(tokenOrCode || '').trim();
  if (!t) return '';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/i/${t}`;
  }
  return Linking.createURL(`/i/${t}`);
}

function getWebBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  const fromEnv =
    process.env.EXPO_PUBLIC_SITE_BASE_URL ?? Constants.expoConfig?.extra?.EXPO_PUBLIC_SITE_BASE_URL;
  const base = String(fromEnv ?? '').trim().replace(/\/+$/, '');
  return base || 'https://rork.com';
}

function buildDemoInviteUrl(eventId: string) {
  const id = String(eventId || '').trim();
  if (!id) return '';
  const base = buildInviteUrl('demo');
  if (!base) return '';
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}eventId=${encodeURIComponent(id)}`;
}

function buildDemoInviteUrlWeb(eventId: string): string {
  const id = String(eventId || '').trim();
  if (!id) return '';
  const webBase = getWebBaseUrl();
  return `${webBase}/i/demo?eventId=${encodeURIComponent(id)}`;
}

function getStatusDotColor(statusRaw: string) {
  const s = String(statusRaw || '').trim();
  if (!s) return 'rgba(17,24,39,0.25)';
  if (s.includes('ממתין')) return colors.warning;
  if (s.includes('לא')) return colors.error;
  if (s.includes('מגיע')) return colors.success;
  return 'rgba(17,24,39,0.25)';
}

export default function AdminInvitationLinksScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const id = useMemo(() => String(eventId || ''), [eventId]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { loading, error, event, setEvent, guests, refresh } = useAdminEventDetailsModel(id);

  const isWedding = useMemo(() => isWeddingEventTitle(String(event?.title ?? '')), [event?.title]);

  const [form, setForm] = useState<{
    invitationTitle: string;
    invitationImageUrl: string;
    groomName: string;
    brideName: string;
    receptionTime: string;
    ceremonyTime: string;
    brideParents: string;
    groomParents: string;
  }>({
    invitationTitle: '',
    invitationImageUrl: '',
    groomName: '',
    brideName: '',
    receptionTime: '',
    ceremonyTime: '',
    brideParents: '',
    groomParents: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [guestFilter, setGuestFilter] = useState<'all' | 'מגיע' | 'ממתין' | 'לא מגיע'>('all');
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [copiedGuestId, setCopiedGuestId] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setForm({
      invitationTitle: String((event as any)?.invitationTitle ?? ''),
      invitationImageUrl: String((event as any)?.invitationImageUrl ?? ''),
      groomName: String((event as any)?.groomName ?? ''),
      brideName: String((event as any)?.brideName ?? ''),
      receptionTime: String((event as any)?.receptionTime ?? ''),
      ceremonyTime: String((event as any)?.ceremonyTime ?? ''),
      brideParents: String((event as any)?.brideParents ?? ''),
      groomParents: String((event as any)?.groomParents ?? ''),
    });
  }, [event?.id]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  const invitationPreviewTitle = useMemo(() => {
    if (isWedding) {
      const g = (form.groomName || '').trim();
      const b = (form.brideName || '').trim();
      if (g && b) return `${g} \u200E&\u200E ${b}`;
      return 'חתן \u200E&\u200E כלה';
    }
    return (form.invitationTitle || '').trim() || String(event?.title ?? '');
  }, [isWedding, form.groomName, form.brideName, form.invitationTitle, event?.title]);

  const invitationPreviewImage = (form.invitationImageUrl || '').trim();
  const dateLabel = useMemo(() => {
    const d = event?.date ? new Date(event.date) : new Date('invalid');
    return Number.isFinite(d.getTime()) ? formatDateNumeric(d) : '';
  }, [event?.date]);

  const demoUrl = useMemo(() => {
    return event?.id ? buildDemoInviteUrl(String(event.id)) : '';
  }, [event?.id]);

  const openDemo = async () => {
    if (!event?.id) {
      Alert.alert('דמו', 'חסר מזהה אירוע כדי לפתוח דמו.');
      return;
    }
    try {
      const webUrl = buildDemoInviteUrlWeb(String(event.id));
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(webUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      await Linking.openURL(webUrl);
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'לא ניתן לפתוח קישור';
      Alert.alert('דמו', msg);
    }
  };

  const counts = useMemo(() => {
    const all = Array.isArray(guests) ? guests : [];
    const confirmed = all.filter((g) => g.status === 'מגיע').length;
    const pending = all.filter((g) => g.status === 'ממתין').length;
    const declined = all.filter((g) => g.status === 'לא מגיע').length;
    return { all: all.length, confirmed, pending, declined };
  }, [guests]);

  const filteredGuests = useMemo(() => {
    const all = Array.isArray(guests) ? guests : [];
    if (guestFilter === 'all') return all;
    return all.filter((g) => g.status === guestFilter);
  }, [guests, guestFilter]);

  const pickerGuests = useMemo(() => {
    const base = filteredGuests;
    const q = String(guestSearch || '').trim().toLowerCase();
    if (!q) return base;
    return base.filter((g: any) => {
      const name = String(g?.name || '').toLowerCase();
      const phone = String(g?.phone || '');
      return name.includes(q) || phone.includes(q);
    });
  }, [filteredGuests, guestSearch]);

  const copyText = async (value: string): Promise<boolean> => {
    const text = String(value || '').trim();
    if (!text) return false;

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallback below
    }

    Alert.alert('העתקה', text);
    return false;
  };

  const handleCopyPress = async (guestId: string, url: string) => {
    const ok = await copyText(url);
    if (!ok) return;

    setCopiedGuestId(guestId);
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = setTimeout(() => {
      setCopiedGuestId((cur) => (cur === guestId ? null : cur));
    }, 1500);
  };

  const closeGuestPicker = () => {
    setGuestPickerOpen(false);
    setGuestSearch('');
  };

  const pickAndUploadInvitationImage = async () => {
    if (!event?.id) return;
    if (uploading) return;

    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('הרשאה נדרשת', 'כדי לבחור תמונה יש לאשר גישה לגלריה');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0] as any;

      setUploading(true);
      const url = await invitationAssetService.uploadInvitationImage(event.id, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
        base64: asset.base64,
      });

      setForm((f) => ({ ...f, invitationImageUrl: url }));
      Alert.alert('הועלה', 'תמונת ההזמנה עלתה. לחץ "שמור" כדי לעדכן באירוע.');
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן להעלות תמונה.\n\n${message}`);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!event?.id) return;
    if (saving) return;

    const nextInvitationImageUrl = (form.invitationImageUrl || '').trim() || null;
    const nextInvitationTitle = (form.invitationTitle || '').trim();
    const nextGroom = (form.groomName || '').trim();
    const nextBride = (form.brideName || '').trim();

    if (isWedding) {
      if (!nextGroom || !nextBride) {
        Alert.alert('שגיאה', 'בחתונה חובה למלא שם חתן ושם כלה');
        return;
      }
    } else {
      if (!nextInvitationTitle) {
        Alert.alert('שגיאה', 'יש למלא כותרת להזמנה');
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await eventService.updateEvent(event.id, {
        invitationImageUrl: nextInvitationImageUrl,
        // Non-wedding: show a custom title. Wedding: title is redundant.
        invitationTitle: isWedding ? null : nextInvitationTitle,
        groomName: isWedding ? nextGroom : null,
        brideName: isWedding ? nextBride : null,
        receptionTime: isWedding ? (form.receptionTime || '').trim() || null : null,
        ceremonyTime: isWedding ? (form.ceremonyTime || '').trim() || null : null,
        brideParents: isWedding ? (form.brideParents || '').trim() || null : null,
        groomParents: isWedding ? (form.groomParents || '').trim() || null : null,
      } as any);
      setEvent(updated as any);
      Alert.alert('נשמר', 'ההזמנה עודכנה בהצלחה');
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לשמור.\n\n${message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>טוען...</Text>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.gray[600]} />
        <Text style={styles.centerText}>{error || 'האירוע לא נמצא'}</Text>
      </View>
    );
  }

  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const isMobile = width < 768;
  const isNarrow = width < 420;
  const stickyHeaderHeight = insets.top + 62;

  return (
    <View style={styles.page}>
      <LinearGradient
        colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.75, y: 0.55 }}
        style={styles.bgHighlight}
      />
      <LinearGradient
        colors={['rgba(232,196,122,0.58)', 'rgba(244,224,186,0.22)', 'rgba(244,224,186,0)']}
        start={{ x: 1, y: 0.95 }}
        end={{ x: 0.18, y: 0.22 }}
        style={styles.bgWarmGlow}
      />
      <View style={[styles.stickyHeader, { paddingTop: insets.top, height: stickyHeaderHeight }]}>
        <View style={styles.stickyHeaderInner}>
          <Pressable
            onPress={() => router.replace(`/(admin)/admin-event-details?id=${encodeURIComponent(id)}`)}
            style={({ pressed }) => [styles.stickyHeaderBackBtn, pressed ? { opacity: 0.88 } : null]}
            accessibilityRole="button"
            accessibilityLabel="בחזרה לאירוע"
          >
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          </Pressable>

          <View style={styles.stickyHeaderTitleWrap}>
            <Text style={styles.stickyHeaderTitle}>לינק להזמנה</Text>
          </View>

          <View style={styles.stickyHeaderSideSpacer} />
        </View>
      </View>
      <AppKeyboardAwareScrollView
        contentContainerStyle={[
          styles.content,
          isMobile ? styles.contentMobile : null,
          isNarrow ? styles.contentNarrow : null,
          { paddingTop: stickyHeaderHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topGrid, isDesktop ? styles.topGridDesktop : null]}>
          {/* Preview */}
          <View style={[styles.card, isMobile ? styles.cardMobile : null, isDesktop ? styles.previewCardDesktop : null]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTextWrap}>
                <Text style={styles.cardTitle}>תצוגה מקדימה</Text>
                <Text style={styles.cardSubtitle}>כך עמוד ההזמנה ייראה למוזמנים שלך</Text>
              </View>
              <View style={styles.badge}>
                <Ionicons name="image-outline" size={14} color={colors.primary} />
                <Text style={styles.badgeText}>{invitationPreviewImage ? 'יש תמונה' : 'אין תמונה'}</Text>
              </View>
            </View>

            <View style={styles.previewWrap}>
              <View style={styles.previewMediaWrap}>
                {invitationPreviewImage ? (
                  <Image
                    source={{ uri: invitationPreviewImage }}
                    style={[styles.previewImg, isMobile ? styles.previewImgMobile : null, isNarrow ? styles.previewImgNarrow : null]}
                    contentFit="cover"
                    transition={0}
                  />
                ) : (
                  <View style={[styles.previewFallback, isMobile ? styles.previewFallbackMobile : null, isNarrow ? styles.previewFallbackNarrow : null]}>
                    <Ionicons name="image-outline" size={26} color={colors.gray[500]} />
                    <Text style={styles.previewFallbackText}>עדיין לא הוגדרה תמונה</Text>
                  </View>
                )}

                <Pressable
                  onPress={() => void pickAndUploadInvitationImage()}
                  disabled={uploading}
                  style={({ pressed }) => [
                    styles.previewCameraBtn,
                    pressed ? { opacity: 0.9 } : null,
                    uploading ? { opacity: 0.7 } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={invitationPreviewImage ? 'החלפת תמונת הזמנה' : 'העלאת תמונת הזמנה'}
                >
                  {uploading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Ionicons name="camera-outline" size={18} color={colors.white} />
                  )}
                </Pressable>
              </View>

              <View style={styles.previewBottom}>
                <Text style={styles.previewTitle} numberOfLines={2}>
                  {invitationPreviewTitle}
                </Text>
                <View style={styles.previewMetaRow}>
                  <View style={styles.previewMetaChip}>
                    <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                    <Text style={styles.previewMetaChipText} numberOfLines={1}>
                      {dateLabel}
                    </Text>
                  </View>
                  <View style={styles.previewMetaChip}>
                    <Ionicons name="business-outline" size={13} color={colors.primary} />
                    <Text style={styles.previewMetaChipText} numberOfLines={1}>
                      {String(event.location ?? '')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.previewHint}>לחיצה על המצלמה תאפשר לבחור או להחליף את תמונת ההזמנה</Text>
              </View>
            </View>

            <View style={[styles.demoCard, isMobile ? styles.demoCardMobile : null]}>
              <View style={[styles.demoCardTop, isMobile ? styles.demoCardTopMobile : null]}>
                <View style={styles.demoIconWrap}>
                  <Ionicons name="globe-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.demoTextWrap}>
                  <Text style={styles.demoTitle}>לצפייה בדמו של דף ההזמנה</Text>
                  <Text style={styles.demoSub} numberOfLines={2}>
                    {'ייפתח דמו כללי (לא על שם מוזמן) — כל בחירה נשמרת מקומית בלבד.'}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => void openDemo()}
                disabled={!demoUrl}
                style={({ pressed }) => [
                  styles.demoBtnWrap,
                  !demoUrl ? styles.demoBtnDisabled : null,
                  pressed && demoUrl ? { opacity: 0.92 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="לצפייה בדמו"
              >
                <View style={[styles.demoBtn, isMobile ? styles.demoBtnMobile : null]}>
                  <Ionicons name="open-outline" size={16} color="#fff" />
                  <Text style={styles.demoBtnText}>לצפייה בדמו</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Form */}
          <View style={[styles.card, isMobile ? styles.cardMobile : null, isDesktop ? styles.formCardDesktop : null]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTextWrap}>
                <Text style={styles.cardTitle}>הגדרות הזמנה</Text>
                <Text style={styles.cardSubtitle}>ערוך את התוכן שיוצג בדף ההזמנה שלך</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: 'rgba(2,6,23,0.04)' }]}>
                <Ionicons name={isWedding ? 'heart-outline' : 'pricetag-outline'} size={14} color={'rgba(2,6,23,0.72)'} />
                <Text style={[styles.badgeText, { color: 'rgba(2,6,23,0.72)' }]}>{isWedding ? 'חתונה' : getEventTypeLabel(String(event.title ?? ''))}</Text>
              </View>
            </View>

            {isWedding ? (
              <>
                <View style={styles.formSectionCard}>
                  <Text style={styles.sectionTitle}>שמות</Text>
                  <View style={[styles.row, isNarrow ? styles.rowStack : null]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>שם החתן *</Text>
                      <TextInput
                        value={form.groomName}
                        onChangeText={(t) => setForm((f) => ({ ...f, groomName: t }))}
                        placeholder="שם החתן"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.input}
                        textAlign="right"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>שם הכלה *</Text>
                      <TextInput
                        value={form.brideName}
                        onChangeText={(t) => setForm((f) => ({ ...f, brideName: t }))}
                        placeholder="שם הכלה"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.input}
                        textAlign="right"
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.formSectionCard}>
                  <Text style={styles.sectionTitle}>זמנים (אופציונלי)</Text>
                  <View style={[styles.row, isNarrow ? styles.rowStack : null]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>שעת קבלת פנים</Text>
                      <TextInput
                        value={form.receptionTime}
                        onChangeText={(t) => setForm((f) => ({ ...f, receptionTime: t }))}
                        placeholder="לדוגמה: 18:30"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.input}
                        textAlign="right"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>שעת חופה וקידושין</Text>
                      <TextInput
                        value={form.ceremonyTime}
                        onChangeText={(t) => setForm((f) => ({ ...f, ceremonyTime: t }))}
                        placeholder="לדוגמה: 19:30"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.input}
                        textAlign="right"
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.formSectionCard}>
                  <Text style={styles.sectionTitle}>הורים (אופציונלי)</Text>
                  <View style={[styles.row, isNarrow ? styles.rowStack : null]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>הורי הכלה</Text>
                      <TextInput
                        value={form.brideParents}
                        onChangeText={(t) => setForm((f) => ({ ...f, brideParents: t }))}
                        placeholder="לדוגמה: משפחת לוי"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.input}
                        textAlign="right"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>הורי החתן</Text>
                      <TextInput
                        value={form.groomParents}
                        onChangeText={(t) => setForm((f) => ({ ...f, groomParents: t }))}
                        placeholder="לדוגמה: משפחת כהן"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.input}
                        textAlign="right"
                      />
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.formSectionCard}>
                <Text style={styles.sectionTitle}>כותרת</Text>
                <Text style={styles.label}>כותרת להזמנה *</Text>
                <TextInput
                  value={form.invitationTitle}
                  onChangeText={(t) => setForm((f) => ({ ...f, invitationTitle: t }))}
                  placeholder="לדוגמה: בר המצווה של עומר"
                  placeholderTextColor={'rgba(17,24,39,0.35)'}
                  style={styles.input}
                  textAlign="right"
                />
              </View>
            )}

            <View style={styles.formFooter}>
              <TouchableOpacity
                onPress={() => void save()}
                disabled={saving}
                activeOpacity={0.9}
                style={[styles.saveSimpleBtn, saving ? { opacity: 0.8 } : null]}
                accessibilityRole="button"
                accessibilityLabel="שמור שינויים"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text style={styles.saveSimpleBtnText}>שמור שינויים</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>

        {false ? (
          <View style={[styles.dialogOverlay, isNarrow ? styles.dialogOverlayMobile : null]}>
            <Pressable style={styles.dialogBackdrop} onPress={closeGuestPicker} />
            <View style={[styles.dialogCard, isNarrow ? styles.dialogCardMobile : null]}>
              {isNarrow ? <View style={styles.sheetHandle} /> : null}
              <View style={styles.dialogHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.dialogTitle} numberOfLines={1}>
                    חיפוש מוזמן וקישור אישי
                  </Text>
                  <Text style={styles.dialogSub} numberOfLines={2}>
                    חפש לפי שם/טלפון, ואז לחץ “העתק” כדי להעתיק את הקישור האישי של אותו מוזמן.
                  </Text>
                </View>
                <Pressable onPress={closeGuestPicker} style={styles.dialogClose} accessibilityRole="button" accessibilityLabel="סגור">
                  <Ionicons name="close" size={18} color={colors.text} />
                </Pressable>
              </View>

              <View style={styles.dialogSearchRow}>
                <Ionicons name="search-outline" size={16} color={colors.gray[600]} />
                <TextInput
                  value={guestSearch}
                  onChangeText={setGuestSearch}
                  placeholder="חיפוש לפי שם או טלפון..."
                  placeholderTextColor={'rgba(17,24,39,0.35)'}
                  style={styles.dialogSearchInput}
                  textAlign="right"
                />
                {guestSearch.trim() ? (
                  <Pressable
                    onPress={() => setGuestSearch('')}
                    style={({ pressed }) => [styles.clearBtn, pressed ? { opacity: 0.9 } : null]}
                    accessibilityRole="button"
                    accessibilityLabel="נקה חיפוש"
                  >
                    <Ionicons name="close-circle" size={18} color={'rgba(17,24,39,0.40)'} />
                  </Pressable>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dialogFiltersRow}
                style={styles.dialogFiltersScroll}
              >
                <Pressable
                  onPress={() => setGuestFilter('all')}
                  style={({ pressed }) => [styles.filterPill, guestFilter === 'all' ? styles.filterPillActive : null, pressed ? { opacity: 0.92 } : null]}
                >
                  <Text style={[styles.filterText, guestFilter === 'all' ? styles.filterTextActive : null]}>הכל ({counts.all})</Text>
                </Pressable>
                <Pressable
                  onPress={() => setGuestFilter('ממתין')}
                  style={({ pressed }) => [styles.filterPill, guestFilter === 'ממתין' ? styles.filterPillActive : null, pressed ? { opacity: 0.92 } : null]}
                >
                  <Text style={[styles.filterText, guestFilter === 'ממתין' ? styles.filterTextActive : null]}>ממתינים ({counts.pending})</Text>
                </Pressable>
                <Pressable
                  onPress={() => setGuestFilter('מגיע')}
                  style={({ pressed }) => [styles.filterPill, guestFilter === 'מגיע' ? styles.filterPillActive : null, pressed ? { opacity: 0.92 } : null]}
                >
                  <Text style={[styles.filterText, guestFilter === 'מגיע' ? styles.filterTextActive : null]}>אישרו ({counts.confirmed})</Text>
                </Pressable>
                <Pressable
                  onPress={() => setGuestFilter('לא מגיע')}
                  style={({ pressed }) => [styles.filterPill, guestFilter === 'לא מגיע' ? styles.filterPillActive : null, pressed ? { opacity: 0.92 } : null]}
                >
                  <Text style={[styles.filterText, guestFilter === 'לא מגיע' ? styles.filterTextActive : null]}>לא מגיעים ({counts.declined})</Text>
                </Pressable>
              </ScrollView>

              <AppKeyboardAwareScrollView style={styles.dialogList} contentContainerStyle={styles.dialogListContent} showsVerticalScrollIndicator={false}>
                {pickerGuests.length === 0 ? (
                  <Text style={styles.empty}>
                    {guests.length === 0 ? 'אין עדיין מוזמנים באירוע.' : 'לא נמצאו תוצאות לחיפוש/סינון.'}
                  </Text>
                ) : (
                  pickerGuests.map((g: any) => {
                    const guestId = String(g.id);
                    const codeOrToken = String(g?.invitationCode || g?.invitationToken || '').trim();
                    const url = codeOrToken ? buildInviteUrl(codeOrToken) : '';
                    const status = String(g?.status ?? '').trim();
                    const phone = g?.phone ? String(g.phone) : '';
                    const isArriving = status.includes('מגיע') && !status.includes('לא');
                    const peopleCount = Number(g?.numberOfPeople || 1);
                    const isCopied = copiedGuestId === guestId;
                    return (
                      <View key={guestId} style={[styles.guestRow, isNarrow ? styles.guestRowNarrow : null]}>
                        <View style={styles.avatarIconWrap} pointerEvents="none">
                          <Ionicons name="person-circle-outline" size={34} color={'rgba(17,24,39,0.35)'} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.guestName} numberOfLines={1}>
                            {String(g?.name ?? '')}
                          </Text>
                          <View style={styles.guestMetaBlock}>
                            <View style={styles.statusRow}>
                              <View style={[styles.statusDot, { backgroundColor: getStatusDotColor(status) }]} />
                              <Text style={styles.statusText} numberOfLines={1}>
                                {status || '—'}
                              </Text>
                            </View>
                            {phone ? (
                              <Text style={styles.metaLine} numberOfLines={1}>
                                {phone}
                              </Text>
                            ) : null}
                            {isArriving ? (
                              <Text style={styles.metaLine} numberOfLines={1}>
                                {`${peopleCount} מגיעים`}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        <Pressable
                          onPress={() => void handleCopyPress(guestId, url)}
                          disabled={!url || isCopied}
                          style={({ pressed }) => [
                            styles.copyBtn,
                            isNarrow ? styles.copyBtnNarrow : null,
                            isCopied ? styles.copyBtnCopied : null,
                            pressed ? { opacity: 0.92 } : null,
                            !url ? { opacity: 0.5 } : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`העתקת קישור עבור ${String(g?.name ?? '')}`}
                        >
                          <Ionicons name="copy-outline" size={18} color={isCopied ? 'rgba(17,24,39,0.62)' : colors.white} />
                          <Text style={[styles.copyBtnText, isCopied ? styles.copyBtnTextCopied : null]}>{isCopied ? 'הועתק' : 'העתק'}</Text>
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </AppKeyboardAwareScrollView>
            </View>
          </View>
        ) : null}

      </AppKeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#E8F1FF' },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  stickyHeaderInner: {
    flex: 1,
    paddingHorizontal: 18,
    flexDirection: ROW_DIR,
    alignItems: 'center',
  },
  stickyHeaderTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  stickyHeaderBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(232,240,255,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.20)',
  },
  stickyHeaderSideSpacer: {
    width: 42,
    height: 42,
  },
  content: { padding: 18, paddingBottom: Platform.OS === 'web' ? 40 : 110, gap: 14 },
  contentMobile: {},
  contentNarrow: { padding: 14, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 14, fontWeight: '800', color: colors.gray[700], textAlign: 'center' },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(15,69,230,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    gap: 10,
    ...(Platform.OS === 'android' ? ({ elevation: 1 } as any) : null),
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 26px rgba(2,6,23,0.06)' } as any) : null),
  },
  cardMobile: { padding: 16, gap: 12 },
  topGrid: { gap: 14 },
  topGridDesktop: { flexDirection: ROW_DIR, alignItems: 'flex-start' },
  previewCardDesktop: { flex: 1, minWidth: 420, maxWidth: 560 },
  formCardDesktop: { flex: 1, minWidth: 520 },
  cardHeaderRow: { flexDirection: ROW_DIR, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardHeaderTextWrap: { flex: 1, minWidth: 0, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },
  cardSubtitle: { fontSize: 12, fontWeight: '700', color: 'rgba(17,24,39,0.58)', textAlign: 'right', lineHeight: 18 },

  badge: { flexDirection: ROW_DIR, gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,69,230,0.08)' },
  badgeText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  previewWrap: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: 'rgba(255,255,255,0.90)',
    padding: 10,
    gap: 10,
  },
  previewMediaWrap: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.03)',
  },
  previewImg: { width: '100%', height: 240 },
  previewImgMobile: { height: 220 },
  previewImgNarrow: { height: 210 },
  previewFallback: { height: 240, alignItems: 'center', justifyContent: 'center', gap: 8 },
  previewFallbackMobile: { height: 220 },
  previewFallbackNarrow: { height: 210 },
  previewFallbackText: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center' },
  previewCameraBtn: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  previewBottom: {
    paddingHorizontal: 6,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 10,
  },
  previewTitle: { fontSize: 17, fontWeight: '900', color: colors.text, textAlign: 'right', lineHeight: 24 },
  previewMetaRow: { flexDirection: ROW_DIR, flexWrap: 'wrap', gap: 8 },
  previewMetaChip: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.10)',
  },
  previewMetaChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.72)',
    textAlign: 'right',
  },
  previewHint: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(17,24,39,0.54)',
    textAlign: 'right',
    lineHeight: 17,
  },

  demoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.16)',
    backgroundColor: 'rgba(15,69,230,0.06)',
    padding: 12,
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  demoCardTop: { flexDirection: ROW_DIR, alignItems: 'center', flex: 1, minWidth: 0, gap: 10 },
  demoCardTopMobile: { flex: 0 },
  demoCardMobile: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
    gap: 12,
  },
  demoIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.18)',
  },
  demoTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  demoTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  demoSub: { fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.62)', textAlign: 'right', lineHeight: 18 },
  demoBtnWrap: { alignSelf: 'stretch' },
  demoBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 10px 22px rgba(15,69,230,0.22)' } as any) : null),
  },
  demoBtnMobile: {
    width: '100%',
    minWidth: '100%',
    height: 44,
    alignSelf: 'stretch',
    borderRadius: 14,
    ...(Platform.OS === 'android' ? ({ elevation: 2 } as any) : null),
  },
  demoBtnDisabled: { opacity: 0.55, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null) },
  demoBtnText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },

  formSectionCard: {
    marginTop: 2,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(248,251,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.08)',
  },
  sectionTitle: { marginTop: 2, marginBottom: 8, fontSize: 13, fontWeight: '900', color: 'rgba(17,24,39,0.82)', textAlign: 'right' },
  label: { marginTop: 2, fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right' },
  input: {
    marginTop: 6,
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.10)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  row: { flexDirection: ROW_DIR, gap: 10 },
  rowStack: { flexDirection: 'column' },
  actionsRow: { flexDirection: ROW_DIR, gap: 10, marginTop: 4 },
  actionsRowStack: { flexDirection: 'column' },
  formFooter: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,69,230,0.08)',
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
  },
  saveSimpleBtn: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  saveSimpleBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
  },
  primaryBtnFull: {
    flex: 1,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '900', color: '#fff', textAlign: 'right' },
  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(15,69,230,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  empty: { fontSize: 13, fontWeight: '800', color: colors.gray[600], textAlign: 'right', paddingVertical: 6 },
  filtersRow: { flexDirection: ROW_DIR, flexWrap: 'wrap', gap: 8 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.72)', textAlign: 'right' },
  filterTextActive: { color: '#fff' },
  guestRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : ROW_DIR,
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  guestRowNarrow: { flexDirection: ROW_DIR, flexWrap: 'wrap', alignItems: 'flex-start' },
  guestName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  guestMetaBlock: { marginTop: 4, gap: 2 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '800', color: colors.gray[700], textAlign: 'right' },
  metaLine: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  avatarIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(15,23,42,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    backgroundColor: 'rgba(15,69,230,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  copyBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  copyBtnNarrow: { width: '100%', marginTop: 8 },
  copyBtnText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },
  copyBtnCopied: { backgroundColor: 'rgba(17,24,39,0.10)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.14)' },
  copyBtnTextCopied: { color: 'rgba(17,24,39,0.72)' },

  searchOpenBtn: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(17,24,39,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
  },
  searchOpenText: { fontSize: 13, fontWeight: '900', color: 'rgba(17,24,39,0.62)', textAlign: 'right' },
  searchOpenCta: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6 },
  searchOpenCtaText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  linksStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  linksStatsRowScroll: { flexDirection: ROW_DIR, flexWrap: 'nowrap', gap: 8, alignItems: 'center', paddingHorizontal: 2 },
  statPill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  statDot: { width: 8, height: 8, borderRadius: 999 },
  statText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.72)', textAlign: 'right' },
  statValue: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right' },

  dialogOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 999,
    ...(Platform.OS === 'web' ? ({ position: 'fixed' } as any) : null),
  },
  dialogOverlayMobile: { justifyContent: 'flex-end', padding: 0 },
  dialogBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.45)',
    ...(Platform.OS === 'web' ? ({ position: 'fixed' } as any) : null),
  },
  dialogCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '84%',
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    padding: 14,
    gap: 10,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 22px 60px rgba(2,6,23,0.30)' } as any) : null),
  },
  dialogCardMobile: {
    maxHeight: '92%',
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.16)',
    marginTop: 2,
    marginBottom: 6,
  },
  dialogHeader: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  dialogTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },
  dialogSub: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', lineHeight: 18 },
  dialogClose: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  dialogSearchRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: 'rgba(17,24,39,0.04)',
  },
  dialogSearchInput: { flex: 1, color: '#111827', fontSize: 14, fontWeight: '700' },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  dialogFiltersScroll: { maxHeight: 48 },
  dialogFiltersRow: { flexDirection: ROW_DIR, flexWrap: 'nowrap', gap: 8, alignItems: 'center' },
  dialogList: { flex: 1 },
  dialogListContent: { paddingBottom: 10, gap: 10 },

  smsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(15,23,42,0.02)',
    padding: 12,
    gap: 10,
  },
  smsHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  smsTitleWrap: { flexDirection: ROW_DIR, alignItems: 'center', gap: 8 },
  smsTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  smsBadge: { flexDirection: ROW_DIR, gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(2,6,23,0.04)' },
  smsBadgeText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.72)', textAlign: 'right' },

  smsModeRow: { flexDirection: ROW_DIR, alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  modePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)' },
  modePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.72)', textAlign: 'right' },
  modeTextActive: { color: '#fff' },

  smallBtn: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(15,69,230,0.14)' },
  smallBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  smsHint: { fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.62)', textAlign: 'right' },
  smsHintMono: { fontWeight: '900' },
  smsInput: {
    minHeight: 92,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: '#fff',
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    textAlignVertical: 'top',
  },
  smsFooterRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  smsMeta: { fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.62)', textAlign: 'right' },
  smsSendBtn: { height: 42, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.primary, flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'center', gap: 8 },
  smsSendText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },
  smsResult: { fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.70)', textAlign: 'right' },

});

