import React, { useEffect, useMemo, useState } from 'react';
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
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { colors } from '@/constants/colors';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { useAdminEventDetailsModel } from '@/features/events/useAdminEventDetailsModel';
import { eventService } from '@/lib/services/eventService';
import { supabase } from '@/lib/supabase';

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

function GaugeMeter({
  value,
  total,
  color,
  trackColor,
}: {
  value: number;
  total: number;
  color: string;
  trackColor: string;
}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeValue = Math.max(0, Math.min(Number(value) || 0, safeTotal || Number(value) || 0));
  const progress = safeTotal > 0 ? Math.max(0, Math.min(1, safeValue / safeTotal)) : 0;
  const width = 132;
  const height = 84;
  const cx = width / 2;
  const cy = height - 8;
  const radius = 46;
  const arcLength = Math.PI * radius;
  const pointerRadius = radius - 6;
  const angle = Math.PI - progress * Math.PI;
  const pointerX = cx + pointerRadius * Math.cos(angle);
  const pointerY = cy - pointerRadius * Math.sin(angle);
  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={arcPath} stroke={trackColor} strokeWidth={12} fill="none" strokeLinecap="round" />
      <Path
        d={arcPath}
        stroke={color}
        strokeWidth={12}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(progress > 0 ? 3 : 0, progress * arcLength)} ${arcLength}`}
      />
      <Line x1={cx} y1={cy} x2={pointerX} y2={pointerY} stroke={'rgba(15,23,42,0.78)'} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={9} fill="#FFFFFF" stroke={'rgba(15,23,42,0.78)'} strokeWidth={3} />
    </Svg>
  );
}

export default function AdminEventDetailsWebScreen() {
  const { id, eventId } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const resolvedEventId = useMemo(() => {
    const fromId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
    const fromEventId = typeof eventId === 'string' ? eventId : Array.isArray(eventId) ? eventId[0] : '';
    return fromId || fromEventId || '';
  }, [eventId, id]);

  const { loading, error, event, setEvent, guests, userName, userAvatarUrl, stats, refresh } =
    useAdminEventDetailsModel(resolvedEventId);

  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editDatePickerOpen, setEditDatePickerOpen] = useState(false);
  const [webCalendarOpen, setWebCalendarOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
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
  const ownerDisplayName = String(userName ?? '').trim();
  const contentWidth = width;
  const isNarrow = contentWidth < 920;
  const getWorkflowActionWidth = (itemsInRow: number) => {
    if (isNarrow) return '48.5%';
    if (itemsInRow === 4) return '24.1%';
    if (itemsInRow === 3) return '32.5%';
    if (itemsInRow === 2) return '49%';
    return '100%';
  };
  const useWideEditLayout = contentWidth >= 1180;
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

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const dateObj = new Date(event?.date ?? '');
  const dateLabel = Number.isFinite(dateObj.getTime())
    ? dateObj.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const countdown = useMemo(() => {
    const target = event?.date ? new Date(event.date).getTime() : NaN;
    const diffMs = target - now.getTime();
    if (!Number.isFinite(diffMs)) return null;

    const safeDiff = Math.max(0, diffMs);
    const totalSeconds = Math.floor(safeDiff / 1000);

    return {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  }, [event?.date, now]);

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

  const status = getEventStatusMeta(event.date);
  const headerMetaItems = [dateLabel, String(event.location ?? '').trim(), String(event.city ?? '').trim()].filter(Boolean);
  const headerSubtitle = headerMetaItems.join('  •  ');
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
      onPress: () =>
        router.push(
          `/(admin)/admin-event-messages?eventId=${event.id}&returnTo=${encodeURIComponent(`/(admin)/admin-event-details?id=${event.id}`)}`
        ),
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
      onPress: () =>
        router.push(
          `/(admin)/admin-guest-checkin?eventId=${event.id}&returnTo=${encodeURIComponent(`/(admin)/admin-event-details?id=${event.id}`)}`
        ),
    },
    {
      key: 'seating-map',
      step: 'שלב 7',
      title: 'מפת הושבה',
      subtitle: 'צפייה בנראות הסופית של מפת ההושבה וניהול המיקומים באולם.',
      meta: `${stats.seatedPercent}% הושבו`,
      icon: 'grid-outline' as const,
      accent: '#111827',
      tint: 'rgba(17,24,39,0.10)',
      onPress: handleSeatingMap,
    },
  ] as const;
  const seatedPeople = guests.filter((g) => Boolean(g.tableId)).reduce((sum, guest) => sum + (Number(guest.numberOfPeople) || 1), 0);
  const unassignedConfirmedPeople = Math.max(stats.confirmedPeople - seatedPeople, 0);
  const recentConfirmedGuests = [...guests]
    .filter((guest) => guest.status === 'מגיע')
    .sort((a, b) => {
      const aTime = a.checkedInAt ? new Date(a.checkedInAt as any).getTime() : 0;
      const bTime = b.checkedInAt ? new Date(b.checkedInAt as any).getTime() : 0;
      return bTime - aTime || String(a.name || '').localeCompare(String(b.name || ''), 'he');
    })
    .slice(0, 5);
  const workflowActionRows = isNarrow
    ? [
        [workflowSteps[0], workflowSteps[1]],
        [workflowSteps[2], workflowSteps[3]],
        [workflowSteps[4], workflowSteps[5]],
        [workflowSteps[6]],
      ]
    : [
        [workflowSteps[0], workflowSteps[1], workflowSteps[2], workflowSteps[3]],
        [workflowSteps[4], workflowSteps[5], workflowSteps[6]],
      ];
  const invitedBase = Math.max(0, Number(stats.invitedPeople) || 0);
  const overviewStats = [
    {
      key: 'confirmed',
      label: 'אישרו הגעה',
      value: stats.confirmedPeople,
      total: invitedBase,
      hint: `${stats.seatedPercent}% שובצו לשולחנות`,
      badge: 'מוכנים לאירוע',
      icon: 'checkmark-circle-outline' as const,
      accent: '#10B981',
      tint: 'rgba(16,185,129,0.12)',
    },
    {
      key: 'invited',
      label: 'מוזמנים',
      value: stats.invitedPeople,
      total: stats.invitedPeople,
      hint: 'סה"כ אנשים ברשימה',
      badge: 'מאגר אורחים',
      icon: 'mail-outline' as const,
      accent: '#3B82F6',
      tint: 'rgba(59,130,246,0.12)',
    },
    {
      key: 'pending',
      label: 'ממתינים',
      value: stats.pendingPeople,
      total: invitedBase,
      hint: 'עדיין לא אישרו הגעה',
      badge: 'דורש מעקב',
      icon: 'hourglass-outline' as const,
      accent: '#F59E0B',
      tint: 'rgba(245,158,11,0.12)',
    },
    {
      key: 'declined',
      label: 'לא מגיעים',
      value: stats.declinedPeople,
      total: invitedBase,
      hint: 'אורחים שביטלו הגעה',
      badge: 'סטטוס שלילי',
      icon: 'close-circle-outline' as const,
      accent: '#EF4444',
      tint: 'rgba(239,68,68,0.12)',
    },
  ] as const;

  return (
    <View style={styles.page}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.main}>
            <View style={styles.heroShell}>
              <AdminWebPageHeader
                eyebrow={eventType}
                title={String(event.title ?? 'פרטי אירוע')}
                actions={
                  ownerDisplayName || userAvatarUrl ? (
                    <View style={styles.headerOwnerBadge}>
                      <View style={styles.headerOwnerAvatarWrap}>
                        {userAvatarUrl ? (
                          <Image source={{ uri: userAvatarUrl }} style={styles.headerOwnerAvatar} contentFit="cover" transition={0} />
                        ) : (
                          <View style={[styles.headerOwnerAvatar, styles.headerOwnerAvatarFallback]}>
                            <Ionicons name="person" size={14} color={colors.gray[500]} />
                          </View>
                        )}
                      </View>
                      <Text style={styles.headerOwnerName} numberOfLines={1}>
                        {ownerDisplayName || 'בעל האירוע'}
                      </Text>
                    </View>
                  ) : null
                }
                subtitle={headerSubtitle}
                subtitleContent={
                  <View style={styles.headerSubtitleBar}>
                    <View style={styles.headerSubtitleMetaGroup}>
                      <View
                        style={[
                          styles.headerStatusPill,
                          status.tone === 'active'
                            ? styles.headerStatusPillActive
                            : status.tone === 'planning'
                              ? styles.headerStatusPillPlanning
                              : status.tone === 'past'
                                ? styles.headerStatusPillPast
                                : styles.headerStatusPillDraft,
                        ]}
                      >
                        <Text style={styles.headerStatusPillText}>{status.label}</Text>
                      </View>

                      {headerMetaItems.map((item) => (
                        <View key={item} style={styles.headerSubtitleMetaChip}>
                          <Text style={styles.headerSubtitleMetaText}>{item}</Text>
                        </View>
                      ))}
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
                }
                showNav={false}
                useDefaultActions={false}
                leading={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="חזרה לרשימת האירועים"
                    onPress={() => router.replace('/(admin)/admin-events-list')}
                    style={({ hovered, pressed }: any) => [
                      styles.backHeaderBtn,
                      Platform.OS === 'web' && hovered ? styles.backHeaderBtnHover : null,
                      pressed ? styles.backHeaderBtnPressed : null,
                    ]}
                  >
                    <Ionicons name="arrow-forward" size={16} color={colors.text} />
                    <Text style={styles.backHeaderBtnText}>חזרה</Text>
                  </Pressable>
                }
              />

              <View style={[styles.dashboardBody, isNarrow ? styles.dashboardBodyNarrow : null]}>
                <View style={styles.dashboardMain}>
                  <View style={styles.countdownCard}>
                    <View style={styles.countdownGlowPrimary} />
                    <View style={styles.countdownGlowSecondary} />
                    <View pointerEvents="none" style={styles.countdownDashedFrame} />

                    <View style={styles.countdownHeader}>
                      <View style={styles.countdownHeaderMeta}>
                        <View style={styles.countdownLiveBadge}>
                          <View style={styles.countdownLiveDot} />
                          <Text style={styles.countdownLiveBadgeText}>מתעדכן</Text>
                        </View>
                        <View style={styles.countdownHeaderIcon}>
                          <Ionicons name="time-outline" size={18} color={colors.primary} />
                        </View>
                      </View>
                      <View style={styles.countdownHeaderText}>
                        <Text style={styles.countdownTitle}>הספירה לאחור החלה</Text>
                        <Text style={styles.countdownSubtitle}>
                          {dateLabel ? `טיימר חי עד מועד האירוע ב־${dateLabel}.` : 'טיימר חי עד מועד האירוע.'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.countdownGridShell}>
                      <View style={styles.countdownGrid}>
                      {[
                        { key: 'days', label: 'ימים', value: countdown?.days ?? 0 },
                        { key: 'hours', label: 'שעות', value: countdown?.hours ?? 0 },
                        { key: 'minutes', label: 'דקות', value: countdown?.minutes ?? 0 },
                        { key: 'seconds', label: 'שניות', value: countdown?.seconds ?? 0 },
                      ].map((unit, index, arr) => (
                        <React.Fragment key={unit.key}>
                          <View style={styles.countdownUnit}>
                            <Text style={styles.countdownUnitValue}>{String(unit.value).padStart(2, '0')}</Text>
                            <Text style={styles.countdownUnitLabel}>{unit.label}</Text>
                          </View>
                          {index < arr.length - 1 ? <Text style={styles.countdownSeparator}>:</Text> : null}
                        </React.Fragment>
                      ))}
                      </View>
                    </View>

                    <View style={styles.countdownFooter}>
                      <View style={styles.countdownDatePill}>
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                        <Text style={styles.countdownDatePillText}>{dateLabel || 'תאריך האירוע טרם הוגדר'}</Text>
                      </View>
                      <Text style={styles.countdownFooterHint}>ימים, שעות, דקות ושניות עד תחילת האירוע</Text>
                    </View>
                  </View>

                  <View style={styles.workflowActionsCard}>
                    <View style={styles.workflowActionsHeader}>
                      <View style={styles.workflowActionsHeaderText}>
                        <Text style={styles.workflowActionsTitle}>פעולות לפי שלבים</Text>
                        <Text style={styles.workflowActionsSubtitle}>גישה מהירה לכל שלב מרכזי בתהליך העבודה של האירוע.</Text>
                      </View>
                      <View style={styles.workflowActionsHeaderBadge}>
                        <Text style={styles.workflowActionsHeaderBadgeText}>{`${workflowSteps.length}`}</Text>
                      </View>
                    </View>

                    <View style={styles.workflowActionsGrid}>
                      {workflowActionRows.filter((row) => row.length).map((row) => (
                        <View key={row.map((step) => step.key).join('-')} style={styles.workflowActionsRow}>
                          {row.map((step, index) => (
                            <Pressable
                              key={`quick-${step.key}`}
                              accessibilityRole="button"
                              accessibilityLabel={`מעבר אל ${step.title}`}
                              onPress={step.onPress}
                              style={({ hovered, pressed }: any) => [
                                styles.workflowActionItem,
                                { width: getWorkflowActionWidth(row.length) },
                                Platform.OS === 'web' && hovered ? styles.workflowActionItemHover : null,
                                pressed ? { opacity: 0.94 } : null,
                              ]}
                            >
                              <View style={styles.workflowActionContent}>
                                <View style={styles.workflowActionTopRow}>
                                  <View
                                    style={[
                                      styles.workflowActionStepBadge,
                                      { backgroundColor: '#F8FAFF', borderColor: 'rgba(15,23,42,0.06)' },
                                    ]}
                                  >
                                    <Text style={[styles.workflowActionStepBadgeText, { color: colors.gray[500] }]}>
                                      {step.step || `שלב ${index + 1}`}
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.workflowActionIconWrap,
                                      { backgroundColor: step.tint, borderColor: 'transparent' },
                                    ]}
                                  >
                                    <Ionicons name={step.icon} size={16} color={step.accent} />
                                  </View>
                                </View>

                                <View style={styles.workflowActionTextWrap}>
                                  <Text style={styles.workflowActionTitle} numberOfLines={2}>
                                    {step.title}
                                  </Text>
                                  <Text style={styles.workflowActionSubtitle} numberOfLines={2}>
                                    {step.subtitle}
                                  </Text>
                                </View>

                                <View style={styles.workflowActionFooter}>
                                  <Ionicons name="arrow-back" size={14} color={step.accent} />
                                  <Text style={[styles.workflowActionMetaText, { color: step.accent }]} numberOfLines={1}>
                                    {step.meta}
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                      <View style={styles.summaryHeaderText}>
                        <Text style={styles.summaryTitle}>סיכום הושבה</Text>
                        <Text style={styles.summarySubtitle}>מבט מהיר על מצב ההושבה והקצאת האורחים לאירוע.</Text>
                      </View>
                      <View style={styles.summaryIconWrap}>
                        <Ionicons name="grid-outline" size={18} color={colors.primary} />
                      </View>
                    </View>

                    <View style={styles.summaryProgressMeta}>
                      <Text style={styles.summaryProgressValue}>{`${stats.seatedPercent}% שובצו`}</Text>
                    </View>

                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, stats.seatedPercent))}%` }]} />
                    </View>

                    <View style={[styles.summaryMetricsRow, isNarrow ? styles.summaryMetricsRowNarrow : null]}>
                      <View style={styles.summaryMetric}>
                        <Text style={styles.summaryMetricLabel}>אישרו הגעה</Text>
                        <Text style={styles.summaryMetricValue}>{stats.confirmedPeople}</Text>
                      </View>
                      <View style={[styles.summaryMetricDivider, isNarrow ? styles.summaryMetricDividerNarrow : null]} />
                      <View style={styles.summaryMetric}>
                        <Text style={styles.summaryMetricLabel}>ממתינים לשיבוץ</Text>
                        <Text style={styles.summaryMetricValue}>{unassignedConfirmedPeople}</Text>
                      </View>
                      <View style={[styles.summaryMetricDivider, isNarrow ? styles.summaryMetricDividerNarrow : null]} />
                      <View style={styles.summaryMetric}>
                        <Text style={styles.summaryMetricLabel}>אורחים משובצים</Text>
                        <Text style={styles.summaryMetricValue}>{seatedPeople}</Text>
                      </View>
                    </View>

                    <View style={styles.summaryFooter}>
                      <View style={styles.summaryFooterText}>
                        <Text style={styles.summaryFooterTitle}>ניהול מפת הושבה</Text>
                        <Text style={styles.summaryFooterHint}>כל השולחנות והאורחים מאורגנים במקום אחד לניהול מהיר.</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="מעבר למפת הושבה"
                        onPress={handleSeatingMap}
                        style={({ hovered, pressed }: any) => [
                          styles.summaryActionBtn,
                          Platform.OS === 'web' && hovered ? styles.summaryActionBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Text style={styles.summaryActionBtnText}>צפה במפה</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.recentGuestsCard}>
                    <View style={styles.recentGuestsHeader}>
                      <Text style={styles.recentGuestsTitle}>אורחים אחרונים שאישרו</Text>
                      <Text style={styles.recentGuestsSubtitle}>מוצגים כאן רק 5 האורחים האחרונים שאישרו הגעה.</Text>
                    </View>

                    <View style={styles.recentGuestsList}>
                      {recentConfirmedGuests.length ? (
                        recentConfirmedGuests.map((guest) => {
                          const initials = String(guest.name || '')
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part.charAt(0))
                            .join('');
                          return (
                            <View key={guest.id} style={styles.recentGuestRow}>
                              <View style={styles.recentGuestBody}>
                                <View style={styles.recentGuestAvatar}>
                                  <Text style={styles.recentGuestAvatarText}>{initials || 'א'}</Text>
                                </View>
                                <View style={styles.recentGuestText}>
                                  <Text style={styles.recentGuestName}>{guest.name}</Text>
                                  <Text style={styles.recentGuestMeta}>{`${Number(guest.numberOfPeople) || 1} מוזמנים`}</Text>
                                </View>
                              </View>
                              <View style={styles.recentGuestStatusWrap}>
                                <Text style={styles.recentGuestStatusText}>מאושר</Text>
                              </View>
                            </View>
                          );
                        })
                      ) : (
                        <View style={styles.emptyRecentGuests}>
                          <Text style={styles.emptyRecentGuestsText}>עדיין אין אורחים שאישרו הגעה.</Text>
                        </View>
                      )}
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="מעבר לרשימת שולחנות"
                      onPress={handleTablesList}
                      style={({ hovered, pressed }: any) => [
                        styles.recentGuestsAction,
                        Platform.OS === 'web' && hovered ? styles.recentGuestsActionHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <Text style={styles.recentGuestsActionText}>מעבר לרשימת שולחנות</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.dashboardSide, isNarrow ? styles.dashboardSideNarrow : null]}>
                  <View style={styles.generalStatsCard}>
                    <View style={styles.generalStatsHeader}>
                      <View style={styles.generalStatsHeaderText}>
                        <Text style={styles.generalStatsTitle}>נתונים כללים</Text>
                        <Text style={styles.generalStatsSubtitle}>מבט מהיר על מצב האירוע והאורחים.</Text>
                      </View>
                      <View style={styles.generalStatsHeaderBadge}>
                        <Text style={styles.generalStatsHeaderBadgeText}>{`${overviewStats.length}`}</Text>
                      </View>
                    </View>

                    <View style={styles.generalStatsList}>
                      {overviewStats.map((item) => (
                        <View key={item.key} style={[styles.statCard, styles.generalStatCard, { borderColor: item.tint }]}>
                          <View style={styles.statCardTop}>
                            <View style={[styles.statBadge, { backgroundColor: item.tint }]}>
                              <Text style={[styles.statBadgeText, { color: item.accent }]}>{item.badge}</Text>
                            </View>
                            <View style={[styles.statIconCircle, { backgroundColor: item.tint }]}>
                              <Ionicons name={item.icon} size={18} color={item.accent} />
                            </View>
                          </View>

                          <View style={styles.statCardBody}>
                            <View style={styles.statGaugeWrap}>
                              <GaugeMeter value={item.value} total={item.total} color={item.accent} trackColor={item.tint} />
                            </View>
                            <Text style={styles.statLabel}>{item.label}</Text>
                            <View style={styles.statCardBottom}>
                              <Text style={styles.statValue}>{item.value}</Text>
                              <Text style={styles.statOutOf}>{`מתוך ${item.total}`}</Text>
                            </View>
                            <Text style={styles.statHint}>{item.hint}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              <Text style={styles.footer}>© 2026 כל הזכויות שמורות למערכת אירועים</Text>
            </View>
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
  page: {
    flex: 1,
    backgroundColor: '#F7FAFF',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.14), rgba(25,93,230,0) 40%), radial-gradient(circle at top left, rgba(232,241,255,0.95), rgba(232,241,255,0) 34%), radial-gradient(circle at bottom left, rgba(242,224,186,0.34), rgba(242,224,186,0) 32%), radial-gradient(circle at bottom center, rgba(240,203,70,0.12), rgba(240,203,70,0) 26%)',
        } as any)
      : null),
  },
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
  heroShell: { gap: 18 },
  dashboardBody: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 20,
  },
  dashboardBodyNarrow: {
    flexDirection: 'column' as any,
  },
  dashboardSide: {
    width: 304,
    flexShrink: 0,
    gap: 18,
  },
  dashboardSideNarrow: {
    width: '100%' as any,
  },
  dashboardMain: {
    flex: 1,
    minWidth: 0,
    gap: 18,
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
  backHeaderBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  backHeaderBtnHover: {
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 18px rgba(11,28,65,0.06)' } as any) : null),
  },
  backHeaderBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  backHeaderBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },

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
  dashboardHeroCard: {
    width: '100%' as any,
    minHeight: 176,
  },
  heroImg: { ...StyleSheet.absoluteFillObject },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroBottom: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
    textShadowColor: 'rgba(0,0,0,0.34)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
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
  headerStatusPill: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderColor: 'rgba(15,23,42,0.08)',
  },
  headerStatusPillActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.22)',
  },
  headerStatusPillPlanning: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.24)',
  },
  headerStatusPillPast: {
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderColor: 'rgba(148,163,184,0.24)',
  },
  headerStatusPillDraft: {
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderColor: 'rgba(148,163,184,0.24)',
  },
  headerStatusPillText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  headerSubtitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerSubtitleMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    flexWrap: 'nowrap',
    flex: 1,
  },
  headerSubtitleMetaChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 12px rgba(11,28,65,0.04)',
        } as any)
      : null),
  },
  headerSubtitleMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },

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
  headerOwnerBadge: {
    maxWidth: '100%',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  headerOwnerAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: '#E8EEF8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    flexShrink: 0,
  },
  headerOwnerAvatar: { width: '100%', height: '100%' },
  headerOwnerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerOwnerName: {
    maxWidth: 160,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
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
  statsGridNarrow: {
    flexWrap: 'wrap',
  },
  workflowPanel: {
    width: '100%',
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
  workflowTimeline: {
    gap: 4,
  },
  workflowTimelineItem: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  workflowTimelineItemHover: {
    backgroundColor: 'rgba(15,69,230,0.04)',
  },
  workflowTimelineMarker: {
    width: 28,
    alignItems: 'center',
  },
  workflowStepCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  workflowStepCircleDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  workflowStepCircleCurrent: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(15,69,230,0.08)',
  },
  workflowStepCircleText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[500],
    textAlign: 'center',
  },
  workflowStepCircleTextCurrent: {
    color: colors.primary,
  },
  workflowStepConnector: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: -10,
    backgroundColor: 'rgba(148,163,184,0.25)',
  },
  workflowStepConnectorActive: {
    backgroundColor: 'rgba(15,69,230,0.28)',
  },
  workflowTimelineText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 4,
    gap: 4,
  },
  workflowTimelineTitle: {
    width: '100%',
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  workflowTimelineTitleCurrent: {
    color: colors.primary,
  },
  workflowTimelineMeta: {
    width: '100%',
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    lineHeight: 18,
    textAlign: 'right',
  },
  workflowList: {
    gap: 10,
  },
  workflowListItem: {
    minHeight: 88,
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#FBFCFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  workflowListItemFeatured: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.28)',
  },
  workflowListItemHover: {
    backgroundColor: 'rgba(15,69,230,0.04)',
    borderColor: 'rgba(15,69,230,0.14)',
  },
  workflowListItemFeaturedHover: {
    opacity: 0.97,
  },
  workflowListItemMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
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
  workflowListIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  workflowListTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 4,
  },
  workflowListTitleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  workflowListTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    flex: 1,
    minWidth: 0,
  },
  workflowListTitleFeatured: {
    color: colors.white,
  },
  workflowListSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 20,
    width: '100%',
  },
  workflowListSubtitleFeatured: {
    color: 'rgba(255,255,255,0.82)',
  },
  workflowListMeta: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    width: '100%',
  },
  workflowListMetaFeatured: {
    color: 'rgba(255,255,255,0.86)',
  },
  workflowListArrow: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 132,
    backgroundColor: '#FBFCFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  statCardQuarter: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  statCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statCardBody: { gap: 8, alignItems: 'stretch', justifyContent: 'flex-start' },
  statLabel: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right', lineHeight: 18 },
  statIconCircle: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBadgeText: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  statGaugeWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  statCardBottom: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
    minHeight: 44,
  },
  statValue: { fontSize: 34, fontWeight: '900', color: colors.text, textAlign: 'right' },
  statOutOf: { fontSize: 12, fontWeight: '800', color: colors.gray[500], textAlign: 'right' },
  statHint: { fontSize: 11, fontWeight: '700', color: colors.gray[500], textAlign: 'right' },
  generalStatsCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 18,
    gap: 14,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  generalStatsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  generalStatsHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    alignItems: 'stretch',
  },
  generalStatsTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  generalStatsSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 19,
  },
  generalStatsHeaderBadge: {
    minWidth: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  generalStatsHeaderBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  generalStatsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  generalStatCard: {
    width: '48%',
    minWidth: 0,
    minHeight: 236,
    flexBasis: '48%',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  workflowActionsCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    borderColor: 'rgba(15,23,42,0.08)',
    gap: 14,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  countdownCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    borderColor: 'rgba(15,23,42,0.07)',
    gap: 18,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  countdownGlowPrimary: {
    position: 'absolute',
    top: -64,
    right: -28,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.10)',
  },
  countdownGlowSecondary: {
    position: 'absolute',
    bottom: -56,
    left: -22,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: 'rgba(14,165,233,0.08)',
  },
  countdownDashedFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(15,69,230,0.26)',
  },
  countdownHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  countdownHeaderMeta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  countdownHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  countdownLiveBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.18)',
  },
  countdownLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  countdownLiveBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#059669',
    textAlign: 'center',
  },
  countdownHeaderText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 6,
  },
  countdownTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#102A56',
    textAlign: 'right',
  },
  countdownSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 19,
  },
  countdownGridShell: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.10)',
    backgroundColor: 'rgba(248,250,255,0.88)',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  countdownGrid: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 12,
  },
  countdownUnit: {
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  countdownUnitValue: {
    fontSize: 46,
    lineHeight: 50,
    fontWeight: '900',
    color: '#0E2B57',
    textAlign: 'center',
  },
  countdownUnitLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
  },
  countdownSeparator: {
    fontSize: 36,
    lineHeight: 48,
    fontWeight: '700',
    color: 'rgba(15,69,230,0.42)',
    textAlign: 'center',
    marginTop: 1,
  },
  countdownFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  countdownDatePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.10)',
    maxWidth: '72%',
  },
  countdownDatePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#163C73',
    textAlign: 'right',
  },
  countdownFooterHint: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
  },
  workflowActionsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  workflowActionsHeaderText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 4,
  },
  workflowActionsTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  workflowActionsSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 20,
  },
  workflowActionsHeaderBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  workflowActionsHeaderBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  workflowActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: 12,
  },
  workflowActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  workflowActionItem: {
    minHeight: 164,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  workflowActionItemHover: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15,69,230,0.12)',
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  workflowActionContent: {
    flex: 1,
    minWidth: 0,
    gap: 14,
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  workflowActionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  workflowActionTopText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 6,
  },
  workflowActionKicker: {
    width: '100%',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  workflowActionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  workflowActionStepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  workflowActionStepBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
  },
  workflowActionTextWrap: {
    alignItems: 'stretch',
    minWidth: 0,
    gap: 6,
  },
  workflowActionTitle: {
    width: '100%',
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  workflowActionSubtitle: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 18,
  },
  workflowActionFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  workflowActionMetaText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  eventInfoCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 16,
    gap: 14,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  eventInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventInfoTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  eventInfoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59,130,246,0.10)',
  },
  eventInfoList: {
    gap: 12,
  },
  eventInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventInfoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
  },
  eventInfoValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  eventInfoValueAccent: {
    color: '#10B981',
  },
  summaryCard: {
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
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryHeaderText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 4,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  summarySubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 20,
  },
  summaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryProgressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  summaryProgressValue: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryMetricsRowNarrow: {
    flexDirection: 'column' as any,
  },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  summaryMetricDivider: {
    width: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  summaryMetricDividerNarrow: {
    width: '100%' as any,
    height: 1,
  },
  summaryMetricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'center',
  },
  summaryMetricValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  summaryFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.08)',
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  summaryFooterText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 4,
  },
  summaryFooterTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  summaryFooterHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  summaryActionBtn: {
    minWidth: 106,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  summaryActionBtnHover: {
    backgroundColor: 'rgba(15,69,230,0.12)',
  },
  summaryActionBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  recentGuestsCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    paddingVertical: 12,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  recentGuestsHeader: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.08)',
  },
  recentGuestsTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  recentGuestsSubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 19,
  },
  recentGuestsList: {
    paddingHorizontal: 18,
  },
  recentGuestRow: {
    minHeight: 74,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.07)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 16,
  },
  recentGuestStatusWrap: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignSelf: 'flex-start',
  },
  recentGuestStatusText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#10B981',
    textAlign: 'center',
  },
  recentGuestBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  recentGuestAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentGuestAvatarText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  recentGuestText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 3,
  },
  recentGuestName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  recentGuestMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
  },
  emptyRecentGuests: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRecentGuestsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'center',
  },
  recentGuestsAction: {
    marginHorizontal: 18,
    marginTop: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(15,23,42,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentGuestsActionHover: {
    backgroundColor: 'rgba(15,69,230,0.05)',
    borderColor: 'rgba(15,69,230,0.14)',
  },
  recentGuestsActionText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },

  totalChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,69,230,0.06)' },
  totalChipText: { fontSize: 12, fontWeight: '900', color: colors.primary },

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

