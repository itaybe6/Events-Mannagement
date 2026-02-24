import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';

import { colors } from '@/constants/colors';
import { useAdminEventDetailsModel } from '@/features/events/useAdminEventDetailsModel';
import { eventService } from '@/lib/services/eventService';
import { invitationAssetService } from '@/lib/services/invitationAssetService';

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

export default function AdminInvitationLinksScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const id = useMemo(() => String(eventId || ''), [eventId]);
  const { width } = useWindowDimensions();

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

  const copyText = async (value: string) => {
    const text = String(value || '').trim();
    if (!text) return;

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        Alert.alert('הועתק', 'הקישור הועתק ללוח');
        return;
      }
    } catch {
      // fallback below
    }

    Alert.alert('העתקה', text);
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
        <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
          <Text style={styles.primaryBtnText}>חזרה</Text>
        </Pressable>
      </View>
    );
  }

  const isDesktop = Platform.OS === 'web' && width >= 1024;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>לינק להזמנה</Text>
            <Text style={styles.sub}>הגדרת תצוגת הזמנה + קישורים אישיים למוזמנים</Text>
          </View>

          <Pressable onPress={() => void refresh()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="רענון">
            <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="חזרה">
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          </Pressable>
        </View>

        <View style={[styles.topGrid, isDesktop ? styles.topGridDesktop : null]}>
          {/* Preview */}
          <View style={[styles.card, isDesktop ? styles.previewCardDesktop : null]}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>תצוגה מקדימה</Text>
              <View style={styles.badge}>
                <Ionicons name="image-outline" size={14} color={colors.primary} />
                <Text style={styles.badgeText}>{invitationPreviewImage ? 'יש תמונה' : 'אין תמונה'}</Text>
              </View>
            </View>

            <View style={styles.previewWrap}>
              {invitationPreviewImage ? (
                <Image source={{ uri: invitationPreviewImage }} style={styles.previewImg} contentFit="cover" transition={0} />
              ) : (
                <View style={styles.previewFallback}>
                  <Ionicons name="image-outline" size={26} color={colors.gray[500]} />
                  <Text style={styles.previewFallbackText}>עדיין לא הוגדרה תמונה</Text>
                </View>
              )}
              <View style={styles.previewBottom}>
                <Text style={styles.previewTitle} numberOfLines={2}>
                  {invitationPreviewTitle}
                </Text>
                <Text style={styles.previewMeta} numberOfLines={1}>
                  {dateLabel}
                </Text>
                <Text style={styles.previewMeta} numberOfLines={1}>
                  {String(event.location ?? '')}
                </Text>
              </View>
            </View>
          </View>

          {/* Form */}
          <View style={[styles.card, isDesktop ? styles.formCardDesktop : null]}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>הגדרות הזמנה</Text>
              <View style={[styles.badge, { backgroundColor: 'rgba(2,6,23,0.04)' }]}>
                <Ionicons name={isWedding ? 'heart-outline' : 'pricetag-outline'} size={14} color={'rgba(2,6,23,0.72)'} />
                <Text style={[styles.badgeText, { color: 'rgba(2,6,23,0.72)' }]}>{isWedding ? 'חתונה' : getEventTypeLabel(String(event.title ?? ''))}</Text>
              </View>
            </View>

            {isWedding ? (
              <>
                <Text style={styles.sectionTitle}>שמות</Text>
                <View style={styles.row}>
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

                <Text style={styles.sectionTitle}>זמנים (אופציונלי)</Text>
                <View style={styles.row}>
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

                <Text style={styles.sectionTitle}>הורים (אופציונלי)</Text>
                <View style={styles.row}>
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
              </>
            ) : (
              <>
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
              </>
            )}

            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => void pickAndUploadInvitationImage()}
                disabled={uploading}
                style={({ pressed }) => [styles.secondaryBtn, pressed ? { opacity: 0.92 } : null, uploading ? { opacity: 0.75 } : null]}
              >
                {uploading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />}
                <Text style={styles.secondaryBtnText}>{uploading ? 'מעלה...' : invitationPreviewImage ? 'החלפת תמונה' : 'העלה תמונה'}</Text>
              </Pressable>

              <Pressable
                onPress={() => void save()}
                disabled={saving}
                style={({ pressed }) => [styles.primaryBtn, pressed ? { opacity: 0.92 } : null, saving ? { opacity: 0.8 } : null]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
                <Text style={styles.primaryBtnText}>{saving ? 'שומר...' : 'שמור שינויים'}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>קישורים אישיים למוזמנים</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{guests.length}</Text>
              <Text style={styles.badgeText}>מוזמנים</Text>
            </View>
          </View>

          <View style={styles.filtersRow}>
            <Pressable
              onPress={() => setGuestFilter('all')}
              style={({ pressed }) => [
                styles.filterPill,
                guestFilter === 'all' ? styles.filterPillActive : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Text style={[styles.filterText, guestFilter === 'all' ? styles.filterTextActive : null]}>הכל ({counts.all})</Text>
            </Pressable>
            <Pressable
              onPress={() => setGuestFilter('מגיע')}
              style={({ pressed }) => [
                styles.filterPill,
                guestFilter === 'מגיע' ? styles.filterPillActive : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Text style={[styles.filterText, guestFilter === 'מגיע' ? styles.filterTextActive : null]}>אישרו ({counts.confirmed})</Text>
            </Pressable>
            <Pressable
              onPress={() => setGuestFilter('ממתין')}
              style={({ pressed }) => [
                styles.filterPill,
                guestFilter === 'ממתין' ? styles.filterPillActive : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Text style={[styles.filterText, guestFilter === 'ממתין' ? styles.filterTextActive : null]}>ממתינים ({counts.pending})</Text>
            </Pressable>
            <Pressable
              onPress={() => setGuestFilter('לא מגיע')}
              style={({ pressed }) => [
                styles.filterPill,
                guestFilter === 'לא מגיע' ? styles.filterPillActive : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Text style={[styles.filterText, guestFilter === 'לא מגיע' ? styles.filterTextActive : null]}>לא מגיעים ({counts.declined})</Text>
            </Pressable>
          </View>

          {filteredGuests.length === 0 ? (
            <Text style={styles.empty}>{guests.length === 0 ? 'אין עדיין מוזמנים באירוע.' : 'אין תוצאות לסינון שבחרת.'}</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {filteredGuests.map((g) => {
                const codeOrToken = String((g as any).invitationCode || (g as any).invitationToken || '').trim();
                const url = codeOrToken ? buildInviteUrl(codeOrToken) : '';
                return (
                  <View key={g.id} style={styles.guestRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.guestName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={styles.guestMeta} numberOfLines={1}>
                        {g.status}
                        {g.status === 'מגיע' ? ` · ${g.numberOfPeople || 1} מגיעים` : ''}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => void copyText(url)}
                      disabled={!url}
                      style={({ pressed }) => [
                        styles.copyBtn,
                        pressed ? { opacity: 0.92 } : null,
                        !url ? { opacity: 0.5 } : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`העתקת קישור עבור ${g.name}`}
                    >
                      <Ionicons name="copy-outline" size={18} color={colors.white} />
                      <Text style={styles.copyBtnText}>העתק</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Text style={styles.footer}>© 2026 כל הזכויות שמורות למערכת אירועים</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f6f8' },
  content: { padding: 18, paddingBottom: 40, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 14, fontWeight: '800', color: colors.gray[700], textAlign: 'center' },

  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  h1: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right' },
  sub: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },

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
  },
  topGrid: { gap: 14 },
  topGridDesktop: { flexDirection: 'row-reverse', alignItems: 'flex-start' },
  previewCardDesktop: { flex: 1, minWidth: 420, maxWidth: 560 },
  formCardDesktop: { flex: 1, minWidth: 520 },
  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },

  badge: { flexDirection: 'row-reverse', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,69,230,0.08)' },
  badgeText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  previewWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: 'rgba(15,23,42,0.03)',
  },
  previewImg: { width: '100%', height: 240 },
  previewFallback: { height: 240, alignItems: 'center', justifyContent: 'center', gap: 8 },
  previewFallbackText: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center' },
  previewBottom: { padding: 12, gap: 4, backgroundColor: 'rgba(255,255,255,0.92)' },
  previewTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  previewMeta: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },

  sectionTitle: { marginTop: 2, fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.78)', textAlign: 'right' },
  label: { marginTop: 2, fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right' },
  input: {
    marginTop: 6,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: 'rgba(17,24,39,0.04)',
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  row: { flexDirection: 'row-reverse', gap: 10 },
  actionsRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 4 },
  primaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '900', color: '#fff', textAlign: 'right' },
  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(15,69,230,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  empty: { fontSize: 13, fontWeight: '800', color: colors.gray[600], textAlign: 'right', paddingVertical: 6 },
  filtersRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  guestName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  guestMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  copyBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  copyBtnText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },

  footer: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.gray[500], textAlign: 'center' },
});

