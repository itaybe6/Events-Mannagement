import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/constants/colors';
import { useAdminEventDetailsModel } from '@/features/events/useAdminEventDetailsModel';
import { eventService } from '@/lib/services/eventService';
import { supabase } from '@/lib/supabase';

const HERO_IMAGES = {
  baby: require('../../assets/images/baby.jpg'),
  barMitzvah: require('../../assets/images/Bar Mitzvah.jpg'),
  wedding: require('../../assets/images/wedding.jpg'),
} as const;

function getHeroImageSource(title: string) {
  const t = String(title || '').toLowerCase();
  const hasBarMitzvah = t.includes('בר מצו') || t.includes('בר-מצו') || t.includes('bar mitz');
  const hasBaby =
    t.includes('ברית') ||
    t.includes('בריתה') ||
    t.includes('תינוק') ||
    t.includes('תינוקת') ||
    t.includes('baby') ||
    t.includes('בייבי');
  if (hasBarMitzvah) return HERO_IMAGES.barMitzvah;
  if (hasBaby) return HERO_IMAGES.baby;
  return HERO_IMAGES.wedding;
}

function getEventTypeLabel(rawTitle: string) {
  const raw = String(rawTitle ?? '').trim();
  if (!raw) return 'אירוע';
  const parts = raw.split(/(?:\s*[–—-]\s*)/g).map((p) => p.trim()).filter(Boolean);
  return parts[0] || raw;
}

function getEventStatusMeta(date: Date | string | null | undefined) {
  const today = new Date();
  const d = date ? new Date(date) : new Date('invalid');
  if (!Number.isFinite(d.getTime())) return { label: 'טיוטה', tone: 'draft' as const };
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: 'הסתיים', tone: 'past' as const };
  if (diff <= 7) return { label: 'אירוע פעיל', tone: 'active' as const };
  return { label: 'בתכנון', tone: 'planning' as const };
}

