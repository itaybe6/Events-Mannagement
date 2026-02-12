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
import { Image } from 'expo-image';
import { Picker } from '@react-native-picker/picker';

import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { Event } from '@/types';
import { MONTHS } from '@/features/events/eventsConstants';
import { useEventsListModel } from '@/features/events/useEventsListModel';

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

function formatDateLabel(date: Date | string) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatDay(date: Date | string) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit' });
}

function formatMonthYear(date: Date | string) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

function daysLeftLabel(date: Date | string) {
  const today = new Date();
  const d = new Date(date);
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? `עוד ${diff} ימים` : 'עבר';
}

function getEventSubtitle(e: Event) {
  const g = String(e.groomName ?? '').trim();
  const b = String(e.brideName ?? '').trim();
  if (g && b) return `${g} & ${b}`;
  return [e.city, e.location].filter(Boolean).join(' · ');
}

function initialsLabel(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[1]?.[0] ?? '' : '';
  return (a + b).toUpperCase() || 'U';
}

function getStatusMeta(date: Date | string) {
  const today = new Date();
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) {
    return { label: 'טיוטה', tone: 'draft' as const };
  }
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: 'הסתיים', tone: 'past' as const };
  if (diff <= 7) return { label: 'פעיל', tone: 'active' as const };
  if (diff <= 30) return { label: 'בתכנון', tone: 'planning' as const };
  return { label: 'טיוטה', tone: 'draft' as const };
}

