import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';

import { useUserStore } from '@/store/userStore';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';
import { supabase } from '@/lib/supabase';
import { avatarService } from '@/lib/services/avatarService';
import type { Event } from '@/types';

const ui = {
  bgLight: '#f6f6f8',
  primary: '#0b1b3d',
  primaryLight: '#1a2c55',
  accent: '#3B82F6',
  accentDark: '#1D4ED8',
  gold: '#D4AF37',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: 'rgba(15, 23, 42, 0.08)',
  ring: 'rgba(11, 27, 61, 0.06)',
  success: '#16A34A',
  danger: '#E11D48',
};

type MonthBar = { monthIndex: number; label: string; value: number };

function monthLabelHe(monthIndex0: number) {
  const months = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  return months[monthIndex0] ?? '';
}

function buildYearBars(valuesByMonth: number[]): MonthBar[] {
  return Array.from({ length: 12 }).map((_, m) => ({
    monthIndex: m,
    label: monthLabelHe(m),
    value: valuesByMonth[m] ?? 0,
  }));
}

function formatCurrencyILS(n: number) {
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `₪${Math.round(n).toLocaleString('he-IL')}`;
  }
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone,
  badgeText,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'accent' | 'gold' | 'success' | 'dark';
  badgeText?: string;
}) {
  const isDark = tone === 'dark';
  const iconBg =
    tone === 'accent'
      ? 'rgba(59, 130, 246, 0.10)'
      : tone === 'gold'
        ? 'rgba(212, 175, 55, 0.14)'
        : tone === 'success'
          ? 'rgba(22, 163, 74, 0.12)'
          : 'rgba(11, 27, 61, 0.06)';
  const iconFg = tone === 'accent' ? ui.accentDark : tone === 'gold' ? ui.gold : tone === 'success' ? ui.success : ui.primary;

  if (isDark) {
    return (
      <View style={styles.statCardDark}>
        <View style={styles.statDarkBgDecor1} pointerEvents="none" />
        <View style={styles.statDarkBgDecor2} pointerEvents="none" />
        <View style={styles.statCardHeader}>
          <View style={[styles.statIconBox, { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.16)' }]}>
            <Ionicons name={icon} size={20} color={'rgba(255,255,255,0.92)'} />
          </View>
          <Ionicons name="arrow-up-outline" size={20} color={ui.gold} />
        </View>
        <Text style={styles.statTitleDark}>{title}</Text>
        <Text style={styles.statValueDark} numberOfLines={1}>
          {value}
        </Text>
        {subtitle ? <Text style={styles.statSubDark}>{subtitle}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <View style={[styles.statIconBox, { backgroundColor: iconBg, borderColor: 'rgba(15,23,42,0.06)' }]}>
          <Ionicons name={icon} size={20} color={iconFg} />
        </View>
        {badgeText ? (
          <View style={styles.statBadge}>
            <Ionicons name="trending-up" size={14} color={ui.success} />
            <Text style={styles.statBadgeText}>{badgeText}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      {subtitle ? <Text style={styles.statSub}>{subtitle}</Text> : null}
    </View>
  );
}

export default function AdminProfileWebScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;
  const [heroWidth, setHeroWidth] = useState(0);
  const isHeroStack = heroWidth > 0 ? heroWidth < 520 : width < 520;

  const { userData } = useUserStore();

  const [editOpen, setEditOpen] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [clientsCount, setClientsCount] = useState<number | null>(null);
  const [eventsThisYear, setEventsThisYear] = useState<Event[]>([]);
  const [bars12, setBars12] = useState<MonthBar[]>([]);
  const [yearTotalEvents, setYearTotalEvents] = useState<number>(0);
  const [yearTotalGuests, setYearTotalGuests] = useState<number>(0);
  const [yearTotalBudget, setYearTotalBudget] = useState<number>(0);

  useEffect(() => {
    if (userData) {
      setForm({ name: userData.name, email: userData.email, password: '', confirmPassword: '' });
    }
  }, [userData?.id]);

  const avatarUri = useMemo(() => {
    const direct = String(userData?.avatar_url ?? '').trim();
    if (direct) return direct;
    const seed = encodeURIComponent(userData?.email ?? 'admin');
    return `https://i.pravatar.cc/256?u=${seed}`;
  }, [userData?.avatar_url, userData?.email]);

  const canPrevYear = useMemo(() => {
    if (availableYears.length === 0) return true;
    const min = Math.min(...availableYears);
    return selectedYear > min;
  }, [availableYears, selectedYear]);

  const canNextYear = useMemo(() => {
    if (availableYears.length === 0) return true;
    const max = Math.max(...availableYears);
    return selectedYear < max;
  }, [availableYears, selectedYear]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [users, events] = await Promise.all([userService.getClients(), eventService.getEvents()]);
      setClientsCount(Array.isArray(users) ? users.length : 0);

      const years = new Set<number>();
      years.add(new Date().getFullYear());
      events.forEach((e) => {
        const d = new Date((e as any).date);
        if (!Number.isFinite(d.getTime())) return;
        years.add(d.getFullYear());
      });
      const yearsSorted = Array.from(years).sort((a, b) => b - a);
      setAvailableYears(yearsSorted);

      const yearToUse = yearsSorted.includes(selectedYear) ? selectedYear : yearsSorted[0] ?? selectedYear;
      if (yearToUse !== selectedYear) setSelectedYear(yearToUse);

      const inYear = events.filter((e) => {
        const d = new Date((e as any).date);
        return Number.isFinite(d.getTime()) && d.getFullYear() === yearToUse;
      }) as Event[];
      setEventsThisYear(inYear);

      const eventsByMonth = Array(12).fill(0);
      inYear.forEach((e) => {
        const d = new Date((e as any).date);
        if (!Number.isFinite(d.getTime())) return;
        eventsByMonth[d.getMonth()] += 1;
      });
      const bars = buildYearBars(eventsByMonth);
      setBars12(bars);

      const totalEvents = bars.reduce((sum, b) => sum + b.value, 0);
      const totalGuests = inYear.reduce((sum, e) => sum + (Number((e as any).guests) || 0), 0);
      const totalBudget = inYear.reduce((sum, e) => sum + (Number((e as any).budget) || 0), 0);

      setYearTotalEvents(totalEvents);
      setYearTotalGuests(totalGuests);
      setYearTotalBudget(totalBudget);
    } catch (e) {
      setAvailableYears([]);
      setClientsCount(null);
      setEventsThisYear([]);
      setBars12([]);
      setYearTotalEvents(0);
      setYearTotalGuests(0);
      setYearTotalBudget(0);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (!userData) return;
    void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.id, selectedYear]);

  const maxBar = Math.max(1, ...bars12.map((b) => b.value));
  const now = new Date();
  const isCurrentYear = selectedYear === now.getFullYear();

  const peakMonth = useMemo(() => {
    if (bars12.length === 0) return null;
    const best = [...bars12].sort((a, b) => b.value - a.value)[0];
    return best?.value ? best : null;
  }, [bars12]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      // eslint-disable-next-line no-alert
      alert('שגיאה: יש למלא שם ואימייל');
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      // eslint-disable-next-line no-alert
      alert('שגיאה: הסיסמאות אינן תואמות');
      return;
    }
    if (!userData) return;

    setFormSaving(true);
    try {
      const nextName = form.name.trim();
      const nextEmail = form.email.trim();
      const emailChanged = nextEmail !== userData.email;
      const nameChanged = nextName !== userData.name;

      if (nameChanged || emailChanged) {
        const { error: profileError } = await supabase
          .from('users')
          .update({ name: nextName, email: nextEmail })
          .eq('id', userData.id);
        if (profileError) throw profileError;
      }

      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
        if (emailError) throw emailError;
      }

      if (form.password) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: form.password });
        if (passwordError) throw passwordError;
      }

      useUserStore.setState((state) => ({
        userData: state.userData ? { ...state.userData, name: nextName, email: nextEmail } : state.userData,
      }));

      // eslint-disable-next-line no-alert
      alert('הצלחה: הפרופיל עודכן בהצלחה');
      setEditOpen(false);
      setForm((f) => ({ ...f, password: '', confirmPassword: '' }));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('שגיאה: לא ניתן לעדכן את הפרופיל');
    } finally {
      setFormSaving(false);
    }
  };

  const pickAndUploadAvatar = async () => {
    if (!userData?.id) return;
    if (avatarUploading) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0] as any;

      setAvatarUploading(true);
      const url = await avatarService.uploadUserAvatar(userData.id, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
        base64: asset.base64,
      });

      // Update local store immediately so avatar updates everywhere.
      useUserStore.setState((state) => ({
        userData: state.userData ? { ...state.userData, avatar_url: url } : state.userData,
      }));

      // eslint-disable-next-line no-alert
      alert('הצלחה: תמונת הפרופיל עודכנה');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('שגיאה: לא ניתן להעלות תמונה');
    } finally {
      setAvatarUploading(false);
    }
  };

  if (!userData) {
    return (
      <View style={[styles.center, { backgroundColor: ui.bgLight }]}>
        <ActivityIndicator size="large" color={ui.accentDark} />
      </View>
    );
  }

  const userName = String(userData.name || 'אדמין');
  const userEmail = String(userData.email || '').trim();
  const userPhone = String((userData as any)?.phone || '').trim();
  const userLocation = 'ישראל';

  return (
    <View style={styles.page}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          {/* HERO */}
          <View
            style={styles.heroCard}
            onLayout={(e) => {
              const next = e?.nativeEvent?.layout?.width ?? 0;
              if (next && next !== heroWidth) setHeroWidth(next);
            }}
          >
            <LinearGradient colors={[ui.primary, ui.accent, ui.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.heroTopLine} />
            <View style={styles.heroDecor1} pointerEvents="none" />
            <View style={styles.heroDecor2} pointerEvents="none" />

            <View style={[styles.heroMainRow, isHeroStack ? styles.heroMainRowStack : null]}>
              {/* RIGHT: actions (first in row-reverse) */}
              <View style={[styles.heroActionsCol, isHeroStack ? styles.heroActionsColStack : null]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="עריכת פרופיל"
                  onPress={() => setEditOpen(true)}
                  style={({ hovered, pressed }: any) => [
                    styles.primaryBtn,
                    Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                    isHeroStack ? { width: '100%' } : null,
                  ]}
                >
                  <Ionicons name="create-outline" size={18} color={'#FFFFFF'} />
                  <Text style={styles.primaryBtnText}>עריכת פרופיל</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="שינוי סיסמה"
                  onPress={() => setEditOpen(true)}
                  style={({ hovered, pressed }: any) => [
                    styles.secondaryBtn,
                    Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                    isHeroStack ? { width: '100%' } : null,
                  ]}
                >
                  <Ionicons name="lock-closed-outline" size={18} color={ui.primary} />
                  <Text style={styles.secondaryBtnText}>שינוי סיסמה</Text>
                </Pressable>
              </View>

              {/* RIGHT GROUP: avatar + text (so text sits close to avatar) */}
              <View style={[styles.heroIdentityGroup, isHeroStack ? styles.heroIdentityGroupStack : null]}>
                <View style={[styles.heroAvatarCol, isHeroStack ? styles.heroAvatarColStack : null]}>
                  <View style={styles.heroAvatarBlock}>
                    <View style={styles.heroAvatarRing}>
                      <Image source={{ uri: avatarUri }} style={styles.heroAvatar} contentFit="cover" transition={0} />
                    </View>
                    <View style={styles.heroStatusDot} />
                  </View>
                </View>

                <View style={styles.heroInfoCol}>
                  <View style={styles.heroTitleRow}>
                    <Text style={styles.heroName} numberOfLines={1}>
                      {userName}
                    </Text>
                    <View style={styles.rolePill}>
                      <Ionicons name="checkmark-circle" size={16} color={ui.gold} />
                      <Text style={styles.rolePillText}>מנהל מערכת</Text>
                    </View>
                  </View>

                  <Text style={styles.heroDesc} numberOfLines={2}>
                    אחראי על אופרציה, ניהול אירועים וקשרי לקוחות אסטרטגיים.
                  </Text>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="mail-outline" size={16} color={'rgba(100,116,139,0.95)'} />
                      <Text
                        style={styles.metaTextLtr}
                        numberOfLines={1}
                        // @ts-ignore - react-native-web supports direction
                        dir="ltr"
                      >
                        {userEmail || '—'}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="call-outline" size={16} color={'rgba(100,116,139,0.95)'} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {userPhone || '—'}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={16} color={'rgba(100,116,139,0.95)'} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {userLocation}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* STATS */}
          <View style={styles.statsGrid}>
            <StatCard
              title="אירועים השנה"
              value={loadingStats ? '...' : String(eventsThisYear.length)}
              subtitle={`בשנת ${selectedYear}`}
              icon="calendar-outline"
              tone="accent"
              badgeText={eventsThisYear.length ? `${Math.max(1, Math.round((eventsThisYear.length / 12) * 100) / 10)} / חודש` : undefined}
            />
            <StatCard
              title="מוזמנים השנה"
              value={loadingStats ? '...' : yearTotalGuests.toLocaleString('he-IL')}
              subtitle="סכום מוזמנים לכל האירועים"
              icon="people-outline"
              tone="default"
            />
            <StatCard
              title="לקוחות פעילים"
              value={loadingStats ? '...' : clientsCount === null ? '—' : clientsCount.toLocaleString('he-IL')}
              subtitle="בעלי אירוע במערכת"
              icon="briefcase-outline"
              tone="gold"
            />
            <StatCard
              title="ביצועי שנה"
              value={loadingStats ? '...' : formatCurrencyILS(yearTotalBudget)}
              subtitle="תקציב כולל לכל האירועים"
              icon="analytics-outline"
              tone="dark"
            />
          </View>

          {/* ANALYTICS */}
          <View style={[styles.analyticsRow, isWide ? null : { flexDirection: 'column' }]}>
            <View style={styles.analyticsMain}>
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle}>ביצועים חודשיים</Text>
                    <Text style={styles.cardSubtitle}>מס׳ אירועים לפי חודש · {selectedYear}</Text>
                  </View>

                  <View style={styles.yearControls}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="שנה קודמת"
                      onPress={() => setSelectedYear((y) => y - 1)}
                      disabled={!canPrevYear}
                      style={({ hovered, pressed }: any) => [
                        styles.yearBtn,
                        Platform.OS === 'web' && hovered ? styles.yearBtnHover : null,
                        pressed ? { opacity: 0.92 } : null,
                        !canPrevYear ? { opacity: 0.4 } : null,
                      ]}
                    >
                      <Ionicons name="chevron-forward" size={18} color={ui.text} />
                    </Pressable>

                    <View style={styles.yearPill}>
                      <Ionicons name="calendar-outline" size={14} color={ui.text} />
                      <Text style={styles.yearPillText}>{selectedYear}</Text>
                      <View style={styles.pillDot} />
                      <Text style={styles.yearPillText}>סה״כ {yearTotalEvents}</Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="שנה הבאה"
                      onPress={() => setSelectedYear((y) => y + 1)}
                      disabled={!canNextYear}
                      style={({ hovered, pressed }: any) => [
                        styles.yearBtn,
                        Platform.OS === 'web' && hovered ? styles.yearBtnHover : null,
                        pressed ? { opacity: 0.92 } : null,
                        !canNextYear ? { opacity: 0.4 } : null,
                      ]}
                    >
                      <Ionicons name="chevron-back" size={18} color={ui.text} />
                    </Pressable>
                  </View>
                </View>

                {loadingStats && bars12.length === 0 ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator color={ui.accentDark} />
                  </View>
                ) : (
                  <View style={styles.barsWrap}>
                    {bars12.map((b) => {
                      const isCurrentMonth = isCurrentYear && b.monthIndex === now.getMonth();
                      const pct = b.value === 0 ? 0 : Math.max(0.06, b.value / maxBar);
                      return (
                        <Pressable
                          key={`${selectedYear}-${b.monthIndex}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${b.label}: ${b.value}`}
                          onPress={() => null}
                          style={({ hovered, pressed }: any) => [
                            styles.barCol,
                            pressed ? { opacity: 0.96 } : null,
                            Platform.OS === 'web' && hovered ? styles.barColHover : null,
                          ]}
                        >
                          {({ hovered }: any) => (
                            <>
                              <View style={[styles.barTrack, Platform.OS === 'web' && hovered ? styles.barTrackHover : null]}>
                                <View style={styles.barBg} />
                                <LinearGradient
                                  colors={
                                    isCurrentMonth
                                      ? [ui.accentDark, ui.accent]
                                      : ['rgba(11,27,61,0.18)', 'rgba(59,130,246,0.10)']
                                  }
                                  start={{ x: 0.5, y: 1 }}
                                  end={{ x: 0.5, y: 0 }}
                                  style={[
                                    styles.barFill,
                                    { height: `${Math.round(pct * 100)}%` } as any,
                                    isCurrentMonth ? styles.barFillHot : null,
                                  ]}
                                />
                                <View
                                  style={[
                                    styles.barTooltip,
                                    Platform.OS === 'web' ? (hovered ? { opacity: 1 } : null) : ({ display: 'none' } as any),
                                  ]}
                                >
                                  <Text style={styles.barTooltipText}>{b.value}</Text>
                                </View>
                              </View>
                              <Text style={[styles.barLabel, isCurrentMonth ? styles.barLabelHot : null]}>{b.label}</Text>
                            </>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.analyticsSide}>
              <View style={styles.sideCardPrimary}>
                <View style={styles.sideDecor1} pointerEvents="none" />
                <View style={styles.sideDecor2} pointerEvents="none" />
                <Text style={styles.sideTitle}>סיכום שנתי</Text>

                <View style={styles.sideRows}>
                  <View style={styles.sideRow}>
                    <View>
                      <Text style={styles.sideKpiLabel}>סה״כ אירועים</Text>
                      <Text style={styles.sideKpiValue}>{yearTotalEvents.toLocaleString('he-IL')}</Text>
                    </View>
                    <View style={styles.sideKpiIcon}>
                      <Ionicons name="trophy-outline" size={18} color={'rgba(255,255,255,0.90)'} />
                    </View>
                  </View>

                  <View style={styles.sideDivider} />

                  <View style={styles.sideRow}>
                    <View>
                      <Text style={styles.sideKpiLabel}>הכנסות/תקציב</Text>
                      <Text style={styles.sideKpiValue}>{formatCurrencyILS(yearTotalBudget)}</Text>
                    </View>
                    <View style={styles.sideKpiIcon}>
                      <Ionicons name="cash-outline" size={18} color={'rgba(34,197,94,0.95)'} />
                    </View>
                  </View>

                  <View style={styles.sideDivider} />

                  <View style={styles.sideRow}>
                    <View>
                      <Text style={styles.sideKpiLabel}>חודש שיא</Text>
                      <Text style={styles.sideKpiValue}>
                        {peakMonth ? `${peakMonth.label} · ${peakMonth.value}` : '—'}
                      </Text>
                    </View>
                    <View style={styles.sideKpiIcon}>
                      <Ionicons name="star-outline" size={18} color={ui.gold} />
                    </View>
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="הורדת דוח מלא"
                  onPress={() => null}
                  style={({ hovered, pressed }: any) => [
                    styles.downloadBtn,
                    Platform.OS === 'web' && hovered ? styles.downloadBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Text style={styles.downloadBtnText}>הורדת דוח מלא</Text>
                  <Ionicons name="download-outline" size={16} color={ui.primary} />
                </Pressable>
              </View>
            </View>
          </View>

          <Text style={styles.footer}>© {new Date().getFullYear()} EventFlow Systems. כל הזכויות שמורות.</Text>
        </View>
      </ScrollView>

      {/* EDIT MODAL */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>עריכת פרופיל</Text>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} bounces={false}>
                <View style={styles.avatarEditRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="בחירת תמונת פרופיל"
                    disabled={avatarUploading}
                    onPress={() => void pickAndUploadAvatar()}
                    style={({ hovered, pressed }: any) => [
                      styles.avatarEditBtn,
                      Platform.OS === 'web' && hovered ? styles.avatarEditBtnHover : null,
                      pressed ? { opacity: 0.92 } : null,
                      avatarUploading ? { opacity: 0.75 } : null,
                    ]}
                  >
                    <Image source={{ uri: avatarUri }} style={styles.avatarEditImg} contentFit="cover" transition={0} />
                    <View style={styles.avatarEditBadge}>
                      {avatarUploading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Ionicons name="camera" size={16} color="#fff" />
                      )}
                    </View>
                  </Pressable>

                  <View style={styles.avatarEditMeta}>
                    <Text style={styles.avatarEditLabel}>תמונת פרופיל</Text>
                    <Text style={styles.avatarEditHint} numberOfLines={2}>
                      לחץ על התמונה כדי לבחור תמונה חדשה
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="בחר תמונה"
                      disabled={avatarUploading}
                      onPress={() => void pickAndUploadAvatar()}
                      style={({ hovered, pressed }: any) => [
                        styles.avatarEditActionBtn,
                        Platform.OS === 'web' && hovered ? styles.avatarEditActionBtnHover : null,
                        pressed ? { opacity: 0.92 } : null,
                        avatarUploading ? { opacity: 0.75 } : null,
                      ]}
                    >
                      <Text style={styles.avatarEditActionText}>{avatarUploading ? 'מעלה...' : 'בחר תמונה'}</Text>
                    </Pressable>
                  </View>
                </View>

                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                  placeholder="שם מלא"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  textAlign="right"
                />
                <TextInput
                  style={styles.input}
                  value={form.email}
                  onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
                  placeholder="אימייל"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  // @ts-ignore - react-native-web supports direction
                  dir="ltr"
                  textAlign="left"
                />
                <TextInput
                  style={styles.input}
                  value={form.password}
                  onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
                  placeholder="סיסמה חדשה (לא חובה)"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  secureTextEntry
                  textAlign="right"
                />
                <TextInput
                  style={styles.input}
                  value={form.confirmPassword}
                  onChangeText={(t) => setForm((f) => ({ ...f, confirmPassword: t }))}
                  placeholder="אישור סיסמה"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  secureTextEntry
                  textAlign="right"
                />
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setEditOpen(false)}
                  style={({ hovered, pressed }: any) => [
                    styles.modalBtn,
                    styles.modalBtnGhost,
                    Platform.OS === 'web' && hovered ? styles.modalBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Text style={[styles.modalBtnText, { color: ui.muted }]}>ביטול</Text>
                </Pressable>

                <Pressable
                  onPress={handleSave}
                  disabled={formSaving}
                  style={({ hovered, pressed }: any) => [
                    styles.modalBtn,
                    styles.modalBtnPrimary,
                    Platform.OS === 'web' && hovered ? styles.modalBtnPrimaryHover : null,
                    pressed ? { opacity: 0.92 } : null,
                    formSaving ? { opacity: 0.85 } : null,
                  ]}
                >
                  {formSaving ? <ActivityIndicator color="white" /> : <Text style={[styles.modalBtnText, { color: 'white' }]}>שמור</Text>}
                </Pressable>
      </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.bgLight },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 18, paddingHorizontal: 18, paddingBottom: 28 },
  container: { width: '100%', maxWidth: 1120, alignSelf: 'center', gap: 18 },

  card: {
    backgroundColor: ui.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 18,
    shadowColor: ui.primary,
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  heroCard: {
    backgroundColor: ui.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl', textAlign: 'right' } as any) : null),
    shadowColor: ui.primary,
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  heroTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  heroDecor1: {
    position: 'absolute',
    top: -90,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.10)',
    filter: 'blur(55px)',
  },
  heroDecor2: {
    position: 'absolute',
    bottom: -110,
    left: -110,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(11,27,61,0.06)',
    filter: 'blur(55px)',
  },
  heroMainRow: {
    // row-reverse = visual right-to-left: avatar (right) → text (middle) → actions (left)
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  heroMainRowStack: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },

  heroActionsCol: { width: 180, gap: 10, alignItems: 'stretch', justifyContent: 'center' },
  heroActionsColStack: { width: '100%' },

  heroInfoCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl', textAlign: 'right' } as any) : null),
  },

  heroIdentityGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 18,
  },
  heroIdentityGroupStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 12,
  },

  heroAvatarCol: { width: 132, alignItems: 'flex-end', justifyContent: 'center' },
  heroAvatarColStack: { width: '100%', alignItems: 'flex-end' },
  heroAvatarBlock: { position: 'relative' },
  heroAvatarRing: {
    width: 112,
    height: 112,
    borderRadius: 999,
    padding: 4,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: ui.border,
    shadowColor: 'rgba(2,6,23,0.25)',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  heroAvatar: { width: '100%', height: '100%', borderRadius: 999 },
  heroStatusDot: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: ui.success,
    borderWidth: 3,
    borderColor: '#fff',
  },
  heroInfo: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 8 },
  heroTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    flexWrap: 'wrap',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ textAlign: 'right' } as any) : null),
  },
  heroName: { fontSize: 28, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  rolePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(212,175,55,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
  },
  rolePillText: { fontSize: 13, fontWeight: '900', color: 'rgba(161,98,7,0.98)', textAlign: 'right' },
  heroDesc: { fontSize: 15, fontWeight: '600', color: ui.muted, textAlign: 'right', lineHeight: 24 },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingTop: 4, justifyContent: 'flex-start' },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,0.95)', textAlign: 'right' },
  metaTextLtr: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(100,116,139,0.95)',
    // @ts-ignore - web
    direction: 'ltr',
    textAlign: 'left',
    maxWidth: 260,
  },
  heroActions: { flexDirection: 'column', gap: 10, alignSelf: 'flex-start', alignItems: 'flex-start' },
  heroActionsNarrow: { alignSelf: 'flex-start', alignItems: 'stretch', width: '100%' },
  primaryBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: ui.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: ui.primary,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  primaryBtnHover: { backgroundColor: ui.primaryLight },
  primaryBtnText: { fontSize: 13, fontWeight: '900', color: '#fff', textAlign: 'right' },
  secondaryBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  secondaryBtnHover: { borderColor: 'rgba(15,23,42,0.16)', backgroundColor: 'rgba(248,250,252,1)' },
  secondaryBtnText: { fontSize: 13, fontWeight: '900', color: ui.primary, textAlign: 'right' },

  statsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  statCard: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    backgroundColor: ui.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 16,
    shadowColor: ui.primary,
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  statCardHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
  statIconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(22,163,74,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.18)',
  },
  statBadgeText: { fontSize: 12, fontWeight: '900', color: ui.success, textAlign: 'right' },
  statTitle: { marginTop: 10, fontSize: 13, fontWeight: '800', color: ui.muted, textAlign: 'right' },
  statValue: { marginTop: 6, fontSize: 28, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  statSub: { marginTop: 6, fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,0.95)', textAlign: 'right' },

  statCardDark: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    borderRadius: 24,
    padding: 16,
    backgroundColor: ui.primary,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: ui.primary,
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  statDarkBgDecor1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    filter: 'blur(30px)',
  },
  statDarkBgDecor2: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.22)',
    filter: 'blur(30px)',
  },
  statTitleDark: { marginTop: 12, fontSize: 13, fontWeight: '800', color: 'rgba(203,213,225,0.90)', textAlign: 'right' },
  statValueDark: { marginTop: 8, fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'right' },
  statSubDark: { marginTop: 6, fontSize: 12, fontWeight: '700', color: 'rgba(203,213,225,0.85)', textAlign: 'right' },

  analyticsRow: { flexDirection: 'row-reverse', gap: 14, alignItems: 'stretch' },
  analyticsMain: { flex: 2, minWidth: 0 },
  analyticsSide: { flex: 1, minWidth: 300 },

  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  // Push the bottom cards lower on the page (as requested)
  bottomCardLower: { marginTop: 28 },
  cardSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: ui.muted, textAlign: 'right' },

  yearControls: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 0 },
  yearBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  yearPill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: ui.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  yearPillText: { fontSize: 12, fontWeight: '900', color: ui.text },
  pillDot: { width: 4, height: 4, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.30)' },

  loadingBox: { height: 240, alignItems: 'center', justifyContent: 'center' },
  barsWrap: { height: 260, flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, paddingTop: 10 },
  barCol: { flex: 1, minWidth: 42, alignItems: 'center', gap: 10 },
  barColHover: {},
  barTrack: {
    width: '100%',
    maxWidth: 56,
    height: 200,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: ui.border,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  barTrackHover: { borderColor: 'rgba(59,130,246,0.22)', backgroundColor: 'rgba(59,130,246,0.05)' },
  barBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,27,61,0.03)' },
  barFill: { width: '100%', borderRadius: 14 },
  barFillHot: {
    shadowColor: ui.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  barTooltip: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    alignItems: 'center',
    opacity: 0,
    pointerEvents: 'none',
  },
  barTooltipText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    backgroundColor: ui.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  barLabel: { fontSize: 12, fontWeight: '800', color: ui.muted },
  barLabelHot: { color: ui.primary },

  sideCardPrimary: {
    flex: 1,
    borderRadius: 24,
    padding: 18,
    backgroundColor: ui.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    shadowColor: ui.primary,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  sideDecor1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    filter: 'blur(40px)',
  },
  sideDecor2: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.26)',
    filter: 'blur(45px)',
  },
  sideTitle: { fontSize: 18, fontWeight: '900', color: '#fff', textAlign: 'right' },
  sideRows: { marginTop: 16, gap: 12 },
  sideRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sideKpiLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(203,213,225,0.85)', textAlign: 'right' },
  sideKpiValue: { marginTop: 4, fontSize: 18, fontWeight: '900', color: '#fff', textAlign: 'right' },
  sideKpiIcon: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  sideDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  downloadBtn: {
    marginTop: 18,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#fff',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: 'rgba(2,6,23,0.35)',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  downloadBtnHover: { backgroundColor: 'rgba(248,250,252,1)' },
  downloadBtnText: { fontSize: 13, fontWeight: '900', color: ui.primary, textAlign: 'right' },

  bottomRow: { flexDirection: 'row-reverse', gap: 14, alignItems: 'stretch', marginTop: 18 },
  bottomCol: { flex: 1, minWidth: 320 },

  linkBtn: { fontSize: 13, fontWeight: '900', color: ui.accentDark, textAlign: 'right' },

  timeline: { marginTop: 6, position: 'relative', paddingRight: 6 },
  timelineLine: { position: 'absolute', top: 8, bottom: 10, right: 24, width: 2, backgroundColor: 'rgba(15,23,42,0.06)' },
  timelineItem: { flexDirection: 'row-reverse', gap: 14, paddingBottom: 18, alignItems: 'flex-start' },
  timelineIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: ui.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineBody: { flex: 1, minWidth: 0, paddingTop: 4 },
  timelineTitleRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  timelineTitle: { fontSize: 13, fontWeight: '900', color: ui.text, textAlign: 'right' },
  timelineTime: { fontSize: 11, fontWeight: '800', color: 'rgba(100,116,139,0.95)' },
  timelineText: { marginTop: 6, fontSize: 13, fontWeight: '700', color: ui.muted, textAlign: 'right', lineHeight: 20 },
  emptyTimeline: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 10, paddingVertical: 10 },
  emptyTimelineText: { fontSize: 13, fontWeight: '800', color: ui.muted, textAlign: 'right' },

  footer: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,0.85)', textAlign: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.40)', padding: 16, justifyContent: 'center' },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  avatarEditRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingBottom: 2 },
  avatarEditBtn: {
    width: 74,
    height: 74,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  avatarEditBtnHover: { borderColor: 'rgba(59,130,246,0.28)' },
  avatarEditImg: { width: '100%', height: '100%' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  avatarEditMeta: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 6 },
  avatarEditLabel: { fontSize: 13, fontWeight: '900', color: ui.text, textAlign: 'right' },
  avatarEditHint: { fontSize: 12, fontWeight: '700', color: ui.muted, textAlign: 'right', lineHeight: 18 },
  avatarEditActionBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  avatarEditActionBtnHover: { backgroundColor: 'rgba(15,23,42,0.07)' },
  avatarEditActionText: { fontSize: 12, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  input: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: 'rgba(244, 247, 251, 0.9)',
    color: ui.text,
    fontSize: 15,
    fontWeight: '700',
  },
  modalActions: { flexDirection: 'row-reverse', gap: 10 },
  modalBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalBtnGhost: { backgroundColor: 'rgba(15,23,42,0.05)', borderWidth: 1, borderColor: ui.border },
  modalBtnHover: { backgroundColor: 'rgba(15,23,42,0.07)' },
  modalBtnPrimary: { backgroundColor: ui.primary },
  modalBtnPrimaryHover: { backgroundColor: ui.primaryLight },
  modalBtnText: { fontSize: 14, fontWeight: '900' },
});

