import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';
import {
  RSVP_BUCKET_LABELS,
  arrivedPeople,
  invitedPeople,
  isConfirmedGuest,
  rsvpBucket,
  rsvpBucketLabel,
  type CoupleReportCategory,
  type CoupleReportGuest,
  type RsvpBucket,
} from '@/lib/coupleReports';
import { guestMatchesSearch } from '@/lib/guestPhone';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';

type ReportKind = 'checkin' | 'rsvp';
type CheckInFilter = 'all' | 'arrived' | 'missing';
type RsvpFilter = 'all' | RsvpBucket;

export default function CoupleReportsScreen() {
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const [loading, setLoading] = useState(true);
  const [eventTitle, setEventTitle] = useState('');
  const [guests, setGuests] = useState<CoupleReportGuest[]>([]);
  const [categories, setCategories] = useState<CoupleReportCategory[]>([]);
  const [kind, setKind] = useState<ReportKind>('checkin');
  const [checkInFilter, setCheckInFilter] = useState<CheckInFilter>('all');
  const [rsvpFilter, setRsvpFilter] = useState<RsvpFilter>('all');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!resolvedEventId) {
        setGuests([]);
        setLoading(false);
        return;
      }
      if (userData?.id) setActiveEvent(userData.id, resolvedEventId);
      setLoading(true);
      try {
        const [evt, rows, cats] = await Promise.all([
          eventService.getEventLite(resolvedEventId),
          guestService.getGuests(resolvedEventId),
          guestService.getGuestCategories(resolvedEventId),
        ]);
        if (cancelled) return;
        setEventTitle(String((evt as any)?.title || '').trim());
        setGuests(rows || []);
        setCategories((cats || []).map((c: any) => ({ id: String(c.id), name: String(c.name || ''), side: c.side ?? null })));
      } catch (error) {
        console.error('Couple reports load error:', error);
        if (!cancelled) setGuests([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [resolvedEventId, setActiveEvent, userData?.id]);

  const confirmers = useMemo(() => guests.filter(isConfirmedGuest), [guests]);
  const visible = useMemo(() => {
    const source = kind === 'checkin' ? confirmers : guests;
    return source.filter((guest) => {
      if (query.trim() && !guestMatchesSearch(guest, query)) return false;
      if (kind === 'checkin') {
        if (checkInFilter === 'arrived') return Boolean(guest.checkedIn);
        if (checkInFilter === 'missing') return !guest.checkedIn;
        return true;
      }
      if (rsvpFilter === 'all') return true;
      return rsvpBucket(guest.status) === rsvpFilter;
    });
  }, [checkInFilter, confirmers, guests, kind, query, rsvpFilter]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    if (Platform.OS !== 'web') {
      Alert.alert('ייצוא אקסל', 'ייצוא לאקסל זמין בממשק הווב.');
      return;
    }
    if (kind === 'checkin' && !confirmers.length) {
      Alert.alert('אין נתונים לייצוא', 'עדיין אין מאשרים באירוע.');
      return;
    }
    if (kind === 'rsvp' && !guests.length) {
      Alert.alert('אין נתונים לייצוא', 'עדיין אין מוזמנים באירוע.');
      return;
    }
    setExporting(true);
    try {
      const mod = await import('@/lib/exportCoupleReportsExcel');
      if (kind === 'checkin') mod.exportCheckInReportToExcel(guests, { eventTitle, categories });
      else mod.exportRsvpReportToExcel(guests, { eventTitle, categories });
    } catch (error) {
      console.error('Couple reports excel export error:', error);
      Alert.alert('שגיאה', 'אירעה תקלה בייצוא לאקסל.');
    } finally {
      setExporting(false);
    }
  }, [categories, confirmers.length, eventTitle, exporting, guests, kind]);

  return (
    <View style={styles.page}>
      <Text style={styles.title}>דוחות</Text>
      <Text style={styles.subtitle}>צ׳ק אין של מאשרים ואישורי הגעה</Text>

      <View style={styles.kindRow}>
        <Pressable onPress={() => setKind('checkin')} style={[styles.kindBtn, kind === 'checkin' && styles.kindBtnOn]}>
          <Text style={[styles.kindText, kind === 'checkin' && styles.kindTextOn]}>צ׳ק אין</Text>
        </Pressable>
        <Pressable onPress={() => setKind('rsvp')} style={[styles.kindBtn, kind === 'rsvp' && styles.kindBtnOn]}>
          <Text style={[styles.kindText, kind === 'rsvp' && styles.kindTextOn]}>אישורי הגעה</Text>
        </Pressable>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.gray[500]} />
        <TextInput
          style={styles.searchInput}
          placeholder="חיפוש שם או טלפון"
          placeholderTextColor={colors.gray[500]}
          value={query}
          onChangeText={setQuery}
          textAlign="right"
        />
      </View>

      <View style={styles.filterRow}>
        {kind === 'checkin'
          ? (
              [
                { key: 'all', label: 'הכל' },
                { key: 'arrived', label: 'הגיעו' },
                { key: 'missing', label: 'לא הגיעו' },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => setCheckInFilter(opt.key)}
                style={[styles.filter, checkInFilter === opt.key && styles.filterOn]}
              >
                <Text style={[styles.filterText, checkInFilter === opt.key && styles.filterTextOn]}>{opt.label}</Text>
              </Pressable>
            ))
          : (
              [
                { key: 'all', label: 'הכל' },
                { key: 'confirmed', label: RSVP_BUCKET_LABELS.confirmed },
                { key: 'declined', label: RSVP_BUCKET_LABELS.declined },
                { key: 'pending', label: RSVP_BUCKET_LABELS.pending },
                { key: 'maybe', label: RSVP_BUCKET_LABELS.maybe },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => setRsvpFilter(opt.key)}
                style={[styles.filter, rsvpFilter === opt.key && styles.filterOn]}
              >
                <Text style={[styles.filterText, rsvpFilter === opt.key && styles.filterTextOn]}>{opt.label}</Text>
              </Pressable>
            ))}
      </View>

      <Pressable onPress={() => void handleExport()} style={styles.exportBtn} disabled={exporting}>
        {exporting ? <ActivityIndicator size={16} color={colors.white} /> : <Ionicons name="download-outline" size={16} color={colors.white} />}
        <Text style={styles.exportText}>{exporting ? 'מייצא…' : 'ייצוא אקסל'}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>אין שורות להצגה</Text>
        ) : (
          visible.map((guest) => {
            const people = kind === 'checkin' && guest.checkedIn ? arrivedPeople(guest) : invitedPeople(guest);
            const status = kind === 'checkin' ? (guest.checkedIn ? 'הגיע' : 'לא הגיע') : rsvpBucketLabel(guest.status);
            return (
              <View key={guest.id || guest.name} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {guest.name}
                  </Text>
                  <Text style={styles.meta}>
                    {status} · {people} אורחים
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7FAFF', padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  subtitle: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: { flex: 1, borderRadius: 14, paddingVertical: 10, backgroundColor: 'rgba(6,23,62,0.06)', alignItems: 'center' },
  kindBtnOn: { backgroundColor: colors.primary },
  kindText: { fontWeight: '800', color: colors.primary, fontSize: 13 },
  kindTextOn: { color: colors.white },
  search: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    paddingHorizontal: 12,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.primary },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(6,23,62,0.06)' },
  filterOn: { backgroundColor: colors.primary },
  filterText: { fontWeight: '800', fontSize: 12, color: colors.primary },
  filterTextOn: { color: colors.white },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  exportText: { color: colors.white, fontWeight: '800' },
  list: { gap: 8, paddingBottom: 28 },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
  },
  name: { fontSize: 15, fontWeight: '800', color: colors.primary, textAlign: 'right' },
  meta: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.gray[600], textAlign: 'right' },
  empty: { marginTop: 32, textAlign: 'center', color: colors.gray[500], fontWeight: '700' },
});