export default function AdminEventDetailsWebScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const eventId = useMemo(() => (typeof id === 'string' ? id : Array.isArray(id) ? id[0] : ''), [id]);

  const { loading, error, event, setEvent, guests, userName, userAvatarUrl, stats, refresh } =
    useAdminEventDetailsModel(eventId);

  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editDatePickerOpen, setEditDatePickerOpen] = useState(false);
  const [webCalendarOpen, setWebCalendarOpen] = useState(false);
  const [webCalendarMonth, setWebCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [editForm, setEditForm] = useState({
    date: new Date(),
    location: '',
    city: '',
    groomName: '',
    brideName: '',
  });

  const eventType = getEventTypeLabel(String(event?.title ?? ''));
  const isWedding = eventType === 'חתונה' || String(event?.title ?? '').includes('חתונה');
  // On web we render inside the admin sidebar layout (sticky 270px sidebar).
  // Use "content width" so breakpoints reflect available space, not full viewport.
  const sidebarWidth = Platform.OS === 'web' ? 270 : 0;
  const contentWidth = Math.max(0, width - sidebarWidth);
  const isNarrow = contentWidth < 1024;
  const maxContentWidth = contentWidth >= 1900 ? 1600 : contentWidth >= 1600 ? 1480 : 1280;
  const useWideEditLayout = contentWidth >= 1180;
  const seatedPeople = useMemo(
    () =>
      guests
        .filter((g) => Boolean(g.tableId))
        .reduce((sum, g) => sum + (Number((g as any).numberOfPeople) || 1), 0),
    [guests]
  );
  const totalPeople = useMemo(
    () => guests.reduce((sum, g) => sum + (Number((g as any).numberOfPeople) || 1), 0),
    [guests]
  );

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const toISODate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const monthTitle = useMemo(() => {
    try {
      return webCalendarMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    } catch {
      return `${webCalendarMonth.getMonth() + 1}/${webCalendarMonth.getFullYear()}`;
    }
  }, [webCalendarMonth]);

  const calendarDays = useMemo(() => {
    // Week starts Sunday (Israel). Build 6 weeks grid (42 days).
    const firstOfMonth = new Date(webCalendarMonth.getFullYear(), webCalendarMonth.getMonth(), 1);
    const startOffset = firstOfMonth.getDay(); // 0..6 (Sun..Sat)
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [webCalendarMonth]);

  const openEditDatePicker = () => {
    if (Platform.OS === 'web') {
      const base = editForm.date ? editForm.date : new Date();
      setWebCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
      setWebCalendarOpen(true);
      return;
    }
    setEditDatePickerOpen(true);
  };

  const openEditEvent = () => {
    if (!event) return;
    const nextDate = event?.date ? new Date(event.date) : new Date();
    setEditForm({
      date: Number.isFinite(nextDate.getTime()) ? nextDate : new Date(),
      location: String(event.location ?? ''),
      city: String(event.city ?? ''),
      groomName: String((event as any).groomName ?? ''),
      brideName: String((event as any).brideName ?? ''),
    });
    setEditOpen(true);
  };

  const saveEditEvent = async () => {
    if (!event?.id) return;

    const nextLocation = (editForm.location || '').trim();
    if (!nextLocation) return;

    if (isWedding) {
      const g = (editForm.groomName || '').trim();
      const b = (editForm.brideName || '').trim();
      if (!g || !b) return;
    }

    setEditSaving(true);
    try {
      const updates: any = {
        date: editForm.date,
        location: nextLocation,
        city: (editForm.city || '').trim(),
      };
      if (isWedding) {
        updates.groomName = (editForm.groomName || '').trim();
        updates.brideName = (editForm.brideName || '').trim();
      }

      const updated = await eventService.updateEvent(event.id, updates);
      setEvent(updated);
      setEditOpen(false);
    } finally {
      setEditSaving(false);
    }
  };

  const performDeleteEvent = async () => {
    if (!event?.id) return;
    if (deleteSaving) return;

    setDeleteSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('delete-event', {
        body: { eventId: event.id },
      });
      if (fnError) throw fnError;
      if (data?.ok !== true) throw new Error(String(data?.error ?? 'Failed to delete event'));

      setDeleteConfirmOpen(false);
      setEditOpen(false);
      Alert.alert('נמחק', 'האירוע נמחק בהצלחה');
      router.replace('/(admin)/admin-events');
      return;
    } catch (e) {
      // Fallback: client-side delete (DB uses ON DELETE CASCADE for most tables).
      try {
        await supabase.from('notifications').delete().eq('event_id', event.id);
      } catch {}
      try {
        await eventService.deleteEvent(event.id);
        setDeleteConfirmOpen(false);
        setEditOpen(false);
        Alert.alert('נמחק', 'האירוע נמחק בהצלחה');
        router.replace('/(admin)/admin-events');
        return;
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.error('Delete event error:', e2);
        Alert.alert('שגיאה', 'לא ניתן למחוק את האירוע כרגע');
      }
    } finally {
      setDeleteSaving(false);
    }
  };

  const confirmDeleteEvent = () => {
    if (!event?.id) return;
    setDeleteConfirmOpen(true);
  };

  const handleTablesList = () => {
    if (!event?.id) return;
    router.push({
      pathname: '/(admin)/TablesList',
      params: { eventId: event.id },
    });
  };

  const handleEditSketch = () => {
    if (!event?.id) return;
    router.push({
      pathname: '/(admin)/seating-map' as any,
      params: { eventId: event.id },
    });
  };

  // Ensure seating map exists, then navigate to seating map editor/view
  const handleSeatingMap = async () => {
    if (!event?.id) return;
    try {
      const { data, error } = await supabase.from('seating_maps').select('*').eq('event_id', event.id).single();

      // When there is no existing row, Supabase returns an error for .single().
      // In that case (or if data is empty), create a new empty seating map.
      if (!data) {
        const { error: insertError } = await supabase.from('seating_maps').insert({
          event_id: event.id,
          num_tables: 0,
          tables: [],
          annotations: [],
        });
        if (insertError) throw insertError;
      } else if (error && (error as any).code !== 'PGRST116') {
        // Non "no rows" error; still allow navigation but surface message.
        // eslint-disable-next-line no-console
        console.warn('Failed to verify seating map row:', error);
      }
    } catch (e: any) {
      Alert.alert('שגיאה', 'לא הצלחנו לפתוח/ליצור מפת הושבה. נסה שוב.');
    }

    // IMPORTANT: Keep admin layout by staying inside /(admin) group
    router.push(`/(admin)/BrideGroomSeating?eventId=${event.id}`);
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
        <Text style={styles.errorTitle}>{error || 'האירוע לא נמצא'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חזרה לרשימת אירועים"
          onPress={() => router.replace('/(admin)/admin-events')}
          style={({ hovered, pressed }: any) => [
            styles.primaryBtn,
            Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
            pressed ? { opacity: 0.92 } : null,
          ]}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
          <Text style={styles.primaryBtnText}>חזרה לרשימת אירועים</Text>
        </Pressable>
      </View>
    );
  }

  const dateObj = new Date(event.date);
  const dateLabel = Number.isFinite(dateObj.getTime())
    ? dateObj.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  const status = getEventStatusMeta(event.date);
  const workflowSteps = [
    {
      key: 'sketch',
      step: 'שלב 1',
      title: 'עריכת סקיצה',
      subtitle: 'מתחילים מבניית הסקיצה ומפת ההושבה של האירוע.',
      meta: 'התחלה מומלצת',
      icon: 'create-outline' as const,
      accent: '#F97316',
      tint: 'rgba(249,115,22,0.14)',
      featured: true,
      onPress: handleEditSketch,
    },
    {
      key: 'invite-link',
      step: 'שלב 2',
      title: 'לינק להזמנה',
      subtitle: 'פתיחת הקישור האישי, בדיקה והכנה לשיתוף.',
      meta: 'שיתוף והפצה',
      icon: 'link-outline' as const,
      accent: '#8B5CF6',
      tint: 'rgba(139,92,246,0.14)',
      onPress: () => router.push(`/(admin)/admin-invitation-links?eventId=${event.id}`),
    },
    {
      key: 'messages',
      step: 'שלב 3',
      title: 'עריכת הודעות',
      subtitle: 'התאמת נוסחים, תזכורות והודעות לפי סוג האירוע.',
      meta: 'תוכן אוטומטי',
      icon: 'chatbubble-ellipses-outline' as const,
      accent: '#0EA5E9',
      tint: 'rgba(14,165,233,0.14)',
      onPress: () => router.push(`/(admin)/admin-event-messages?eventId=${event.id}`),
    },
    {
      key: 'tables',
      step: 'שלב 4',
      title: 'רשימת שולחנות',
      subtitle: 'ניהול טבלאות, חלוקה וניקוי מבנה הישיבה.',
      meta: 'ניהול שולחנות',
      icon: 'list-outline' as const,
      accent: '#10B981',
      tint: 'rgba(16,185,129,0.16)',
      onPress: handleTablesList,
    },
    {
      key: 'rsvp',
      step: 'שלב 5',
      title: 'אישורי הגעה',
      subtitle: 'מעקב אחרי מוזמנים, סטטוסים ומי כבר אישר הגעה.',
      meta: `${stats.confirmedPeople} מאושרים`,
      icon: 'people-outline' as const,
      accent: '#3B82F6',
      tint: 'rgba(59,130,246,0.14)',
      onPress: () => router.push(`/(admin)/admin-rsvp-approvals?eventId=${event.id}`),
    },
    {
      key: 'checkin',
      step: 'שלב 6',
      title: 'צ׳ק אין אורחים',
      subtitle: 'ניהול הגעות בפועל ביום האירוע וסימון אורחים שהגיעו.',
      meta: `${stats.confirmedPeople} צפויים להגיע`,
      icon: 'checkbox-outline' as const,
      accent: '#22C55E',
      tint: 'rgba(34,197,94,0.16)',
      onPress: () => router.push(`/(admin)/admin-guest-checkin?eventId=${event.id}`),
    },
  ] as const;

  return (
    <View style={styles.page}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.container, { maxWidth: maxContentWidth }]}>
          <View style={styles.main}>
              <View style={[styles.topOverviewRow, isNarrow ? styles.topOverviewRowNarrow : null]}>
                <View style={[styles.heroCard, styles.heroCardTop, isNarrow ? styles.heroCardTopNarrow : null]}>
                  <Image source={getHeroImageSource(String(event.title ?? ''))} style={styles.heroImg} contentFit="cover" />
                  <LinearGradient
                    colors={['rgba(6,23,62,0.92)', 'rgba(6,23,62,0.35)', 'rgba(6,23,62,0)']}
                    start={{ x: 0.5, y: 1 }}
                    end={{ x: 0.5, y: 0 }}
                    style={styles.heroGradient}
                  />

                  <View style={styles.heroBottom}>
                    <View style={styles.heroTopRow}>
                      <View
                        style={[
                          styles.statusPill,
                          status.tone === 'active'
                            ? styles.statusPillActive
                            : status.tone === 'planning'
                              ? styles.statusPillPlanning
                              : status.tone === 'past'
                                ? styles.statusPillPast
                                : styles.statusPillDraft,
                        ]}
                      >
                        {status.tone === 'active' ? <View style={styles.statusDot} /> : null}
                        <Text style={styles.statusPillText}>{status.label}</Text>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="עריכת אירוע"
                        onPress={openEditEvent}
                        style={({ hovered, pressed }: any) => [
                          styles.heroEditBtn,
                          Platform.OS === 'web' && hovered ? styles.heroEditBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name="create-outline" size={16} color={colors.white} />
                        <Text style={styles.heroEditBtnText}>עריכת אירוע</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.heroTitle} numberOfLines={2}>
                      {String(event.title ?? '')}
                    </Text>

                    <View style={styles.heroMetaCol}>
                      <View style={styles.heroMetaRow}>
                        <Ionicons name="calendar-outline" size={16} color={'rgba(255,255,255,0.86)'} />
                        <Text style={styles.heroMetaText}>{dateLabel}</Text>
                      </View>
                      <View style={styles.heroMetaRow}>
                        <Ionicons name="location-outline" size={16} color={'rgba(255,255,255,0.86)'} />
                        <Text style={styles.heroMetaText}>
                          {String(event.location ?? '')}
                          {event.city ? `, ${event.city}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.heroOwner}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="הגדלת תמונת פרופיל"
                      onPress={() => setAvatarPreviewOpen(true)}
                      style={({ hovered, pressed }: any) => [
                        styles.avatarRing,
                        Platform.OS === 'web' && hovered ? { opacity: 0.96 } : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      {userAvatarUrl ? (
                        <Image source={{ uri: userAvatarUrl }} style={styles.avatarImg} contentFit="cover" transition={0} />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Ionicons name="person" size={18} color={'rgba(13,17,28,0.65)'} />
                        </View>
                      )}
                    </Pressable>
                  </View>
                </View>

              <View style={styles.workflowPanel}>
                <View style={styles.workflowHeader}>
                  <View style={styles.workflowHeaderText}>
                    <Text style={styles.workflowEyebrow}>תהליך עבודה מומלץ</Text>
                    <Text style={styles.workflowTitle}>שלבי הניהול של האירוע</Text>
                    <Text style={styles.workflowSubtitle}>
                      בכל אירוע חדש מומלץ לעבוד לפי הסדר הזה כדי לבנות את האירוע נכון ולחסוך חזרה בין מסכים.
                    </Text>
                  </View>
                  <View style={styles.workflowHeaderBadge}>
                    <Text style={styles.workflowHeaderBadgeText}>6 שלבים</Text>
                  </View>
                </View>

                <View style={[styles.workflowGrid, !isNarrow ? styles.workflowGridWide : null]}>
                  {workflowSteps.map((step) => (
                    <Pressable
                      key={step.key}
                      accessibilityRole="button"
                      accessibilityLabel={step.title}
                      onPress={step.onPress}
                      style={({ hovered, pressed }: any) => [
                        styles.workflowCard,
                        step.featured ? styles.workflowCardFeatured : null,
                        Platform.OS === 'web' && hovered ? (step.featured ? styles.workflowCardFeaturedHover : styles.workflowCardHover) : null,
                        pressed ? { opacity: 0.95 } : null,
                      ]}
                    >
                      <View style={styles.workflowCardTop}>
                        <View style={[styles.workflowStepBadge, step.featured ? styles.workflowStepBadgeFeatured : null]}>
                          <Text style={[styles.workflowStepBadgeText, step.featured ? styles.workflowStepBadgeTextFeatured : null]}>
                            {step.step}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.workflowIconWrap,
                            { backgroundColor: step.featured ? 'rgba(255,255,255,0.14)' : step.tint },
                          ]}
                        >
                          <Ionicons
                            name={step.icon}
                            size={18}
                            color={step.featured ? colors.white : (step.accent as any)}
                          />
                        </View>
                      </View>

                      <View style={styles.workflowTextWrap}>
                        <Text style={[styles.workflowCardTitle, step.featured ? styles.workflowCardTitleFeatured : null]}>
                          {step.title}
                        </Text>
                        <Text
                          style={[styles.workflowCardSubtitle, step.featured ? styles.workflowCardSubtitleFeatured : null]}
                          numberOfLines={2}
                        >
                          {step.subtitle}
                        </Text>
                      </View>

                      <View style={styles.workflowCardFooter}>
                        <Text style={[styles.workflowMetaText, step.featured ? styles.workflowMetaTextFeatured : null]}>
                          {step.meta}
                        </Text>
                        <Ionicons
                          name="arrow-back"
                          size={16}
                          color={step.featured ? 'rgba(255,255,255,0.9)' : colors.gray[500]}
                        />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
              </View>

              <View style={[styles.statsGrid, !isNarrow ? styles.statsGridWide : null]}>
                <View style={[styles.statCard, !isNarrow ? styles.statCardQuarter : null, { borderBottomColor: '#10B981' }]}>
                  <View style={styles.statCardTop}>
                    <Text style={styles.statLabel}>מאושרים</Text>
                    <View style={[styles.statIconCircle, { backgroundColor: 'rgba(16,185,129,0.16)' }]}>
                      <Ionicons name="checkmark-circle-outline" size={18} color={'#10B981'} />
                    </View>
                  </View>
                  <View style={styles.statCardBottom}>
                    <Text style={styles.statValue}>{stats.confirmedPeople}</Text>
                  </View>
                </View>

                <View style={[styles.statCard, !isNarrow ? styles.statCardQuarter : null, { borderBottomColor: '#3B82F6' }]}>
                  <View style={styles.statCardTop}>
                    <Text style={styles.statLabel}>מוזמנים</Text>
                    <View style={[styles.statIconCircle, { backgroundColor: 'rgba(59,130,246,0.16)' }]}>
                      <Ionicons name="mail-outline" size={18} color={'#3B82F6'} />
                    </View>
                  </View>
                  <View style={styles.statCardBottom}>
                    <Text style={styles.statValue}>{stats.invitedPeople}</Text>
                  </View>
                </View>

                <View style={[styles.statCard, !isNarrow ? styles.statCardQuarter : null, { borderBottomColor: '#F59E0B' }]}>
                  <View style={styles.statCardTop}>
                    <Text style={styles.statLabel}>ממתינים</Text>
                    <View style={[styles.statIconCircle, { backgroundColor: 'rgba(245,158,11,0.16)' }]}>
                      <Ionicons name="hourglass-outline" size={18} color={'#F59E0B'} />
                    </View>
                  </View>
                  <View style={styles.statCardBottom}>
                    <Text style={styles.statValue}>{stats.pendingPeople}</Text>
                  </View>
                </View>

                <View style={[styles.statCard, !isNarrow ? styles.statCardQuarter : null, { borderBottomColor: '#EF4444' }]}>
                  <View style={styles.statCardTop}>
                    <Text style={styles.statLabel}>לא מגיעים</Text>
                    <View style={[styles.statIconCircle, { backgroundColor: 'rgba(239,68,68,0.16)' }]}>
                      <Ionicons name="close-circle-outline" size={18} color={'#EF4444'} />
                    </View>
                  </View>
                  <View style={styles.statCardBottom}>
                    <Text style={styles.statValue}>{stats.declinedPeople}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>סיכום הושבה</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="פרטים נוספים"
                    onPress={handleTablesList}
                  >
                    <Text style={styles.panelLink}>פרטים נוספים</Text>
                  </Pressable>
                </View>

                <View style={styles.progressCard}>
                  <View style={styles.progressHeader}>
                    <View style={styles.progressHeaderRight}>
                      <Text style={styles.progressLabel}>התקדמות הושבה</Text>
                      <Text style={styles.progressValue}>
                        {stats.seatedPercent}% <Text style={styles.progressValueSub}>הושבו</Text>
                      </Text>
                    </View>
                    <View style={styles.progressChip}>
                      <Text style={styles.progressChipText}>
                        {seatedPeople} / {Math.max(stats.confirmedPeople, totalPeople)} אורחים
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, stats.seatedPercent))}%` }]} />
                  <View style={styles.progressKnob} />
                  </View>
                </View>

                <View style={styles.compactCardsRow}>
                  <View style={styles.compactCard}>
                    <Text style={styles.compactNumber}>{Math.max(0, Math.round(stats.seated / 10))}</Text>
                    <Text style={styles.compactLabel}>שולחנות מלאים</Text>
                  </View>
                  <View style={styles.compactCard}>
                    <Text style={styles.compactNumber}>{Math.max(0, Math.round((stats.totalGuests - stats.seated) / 10))}</Text>
                    <Text style={styles.compactLabel}>שולחנות פנויים</Text>
                  </View>
                  <View style={styles.compactCard}>
                    <Text style={styles.compactNumber}>{Math.max(0, totalPeople - seatedPeople)}</Text>
                    <Text style={styles.compactLabel}>כיסאות פנויים</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.footer}>© 2026 כל הזכויות שמורות למערכת אירועים</Text>
            </View>
        </View>
      </ScrollView>

      {/* Avatar preview */}
      <Modal transparent visible={avatarPreviewOpen} animationType="fade" onRequestClose={() => setAvatarPreviewOpen(false)}>
        <Pressable style={styles.previewOverlay} onPress={() => setAvatarPreviewOpen(false)}>
          <Pressable onPress={() => null} style={styles.previewContent}>
            {userAvatarUrl ? (
              <Image
                source={{ uri: userAvatarUrl }}
                style={styles.previewImg}
                contentFit="contain"
                transition={0}
              />
            ) : (
              <View style={styles.previewFallback}>
                <Ionicons name="person" size={34} color={'rgba(255,255,255,0.78)'} />
                <Text style={styles.previewFallbackText}>אין תמונה להצגה</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit modal */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.editOverlay} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.editCard} onPress={() => null}>
            <View style={styles.editHeader}>
              <View style={styles.editHeaderContent}>
                <View style={styles.editHeaderBadge}>
                  <Ionicons name="create-outline" size={18} color="#1d4ed8" />
                </View>
                <View style={styles.editHeaderTextWrap}>
                  <Text style={styles.editTitle}>עריכת אירוע</Text>
                  <Text style={styles.editSubtitle} numberOfLines={1}>
                    {eventType}
                  </Text>
                  <Text style={styles.editHeaderHint}>עדכנו כאן את פרטי האירוע כפי שיוצגו בכל המערכת.</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={() => setEditOpen(false)}
                style={({ hovered, pressed }: any) => [
                  styles.iconCircle,
                  Platform.OS === 'web' && hovered ? styles.iconCircleHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Ionicons name="close" size={18} color={'rgba(17,24,39,0.70)'} />
              </Pressable>
            </View>

            <View style={styles.editDivider} />

            <ScrollView contentContainerStyle={styles.editBody} showsVerticalScrollIndicator={false}>
              <View style={styles.editSectionCard}>
                <View style={styles.editSectionHeader}>
                  <Text style={styles.editSectionTitle}>פרטי האירוע</Text>
                  <Text style={styles.editSectionHint}>אפשר לעדכן תאריך, מיקום ועיר לפני השמירה.</Text>
                </View>

                <View style={[styles.editFieldsRow, useWideEditLayout ? styles.editFieldsRowDesktop : null]}>
                  <View style={[styles.editFieldGroup, useWideEditLayout ? styles.editFieldHalf : null]}>
                    <Text style={styles.editLabel}>תאריך האירוע</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="בחירת תאריך"
                      onPress={openEditDatePicker}
                      style={({ hovered, pressed }: any) => [
                        styles.inputLike,
                        Platform.OS === 'web' && hovered ? styles.inputLikeHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <Ionicons name="calendar-outline" size={18} color={'rgba(17,24,39,0.55)'} />
                      <Text style={styles.inputLikeText}>
                        {Number.isFinite(editForm.date.getTime())
                          ? editForm.date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          : ''}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={[styles.editFieldGroup, useWideEditLayout ? styles.editFieldHalf : null]}>
                    <Text style={styles.editLabel}>מיקום</Text>
                    <TextInput
                      value={editForm.location}
                      onChangeText={(t) => setEditForm((f) => ({ ...f, location: t }))}
                      placeholder="מיקום"
                      placeholderTextColor={'rgba(17,24,39,0.35)'}
                      style={styles.textInput}
                      textAlign="right"
                    />
                  </View>
                </View>

                <View style={styles.editFieldGroup}>
                  <Text style={styles.editLabel}>עיר</Text>
                  <TextInput
                    value={editForm.city}
                    onChangeText={(t) => setEditForm((f) => ({ ...f, city: t }))}
                    placeholder="עיר"
                    placeholderTextColor={'rgba(17,24,39,0.35)'}
                    style={styles.textInput}
                    textAlign="right"
                  />
                </View>
              </View>

              {isWedding ? (
                <View style={styles.editSectionCard}>
                  <View style={styles.editSectionHeader}>
                    <Text style={styles.editSectionTitle}>פרטי בני הזוג</Text>
                    <Text style={styles.editSectionHint}>השמות יוצגו בכותרות ובהודעות האירוע.</Text>
                  </View>

                  <View style={[styles.editFieldsRow, useWideEditLayout ? styles.editFieldsRowDesktop : null]}>
                    <View style={[styles.editFieldGroup, useWideEditLayout ? styles.editFieldHalf : null]}>
                      <Text style={styles.editLabel}>שם חתן</Text>
                      <TextInput
                        value={editForm.groomName}
                        onChangeText={(t) => setEditForm((f) => ({ ...f, groomName: t }))}
                        placeholder="שם החתן"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.textInput}
                        textAlign="right"
                      />
                    </View>

                    <View style={[styles.editFieldGroup, useWideEditLayout ? styles.editFieldHalf : null]}>
                      <Text style={styles.editLabel}>שם כלה</Text>
                      <TextInput
                        value={editForm.brideName}
                        onChangeText={(t) => setEditForm((f) => ({ ...f, brideName: t }))}
                        placeholder="שם הכלה"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.textInput}
                        textAlign="right"
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={styles.editDangerCard}>
                <View style={styles.editDangerTextWrap}>
                  <Text style={styles.editDangerTitle}>מחיקת אירוע</Text>
                  <Text style={styles.editDangerHint}>הפעולה תמחק את האירוע והמידע המשויך אליו לצמיתות.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="מחיקת אירוע"
                  onPress={confirmDeleteEvent}
                  disabled={deleteSaving || editSaving}
                  style={({ hovered, pressed }: any) => [
                    styles.footerBtnDanger,
                    Platform.OS === 'web' && hovered ? styles.footerBtnDangerHover : null,
                    pressed ? { opacity: 0.92 } : null,
                    deleteSaving ? { opacity: 0.88 } : null,
                  ]}
                >
                  {deleteSaving ? (
                    <ActivityIndicator color={colors.error} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.footerBtnDangerText}>מחק אירוע</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </ScrollView>

            <View style={styles.editFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={() => setEditOpen(false)}
                style={({ hovered, pressed }: any) => [
                  styles.footerBtnSecondary,
                  Platform.OS === 'web' && hovered ? styles.footerBtnSecondaryHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמירה"
                onPress={() => void saveEditEvent()}
                disabled={editSaving || deleteSaving}
                style={({ hovered, pressed }: any) => [
                  styles.footerBtnPrimary,
                  Platform.OS === 'web' && hovered ? styles.footerBtnPrimaryHover : null,
                  pressed ? { opacity: 0.92 } : null,
                  editSaving ? { opacity: 0.85 } : null,
                ]}
              >
                {editSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={styles.footerBtnPrimaryText}>שמור</Text>
                  </>
                )}
              </Pressable>
            </View>

            <DateTimePickerModal
              isVisible={editDatePickerOpen}
              mode="date"
              onConfirm={(d) => {
                setEditDatePickerOpen(false);
                if (d) setEditForm((f) => ({ ...f, date: d }));
              }}
              onCancel={() => setEditDatePickerOpen(false)}
              locale="he-IL"
              date={editForm.date}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete confirmation modal (styled, RTL) */}
      <Modal
        transparent
        visible={deleteConfirmOpen}
        animationType="fade"
        onRequestClose={() => setDeleteConfirmOpen(false)}
      >
        <Pressable
          style={styles.deleteOverlay}
          onPress={() => {
            if (!deleteSaving) setDeleteConfirmOpen(false);
          }}
        >
          <Pressable style={styles.deleteCard} onPress={() => null}>
            <View style={styles.deleteHeaderRow}>
              <View style={styles.deleteIconCircle}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </View>
              <View style={styles.deleteHeaderText}>
                <Text style={styles.deleteTitle}>מחיקת אירוע</Text>
                <Text style={styles.deleteSubtitle} numberOfLines={2}>
                  פעולה זו בלתי הפיכה
                </Text>
              </View>
            </View>

            <View style={styles.deleteDivider} />

            <View style={styles.deleteBody}>
              <Text style={styles.deleteBodyText}>
                אתה עומד למחוק את האירוע ואת כל הנתונים שמקושרים אליו:
              </Text>

              <View style={styles.deleteList}>
                {[
                  'מוזמנים וסטטוסים',
                  'קטגוריות מוזמנים',
                  'שולחנות ומפת הושבה',
                  'משימות והודעות',
                ].map((t) => (
                  <View key={t} style={styles.deleteListRow}>
                    <View style={styles.deleteBullet} />
                    <Text style={styles.deleteListText}>{t}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.deleteHintBox}>
                <Ionicons name="alert-circle-outline" size={16} color={'rgba(255, 59, 48, 0.9)'} />
                <Text style={styles.deleteHintText}>
                  מומלץ לוודא שזה האירוע הנכון לפני מחיקה.
                </Text>
              </View>
            </View>

            <View style={styles.deleteFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול מחיקה"
                onPress={() => setDeleteConfirmOpen(false)}
                disabled={deleteSaving}
                style={({ hovered, pressed }: any) => [
                  styles.deleteBtnSecondary,
                  Platform.OS === 'web' && hovered ? styles.deleteBtnSecondaryHover : null,
                  pressed ? { opacity: 0.92 } : null,
                  deleteSaving ? { opacity: 0.88 } : null,
                ]}
              >
                <Text style={styles.deleteBtnSecondaryText}>ביטול</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="אישור מחיקת אירוע"
                onPress={() => void performDeleteEvent()}
                disabled={deleteSaving}
                style={({ hovered, pressed }: any) => [
                  styles.deleteBtnDanger,
                  Platform.OS === 'web' && hovered ? styles.deleteBtnDangerHover : null,
                  pressed ? { opacity: 0.94 } : null,
                  deleteSaving ? { opacity: 0.88 } : null,
                ]}
              >
                {deleteSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                    <Text style={styles.deleteBtnDangerText}>מחק אירוע</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={Platform.OS === 'web' && webCalendarOpen}
        animationType="fade"
        onRequestClose={() => setWebCalendarOpen(false)}
      >
        <Pressable style={styles.editOverlay} onPress={() => setWebCalendarOpen(false)}>
          <Pressable style={styles.dateModalCard} onPress={() => null}>
            <View style={styles.dateModalHeader}>
              <View style={styles.dateHeaderSide}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חודש קודם"
                  onPress={() => setWebCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  style={({ hovered, pressed }: any) => [
                    styles.iconCircle,
                    Platform.OS === 'web' && hovered ? styles.iconCircleHover : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name="chevron-forward" size={18} color={'rgba(17,24,39,0.70)'} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חודש הבא"
                  onPress={() => setWebCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  style={({ hovered, pressed }: any) => [
                    styles.iconCircle,
                    Platform.OS === 'web' && hovered ? styles.iconCircleHover : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name="chevron-back" size={18} color={'rgba(17,24,39,0.70)'} />
                </Pressable>
              </View>

              <Text style={styles.dateModalTitle}>{monthTitle}</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={() => setWebCalendarOpen(false)}
                style={({ hovered, pressed }: any) => [
                  styles.iconCircle,
                  Platform.OS === 'web' && hovered ? styles.iconCircleHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Ionicons name="close" size={18} color={'rgba(17,24,39,0.70)'} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((d) => (
                <Text key={d} style={styles.weekDay}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((d) => {
                const day = startOfDay(d);
                const isOutside = d.getMonth() !== webCalendarMonth.getMonth();
                const selected = toISODate(day) === toISODate(startOfDay(editForm.date));
                return (
                  <Pressable
                    key={toISODate(day)}
                    accessibilityRole="button"
                    accessibilityLabel={`בחירת תאריך ${d.toLocaleDateString('he-IL')}`}
                    onPress={() => {
                      setEditForm((f) => ({ ...f, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) }));
                      setWebCalendarOpen(false);
                    }}
                    style={({ hovered, pressed }: any) => [
                      styles.dayCell,
                      isOutside ? styles.dayCellOutside : null,
                      selected ? styles.dayCellSelected : null,
                      Platform.OS === 'web' && hovered ? styles.dayCellHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={[styles.dayText, isOutside ? styles.dayTextOutside : null, selected ? styles.dayTextSelected : null]}>
                      {d.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.dateModalFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="בחירת היום"
                onPress={() => {
                  const d = new Date();
                  setWebCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  setEditForm((f) => ({ ...f, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) }));
                  setWebCalendarOpen(false);
                }}
                style={({ hovered, pressed }: any) => [
                  styles.todayBtn,
                  Platform.OS === 'web' && hovered ? styles.todayBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="today-outline" size={16} color={colors.primary} />
                <Text style={styles.todayBtnText}>היום</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f6f8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 14, fontWeight: '800', color: colors.gray[600] },
  errorTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },

  scroll: { flex: 1 },
  // Extra bottom padding so the floating tab-bar won't cover content
  scrollContent: { paddingTop: 18, paddingBottom: Platform.OS === 'web' ? 40 : 130 },
  // On web we want the content to hug the right sidebar (RTL) instead of being centered,
  // while still keeping a max width on large displays.
  container: { width: '100%', alignSelf: 'flex-start', paddingHorizontal: 20 },
  grid: {
    // IMPORTANT: In React Native RTL, `row` lays out children right-to-left.
    // Side (first child) should sit next to the right sidebar menu.
    flexDirection: 'row',
    gap: 18,
    alignItems: 'stretch',
  },
  // On narrow screens show the side section first (top).
  gridNarrow: { flexDirection: 'column' as any },
  side: { width: 380, gap: 14 },
  sideNarrow: { width: '100%' as any },
  main: { flex: 1, minWidth: 0, gap: 14 },
  mainContent: { paddingBottom: 24, gap: 16 },
  topOverviewRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
  },
  topOverviewRowNarrow: {
    flexDirection: 'column' as any,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnHover: { opacity: 0.95 },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },

  heroCard: {
    minHeight: 320,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: colors.white,
    position: 'relative',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  heroCardTop: {
    width: 360,
    flexShrink: 0,
    alignSelf: 'stretch',
    minHeight: 392,
  },
  heroCardTopNarrow: {
    width: '100%' as any,
    minHeight: 320,
  },
  heroImg: { ...StyleSheet.absoluteFillObject },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroBottom: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  // Match screenshot: status on left, edit button on right
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroTitle: { marginTop: 8, fontSize: 24, fontWeight: '900', color: colors.white, textAlign: 'right' },
  heroMetaCol: { marginTop: 10, gap: 6 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8 },
  heroMetaText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.88)', textAlign: 'right', flex: 1 },

  heroOwner: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  heroOwnerText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  heroOwnerName: { fontSize: 14, fontWeight: '900', color: colors.white, textAlign: 'right' },
  heroOwnerSub: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.82)', textAlign: 'right' },

  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  statusPillText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  statusPillActive: {},
  statusPillPlanning: { backgroundColor: 'rgba(245,158,11,0.18)', borderColor: 'rgba(245,158,11,0.35)' },
  statusPillPast: { backgroundColor: 'rgba(148,163,184,0.18)', borderColor: 'rgba(148,163,184,0.35)' },
  statusPillDraft: { backgroundColor: 'rgba(148,163,184,0.18)', borderColor: 'rgba(148,163,184,0.35)' },

  heroEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroEditBtnHover: { opacity: 0.96 },
  heroEditBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },
  ownerRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,69,230,0.08)' },
  ownerText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  ownerName: { fontSize: 16, fontWeight: '900', color: colors.white, textAlign: 'right' },
  ownerMeta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.88)', textAlign: 'right' },
  weddingRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  weddingText: { flex: 1, fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.92)', textAlign: 'right' },

  sideCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  actionBtn: {
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  actionBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  actionBtnText: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },

  quickActionsCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    gap: 12,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  quickActionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickActionBtn: {
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  quickActionBtnHover: { backgroundColor: 'rgba(15,69,230,0.06)', borderColor: 'rgba(15,69,230,0.14)' },
  quickActionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  quickActionIcon: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  quickActionText: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', flex: 1 },
  quickActionChevron: {},

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    gap: 12,
  },
  workflowPanel: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 18,
    gap: 16,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  workflowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  workflowHeaderText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 4,
  },
  workflowEyebrow: {
    width: '100%',
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  workflowTitle: {
    width: '100%',
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  workflowSubtitle: {
    width: '100%',
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 20,
    writingDirection: 'rtl',
  },
  workflowHeaderBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  workflowHeaderBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  workflowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  workflowGridWide: {
    flexWrap: 'wrap',
  },
  workflowCard: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 156,
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#fbfcff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    justifyContent: 'space-between',
    gap: 14,
  },
  workflowCardFeatured: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.32)',
  },
  workflowCardHover: {
    backgroundColor: 'rgba(15,69,230,0.04)',
    borderColor: 'rgba(15,69,230,0.14)',
  },
  workflowCardFeaturedHover: {
    opacity: 0.97,
  },
  workflowCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  workflowStepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  workflowStepBadgeFeatured: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  workflowStepBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'center',
  },
  workflowStepBadgeTextFeatured: {
    color: colors.white,
  },
  workflowIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workflowTextWrap: {
    alignItems: 'flex-end',
    gap: 6,
  },
  workflowCardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    width: '100%',
  },
  workflowCardTitleFeatured: {
    color: colors.white,
  },
  workflowCardSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 20,
    width: '100%',
  },
  workflowCardSubtitleFeatured: {
    color: 'rgba(255,255,255,0.82)',
  },
  workflowCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  workflowMetaText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  workflowMetaTextFeatured: {
    color: 'rgba(255,255,255,0.86)',
  },
  // Force 4 cards in a single row on wide screens (matches design)
  statsGridWide: {
    flexWrap: 'nowrap',
  },
  cardsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  statCard: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 210,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    borderBottomWidth: 4,
    padding: 14,
    justifyContent: 'space-between',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  statCardQuarter: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  statCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  statLabel: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  statIconCircle: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  statCardBottom: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  statValue: { fontSize: 30, fontWeight: '900', color: colors.text, textAlign: 'right' },
  statHint: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },

  panel: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 16,
    gap: 14,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  panelLink: { fontSize: 12, fontWeight: '900', color: '#3B82F6', textAlign: 'left' },
  totalChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,69,230,0.06)' },
  totalChipText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  progressRow: { flexDirection: 'row', gap: 12 },
  progressItem: { flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  progressCard: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    gap: 12,
  },
  progressHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  progressHeaderRight: { justifyContent: 'flex-start', alignItems: 'flex-start', gap: 4, flex: 1, minWidth: 0 },
  progressLabel: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  progressValue: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'right' },
  progressValueSub: { fontSize: 12, fontWeight: '700', color: colors.gray[500] },
  progressChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
  },
  progressChipText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  progressTrack: { height: 12, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.10)', overflow: 'hidden' },
  progressFill: { height: 12, borderRadius: 999, backgroundColor: colors.primary },
  progressKnob: {
    position: 'absolute',
    right: 4,
    top: '50%',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0f172a',
    transform: [{ translateY: -5 }],
    opacity: 0.9,
  },

  barTrack: { height: 8, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.06)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },
  panelActionsRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  secondaryBtnText: { fontSize: 12, fontWeight: '900', color: colors.text },

  compactCardsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  compactCard: {
    flexGrow: 1,
    flexBasis: 160,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  compactNumber: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'center' },
  compactLabel: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  bigActionsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  bigActionSecondary: {
    flexGrow: 1,
    flexBasis: 300,
    minHeight: 150,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 7,
    overflow: 'hidden',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  bigActionSecondaryHover: { borderColor: 'rgba(6,23,62,0.20)', backgroundColor: 'rgba(6,23,62,0.04)' },
  bigActionIconWrapSecondary: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigActionTitleSecondary: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  bigActionSubtitleSecondary: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  bigActionPrimary: {
    flexGrow: 1,
    flexBasis: 300,
    minHeight: 150,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 7,
    overflow: 'hidden',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  bigActionPrimaryHover: { opacity: 0.96 },
  bigActionBgBlob1: {
    position: 'absolute',
    top: -22,
    right: -22,
    width: 104,
    height: 104,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bigActionBgBlob2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 86,
    height: 86,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bigActionIconWrapPrimary: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigActionTitlePrimary: { fontSize: 16, fontWeight: '900', color: colors.white, textAlign: 'center' },
  bigActionSubtitlePrimary: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.70)', textAlign: 'center' },

  footer: { marginTop: 10, fontSize: 12, fontWeight: '700', color: colors.gray[500], textAlign: 'center' },

  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  previewContent: { alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: 920, height: 680, maxWidth: '96%', maxHeight: '86%', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)' },
  previewFallback: { width: 280, height: 240, borderRadius: 18, justifyContent: 'center', alignItems: 'center', gap: 10 },
  previewFallbackText: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.78)', textAlign: 'center' },

  editOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.54)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  editCard: {
    width: '100%',
    maxWidth: 760,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.76)',
    overflow: 'hidden',
    maxHeight: '90%',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 28px 80px rgba(15,23,42,0.22)' } as any) : null),
  },
  editHeader: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 18, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  editHeaderContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  editHeaderBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(29,78,216,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editHeaderTextWrap: { flex: 1, alignItems: 'stretch', justifyContent: 'center' },
  iconCircle: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(17,24,39,0.06)' },
  iconCircleHover: { backgroundColor: 'rgba(17,24,39,0.09)' },
  editTitle: { width: '100%', fontSize: 22, fontWeight: '900', color: '#0f172a', textAlign: 'right', writingDirection: 'rtl' },
  editSubtitle: { width: '100%', marginTop: 4, fontSize: 13, fontWeight: '900', color: '#1d4ed8', textAlign: 'right', writingDirection: 'rtl' },
  editHeaderHint: { width: '100%', marginTop: 6, fontSize: 12, fontWeight: '700', color: 'rgba(15,23,42,0.62)', textAlign: 'right', lineHeight: 18, writingDirection: 'rtl' },
  editDivider: { height: 1, backgroundColor: 'rgba(15,23,42,0.08)', marginHorizontal: 22 },
  editBody: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 18, gap: 14 },
  editSectionCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.20)',
    gap: 14,
    alignItems: 'stretch',
  },
  editSectionHeader: { width: '100%', alignItems: 'stretch', gap: 4 },
  editSectionTitle: { width: '100%', fontSize: 15, fontWeight: '900', color: '#0f172a', textAlign: 'right', writingDirection: 'rtl' },
  editSectionHint: { width: '100%', fontSize: 12, fontWeight: '700', color: 'rgba(15,23,42,0.58)', textAlign: 'right', lineHeight: 18, writingDirection: 'rtl' },
  editFieldsRow: { gap: 14 },
  editFieldsRowDesktop: { flexDirection: 'row-reverse', alignItems: 'flex-start' },
  editFieldGroup: { gap: 8, alignItems: 'stretch' },
  editFieldHalf: { flex: 1 },
  editLabel: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  inputLike: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLikeHover: { borderColor: 'rgba(29,78,216,0.22)', backgroundColor: 'rgba(255,255,255,0.98)' },
  inputLikeText: { fontSize: 15, fontWeight: '900', color: '#111827' },
  textInput: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: '#fff',
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  editDangerCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  editDangerTextWrap: { flex: 1, alignItems: 'stretch', gap: 4 },
  editDangerTitle: { width: '100%', fontSize: 14, fontWeight: '900', color: '#7f1d1d', textAlign: 'right', writingDirection: 'rtl' },
  editDangerHint: { width: '100%', fontSize: 12, fontWeight: '700', color: 'rgba(127,29,29,0.76)', textAlign: 'right', lineHeight: 18, writingDirection: 'rtl' },
  editFooter: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 18, borderTopWidth: 1, borderTopColor: 'rgba(15,23,42,0.08)', flexDirection: 'row-reverse', gap: 12, backgroundColor: 'rgba(255,255,255,0.98)' },
  footerBtnSecondary: { flex: 1, height: 50, borderRadius: 14, backgroundColor: 'rgba(17,24,39,0.06)', justifyContent: 'center', alignItems: 'center' },
  footerBtnSecondaryHover: { backgroundColor: 'rgba(17,24,39,0.08)' },
  footerBtnSecondaryText: { fontSize: 14, fontWeight: '900', color: '#111827' },
  footerBtnDanger: { minWidth: 154, height: 48, borderRadius: 14, backgroundColor: 'rgba(255, 59, 48, 0.08)', borderWidth: 1, borderColor: 'rgba(255, 59, 48, 0.22)', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  footerBtnDangerHover: { backgroundColor: 'rgba(255, 59, 48, 0.12)' },
  footerBtnDangerText: { fontSize: 13, fontWeight: '900', color: colors.error },
  footerBtnPrimary: { flex: 1.35, height: 50, borderRadius: 16, backgroundColor: '#1d4ed8', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  footerBtnPrimaryHover: { opacity: 0.95 },
  footerBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },

  // Delete confirmation modal (RTL)
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    padding: 0,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 24px 70px rgba(0,0,0,0.22)' } as any) : null),
    overflow: 'hidden',
  },
  deleteHeaderRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  deleteIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 59, 48, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteHeaderText: { flex: 1, alignItems: 'flex-end' },
  deleteTitle: { fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'right' },
  deleteSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.55)', textAlign: 'right' },
  deleteDivider: { height: 1, backgroundColor: 'rgba(17,24,39,0.08)', marginHorizontal: 16 },
  deleteBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 12 },
  deleteBodyText: { fontSize: 13, fontWeight: '800', color: 'rgba(17,24,39,0.78)', textAlign: 'right', lineHeight: 20 },
  deleteList: { gap: 10, paddingTop: 4 },
  deleteListRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  deleteBullet: { width: 8, height: 8, borderRadius: 999, backgroundColor: 'rgba(255, 59, 48, 0.85)' },
  deleteListText: { flex: 1, fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  deleteHintBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.14)',
  },
  deleteHintText: { flex: 1, fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.70)', textAlign: 'right', lineHeight: 18 },
  deleteFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.08)',
    flexDirection: 'row-reverse',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  deleteBtnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  deleteBtnSecondaryHover: { backgroundColor: 'rgba(17,24,39,0.08)' },
  deleteBtnSecondaryText: { fontSize: 13, fontWeight: '900', color: '#111827' },
  deleteBtnDanger: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  deleteBtnDangerHover: { opacity: 0.96 },
  deleteBtnDangerText: { fontSize: 13, fontWeight: '900', color: '#fff' },

  dateModalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    padding: 16,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 20px 60px rgba(0,0,0,0.18)' } as any) : null),
  },
  dateModalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dateHeaderSide: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  dateModalTitle: { width: '100%', flex: 1, fontSize: 16, fontWeight: '900', color: '#111827', textAlign: 'center' },
  weekRow: {
    marginTop: 14,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  weekDay: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '900', color: 'rgba(17,24,39,0.55)' },
  calendarGrid: { marginTop: 10, flexDirection: 'row-reverse', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  dayCellHover: { backgroundColor: 'rgba(17, 24, 39, 0.04)' },
  dayCellOutside: { opacity: 0.55 },
  dayCellSelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'center' },
  dayTextOutside: { color: 'rgba(17,24,39,0.55)' },
  dayTextSelected: { color: colors.white },
  dateModalFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17, 24, 39, 0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  todayBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(22,45,156,0.06)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  todayBtnHover: { backgroundColor: 'rgba(22,45,156,0.10)' },
  todayBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
});

