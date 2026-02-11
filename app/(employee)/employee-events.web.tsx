import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import { colors } from '@/constants/colors';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { supabase } from '@/lib/supabase';
import { Event } from '@/types';
import { MONTHS } from '@/features/events/eventsConstants';
import { useEventsListModel } from '@/features/events/useEventsListModel';

function formatDateLabel(date: Date | string) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function daysLeftLabel(date: Date | string) {
  const today = new Date();
  const d = new Date(date);
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? `עוד ${diff} ימים` : 'עבר';
}

export default function EmployeeEventsWebScreen() {
  const router = useRouter();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadEventsFn = useMemo(() => async () => {
    const { data, error } = await supabase
      .from('events')
      .select(
        'id,title,date,location,city,story,guests_count,budget,groom_name,bride_name,rsvp_link,user_id,user:users(name,avatar_url)'
      )
      .order('date', { ascending: true });

    if (error) throw error;

    const mapped: Event[] = (data || []).map((e: any) => ({
      id: e.id,
      title: e.title,
      date: new Date(e.date),
      location: e.location || '',
      city: e.city || '',
      image: '',
      story: e.story || '',
      guests: e.guests_count || 0,
      budget: Number(e.budget) || 0,
      groomName: e.groom_name ?? undefined,
      brideName: e.bride_name ?? undefined,
      rsvpLink: e.rsvp_link ?? undefined,
      tasks: [],
      user_id: e.user_id ?? undefined,
      userName: e.user?.name ?? undefined,
      userAvatarUrl: e.user?.avatar_url ?? undefined,
    }));

    return mapped;
  }, []);

  const {
    loading,
    query,
    setQuery,
    filterDate,
    setFilterDate,
    filterMonth,
    setFilterMonth,
    sortOrder,
    setSortOrder,
    refresh,
    filteredEvents,
  } = useEventsListModel(loadEventsFn, { errorTitle: 'שגיאה', errorMessage: 'לא ניתן לטעון אירועים כרגע' });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={styles.page}>
      <DesktopTopBar
        title="אירועים"
        subtitle="צפייה וניהול אירועים"
        rightActions={null}
        leftActions={<TopBarIconButton icon="refresh" label="רענון" onPress={() => void refresh()} />}
      />

      <View style={styles.contentRow}>
        <View style={styles.main}>
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: 110 }]}>תאריך</Text>
              <Text style={[styles.th, { flex: 1 }]}>כותרת</Text>
              <Text style={[styles.th, { flex: 1 }]}>מיקום</Text>
              <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>אורחים</Text>
              <Text style={[styles.th, { width: 120 }]}>זמן</Text>
              <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>פתיחה</Text>
            </View>

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>טוען אירועים...</Text>
              </View>
            ) : filteredEvents.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="calendar-outline" size={42} color={colors.gray[500]} />
                <Text style={styles.emptyTitle}>לא נמצאו אירועים</Text>
                <Text style={styles.emptyText}>נסה לשנות את החיפוש או הסינון</Text>
              </View>
            ) : (
              filteredEvents.map((e) => (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityLabel={`פתיחת אירוע ${e.title}`}
                  onPress={() =>
                    router.push({ pathname: '/(employee)/employee-event-details', params: { id: e.id } })
                  }
                  style={({ hovered, pressed }: any) => [
                    styles.tr,
                    Platform.OS === 'web' && hovered ? styles.trHover : null,
                    pressed ? { opacity: 0.96 } : null,
                  ]}
                >
                  <Text style={[styles.td, { width: 110 }]}>{formatDateLabel(e.date)}</Text>
                  <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                    {e.location}
                    {e.city ? `, ${e.city}` : ''}
                  </Text>
                  <Text style={[styles.td, { width: 90, textAlign: 'center' }]}>
                    {typeof (e as any).guests === 'number' && (e as any).guests > 0 ? (e as any).guests : '—'}
                  </Text>
                  <Text style={[styles.td, { width: 120 }]}>{daysLeftLabel(e.date)}</Text>
                  <View style={[styles.td, { width: 90, alignItems: 'center' }]}>
                    <View style={styles.openPill}>
                      <Ionicons name="open-outline" size={14} color={colors.primary} />
                      <Text style={styles.openPillText}>פתח</Text>
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </View>

        <View style={styles.filters}>
          <View style={styles.filterCard}>
            <Text style={styles.filterTitle}>חיפוש וסינון</Text>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש אירוע..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign="right"
                returnKeyType="search"
              />
            </View>

            <View style={styles.filterBtnRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="בחירת תאריך"
                onPress={() => setShowDatePicker(true)}
                style={({ hovered, pressed }: any) => [
                  styles.filterBtn,
                  Platform.OS === 'web' && hovered ? styles.filterBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.text} />
                <Text style={styles.filterBtnText}>
                  {filterDate ? filterDate.toLocaleDateString('he-IL') : 'בחירת תאריך'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שינוי סדר מיון"
                onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                style={({ hovered, pressed }: any) => [
                  styles.filterBtn,
                  Platform.OS === 'web' && hovered ? styles.filterBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="swap-vertical" size={16} color={colors.text} />
                <Text style={styles.filterBtnText}>{sortOrder === 'asc' ? 'תאריך עולה' : 'תאריך יורד'}</Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            <Text style={styles.filterSectionTitle}>חודשים</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.monthsList}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סינון: הכל"
                onPress={() => {
                  setFilterMonth('');
                  setFilterDate(null);
                }}
                style={({ hovered, pressed }: any) => [
                  styles.monthItem,
                  !filterMonth && !filterDate ? styles.monthItemActive : null,
                  Platform.OS === 'web' && hovered ? styles.monthItemHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Text style={[styles.monthItemText, !filterMonth && !filterDate ? styles.monthItemTextActive : null]}>
                  הכל
                </Text>
              </Pressable>

              {MONTHS.map((m, i) => {
                const active = filterMonth === String(i) && !filterDate;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    accessibilityLabel={`סינון חודש ${m}`}
                    onPress={() => {
                      setFilterMonth(String(i));
                      setFilterDate(null);
                    }}
                    style={({ hovered, pressed }: any) => [
                      styles.monthItem,
                      active ? styles.monthItemActive : null,
                      Platform.OS === 'web' && hovered ? styles.monthItemHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={[styles.monthItemText, active ? styles.monthItemTextActive : null]}>{m}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filterDate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ניקוי סינון תאריך"
                onPress={() => setFilterDate(null)}
                style={({ hovered, pressed }: any) => [
                  styles.clearBtn,
                  Platform.OS === 'web' && hovered ? styles.clearBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="close" size={16} color={colors.gray[700]} />
                <Text style={styles.clearBtnText}>ניקוי תאריך</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="date"
        onConfirm={(date) => {
          setShowDatePicker(false);
          setFilterDate(date as Date);
          setFilterMonth('');
        }}
        onCancel={() => setShowDatePicker(false)}
        minimumDate={new Date()}
        locale="he-IL"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  contentRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    gap: 16,
    paddingTop: 16,
    alignItems: 'flex-start',
  },
  main: { flex: 1, minWidth: 0 },
  filters: { width: 340 },
  tableCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    gap: 10,
  },
  th: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  tr: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    gap: 10,
  },
  trHover: { backgroundColor: 'rgba(15,23,42,0.03)' },
  td: { fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'right' },
  openPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  openPillText: { fontSize: 11, fontWeight: '900', color: colors.primary },
  loadingRow: { paddingVertical: 34, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },
  emptyRow: { paddingVertical: 34, paddingHorizontal: 16, alignItems: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
  filterCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
  },
  filterTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },
  searchWrap: {
    marginTop: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: 12 },
  searchInput: { paddingLeft: 40, paddingRight: 12, fontSize: 14, fontWeight: '800', color: colors.text },
  filterBtnRow: { marginTop: 12, gap: 10 },
  filterBtn: {
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  filterBtnHover: { backgroundColor: 'rgba(15,23,42,0.03)' },
  filterBtnText: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right' },
  divider: { height: 1, backgroundColor: 'rgba(15,23,42,0.08)', marginTop: 14, marginBottom: 12 },
  filterSectionTitle: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', marginBottom: 8 },
  monthsList: { paddingBottom: 10, gap: 8 },
  monthItem: {
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  monthItemHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  monthItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  monthItemText: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  monthItemTextActive: { color: colors.white },
  clearBtn: {
    marginTop: 8,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  clearBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  clearBtnText: { fontSize: 12, fontWeight: '900', color: colors.gray[700] },
});

