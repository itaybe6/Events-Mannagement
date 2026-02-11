import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { colors } from '@/constants/colors';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { useEmployeeEventDetailsModel } from '@/features/events/useEmployeeEventDetailsModel';

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

export default function EmployeeEventDetailsWebScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const eventId = useMemo(() => (typeof id === 'string' ? id : Array.isArray(id) ? id[0] : ''), [id]);

  const { loading, event, userAvatarUrl, stats, refresh } = useEmployeeEventDetailsModel(eventId);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>טוען...</Text>
      </View>
    );
  }

  if (!eventId || !event) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.gray[600]} />
        <Text style={styles.errorTitle}>האירוע לא נמצא</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חזרה לרשימת אירועים"
          onPress={() => router.replace('/(employee)/employee-events')}
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

  const eventType = getEventTypeLabel(String(event.title ?? ''));
  const dateObj = new Date(event.date);
  const dateLabel = Number.isFinite(dateObj.getTime())
    ? dateObj.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <View style={styles.page}>
      <DesktopTopBar
        title={eventType}
        subtitle={dateLabel}
        leftActions={<TopBarIconButton icon="refresh" label="רענון" onPress={() => void refresh()} />}
      />

      <View style={styles.grid}>
        <View style={styles.side}>
          <View style={styles.heroCard}>
            <Image source={getHeroImageSource(String(event.title ?? ''))} style={styles.heroImg} contentFit="cover" />
            <View style={styles.heroOverlay} />
            <View style={styles.ownerRow}>
              <View style={styles.avatarRing}>
                {userAvatarUrl ? (
                  <Image source={{ uri: userAvatarUrl }} style={styles.avatarImg} contentFit="cover" transition={0} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons name="person" size={18} color={'rgba(13,17,28,0.65)'} />
                  </View>
                )}
              </View>
              <View style={styles.ownerText}>
                <Text style={styles.ownerName} numberOfLines={1}>
                  {String(event.title ?? '')}
                </Text>
                <Text style={styles.ownerMeta} numberOfLines={2}>
                  {String(event.location ?? '')}
                  {event.city ? `, ${event.city}` : ''}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.sideCard}>
            <Text style={styles.cardTitle}>פעולות צוות</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="אישורי הגעה"
              onPress={() => router.push(`/(employee)/employee-rsvp-approvals?eventId=${event.id}`)}
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
              accessibilityLabel="מפת הושבה"
              onPress={() => router.push(`/(employee)/employee-seating-map?eventId=${event.id}`)}
              style={({ hovered, pressed }: any) => [
                styles.actionBtn,
                Platform.OS === 'web' && hovered ? styles.actionBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="grid-outline" size={18} color={'#A855F7'} />
              <Text style={styles.actionBtnText}>מפת הושבה</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="צ׳ק-אין אורחים"
              onPress={() => router.push(`/(employee)/employee-guest-checkin?eventId=${event.id}`)}
              style={({ hovered, pressed }: any) => [
                styles.actionBtn,
                Platform.OS === 'web' && hovered ? styles.actionBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="checkbox-outline" size={18} color={colors.success} />
              <Text style={styles.actionBtnText}>צ׳ק-אין אורחים</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.main} contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
          <View style={styles.cardsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>מוזמנים</Text>
              <Text style={styles.statValue}>{stats.invitedPeople}</Text>
              <Text style={styles.statHint}>{`${stats.counts.total} רשומות`}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>הגיעו</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.checkedInCount}</Text>
              <Text style={styles.statHint}>{`${Math.max(0, stats.counts.total - stats.checkedInCount)} נשארו`}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>מושבים חופשיים</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>{stats.freeSeats}</Text>
              <Text style={styles.statHint}>{`סה״כ מושבים: ${stats.freeSeats + stats.seatedArrivedPeople}`}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>הושבה</Text>
              <Text style={styles.statValue}>{`${stats.seatedPercent}%`}</Text>
              <Text style={styles.statHint}>{`הושבו: ${stats.seatedArrivedPeople}`}</Text>
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>צ׳ק-אין</Text>
              <Text style={styles.panelSubtitle}>{`הגיעו ${stats.checkedInCount} מתוך ${stats.counts.total}`}</Text>
            </View>
            <View style={styles.progressRow}>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>מאושרים שהגיעו</Text>
                <Text style={styles.progressValue}>{`${stats.checkedInConfirmedCount}/${stats.counts.coming}`}</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>לא מאושרים שהגיעו</Text>
                <Text style={styles.progressValue}>{`${stats.checkedInNotConfirmedCount}/${stats.notConfirmedTotal}`}</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>לא הושבו (שהגיעו)</Text>
                <Text style={styles.progressValue}>{stats.arrivedNotSeatedPeople}</Text>
              </View>
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>שולחנות</Text>
              <Text style={styles.panelSubtitle}>
                {`${stats.tableStats.fullRegular}/${stats.tableStats.totalRegular} מלאים`}
              </Text>
            </View>
            <View style={styles.progressRow}>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>רגילים</Text>
                <Text style={styles.progressValue}>{stats.tableStats.totalRegular}</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>לא מלאים</Text>
                <Text style={styles.progressValue}>{stats.tableStats.notFullRegular}</Text>
              </View>
              <View style={styles.progressItem}>
                <Text style={styles.progressLabel}>רזרבה פתוחים</Text>
                <Text style={styles.progressValue}>{stats.tableStats.openedReserve}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 14, fontWeight: '800', color: colors.gray[600] },
  errorTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },

  primaryBtn: {
    marginTop: 12,
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

  grid: { flex: 1, flexDirection: 'row-reverse', gap: 16, paddingTop: 16, alignItems: 'stretch' },
  side: { width: 380, gap: 16 },
  main: { flex: 1, minWidth: 0 },
  mainContent: { paddingBottom: 24, gap: 16 },

  heroCard: {
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: colors.white,
    position: 'relative',
  },
  heroImg: { ...StyleSheet.absoluteFillObject },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.30)' },
  ownerRow: { position: 'absolute', left: 14, right: 14, bottom: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  avatarRing: { width: 52, height: 52, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,69,230,0.08)' },
  ownerText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  ownerName: { fontSize: 14, fontWeight: '900', color: colors.white, textAlign: 'right' },
  ownerMeta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.88)', textAlign: 'right' },

  sideCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', padding: 14, gap: 10 },
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
  statCard: { flexGrow: 1, flexBasis: 240, minWidth: 220, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', padding: 14 },
  statLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  statValue: { marginTop: 8, fontSize: 28, fontWeight: '900', color: colors.text, textAlign: 'right' },
  statHint: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },

  panel: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', padding: 14, gap: 12 },
  panelHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelSubtitle: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'left' },
  progressRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
  progressItem: { flexGrow: 1, flexBasis: 260, minWidth: 220, borderRadius: 14, padding: 12, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  progressLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  progressValue: { marginTop: 6, fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'right' },
});

