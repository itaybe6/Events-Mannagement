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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import { colors } from '@/constants/colors';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
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

export default function AdminEventDetailsWebScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
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

  return (
    <View style={styles.page}>
      <DesktopTopBar
        title={eventType}
        subtitle={userName ? `לקוח: ${userName}` : undefined}
        leftActions={<TopBarIconButton icon="refresh" label="רענון" onPress={() => void refresh()} />}
        rightActions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="עריכת אירוע"
            onPress={openEditEvent}
            style={({ hovered, pressed }: any) => [
              styles.primaryBtn,
              Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Ionicons name="create-outline" size={18} color={colors.white} />
            <Text style={styles.primaryBtnText}>עריכת אירוע</Text>
          </Pressable>
        }
      />

      <View style={styles.grid}>
        {/* Side summary */}
        <View style={styles.side}>
          <View style={styles.heroCard}>
            <Image source={getHeroImageSource(String(event.title ?? ''))} style={styles.heroImg} contentFit="cover" />
            <View style={styles.heroOverlay} />

            <View style={styles.ownerRow}>
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

              <View style={styles.ownerText}>
                <Text style={styles.ownerName} numberOfLines={1}>
                  {userName || 'לקוח'}
                </Text>
                <Text style={styles.ownerMeta} numberOfLines={2}>
                  {dateLabel}
                </Text>
                <Text style={styles.ownerMeta} numberOfLines={2}>
                  {String(event.location ?? '')}
                  {event.city ? `, ${event.city}` : ''}
                </Text>
              </View>
            </View>

            {isWedding ? (
              <View style={styles.weddingRow}>
                <Ionicons name="heart-outline" size={16} color={'rgba(255,255,255,0.92)'} />
                <Text style={styles.weddingText} numberOfLines={1}>
                  {`חתן: ${(event as any).groomName || 'לא הוזן'} | כלה: ${(event as any).brideName || 'לא הוזן'}`}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sideCard}>
            <Text style={styles.cardTitle}>פעולות מהירות</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="פתיחת אישורי הגעה"
              onPress={() => router.push(`/(admin)/admin-rsvp-approvals?eventId=${event.id}`)}
              style={({ hovered, pressed }: any) => [
                styles.actionBtn,
                Platform.OS === 'web' && hovered ? styles.actionBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="people-outline" size={18} color={colors.primary} />
              <Text style={styles.actionBtnText}>אישורי הגעה</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="עריכת סקיצה"
              onPress={() => router.push(`/(admin)/seating-templates?eventId=${event.id}`)}
              style={({ hovered, pressed }: any) => [
                styles.actionBtn,
                Platform.OS === 'web' && hovered ? styles.actionBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="create-outline" size={18} color={'#F97316'} />
              <Text style={styles.actionBtnText}>עריכת סקיצה</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="מפת הושבה"
              onPress={handleSeatingMap}
              style={({ hovered, pressed }: any) => [
                styles.actionBtn,
                Platform.OS === 'web' && hovered ? styles.actionBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="grid-outline" size={18} color={'#A855F7'} />
              <Text style={styles.actionBtnText}>מפת הושבה</Text>
            </Pressable>
          </View>
        </View>

        {/* Main column */}
        <ScrollView style={styles.main} contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
          <View style={styles.cardsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>מוזמנים</Text>
              <Text style={styles.statValue}>{stats.invitedPeople}</Text>
              <Text style={styles.statHint}>{`${guests.length} רשומות`}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>אישרו</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.confirmedPeople}</Text>
              <Text style={styles.statHint}>אנשים</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>ממתינים</Text>
              <Text style={[styles.statValue, { color: colors.warning }]}>{stats.pendingPeople}</Text>
              <Text style={styles.statHint}>אנשים</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>לא מגיעים</Text>
              <Text style={[styles.statValue, { color: colors.error }]}>{stats.declinedPeople}</Text>
              <Text style={styles.statHint}>אנשים</Text>
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>סטטוס אורחים</Text>
              <View style={styles.totalChip}>
                <Text style={styles.totalChipText}>{`${stats.totalGuests} סה״כ`}</Text>
              </View>
            </View>

            <View style={styles.progressRow}>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>אישרו</Text>
                <Text style={styles.progressValue}>{stats.confirmed}</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>ממתינים</Text>
                <Text style={styles.progressValue}>{stats.pending}</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>לא</Text>
                <Text style={styles.progressValue}>{stats.declined}</Text>
              </View>
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>הושבה</Text>
              <Text style={styles.panelSubtitle}>{`${stats.seatedPercent}% הושבו`}</Text>
            </View>

            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, stats.seatedPercent))}%` }]} />
            </View>

            <View style={styles.panelActionsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="פתיחת עריכת סקיצה"
                onPress={() => router.push(`/(admin)/seating-templates?eventId=${event.id}`)}
                style={({ hovered, pressed }: any) => [
                  styles.secondaryBtn,
                  Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="create-outline" size={16} color={colors.text} />
                <Text style={styles.secondaryBtnText}>עריכת סקיצה</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="פתיחת מפת הושבה"
                onPress={handleSeatingMap}
                style={({ hovered, pressed }: any) => [
                  styles.secondaryBtn,
                  Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="grid-outline" size={16} color={colors.text} />
                <Text style={styles.secondaryBtnText}>מפת הושבה</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>

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
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 14, fontWeight: '800', color: colors.gray[600] },
  errorTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  grid: {
    flex: 1,
    flexDirection: 'row-reverse',
    gap: 16,
    paddingTop: 16,
    alignItems: 'stretch',
  },
  side: { width: 380, gap: 16 },
  main: { flex: 1, minWidth: 0 },
  mainContent: { paddingBottom: 24, gap: 16 },

  primaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnHover: { opacity: 0.95 },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },

  heroCard: {
    height: 260,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: colors.white,
    position: 'relative',
  },
  heroImg: { ...StyleSheet.absoluteFillObject },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.30)' },
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
    width: 58,
    height: 58,
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
  cardTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },
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

  cardsRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
  statCard: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
  },
  statLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  statValue: { marginTop: 8, fontSize: 28, fontWeight: '900', color: colors.text, textAlign: 'right' },
  statHint: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },

  panel: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    gap: 12,
  },
  panelHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelSubtitle: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'left' },
  totalChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,69,230,0.06)' },
  totalChipText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  progressRow: { flexDirection: 'row-reverse', gap: 12 },
  progressItem: { flex: 1, borderRadius: 14, padding: 12, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  progressLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  progressValue: { marginTop: 6, fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'right' },

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

