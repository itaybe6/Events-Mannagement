import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { colors } from '@/constants/colors';
import type { Guest } from '@/types';
import { invitationService, type InvitationInfo } from '@/lib/services/invitationService';

type Status = Guest['status'];
const GOLD = '#D4AF37';

function formatDateNumeric(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

export default function InvitationLandingScreen() {
  const { token, eventId } = useLocalSearchParams<{ token?: string; eventId?: string }>();
  const t = useMemo(() => String(token || '').trim(), [token]);
  const demoEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const isDemo = useMemo(() => t.toLowerCase() === 'demo', [t]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [status, setStatus] = useState<Status>('ממתין');
  const [peopleCount, setPeopleCount] = useState(1);
  const [submittedLocked, setSubmittedLocked] = useState(false);

  const successAnim = useRef(new Animated.Value(0)).current;

  const invitationImageUrl = useMemo(() => {
    const s = String(info?.event?.invitationImageUrl ?? '').trim();
    return s || '';
  }, [info?.event?.invitationImageUrl]);

  const groomName = useMemo(() => String(info?.event?.groomName ?? '').trim(), [info?.event?.groomName]);
  const brideName = useMemo(() => String(info?.event?.brideName ?? '').trim(), [info?.event?.brideName]);
  const isWedding = Boolean(groomName && brideName);
  const eventTitle = useMemo(() => {
    const customInvitationTitle = String(info?.event?.invitationTitle ?? '').trim();
    if (customInvitationTitle) return customInvitationTitle;
    return String(info?.event?.title ?? 'אירוע').trim() || 'אירוע';
  }, [info?.event?.invitationTitle, info?.event?.title]);

  const weddingDetails = useMemo(() => {
    const receptionTime = String(info?.event?.receptionTime ?? '').trim();
    const ceremonyTime = String(info?.event?.ceremonyTime ?? '').trim();
    const brideParents = String(info?.event?.brideParents ?? '').trim();
    const groomParents = String(info?.event?.groomParents ?? '').trim();
    return { receptionTime, ceremonyTime, brideParents, groomParents };
  }, [info?.event?.receptionTime, info?.event?.ceremonyTime, info?.event?.brideParents, info?.event?.groomParents]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!t) {
        setLoading(false);
        setLoadError(null);
        setInfo(null);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const data = isDemo
          ? await invitationService.getInvitationDemoByEventId(demoEventId)
          : await invitationService.getInvitationByToken(t);
        if (!alive) return;
        if (isDemo && !demoEventId) {
          setInfo(null);
          setLoadError('חסר מזהה אירוע לדמו');
          return;
        }
        setInfo(data);
        if (!isDemo && data?.guest?.status) setStatus(data.guest.status);
        if (!isDemo) setPeopleCount(Math.max(1, Math.min(99, Number(data?.guest?.numberOfPeople) || 1)));
        setSubmittedLocked(isDemo ? false : Boolean((data as any)?.guest?.rsvpLocked));
      } catch (e: any) {
        if (!alive) return;
        const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
        setLoadError(message);
        Alert.alert('שגיאה', `לא ניתן לטעון את ההזמנה.\n\n${message}`);
        setInfo(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [t, isDemo, demoEventId]);

  const canSubmit = Boolean(info) && !saving && (isDemo || Boolean(info?.guest?.id));

  const submit = async () => {
    if (saving) return;
    if (submittedLocked) return;

    setSaving(true);
    try {
      if (isDemo) {
        // Demo mode: keep changes local only (do not update DB / guests).
        setSubmittedLocked(true);
        return;
      }

      const submitToken = String(info?.guest?.invitationCode || info?.guest?.invitationToken || '').trim();
      if (!submitToken) return;

      const nextPeople = status === 'מגיע' ? Math.max(1, Math.min(99, Number(peopleCount) || 1)) : undefined;
      const updatedGuest = await invitationService.updateRsvpByToken(submitToken, {
        status,
        numberOfPeople: nextPeople,
      });

      setInfo((prev) => (prev ? { ...prev, guest: prev.guest ? { ...prev.guest, ...updatedGuest } : updatedGuest } : prev));
      setSubmittedLocked(true);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לעדכן.\n\n${message}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!submittedLocked) return;
    successAnim.setValue(0);
    Animated.spring(successAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 14,
      stiffness: 160,
      mass: 0.8,
    }).start();
  }, [submittedLocked, successAnim]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>טוען הזמנה...</Text>
      </View>
    );
  }

  if (!t) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.gray[600]} />
        <Text style={styles.centerText}>קישור הזמנה לא תקין</Text>
      </View>
    );
  }

  if (!info) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.gray[600]} />
        <Text style={styles.centerText}>לא מצאנו הזמנה עבור הקישור הזה</Text>
        {loadError ? (
          <Text style={[styles.centerText, { fontSize: 12, fontWeight: '700', color: colors.gray[600] }]}>
            {loadError}
          </Text>
        ) : null}
      </View>
    );
  }

  if (submittedLocked) {
    return (
      <View style={styles.page}>
        <View style={styles.thanksWrap}>
          <Animated.View
            style={[
              styles.successIconWrap,
              {
                transform: [
                  {
                    scale: successAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.72, 1],
                    }),
                  },
                ],
                opacity: successAnim,
              },
            ]}
          >
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={38} color="#fff" />
            </View>
          </Animated.View>

          <Text style={styles.successTitle}>{isDemo ? 'מצב דמו' : 'תודה שעדכנתם אותנו'}</Text>
          <Text style={styles.successText}>
            {isDemo
              ? 'הבחירה נשמרה מקומית בלבד — לא נשמר שום עדכון ולא שונתה תשובה של אף אורח.'
              : 'העדכון נשמר בהצלחה, ולא ניתן לשנות שוב דרך הקישור הזה.'}
          </Text>
          <View style={styles.thanksMeta}>
            <Text style={styles.thanksMetaText}>
              סטטוס: {status}
              {status === 'מגיע' ? ` · ${Math.max(1, Number(peopleCount) || 1)} אורחים` : ''}
            </Text>
          </View>
          {isDemo ? (
            <Pressable
              onPress={() => setSubmittedLocked(false)}
              style={({ pressed }) => [styles.demoResetBtn, pressed ? { opacity: 0.94 } : null]}
              accessibilityRole="button"
              accessibilityLabel="חזרה לדמו"
            >
              <Ionicons name="refresh" size={18} color={'rgba(2,6,23,0.78)'} />
              <Text style={styles.demoResetText}>חזרה לדמו</Text>
            </Pressable>
          ) : (
            <Text style={styles.thanksHint}>אפשר לסגור את הדף.</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          {/* Image + details card */}
          <View style={styles.card}>
            <View style={styles.imageCard}>
              {invitationImageUrl ? (
                <Image source={{ uri: invitationImageUrl }} style={styles.image} contentFit="cover" transition={0} />
              ) : (
                <View style={styles.heroFallback}>
                  <Ionicons name="image-outline" size={30} color={colors.gray[500]} />
                  <Text style={styles.heroFallbackText}>אין תמונה להצגה</Text>
                </View>
              )}
            </View>

            <View style={styles.details}>
              {isWedding ? (
                <Text style={styles.title} numberOfLines={2}>
                  <Text>{groomName}</Text>
                  <Text>{' '}</Text>
                  <Text style={styles.amp}>&</Text>
                  <Text>{' '}</Text>
                  <Text>{brideName}</Text>
                </Text>
              ) : (
                <Text style={styles.title} numberOfLines={2}>
                  {eventTitle}
                </Text>
              )}

              <View style={styles.infoLine}>
                <Ionicons name="calendar-outline" size={16} color={'rgba(2,6,23,0.72)'} />
                <Text style={styles.infoLineText}>{formatDateNumeric(info.event.date)}</Text>
              </View>

              <View style={styles.infoLine}>
                <Ionicons name="location-outline" size={16} color={'rgba(2,6,23,0.72)'} />
                <Text style={styles.infoLineText} numberOfLines={2}>
                  {String(info.event.location || '')}
                </Text>
              </View>

              {(weddingDetails.receptionTime || weddingDetails.ceremonyTime) ? (
                <>
                  <View style={styles.timesRow}>
                    {weddingDetails.ceremonyTime ? (
                      <View style={styles.timeChip}>
                        <Ionicons name="heart" size={14} color={GOLD} />
                        <Text style={styles.timeChipText}>חופה {weddingDetails.ceremonyTime}</Text>
                      </View>
                    ) : null}
                    {weddingDetails.receptionTime ? (
                      <View style={styles.timeChip}>
                        <Ionicons name="wine" size={14} color={GOLD} />
                        <Text style={styles.timeChipText}>קבלת פנים {weddingDetails.receptionTime}</Text>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : null}

              {(weddingDetails.brideParents || weddingDetails.groomParents) ? (
                <View style={styles.parentsCard}>
                  <View style={styles.parentsCol}>
                    <Text style={styles.parentsTitle}>הורי הכלה</Text>
                    <Text style={styles.parentsValue} numberOfLines={3}>{weddingDetails.brideParents || '—'}</Text>
                  </View>
                  <View style={styles.parentsDivider} />
                  <View style={styles.parentsCol}>
                    <Text style={styles.parentsTitle}>הורי החתן</Text>
                    <Text style={styles.parentsValue} numberOfLines={3}>{weddingDetails.groomParents || '—'}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* RSVP card */}
          <View style={styles.rsvpCard}>
            <Text style={styles.rsvpTitle}>אישור הגעה</Text>

            <View style={styles.rsvpButtonsRow}>
              <Pressable
                onPress={() => setStatus('לא מגיע')}
                style={({ pressed }) => [
                  styles.rsvpBtn,
                  status === 'לא מגיע' ? styles.rsvpBtnActiveLight : null,
                  pressed ? { opacity: 0.95 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="לא נוכל להגיע"
              >
                <View style={styles.rsvpIconCircle}>
                  <Ionicons name="close" size={18} color={'rgba(2,6,23,0.75)'} />
                </View>
                <Text style={styles.rsvpBtnText}>לא נוכל</Text>
              </Pressable>

              <Pressable
                onPress={() => setStatus('ממתין')}
                style={({ pressed }) => [
                  styles.rsvpBtn,
                  status === 'ממתין' ? styles.rsvpBtnActiveLight : null,
                  pressed ? { opacity: 0.95 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="אולי"
              >
                <View style={styles.rsvpIconCircle}>
                  <Ionicons name="help" size={18} color={'rgba(2,6,23,0.75)'} />
                </View>
                <Text style={styles.rsvpBtnText}>אולי</Text>
              </Pressable>

              <Pressable
                onPress={() => setStatus('מגיע')}
                style={({ pressed }) => [
                  styles.rsvpBtn,
                  status === 'מגיע' ? styles.rsvpBtnActiveDark : null,
                  pressed ? { opacity: 0.95 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="נגיע"
              >
                <View style={[styles.rsvpIconCircle, status === 'מגיע' ? styles.rsvpIconCircleDark : null]}>
                  <Ionicons name="checkmark" size={18} color={status === 'מגיע' ? '#fff' : 'rgba(2,6,23,0.75)'} />
                </View>
                <Text style={[styles.rsvpBtnText, status === 'מגיע' ? styles.rsvpBtnTextDark : null]}>נגיע</Text>
              </Pressable>
            </View>

            {status === 'מגיע' ? (
              <View style={styles.countBox}>
                <View style={styles.countRow}>
                  <Text style={styles.countLabel}>מספר אורחים</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => setPeopleCount((n) => Math.max(1, (Number(n) || 1) - 1))}
                      style={({ pressed }) => [styles.stepBtn, styles.stepBtnSecondary, pressed ? { opacity: 0.92 } : null]}
                      accessibilityRole="button"
                      accessibilityLabel="הקטן מספר אורחים"
                    >
                      <Ionicons name="remove" size={18} color={'rgba(2,6,23,0.85)'} />
                    </Pressable>
                    <Text style={styles.countValue}>{Math.max(1, Number(peopleCount) || 1)}</Text>
                    <Pressable
                      onPress={() => setPeopleCount((n) => Math.min(99, (Number(n) || 1) + 1))}
                      style={({ pressed }) => [styles.stepBtn, styles.stepBtnPrimary, pressed ? { opacity: 0.92 } : null]}
                      accessibilityRole="button"
                      accessibilityLabel="הגדל מספר אורחים"
                    >
                      <Ionicons name="add" size={18} color={'#fff'} />
                    </Pressable>
                </View>
                </View>
              </View>
            ) : null}

            <Pressable
              onPress={() => void submit()}
              disabled={!canSubmit || submittedLocked}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed ? { opacity: 0.94, transform: [{ scale: 0.995 }] } : null,
                !canSubmit || submittedLocked ? { opacity: 0.6 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="שליחה ואישור"
            >
              {saving ? <ActivityIndicator color="#fff" /> : null}
              <Text style={styles.submitText}>{saving ? 'שולח...' : 'שליחה ואישור'}</Text>
              {!saving ? <Ionicons name="paper-plane-outline" size={20} color="#fff" /> : null}
            </Pressable>
          </View>

          <Text style={styles.footer}>© 2026 כל הזכויות שמורות</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F5F7' },
  content: { padding: 16, paddingBottom: 34 },
  shell: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: '#fff' },
  centerText: { fontSize: 14, fontWeight: '800', color: colors.gray[700], textAlign: 'center' },

  thanksWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 10,
  },
  successIconWrap: { marginTop: 4 },
  successIconCircle: {
    width: 74,
    height: 74,
    borderRadius: 999,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  successTitle: { marginTop: 6, fontSize: 18, fontWeight: '900', color: '#0B1020', textAlign: 'center' },
  successText: { fontSize: 13, fontWeight: '800', color: 'rgba(2,6,23,0.70)', textAlign: 'center' },
  thanksMeta: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(2,6,23,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
  },
  thanksMetaText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.78)', textAlign: 'center' },
  thanksHint: { marginTop: 10, fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.55)', textAlign: 'center' },
  demoResetBtn: {
    marginTop: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(2,6,23,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  demoResetText: { fontSize: 13, fontWeight: '900', color: 'rgba(2,6,23,0.78)', textAlign: 'center' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: '#0B1020',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    overflow: 'hidden',
  },

  imageCard: {
    margin: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(2,6,23,0.03)',
    overflow: 'hidden',
  },
  image: { width: '100%', aspectRatio: 4 / 5 },
  details: { paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center', gap: 10 },
  title: { marginTop: 2, fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'center' },
  amp: { color: '#D4AF37', fontWeight: '900' },
  infoLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  infoLineText: { fontSize: 13, fontWeight: '800', color: 'rgba(2,6,23,0.72)', textAlign: 'center' },

  timesRow: { marginTop: 6, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  timeChipText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.78)', textAlign: 'right' },


  parentsCard: {
    width: '100%',
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    flexDirection: 'row-reverse',
    gap: 12,
    alignItems: 'stretch',
  },
  parentsCol: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  parentsDivider: { width: 1, backgroundColor: 'rgba(212,175,55,0.35)' },
  parentsTitle: { fontSize: 12, fontWeight: '900', color: '#D4AF37', textAlign: 'center' },
  parentsValue: { fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.70)', textAlign: 'center', lineHeight: 18 },

  heroFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroFallbackText: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center' },

  rsvpCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    shadowColor: '#0B1020',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    gap: 12,
  },
  rsvpTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'center' },
  rsvpButtonsRow: { flexDirection: 'row-reverse', gap: 10 },
  rsvpBtn: {
    flex: 1,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rsvpBtnActiveDark: { backgroundColor: '#0B1020', borderColor: 'rgba(11,16,32,0.18)' },
  rsvpBtnActiveLight: { backgroundColor: 'rgba(2,6,23,0.04)' },
  rsvpIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.06)',
  },
  rsvpIconCircleDark: { backgroundColor: 'rgba(255,255,255,0.14)' },
  rsvpBtnText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.78)', textAlign: 'center' },
  rsvpBtnTextDark: { color: '#fff' },

  countBox: {
    marginTop: 2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countLabel: { fontSize: 13, fontWeight: '900', color: 'rgba(2,6,23,0.80)', textAlign: 'right' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPrimary: { backgroundColor: '#0B1020', borderColor: 'rgba(11,16,32,0.18)' },
  stepBtnSecondary: { backgroundColor: 'rgba(2,6,23,0.04)' },
  countValue: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '900', color: 'rgba(2,6,23,0.86)' },

  submitBtn: {
    marginTop: 8,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#0B1020',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#0B1020',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
  },
  submitText: { fontSize: 14, fontWeight: '900', color: '#fff', textAlign: 'center' },

  footer: { marginTop: 14, fontSize: 12, fontWeight: '700', color: colors.gray[500], textAlign: 'center' },
});

