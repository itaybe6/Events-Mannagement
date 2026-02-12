import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  if (diff <= 30) return { label: 'בתכנון', tone: 'planning' as const };
  return { label: 'טיוטה', tone: 'draft' as const };
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
  const [editDatePickerOpen, setEditDatePickerOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    date: new Date(),
    location: '',
    city: '',
    groomName: '',
    brideName: '',
  });

  const eventType = getEventTypeLabel(String(event?.title ?? ''));
  const isWedding = eventType === 'חתונה' || String(event?.title ?? '').includes('חתונה');
  const isNarrow = width < 1024;
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

  const handleSeatingMap = async () => {
    if (!event?.id) return;
    const { data } = await supabase.from('seating_maps').select('*').eq('event_id', event.id).single();
    if (!data) {
      await supabase.from('seating_maps').insert({
        event_id: event.id,
        num_tables: 0,
        tables: [],
        annotations: [],
      });
    }
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

  return (
    <View style={styles.page}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={[styles.grid, isNarrow ? styles.gridNarrow : null]}>
            {/* Sidebar */}
            <View style={[styles.side, isNarrow ? styles.sideNarrow : null]}>
              <View style={styles.heroCard}>
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
                      <Text style={styles.heroMetaText}>{dateLabel}</Text>
                      <Ionicons name="calendar-outline" size={16} color={'rgba(255,255,255,0.86)'} />
                    </View>
                    <View style={styles.heroMetaRow}>
                      <Text style={styles.heroMetaText}>
                        {String(event.location ?? '')}
                        {event.city ? `, ${event.city}` : ''}
                      </Text>
                      <Ionicons name="location-outline" size={16} color={'rgba(255,255,255,0.86)'} />
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

              <View style={styles.quickActionsCard}>
                <View style={styles.quickActionsHeader}>
                  <Ionicons name="flash-outline" size={18} color={'rgba(0,29,61,0.55)'} />
                  <Text style={styles.cardTitle}>פעולות מהירות</Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="אישורי הגעה"
                  onPress={() => router.push(`/(admin)/admin-rsvp-approvals?eventId=${event.id}`)}
                  style={({ hovered, pressed }: any) => [
                    styles.quickActionBtn,
                    Platform.OS === 'web' && hovered ? styles.quickActionBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <View style={styles.quickActionLeft}>
                    <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(59,130,246,0.14)' }]}>
                      <Ionicons name="people-outline" size={18} color={'#3B82F6'} />
                    </View>
                    <Text style={styles.quickActionText}>אישורי הגעה</Text>
                  </View>
                  <Ionicons name="chevron-back" size={18} color={colors.gray[500]} style={styles.quickActionChevron} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="עריכת סקיצה"
                  onPress={() => router.push(`/(admin)/seating-templates?eventId=${event.id}`)}
                  style={({ hovered, pressed }: any) => [
                    styles.quickActionBtn,
                    Platform.OS === 'web' && hovered ? styles.quickActionBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <View style={styles.quickActionLeft}>
                    <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(168,85,247,0.14)' }]}>
                      <Ionicons name="create-outline" size={18} color={'#A855F7'} />
                    </View>
                    <Text style={styles.quickActionText}>עריכת סקיצה</Text>
                  </View>
                  <Ionicons name="chevron-back" size={18} color={colors.gray[500]} style={styles.quickActionChevron} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="מפת הושבה"
                  onPress={handleSeatingMap}
                  style={({ hovered, pressed }: any) => [
                    styles.quickActionBtn,
                    Platform.OS === 'web' && hovered ? styles.quickActionBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <View style={styles.quickActionLeft}>
                    <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(16,185,129,0.16)' }]}>
                      <Ionicons name="grid-outline" size={18} color={'#10B981'} />
                    </View>
                    <Text style={styles.quickActionText}>מפת הושבה</Text>
                  </View>
                  <Ionicons name="chevron-back" size={18} color={colors.gray[500]} style={styles.quickActionChevron} />
                </Pressable>
              </View>
            </View>

            {/* Main */}
            <View style={styles.main}>
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
                    onPress={() => router.push(`/(admin)/seating-templates?eventId=${event.id}`)}
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

              <View style={styles.bigActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="עריכת סקיצה"
                  onPress={() => router.push(`/(admin)/seating-templates?eventId=${event.id}`)}
                  style={({ hovered, pressed }: any) => [
                    styles.bigActionSecondary,
                    Platform.OS === 'web' && hovered ? styles.bigActionSecondaryHover : null,
                    pressed ? { opacity: 0.94 } : null,
                  ]}
                >
                  <View style={styles.bigActionIconWrapSecondary}>
                  <Ionicons name="color-palette-outline" size={26} color={colors.primary} />
                  </View>
                  <Text style={styles.bigActionTitleSecondary}>עריכת סקיצה</Text>
                  <Text style={styles.bigActionSubtitleSecondary}>סידור שולחנות ועיצוב אולם</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="מפת הושבה"
                  onPress={handleSeatingMap}
                  style={({ hovered, pressed }: any) => [
                    styles.bigActionPrimary,
                    Platform.OS === 'web' && hovered ? styles.bigActionPrimaryHover : null,
                    pressed ? { opacity: 0.94 } : null,
                  ]}
                >
                  <View style={styles.bigActionBgBlob1} />
                  <View style={styles.bigActionBgBlob2} />
                  <View style={styles.bigActionIconWrapPrimary}>
                    <Ionicons name="grid-outline" size={26} color={colors.white} />
                  </View>
                  <Text style={styles.bigActionTitlePrimary}>מפת הושבה</Text>
                  <Text style={styles.bigActionSubtitlePrimary}>שיבוץ אורחים בשולחנות</Text>
                </Pressable>
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={() => setEditOpen(false)}
                style={styles.iconCircle}
              >
                <Ionicons name="close" size={18} color={'rgba(17,24,39,0.70)'} />
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.editTitle}>עריכת אירוע</Text>
                <Text style={styles.editSubtitle} numberOfLines={1}>
                  {eventType}
                </Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.editDivider} />

            <ScrollView contentContainerStyle={styles.editBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.editLabel}>תאריך האירוע</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="בחירת תאריך"
                onPress={() => setEditDatePickerOpen(true)}
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

              <Text style={[styles.editLabel, { marginTop: 12 }]}>מיקום</Text>
              <TextInput
                value={editForm.location}
                onChangeText={(t) => setEditForm((f) => ({ ...f, location: t }))}
                placeholder="מיקום"
                placeholderTextColor={'rgba(17,24,39,0.35)'}
                style={styles.textInput}
                textAlign="right"
              />

              <Text style={[styles.editLabel, { marginTop: 12 }]}>עיר</Text>
              <TextInput
                value={editForm.city}
                onChangeText={(t) => setEditForm((f) => ({ ...f, city: t }))}
                placeholder="עיר"
                placeholderTextColor={'rgba(17,24,39,0.35)'}
                style={styles.textInput}
                textAlign="right"
              />

              {isWedding ? (
                <>
                  <Text style={[styles.editLabel, { marginTop: 12 }]}>שם חתן</Text>
                  <TextInput
                    value={editForm.groomName}
                    onChangeText={(t) => setEditForm((f) => ({ ...f, groomName: t }))}
                    placeholder="שם החתן"
                    placeholderTextColor={'rgba(17,24,39,0.35)'}
                    style={styles.textInput}
                    textAlign="right"
                  />

                  <Text style={[styles.editLabel, { marginTop: 12 }]}>שם כלה</Text>
                  <TextInput
                    value={editForm.brideName}
                    onChangeText={(t) => setEditForm((f) => ({ ...f, brideName: t }))}
                    placeholder="שם הכלה"
                    placeholderTextColor={'rgba(17,24,39,0.35)'}
                    style={styles.textInput}
                    textAlign="right"
                  />
                </>
              ) : null}
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
                disabled={editSaving}
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
  scrollContent: { paddingTop: 18, paddingBottom: 130 },
  container: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 20 },
  grid: {
    // RTL desktop layout: right column (side) + left column (main)
    flexDirection: 'row-reverse',
    gap: 18,
    alignItems: 'stretch',
  },
  // On narrow screens show the side section first (top).
  gridNarrow: { flexDirection: 'column' as any },
  side: { width: 380, gap: 14 },
  sideNarrow: { width: '100%' as any },
  main: { flex: 1, minWidth: 0, gap: 14 },
  mainContent: { paddingBottom: 24, gap: 16 },

  primaryBtn: {
    flexDirection: 'row-reverse',
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
    height: 320,
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
  heroImg: { ...StyleSheet.absoluteFillObject },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroBottom: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  // Match screenshot: status on left, edit button on right
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroTitle: { marginTop: 8, fontSize: 24, fontWeight: '900', color: colors.white, textAlign: 'right' },
  heroMetaCol: { marginTop: 10, gap: 6 },
  heroMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
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
    flexDirection: 'row-reverse',
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
    flexDirection: 'row-reverse',
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
  quickActionsHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  quickActionBtn: {
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  quickActionBtnHover: { backgroundColor: 'rgba(15,69,230,0.06)', borderColor: 'rgba(15,69,230,0.14)' },
  quickActionLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  quickActionIcon: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  quickActionText: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', flex: 1 },
  quickActionChevron: { transform: [{ rotate: '180deg' }] },

  statsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  // Force 4 cards in a single row on wide screens (matches design)
  statsGridWide: {
    flexWrap: 'nowrap',
  },
  cardsRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
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
  statCardTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  statLabel: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  statIconCircle: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  statCardBottom: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 10 },
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
  panelHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  panelLink: { fontSize: 12, fontWeight: '900', color: '#3B82F6', textAlign: 'left' },
  totalChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,69,230,0.06)' },
  totalChipText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  progressRow: { flexDirection: 'row-reverse', gap: 12 },
  progressItem: { flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  progressCard: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    gap: 12,
  },
  progressHeader: { flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  progressHeaderRight: { alignItems: 'flex-end', gap: 4, flex: 1, minWidth: 0 },
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
  panelActionsRow: { flexDirection: 'row-reverse', gap: 10 },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  secondaryBtnText: { fontSize: 12, fontWeight: '900', color: colors.text },

  compactCardsRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
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

  bigActionsRow: { flexDirection: 'row-reverse', gap: 14, flexWrap: 'wrap' },
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

  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
  editCard: { width: '100%', maxWidth: 720, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', overflow: 'hidden', maxHeight: '88%' },
  editHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  iconCircle: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.06)', justifyContent: 'center', alignItems: 'center' },
  editTitle: { fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'center' },
  editSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.55)', textAlign: 'center' },
  editDivider: { height: 1, backgroundColor: 'rgba(17,24,39,0.08)', marginHorizontal: 16 },
  editBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
  editLabel: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  inputLike: { marginTop: 8, height: 52, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)', backgroundColor: 'rgba(17,24,39,0.04)', paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  inputLikeHover: { backgroundColor: 'rgba(17,24,39,0.06)' },
  inputLikeText: { fontSize: 15, fontWeight: '900', color: '#111827' },
  textInput: { marginTop: 8, height: 48, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)', backgroundColor: 'rgba(17,24,39,0.04)', color: '#111827', fontSize: 14, fontWeight: '700' },
  editFooter: { padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(17,24,39,0.08)', flexDirection: 'row-reverse', gap: 10, backgroundColor: 'rgba(255,255,255,0.98)' },
  footerBtnSecondary: { flex: 1, height: 50, borderRadius: 14, backgroundColor: 'rgba(17,24,39,0.06)', justifyContent: 'center', alignItems: 'center' },
  footerBtnSecondaryHover: { backgroundColor: 'rgba(17,24,39,0.08)' },
  footerBtnSecondaryText: { fontSize: 14, fontWeight: '900', color: '#111827' },
  footerBtnPrimary: { flex: 2, height: 50, borderRadius: 14, backgroundColor: '#1d4ed8', justifyContent: 'center', alignItems: 'center', flexDirection: 'row-reverse', gap: 8 },
  footerBtnPrimaryHover: { opacity: 0.95 },
  footerBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },
});