export default function AdminEventsWebScreen() {
  const router = useRouter();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadEventsFn = useMemo(() => async () => {
    const data = await eventService.getEvents();
    return Array.isArray(data) ? (data as Event[]) : [];
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
      <View style={styles.filterBarOuter}>
        <View style={styles.filterBar}>
          <View style={styles.filterBarLeft}>
            <View style={styles.filterLabelRow}>
              <Ionicons name="filter" size={18} color={colors.primary} />
              <Text style={styles.filterLabel}>סינון</Text>
            </View>
            <View style={styles.filterDivider} />

            <View style={styles.searchWrapInline}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIconInline} />
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

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="בחירת תאריך"
              onPress={() => setShowDatePicker(true)}
              style={({ hovered, pressed }: any) => [
                styles.dateBtn,
                Platform.OS === 'web' && hovered ? styles.dateBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.text} />
              <Text style={styles.dateBtnText}>
                {filterDate ? filterDate.toLocaleDateString('he-IL') : 'בחירת תאריך'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.filterBarRight}>
            <View style={styles.selectWrap}>
              <Picker
                selectedValue={sortOrder}
                onValueChange={(value) => setSortOrder(value as any)}
                style={styles.picker}
                dropdownIconColor={colors.gray[600]}
              >
                <Picker.Item label="תאריך (חדש)" value="desc" />
                <Picker.Item label="תאריך (ישן)" value="asc" />
              </Picker>
            </View>

            <View style={styles.selectWrap}>
              <Picker
                selectedValue={filterDate ? '' : filterMonth}
                onValueChange={(value) => {
                  const v = String(value ?? '');
                  setFilterMonth(v);
                  setFilterDate(null);
                }}
                style={styles.picker}
                dropdownIconColor={colors.gray[600]}
              >
                <Picker.Item label="כל החודשים" value="" />
                {MONTHS.map((m, i) => (
                  <Picker.Item key={m} label={m} value={String(i)} />
                ))}
              </Picker>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="איפוס סינון"
              onPress={() => {
                setQuery('');
                setFilterDate(null);
                setFilterMonth('');
                setSortOrder('asc');
              }}
              style={({ hovered, pressed }: any) => [
                styles.resetBtn,
                Platform.OS === 'web' && hovered ? styles.resetBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Text style={styles.resetBtnText}>איפוס</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.contentRow}>
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 64, textAlign: 'center' }]}>תמונה</Text>
            <Text style={[styles.th, { width: 160 }]}>לקוח</Text>
            <Text style={[styles.th, { width: 110 }]}>תאריך</Text>
            <Text style={[styles.th, { flex: 1 }]}>כותרת</Text>
            <Text style={[styles.th, { flex: 1 }]}>מיקום</Text>
            <Text style={[styles.th, { width: 120 }]}>זמן</Text>
            <Text style={[styles.th, { width: 110, textAlign: 'center' }]}>סטטוס</Text>
            <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>פעולה</Text>
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
            <ScrollView
              style={styles.rowsScroll}
              contentContainerStyle={styles.rowsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredEvents.map((e) => {
                const ownerName = String((e as any).userName || e.userName || '').trim();
                const ownerAvatar = String((e as any).userAvatarUrl || e.userAvatarUrl || '').trim();
                const subtitle = getEventSubtitle(e);
                const status = getStatusMeta(e.date);
                const statusToneStyle =
                  status.tone === 'active'
                    ? styles.statusPillActive
                    : status.tone === 'planning'
                      ? styles.statusPillPlanning
                      : status.tone === 'past'
                        ? styles.statusPillPast
                        : styles.statusPillDraft;

                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityLabel={`פתיחת אירוע ${e.title}`}
                    onPress={() => router.push({ pathname: '/(admin)/admin-event-details', params: { id: e.id } })}
                    style={({ hovered, pressed }: any) => [
                      styles.tr,
                      Platform.OS === 'web' && hovered ? styles.trHover : null,
                      pressed ? { opacity: 0.96 } : null,
                    ]}
                  >
                    <View style={[styles.cell, { width: 64, alignItems: 'center' }]}>
                      <View style={styles.avatarRing}>
                        {ownerAvatar ? (
                          <Image
                            source={{ uri: ownerAvatar }}
                            style={styles.avatarImg}
                            contentFit="cover"
                            transition={0}
                          />
                        ) : ownerName ? (
                          <View style={styles.avatarFallback}>
                            <Text style={styles.avatarInitials}>{initialsLabel(ownerName)}</Text>
                          </View>
                        ) : (
                          <View style={styles.avatarFallback}>
                            <Ionicons name="person" size={16} color={'rgba(13,17,28,0.65)'} />
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={[styles.cell, { width: 160 }]}>
                      <Text style={styles.ownerName} numberOfLines={1}>
                        {ownerName || '—'}
                      </Text>
                    </View>

                    <View style={[styles.cell, { width: 110 }]}>
                      <Text style={styles.dateDay}>{formatDay(e.date)}</Text>
                      <Text style={styles.dateMonth}>{formatMonthYear(e.date)}</Text>
                    </View>

                    <View style={[styles.cell, { flex: 1 }]}>
                      <View style={styles.titleTexts}>
                        <Text style={styles.titleMain} numberOfLines={1}>
                          {e.title}
                        </Text>
                        <Text style={styles.titleSub} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.tdText, { flex: 1 }]} numberOfLines={1}>
                      {e.location}
                      {e.city ? `, ${e.city}` : ''}
                    </Text>

                    <View style={[styles.cell, { width: 120 }]}>
                      <Text style={styles.timeMain}>{daysLeftLabel(e.date)}</Text>
                      <Text style={styles.timeSub}>{formatDateLabel(e.date)}</Text>
                    </View>

                    <View style={[styles.cell, { width: 110, alignItems: 'center' }]}>
                      <View style={[styles.statusPill, statusToneStyle]}>
                        <Text style={styles.statusPillText}>{status.label}</Text>
                      </View>
                    </View>

                    <View style={[styles.cell, { width: 90, alignItems: 'center' }]}>
                      <View style={styles.openPill}>
                        <Ionicons name="open-outline" size={14} color={colors.primary} />
                        <Text style={styles.openPillText}>פתח</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.tableFooter}>
            <Text style={styles.tableFooterText}>מציג {filteredEvents.length} אירועים</Text>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="יצירת אירוע חדש"
        onPress={() => router.push('/(admin)/admin-events-create')}
        style={({ hovered, pressed }: any) => [
          styles.fabCreate,
          Platform.OS === 'web' && hovered ? styles.fabCreateHover : null,
          pressed ? { opacity: 0.92 } : null,
        ]}
      >
        <Ionicons name="add" size={20} color={colors.white} />
        <Text style={styles.fabCreateText}>אירוע חדש</Text>
      </Pressable>

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
  page: {
    flex: 1,
    backgroundColor: '#f6f7f9',
  },
  header: {
    height: 96,
    paddingHorizontal: 32,
    // RTL is already applied at the document level; using `row-reverse` here
    // causes a double-flip on web. `row` keeps title on the right and actions on the left.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerTitles: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnHover: {
    backgroundColor: 'rgba(15,23,42,0.03)',
  },
  iconBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: colors.white,
  },
  primaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnHover: {
    opacity: 0.95,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  filterBarOuter: {
    paddingHorizontal: 32,
    paddingBottom: 16,
    paddingTop: 18,
  },
  filterBar: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  filterBarLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  filterBarRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  filterLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  filterDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(15,23,42,0.10)',
    marginHorizontal: 6,
  },
  searchWrapInline: {
    height: 42,
    minWidth: 260,
    flexGrow: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  searchIconInline: { position: 'absolute', right: 12 },
  searchInput: {
    paddingRight: 40,
    paddingLeft: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  dateBtn: {
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  dateBtnHover: {
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  dateBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  selectWrap: {
    height: 42,
    minWidth: 160,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  picker: {
    height: 42,
    width: '100%',
    color: colors.text,
  },
  resetBtn: {
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnHover: {
    backgroundColor: 'rgba(15,69,230,0.12)',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  contentRow: {
    flex: 1,
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  tableCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(15,23,42,0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    gap: 10,
  },
  th: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
  },
  rowsScroll: {
    flex: 1,
  },
  rowsScrollContent: {
    paddingBottom: 90, // internal space so last row isn't hidden by FAB
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(255,255,255,1)',
    gap: 10,
  },
  trHover: {
    backgroundColor: 'rgba(15,69,230,0.04)',
  },
  td: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  cell: { minWidth: 0 },
  tdText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
  },
  dateDay: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    lineHeight: 22,
  },
  dateMonth: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  titleCell: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  titleTexts: { flex: 1, minWidth: 0 },
  titleMain: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  titleSub: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  ownerCell: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  avatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(6,23,62,0.18)',
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  ownerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    flex: 1,
    minWidth: 0,
  },
  timeMain: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  timeSub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusPillActive: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: 'rgba(34,197,94,0.30)',
  },
  statusPillPlanning: {
    backgroundColor: 'rgba(234,179,8,0.16)',
    borderColor: 'rgba(234,179,8,0.30)',
  },
  statusPillPast: {
    backgroundColor: 'rgba(148,163,184,0.18)',
    borderColor: 'rgba(148,163,184,0.30)',
  },
  statusPillDraft: {
    backgroundColor: 'rgba(148,163,184,0.18)',
    borderColor: 'rgba(148,163,184,0.30)',
  },
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
  openPillText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
  },
  loadingRow: {
    flex: 1,
    paddingVertical: 34,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[600],
  },
  emptyRow: {
    flex: 1,
    paddingVertical: 34,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'center',
  },
  tableFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableFooterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  fabCreate: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    left: 24,
    bottom: 24,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    zIndex: 50,
  },
  fabCreateHover: {
    opacity: 0.96,
  },
  fabCreateText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
});

