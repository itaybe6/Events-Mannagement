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
import { useRouter } from 'expo-router';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Image } from 'expo-image';
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { supabase } from '@/lib/supabase';
import { Event } from '@/types';
import { inferEventType, MONTHS } from '@/features/events/eventsConstants';
import { useEventsListModel } from '@/features/events/useEventsListModel';
import AdminEventsScreen from './admin-events';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { userService, type UserWithMetadata } from '@/lib/services/userService';
import { useUserStore } from '@/store/userStore';
import { rtlText } from '@/lib/rtl';

const HERO_IMAGES = {
  baby: require('../../assets/images/baby.jpg'),
  barMitzvah: require('../../assets/images/Bar Mitzvah.jpg'),
  wedding: require('../../assets/images/wedding.jpg'),
} as const;
const EVENT_TYPE_META = {
  חתונה: {
    background: 'rgba(239, 221, 184, 0.96)',
    border: 'rgba(204, 160, 0, 0.22)',
    text: '#5E4600',
  },
  'בר מצווה': {
    background: 'rgba(229, 238, 255, 0.96)',
    border: 'rgba(0, 53, 102, 0.14)',
    text: colors.primary,
  },
  'בת מצווה': {
    background: 'rgba(239, 233, 255, 0.96)',
    border: 'rgba(98, 90, 150, 0.16)',
    text: '#53457E',
  },
  ברית: {
    background: 'rgba(231, 243, 236, 0.96)',
    border: 'rgba(67, 122, 92, 0.16)',
    text: '#2F6046',
  },
  'אירוע חברה': {
    background: 'rgba(228, 238, 247, 0.96)',
    border: 'rgba(6, 23, 62, 0.12)',
    text: colors.yaleBlue,
  },
} as const;
const SHORT_MONTHS_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

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

function formatDateInputValue(date: Date | string | null | undefined) {
  if (!date) return '';
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatHebrewDate(value?: string | Date) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString('he-IL');
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

function formatCurrencyILS(value: number) {
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  } catch {
    return `${Number(value) || 0} ₪`;
  }
}

function DashboardStatCard({
  title,
  value,
  subtitle,
  icon,
  tone = 'default',
  badgeText,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'accent' | 'gold' | 'dark';
  badgeText?: string;
}) {
  const isDark = tone === 'dark';
  const iconBackground =
    tone === 'accent'
      ? 'rgba(25,93,230,0.10)'
      : tone === 'gold'
        ? 'rgba(212,175,55,0.14)'
        : isDark
          ? 'rgba(255,255,255,0.10)'
          : 'rgba(11,27,61,0.06)';
  const iconColor = tone === 'accent' ? '#195DE6' : tone === 'gold' ? '#C6931A' : isDark ? '#FFFFFF' : colors.text;

  return (
    <View style={[dashboardStyles.overviewStatCard, isDark ? dashboardStyles.overviewStatCardDark : null]}>
      <View style={dashboardStyles.overviewStatHeader}>
        <View
          style={[
            dashboardStyles.overviewStatIconBox,
            { backgroundColor: iconBackground },
            isDark ? dashboardStyles.overviewStatIconBoxDark : null,
          ]}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        {badgeText ? (
          <View style={dashboardStyles.overviewStatBadge}>
            <Ionicons name="trending-up" size={13} color="#16A34A" />
            <Text style={dashboardStyles.overviewStatBadgeText}>{badgeText}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[dashboardStyles.overviewStatTitle, isDark ? dashboardStyles.overviewStatTitleDark : null]}>{title}</Text>
      <Text style={[dashboardStyles.overviewStatValue, isDark ? dashboardStyles.overviewStatValueDark : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[dashboardStyles.overviewStatSubtitle, isDark ? dashboardStyles.overviewStatSubtitleDark : null]}>{subtitle}</Text>
    </View>
  );
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
  return { label: 'בתכנון', tone: 'planning' as const };
}

export function AdminEventsListWebScreen() {
  const { width } = useWindowDimensions();

  if (width < 900) {
    return <AdminEventsScreen />;
  }

  const router = useRouter();
  const userType = useUserStore((state) => state.userType);
  const isEmployeeWebUser = Platform.OS === 'web' && userType === 'employee';
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'exact' | 'start' | 'end'>('exact');

  const loadEventsFn = useMemo(() => async () => {
    const data = await eventService.getEvents();
    return Array.isArray(data) ? (data as Event[]) : [];
  }, []);

  const {
    events,
    loading,
    query,
    setQuery,
    filterDate,
    setFilterDate,
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    filterMonth,
    setFilterMonth,
    sortOrder,
    setSortOrder,
    refresh,
    filteredEvents,
  } = useEventsListModel(loadEventsFn, { errorTitle: 'שגיאה', errorMessage: 'לא ניתן לטעון אירועים כרגע' });

  const [guestStatsByEventId, setGuestStatsByEventId] = useState<
    Record<string, { invitedPeople: number; comingPeople: number; seatedPeople: number }>
  >({});
  const [guestStatsLoading, setGuestStatsLoading] = useState(false);
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<Event | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [clients, setClients] = useState<UserWithMetadata[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setClientsLoading(true);

    userService
      .getClients()
      .then((data) => {
        if (cancelled) return;
        const sorted = [...data].sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        setClients(sorted);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load recent clients:', error);
          setClients([]);
        }
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleEventIds = useMemo(
    () => filteredEvents.map((e) => String(e.id)).filter(Boolean),
    [filteredEvents]
  );

  const visibleEventIdsKey = useMemo(() => visibleEventIds.join(','), [visibleEventIds]);

  useEffect(() => {
    if (visibleEventIds.length === 0) {
      setGuestStatsByEventId({});
      return;
    }

    let cancelled = false;
    setGuestStatsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('guests')
        .select('event_id,status,number_of_people,table_id')
        .in('event_id', visibleEventIds);

      if (cancelled) return;

      if (error || !Array.isArray(data)) {
        console.error('Failed to load guests aggregates for events:', error);
        setGuestStatsByEventId({});
        return;
      }

      const next: Record<string, { invitedPeople: number; comingPeople: number; seatedPeople: number }> = {};
      for (const row of data as any[]) {
        const eventId = String(row?.event_id ?? '').trim();
        if (!eventId) continue;
        const people = Number(row?.number_of_people) || 1;
        const status = String(row?.status ?? '').trim();
        const hasTable = Boolean(row?.table_id);

        const prev = next[eventId] || { invitedPeople: 0, comingPeople: 0, seatedPeople: 0 };
        prev.invitedPeople += people;
        if (status === 'מגיע') prev.comingPeople += people;
        if (hasTable) prev.seatedPeople += people;
        next[eventId] = prev;
      }

      setGuestStatsByEventId(next);
    })()
      .catch((e) => {
        if (!cancelled) {
          console.error('Guests aggregates error:', e);
          setGuestStatsByEventId({});
        }
      })
      .finally(() => {
        if (!cancelled) setGuestStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visibleEventIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCount = (n: number) => (Number(n) || 0).toLocaleString('he-IL');
  const closeDeleteDialog = () => {
    if (deleteSaving) return;
    setDeleteConfirmEvent(null);
  };

  const handleDeletePress = (eventItem: Event, pressEvent?: any) => {
    pressEvent?.stopPropagation?.();
    pressEvent?.preventDefault?.();
    setDeleteConfirmEvent(eventItem);
  };

  const performDeleteEvent = async () => {
    const eventId = String(deleteConfirmEvent?.id ?? '').trim();
    if (!eventId || deleteSaving) return;

    setDeleteSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('delete-event', {
        body: { eventId },
      });
      if (fnError) throw fnError;
      if (data?.ok !== true) throw new Error(String(data?.error ?? 'Failed to delete event'));

      setDeleteConfirmEvent(null);
      await refresh();
      return;
    } catch (e) {
      try {
        await supabase.from('notifications').delete().eq('event_id', eventId);
      } catch {}

      try {
        await eventService.deleteEvent(eventId);
        setDeleteConfirmEvent(null);
        await refresh();
        return;
      } catch (fallbackError) {
        console.error('Delete event error:', fallbackError);
        Alert.alert('שגיאה', 'לא ניתן למחוק את האירוע כרגע');
      }
    } finally {
      setDeleteSaving(false);
    }
  };

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    const trimmedQuery = query.trim();
    if (trimmedQuery) labels.push(`חיפוש: ${trimmedQuery}`);
    if (filterDate) {
      labels.push(`תאריך: ${formatDateLabel(filterDate)}`);
    } else if (filterStartDate || filterEndDate) {
      const from = filterStartDate ? formatDateLabel(filterStartDate) : 'מההתחלה';
      const to = filterEndDate ? formatDateLabel(filterEndDate) : 'ללא סוף';
      labels.push(`טווח: ${from} - ${to}`);
    } else if (filterMonth) {
      labels.push(`חודש: ${MONTHS[Number(filterMonth)] ?? 'נבחר'}`);
    }
    if (sortOrder === 'desc') labels.push('מיון: חדש לישן');
    return labels;
  }, [filterDate, filterEndDate, filterMonth, filterStartDate, query, sortOrder]);

  const openPicker = (mode: 'exact' | 'start' | 'end') => {
    setDatePickerMode(mode);
    setShowDatePicker(true);
  };

  const resetFilters = () => {
    setQuery('');
    setFilterDate(null);
    setFilterStartDate(null);
    setFilterEndDate(null);
    setFilterMonth('');
    setSortOrder('asc');
  };

  const hasExactDateFilter = Boolean(filterDate);
  const hasRangeFilter = Boolean(filterStartDate || filterEndDate);
  const hasMonthFilter = Boolean(filterMonth) && !hasExactDateFilter && !hasRangeFilter;
  const eventGridColumns = width >= 1680 ? 4 : width >= 1380 ? 3 : width >= 1040 ? 2 : 1;
  const eventCardWidthStyle = {
    width: eventGridColumns === 4 ? '23.5%' : eventGridColumns === 3 ? '31.8%' : eventGridColumns === 2 ? '48.8%' : '100%',
  } as const;

  return (
    <>
      <ScrollView style={styles.page} contentContainerStyle={styles.pageScrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.filterBarOuter}>
        <AdminWebPageHeader eyebrow="אירועים" title="כל האירועים במערכת" />

        <View style={styles.toolbarCard}>
          <View style={styles.toolbarTopRow}>
            <View style={styles.toolbarTitleWrap}>
              <Text style={styles.toolbarEyebrow}>אירועים</Text>
              <Text style={styles.toolbarTitle}>כל האירועים במערכת</Text>
            </View>
            <View style={styles.toolbarTopActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="הוסף אירוע חדש"
                disabled={isEmployeeWebUser}
                onPress={isEmployeeWebUser ? undefined : () => router.push('/(admin)/admin-events-create')}
                style={({ hovered, pressed }: any) => [
                  styles.createEventBtn,
                  isEmployeeWebUser ? styles.createEventBtnDisabled : null,
                  Platform.OS === 'web' && hovered && !isEmployeeWebUser ? styles.createEventBtnHover : null,
                  pressed && !isEmployeeWebUser ? styles.createEventBtnPressed : null,
                ]}
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={styles.createEventBtnText}>הוסף אירוע</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.searchToolbarRow}>
            <View style={styles.searchWrapHero}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIconInline} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש לפי שם אירוע, לקוח, אולם או עיר..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInputHero}
                textAlign="right"
                returnKeyType="search"
              />
              {query.trim() ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="נקה חיפוש"
                  onPress={() => setQuery('')}
                  style={({ pressed }: any) => [styles.clearSearchBtn, pressed ? { opacity: 0.72 } : null]}
                >
                  <Ionicons name="close" size={14} color={colors.gray[600]} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={filtersOpen ? 'סגור סינון' : 'פתח סינון'}
              onPress={() => setFiltersOpen((prev) => !prev)}
              style={({ hovered, pressed }: any) => [
                styles.filterToggleBtn,
                Platform.OS === 'web' && hovered ? styles.filterToggleBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name={filtersOpen ? 'options' : 'options-outline'} size={18} color={colors.primary} />
              <Text style={styles.filterToggleBtnText}>סינון</Text>
              {activeFilterLabels.length > 0 ? (
                <View style={styles.filterToggleBadge}>
                  <Text style={styles.filterToggleBadgeText}>{activeFilterLabels.length}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {activeFilterLabels.length > 0 ? (
            <View style={styles.activeFiltersRow}>
              {activeFilterLabels.map((label) => (
                <View key={label} style={styles.activeFilterChip}>
                  <Text style={styles.activeFilterChipText}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {filtersOpen ? (
            <View style={styles.filtersPanel}>
              <View style={styles.filtersPanelHeader}>
                <View style={styles.filtersPanelTitleWrap}>
                  <Text style={styles.filtersPanelEyebrow}>סינון מתקדם</Text>
                  <Text style={styles.filtersPanelTitle}>מקד את רשימת האירועים</Text>
                  <Text style={styles.filtersPanelSubtitle}>
                    אפשר לבחור חודש, תאריך מדויק או טווח תאריכים וגם לשנות את סדר המיון.
                  </Text>
                </View>
                <View
                  style={[styles.filtersSummaryPill, activeFilterLabels.length > 0 ? styles.filtersSummaryPillActive : null]}
                >
                  <Ionicons
                    name={activeFilterLabels.length > 0 ? 'options-outline' : 'sparkles-outline'}
                    size={14}
                    color={activeFilterLabels.length > 0 ? colors.primary : colors.gray[600]}
                  />
                  <Text
                    style={[
                      styles.filtersSummaryPillText,
                      activeFilterLabels.length > 0 ? styles.filtersSummaryPillTextActive : null,
                    ]}
                  >
                    {activeFilterLabels.length > 0 ? `${activeFilterLabels.length} מסננים פעילים` : 'ללא מסננים פעילים'}
                  </Text>
                </View>
              </View>

              <View style={styles.filtersGrid}>
                <View style={[styles.filterField, styles.filterFieldCard]}>
                  <Text style={styles.filterFieldLabel}>מיון</Text>
                  <View style={[styles.selectWrapModern, sortOrder === 'desc' ? styles.selectWrapModernActive : null]}>
                    <Picker
                      selectedValue={sortOrder}
                      onValueChange={(value) => setSortOrder(value as any)}
                      style={styles.picker}
                      dropdownIconColor={colors.gray[600]}
                    >
                      <Picker.Item label="תאריך (ישן לחדש)" value="asc" />
                      <Picker.Item label="תאריך (חדש לישן)" value="desc" />
                    </Picker>
                  </View>
                </View>

                <View style={[styles.filterField, styles.filterFieldCard]}>
                  <Text style={styles.filterFieldLabel}>חודש</Text>
                  <View style={[styles.selectWrapModern, hasMonthFilter ? styles.selectWrapModernActive : null]}>
                    <Picker
                      selectedValue={filterDate || filterStartDate || filterEndDate ? '' : filterMonth}
                      onValueChange={(value) => {
                        const v = String(value ?? '');
                        setFilterMonth(v);
                        setFilterDate(null);
                        setFilterStartDate(null);
                        setFilterEndDate(null);
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
                </View>

                <View style={[styles.filterField, styles.filterFieldCard]}>
                  <Text style={styles.filterFieldLabel}>תאריך מדויק</Text>
                  {Platform.OS === 'web' ? (
                    <View style={[styles.dateBtnWide, hasExactDateFilter ? styles.dateBtnWideActive : null]}>
                      {/* @ts-expect-error web-only element */}
                      <input
                        aria-label="בחירת תאריך מדויק"
                        value={formatDateInputValue(filterDate)}
                        onChange={(e: any) => {
                          const value = String(e?.target?.value || '');
                          setFilterMonth('');
                          setFilterStartDate(null);
                          setFilterEndDate(null);
                          setFilterDate(value ? new Date(`${value}T00:00:00`) : null);
                        }}
                        type="date"
                        style={styles.webDateInputFull as any}
                      />
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="בחירת תאריך מדויק"
                      onPress={() => openPicker('exact')}
                      style={({ hovered, pressed }: any) => [
                        styles.dateBtnWide,
                        hasExactDateFilter ? styles.dateBtnWideActive : null,
                        Platform.OS === 'web' && hovered ? styles.dateBtnHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <Ionicons name="calendar-outline" size={16} color={colors.text} />
                      <Text style={styles.dateBtnText}>{filterDate ? formatDateLabel(filterDate) : 'בחירת תאריך'}</Text>
                    </Pressable>
                  )}
                </View>

                <View style={[styles.filterField, styles.filterFieldCard]}>
                  <Text style={styles.filterFieldLabel}>טווח תאריכים</Text>
                  <View style={styles.rangeActions}>
                    {Platform.OS === 'web' ? (
                      <View style={[styles.rangeBtn, filterStartDate ? styles.rangeBtnActive : null]}>
                        <Ionicons name="arrow-forward-outline" size={14} color={colors.text} style={styles.webDateInlineIcon} />
                        {/* @ts-expect-error web-only element */}
                        <input
                          aria-label="בחירת תאריך התחלה"
                          value={formatDateInputValue(filterStartDate)}
                          onChange={(e: any) => {
                            const value = String(e?.target?.value || '');
                            setFilterDate(null);
                            setFilterMonth('');
                            if (!value) {
                              setFilterStartDate(null);
                              return;
                            }
                            const nextStart = new Date(`${value}T00:00:00`);
                            setFilterStartDate(nextStart);
                            if (filterEndDate && nextStart.getTime() > new Date(filterEndDate).getTime()) {
                              setFilterEndDate(nextStart);
                            }
                          }}
                          type="date"
                          max={filterEndDate ? formatDateInputValue(filterEndDate) : undefined}
                          style={styles.webDateInputWithLeadingIcon as any}
                        />
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="בחירת תאריך התחלה"
                        onPress={() => openPicker('start')}
                        style={({ hovered, pressed }: any) => [
                          styles.rangeBtn,
                          filterStartDate ? styles.rangeBtnActive : null,
                          Platform.OS === 'web' && hovered ? styles.rangeBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name="arrow-forward-outline" size={14} color={colors.text} />
                        <Text style={styles.rangeBtnText}>{filterStartDate ? formatDateLabel(filterStartDate) : 'מתאריך'}</Text>
                      </Pressable>
                    )}

                    {Platform.OS === 'web' ? (
                      <View style={[styles.rangeBtn, filterEndDate ? styles.rangeBtnActive : null]}>
                        <Ionicons name="arrow-back-outline" size={14} color={colors.text} style={styles.webDateInlineIcon} />
                        {/* @ts-expect-error web-only element */}
                        <input
                          aria-label="בחירת תאריך סיום"
                          value={formatDateInputValue(filterEndDate)}
                          onChange={(e: any) => {
                            const value = String(e?.target?.value || '');
                            setFilterDate(null);
                            setFilterMonth('');
                            if (!value) {
                              setFilterEndDate(null);
                              return;
                            }
                            const nextEnd = new Date(`${value}T00:00:00`);
                            setFilterEndDate(nextEnd);
                            if (filterStartDate && nextEnd.getTime() < new Date(filterStartDate).getTime()) {
                              setFilterStartDate(nextEnd);
                            }
                          }}
                          type="date"
                          min={filterStartDate ? formatDateInputValue(filterStartDate) : undefined}
                          style={styles.webDateInputWithLeadingIcon as any}
                        />
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="בחירת תאריך סיום"
                        onPress={() => openPicker('end')}
                        style={({ hovered, pressed }: any) => [
                          styles.rangeBtn,
                          filterEndDate ? styles.rangeBtnActive : null,
                          Platform.OS === 'web' && hovered ? styles.rangeBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name="arrow-back-outline" size={14} color={colors.text} />
                        <Text style={styles.rangeBtnText}>{filterEndDate ? formatDateLabel(filterEndDate) : 'עד תאריך'}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.filtersFooter}>
                <Text style={styles.filtersHint}>אפשר לסנן לפי חודש, תאריך מדויק או טווח תאריכים.</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="איפוס פילטרים"
                  onPress={resetFilters}
                  style={({ hovered, pressed }: any) => [
                    styles.resetBtnModern,
                    Platform.OS === 'web' && hovered ? styles.resetBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.primary} />
                  <Text style={styles.resetBtnText}>איפוס פילטרים</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.contentRow}>
        <View style={styles.eventsGridPanel}>
          <View style={styles.eventsGridPanelHeader}>
            <View style={styles.eventsGridPanelTitleWrap}>
              <Text style={styles.eventsGridPanelEyebrow}>תצוגת כרטיסיות</Text>
              <Text style={styles.eventsGridPanelTitle}>כל האירועים במערכת</Text>
              <Text style={styles.eventsGridPanelSubtitle}>מבט נקי ומהיר על כל אירוע, סטטוס, מיקום ונתוני מוזמנים.</Text>
            </View>

            <View style={styles.eventsGridPanelSummary}>
              <Text style={styles.eventsGridPanelSummaryValue}>{formatCount(filteredEvents.length)}</Text>
              <Text style={styles.eventsGridPanelSummaryLabel}>אירועים מוצגים</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.centerStateTitle}>טוען אירועים...</Text>
              <Text style={styles.centerStateText}>אנחנו אוספים עבורך את כל האירועים במערכת.</Text>
            </View>
          ) : filteredEvents.length === 0 ? (
            <View style={styles.centerState}>
              <Ionicons name="calendar-outline" size={42} color={colors.gray[500]} />
              <Text style={styles.centerStateTitle}>לא נמצאו אירועים</Text>
              <Text style={styles.centerStateText}>נסה לשנות את החיפוש או הסינון, או ליצור אירוע חדש.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="הוסף אירוע חדש"
                disabled={isEmployeeWebUser}
                onPress={isEmployeeWebUser ? undefined : () => router.push('/(admin)/admin-events-create')}
                style={({ hovered, pressed }: any) => [
                  styles.emptyCreateBtn,
                  isEmployeeWebUser ? styles.createEventBtnDisabled : null,
                  Platform.OS === 'web' && hovered && !isEmployeeWebUser ? styles.createEventBtnHover : null,
                  pressed && !isEmployeeWebUser ? styles.createEventBtnPressed : null,
                ]}
              >
                <Text style={styles.emptyCreateBtnText}>הוסף אירוע</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.eventsCardsGrid}>
              {filteredEvents.map((e) => {
                const ownerName = String((e as any).userName || e.userName || '').trim();
                const invitationImageUrl = String((e as any).invitationImageUrl ?? e.invitationImageUrl ?? '').trim();
                const subtitle = rtlText(getEventSubtitle(e));
                const status = getStatusMeta(e.date);
                const guestStats = guestStatsByEventId[String(e.id)] || null;
                const coverSource: any = invitationImageUrl ? { uri: invitationImageUrl } : getHeroImageSource(e.title);
                const eventType = inferEventType(e.title) || 'חתונה';
                const eventTypeLabel = rtlText(eventType);
                const eventTitleLabel = rtlText(String(e.title ?? '').trim());
                const ownerNameLabel = rtlText(ownerName || 'ללא לקוח');
                const ownerDateLabel = rtlText(formatDateLabel(e.date));
                const typeMeta = EVENT_TYPE_META[eventType as keyof typeof EVENT_TYPE_META] ?? EVENT_TYPE_META['חתונה'];
                const statusToneStyle =
                  status.tone === 'active'
                    ? styles.statusPillActive
                    : status.tone === 'planning'
                      ? styles.statusPillPlanning
                      : status.tone === 'past'
                        ? styles.statusPillPast
                        : styles.statusPillDraft;
                const statusTextToneStyle =
                  status.tone === 'active'
                    ? styles.statusPillTextActive
                    : status.tone === 'planning'
                      ? styles.statusPillTextPlanning
                      : styles.statusPillTextMuted;

                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityLabel={`פתיחת אירוע ${e.title}`}
                    onPress={() => router.push({ pathname: '/(admin)/admin-event-details', params: { id: e.id } })}
                    style={({ hovered, pressed }: any) => [
                      styles.eventOverviewCard,
                      eventCardWidthStyle,
                      Platform.OS === 'web' && hovered ? styles.eventOverviewCardHover : null,
                      pressed ? styles.eventOverviewCardPressed : null,
                    ]}
                  >
                    <View style={styles.eventOverviewCover}>
                      <Image source={coverSource} style={styles.eventOverviewCoverImage} contentFit="cover" transition={0} />
                      <LinearGradient
                        colors={['rgba(6,23,62,0.04)', 'rgba(6,23,62,0.54)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.eventOverviewCoverOverlay}
                      />
                      <View style={styles.eventOverviewCoverTopRow}>
                        <View style={[styles.statusPill, statusToneStyle]}>
                          <Text style={[styles.statusPillText, statusTextToneStyle]}>{status.label}</Text>
                        </View>
                        <View style={styles.eventOverviewDaysBadge}>
                          <Text style={styles.eventOverviewDaysBadgeText}>{daysLeftLabel(e.date)}</Text>
                        </View>
                      </View>

                      <View style={styles.eventOverviewTypePill}>
                        <View style={[styles.eventOverviewTypeInner, { backgroundColor: typeMeta.background, borderColor: typeMeta.border }]}>
                          <Text style={[styles.eventOverviewTypeText, { color: typeMeta.text }]}>{eventTypeLabel}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.eventOverviewBody}>
                      <View style={styles.eventOverviewHeader}>
                        <Text style={styles.eventOverviewTitle} numberOfLines={1}>
                          {eventTitleLabel}
                        </Text>
                        <Text style={styles.eventOverviewSubtitle} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      </View>

                      <View style={styles.eventOverviewMetaRow}>
                        <Ionicons name="location-outline" size={15} color={colors.gray[500]} />
                        <Text style={styles.eventOverviewMetaText} numberOfLines={1}>
                          {[e.location, e.city].filter(Boolean).join(' · ') || 'ללא מיקום'}
                        </Text>
                      </View>

                      <View style={styles.eventOverviewMetrics}>
                        <View style={styles.eventOverviewMetricCard}>
                          <Text style={styles.eventOverviewMetricLabel}>מוזמנים</Text>
                          <Text style={styles.eventOverviewMetricValue}>
                            {guestStatsLoading ? '…' : guestStats ? formatCount(guestStats.invitedPeople) : '—'}
                          </Text>
                        </View>
                        <View style={styles.eventOverviewMetricCard}>
                          <Text style={styles.eventOverviewMetricLabel}>מגיעים</Text>
                          <Text style={styles.eventOverviewMetricValue}>
                            {guestStatsLoading ? '…' : guestStats ? formatCount(guestStats.comingPeople) : '—'}
                          </Text>
                        </View>
                        <View style={styles.eventOverviewMetricCard}>
                          <Text style={styles.eventOverviewMetricLabel}>הושבו</Text>
                          <Text style={styles.eventOverviewMetricValue}>
                            {guestStatsLoading ? '…' : guestStats ? formatCount(guestStats.seatedPeople) : '—'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.eventOverviewFooter}>
                        <View style={styles.eventOverviewOwnerBlock}>
                          <View style={styles.eventOverviewOwnerAvatar}>
                            <Image source={coverSource} style={styles.eventOverviewOwnerAvatarImage} contentFit="cover" transition={0} />
                          </View>
                          <View style={styles.eventOverviewOwnerText}>
                            <Text style={styles.eventOverviewOwnerName} numberOfLines={1}>
                              {ownerNameLabel}
                            </Text>
                            <Text style={styles.eventOverviewOwnerDate} numberOfLines={1}>
                              {ownerDateLabel}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.eventOverviewActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`מחיקת אירוע ${e.title}`}
                            onPress={(pressEvent) => handleDeletePress(e, pressEvent)}
                            style={({ hovered, pressed }: any) => [
                              styles.deleteIconBtnModern,
                              Platform.OS === 'web' && hovered ? styles.deleteIconBtnModernHover : null,
                              pressed ? styles.deleteActionBtnPressed : null,
                            ]}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.error} />
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`פתיחת אירוע ${e.title}`}
                            onPress={(pressEvent: any) => {
                              pressEvent?.stopPropagation?.();
                              router.push({ pathname: '/(admin)/admin-event-details', params: { id: e.id } });
                            }}
                            style={({ hovered, pressed }: any) => [
                              styles.eventOverviewDetailsBtn,
                              Platform.OS === 'web' && hovered ? styles.eventOverviewDetailsBtnHover : null,
                              pressed ? styles.createEventBtnPressed : null,
                            ]}
                          >
                            <Text style={styles.eventOverviewDetailsBtnText}>פרטי אירוע</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.eventsGridPanelFooter}>
            <Text style={styles.eventsGridPanelFooterText}>מציג {filteredEvents.length} אירועים</Text>
            <Text style={styles.eventsGridPanelFooterAccent}>כרטיסיות דסקטופ למנהל</Text>
          </View>
        </View>
      </View>

      </ScrollView>

      <Modal transparent visible={Boolean(deleteConfirmEvent)} animationType="fade" onRequestClose={closeDeleteDialog}>
        <Pressable style={styles.deleteOverlay} onPress={closeDeleteDialog}>
          <Pressable style={styles.deleteCard} onPress={() => null}>
            <View style={styles.deleteHeaderRow}>
              <View style={styles.deleteIconCircle}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </View>
              <View style={styles.deleteHeaderText}>
                <Text style={styles.deleteTitle}>מחיקת אירוע</Text>
                <Text style={styles.deleteSubtitle}>פעולה זו אינה ניתנת לביטול</Text>
              </View>
            </View>

            <View style={styles.deleteDivider} />

            <View style={styles.deleteBody}>
              <Text style={styles.deleteBodyText}>
                האם אתה בטוח שברצונך למחוק את האירוע
                {' "'}
                {deleteConfirmEvent?.title || 'ללא שם'}
                {'"'}?
              </Text>
              <Text style={styles.deleteHintText}>
                המחיקה תסיר גם נתונים קשורים כמו מוזמנים, הודעות, משימות ומפת הושבה.
              </Text>
            </View>

            <View style={styles.deleteFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול מחיקה"
                onPress={closeDeleteDialog}
                disabled={deleteSaving}
                style={({ hovered, pressed }: any) => [
                  styles.deleteBtnSecondary,
                  Platform.OS === 'web' && hovered ? styles.deleteBtnSecondaryHover : null,
                  pressed ? { opacity: 0.92 } : null,
                  deleteSaving ? { opacity: 0.7 } : null,
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
                  deleteSaving ? { opacity: 0.84 } : null,
                ]}
              >
                {deleteSaving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={colors.white} />
                    <Text style={styles.deleteBtnDangerText}>מחק אירוע</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {Platform.OS !== 'web' ? (
        <DateTimePickerModal
          isVisible={showDatePicker}
          mode="date"
          onConfirm={(date) => {
            setShowDatePicker(false);
            if (datePickerMode === 'exact') {
              setFilterDate(date as Date);
              setFilterMonth('');
              setFilterStartDate(null);
              setFilterEndDate(null);
              return;
            }

            if (datePickerMode === 'start') {
              const nextStart = date as Date;
              setFilterDate(null);
              setFilterMonth('');
              setFilterStartDate(nextStart);
              if (filterEndDate && nextStart.getTime() > new Date(filterEndDate).getTime()) {
                setFilterEndDate(nextStart);
              }
              return;
            }

            const nextEnd = date as Date;
            setFilterDate(null);
            setFilterMonth('');
            setFilterEndDate(nextEnd);
            if (filterStartDate && nextEnd.getTime() < new Date(filterStartDate).getTime()) {
              setFilterStartDate(nextEnd);
            }
          }}
          onCancel={() => setShowDatePicker(false)}
          minimumDate={datePickerMode === 'end' && filterStartDate ? new Date(filterStartDate) : undefined}
          locale="he-IL"
        />
      ) : null}
    </>
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
  pageScrollContent: {
    paddingBottom: 32,
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
    paddingHorizontal: 24,
    paddingBottom: 18,
    paddingTop: 24,
    gap: 18,
  },
  toolbarCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 18,
    gap: 14,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  toolbarTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  toolbarTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  toolbarTitleWrap: {
    alignItems: 'stretch',
    gap: 4,
  },
  toolbarEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  toolbarTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  createEventBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#195DE6',
    shadowColor: '#195DE6',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  createEventBtnHover: {
    backgroundColor: '#1D4ED8',
  },
  createEventBtnDisabled: {
    backgroundColor: '#A9B6D3',
    shadowOpacity: 0,
    opacity: 0.7,
  },
  createEventBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  createEventBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  searchToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchWrapHero: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#f7f9fc',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
    position: 'relative',
  },
  searchIconInline: {
    position: 'absolute',
    right: 16,
    top: 17,
  },
  searchInputHero: {
    minHeight: 52,
    paddingRight: 46,
    paddingLeft: 44,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  clearSearchBtn: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleBtn: {
    minWidth: 118,
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  filterToggleBtnHover: {
    backgroundColor: 'rgba(15,69,230,0.12)',
  },
  filterToggleBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  filterToggleBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  activeFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  activeFilterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  filtersPanel: {
    marginTop: 4,
    padding: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(247,249,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    gap: 14,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  filtersPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'nowrap',
  },
  filtersPanelTitleWrap: {
    flex: 1,
    minWidth: 240,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: 4,
  },
  filtersPanelEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  filtersPanelTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  filtersPanelSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.gray[600],
    textAlign: 'right',
  },
  filtersSummaryPill: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  filtersSummaryPillActive: {
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderColor: 'rgba(15,69,230,0.16)',
  },
  filtersSummaryPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
  },
  filtersSummaryPillTextActive: {
    color: colors.primary,
  },
  filtersGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterField: {
    flexGrow: 1,
    minWidth: 220,
    flexBasis: 240,
    gap: 8,
  },
  filterFieldCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  filterFieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  selectWrapModern: {
    height: 48,
    minWidth: 160,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(247,249,252,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  selectWrapModernActive: {
    backgroundColor: 'rgba(15,69,230,0.06)',
    borderColor: 'rgba(15,69,230,0.18)',
  },
  dateBtnHover: {
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  dateBtnWide: {
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(247,249,252,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    position: 'relative',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
  },
  dateBtnWideActive: {
    backgroundColor: 'rgba(15,69,230,0.06)',
    borderColor: 'rgba(15,69,230,0.18)',
  },
  dateBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  webDateInputFull: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: colors.text,
    fontSize: '13px',
    fontWeight: 800,
    fontFamily: 'inherit',
    textAlign: 'right',
    direction: 'rtl',
    cursor: 'pointer',
    paddingLeft: '12px',
    paddingRight: '12px',
  } as any,
  webDateInputWithLeadingIcon: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: colors.text,
    fontSize: '13px',
    fontWeight: 800,
    fontFamily: 'inherit',
    textAlign: 'right',
    direction: 'rtl',
    cursor: 'pointer',
    paddingLeft: '36px',
    paddingRight: '12px',
  } as any,
  picker: {
    height: 48,
    width: '100%',
    color: colors.text,
  },
  rangeActions: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
  },
  rangeBtn: {
    height: 48,
    flex: 1,
    minWidth: 150,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(247,249,252,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    position: 'relative',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rangeBtnActive: {
    backgroundColor: 'rgba(15,69,230,0.06)',
    borderColor: 'rgba(15,69,230,0.18)',
  },
  rangeBtnHover: {
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  rangeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  webDateInlineIcon: {
    position: 'absolute',
    left: 12,
    top: 17,
    pointerEvents: 'none',
  } as any,
  filtersFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'nowrap',
    paddingTop: 2,
  },
  filtersHint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  resetBtnModern: {
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  eventsGridPanel: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    overflow: 'hidden',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  eventsGridPanelHeader: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.05)',
    flexWrap: 'wrap',
  },
  eventsGridPanelTitleWrap: {
    flex: 1,
    minWidth: 260,
    alignItems: 'stretch',
    gap: 4,
  },
  eventsGridPanelEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195DE6',
    textAlign: 'right',
  },
  eventsGridPanelTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  eventsGridPanelSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  eventsGridPanelSummary: {
    minWidth: 110,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    alignItems: 'center',
  },
  eventsGridPanelSummaryValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#195DE6',
    textAlign: 'center',
  },
  eventsGridPanelSummaryLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
  },
  eventsCardsGrid: {
    padding: 18,
    paddingBottom: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    alignItems: 'flex-start',
  },
  eventOverviewCard: {
    minWidth: 0,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  eventOverviewCardHover: {
    borderColor: 'rgba(25,93,230,0.18)',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  eventOverviewCardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.995 }],
  },
  eventOverviewCover: {
    height: 194,
    position: 'relative',
    backgroundColor: '#E9EEF7',
  },
  eventOverviewCoverImage: {
    width: '100%',
    height: '100%',
  },
  eventOverviewCoverOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  eventOverviewCoverTopRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eventOverviewDaysBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0F172A',
  },
  eventOverviewDaysBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
  },
  eventOverviewTypePill: {
    position: 'absolute',
    right: 14,
    bottom: 14,
  },
  eventOverviewTypeInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'flex-end',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  eventOverviewTypeText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  eventOverviewBody: {
    padding: 18,
    gap: 14,
    alignItems: 'stretch',
  },
  eventOverviewHeader: {
    gap: 4,
    alignItems: 'stretch',
    width: '100%',
  },
  eventOverviewTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  eventOverviewSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  eventOverviewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventOverviewMetaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
  },
  eventOverviewMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  eventOverviewMetricCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#F8FAFD',
    alignItems: 'center',
    gap: 4,
  },
  eventOverviewMetricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'center',
  },
  eventOverviewMetricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  eventOverviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventOverviewOwnerBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventOverviewOwnerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  eventOverviewOwnerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  eventOverviewOwnerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    alignItems: 'stretch',
    width: '100%',
  },
  eventOverviewOwnerName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  eventOverviewOwnerDate: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  eventOverviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventOverviewDetailsBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(25,93,230,0.10)',
  },
  eventOverviewDetailsBtnHover: {
    backgroundColor: 'rgba(25,93,230,0.16)',
  },
  eventOverviewDetailsBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#195DE6',
    textAlign: 'center',
  },
  deleteIconBtnModern: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  deleteIconBtnModernHover: {
    backgroundColor: 'rgba(239,68,68,0.14)',
  },
  eventsGridPanelFooter: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(6,23,62,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventsGridPanelFooterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  eventsGridPanelFooterAccent: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195DE6',
    textAlign: 'right',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 46,
    paddingHorizontal: 20,
    gap: 10,
  },
  centerStateTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  centerStateText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'center',
  },
  emptyCreateBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#195DE6',
  },
  emptyCreateBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
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
  tableTopBar: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    backgroundColor: '#fcfdff',
  },
  tableTopTextWrap: {
    flex: 1,
    alignItems: 'stretch',
    gap: 4,
  },
  tableTopTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  tableTopSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  th: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
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
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  trAlt: {
    backgroundColor: '#fbfcfe',
  },
  trHover: {
    backgroundColor: 'rgba(15,69,230,0.05)',
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
  dateCell: {
    width: 110,
    alignItems: 'stretch',
  },
  dateBadge: {
    width: 88,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#fbfcff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  dateDay: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f2f63',
    textAlign: 'right',
    writingDirection: 'ltr',
    lineHeight: 20,
    width: '100%',
  },
  dateMonth: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#7b8aa0',
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
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
  locationMain: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  locationSub: {
    marginTop: 3,
    fontSize: 12,
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
  guestsMetaMain: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
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
  statusPillTextActive: {
    color: '#FFFFFF',
  },
  statusPillTextPlanning: {
    color: '#FFFFFF',
  },
  statusPillTextMuted: {
    color: '#FFFFFF',
  },
  statusPillActive: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  statusPillPlanning: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  statusPillPast: {
    backgroundColor: '#64748B',
    borderColor: '#64748B',
  },
  statusPillDraft: {
    backgroundColor: '#334155',
    borderColor: '#334155',
  },
  deleteActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.14)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  deleteActionBtnHover: { backgroundColor: 'rgba(239,68,68,0.12)' },
  deleteActionBtnPressed: { opacity: 0.84 },
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
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 24px 70px rgba(0,0,0,0.22)' } as any) : null),
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
  deleteHeaderText: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  deleteTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  deleteSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.55)',
    textAlign: 'right',
  },
  deleteDivider: {
    height: 1,
    backgroundColor: 'rgba(17,24,39,0.08)',
    marginHorizontal: 16,
  },
  deleteBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  deleteBodyText: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.82)',
    textAlign: 'right',
    lineHeight: 22,
  },
  deleteHintText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(17,24,39,0.66)',
    textAlign: 'right',
    lineHeight: 18,
  },
  deleteFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.08)',
    flexDirection: 'row',
    flexWrap: 'wrap',
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

export default function AdminEventsWebScreen() {
  const { width } = useWindowDimensions();

  if (width < 900) {
    return <AdminEventsScreen />;
  }

  const isCompactDesktop = width < 1360;

  const router = useRouter();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'exact' | 'start' | 'end'>('exact');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'planning' | 'past'>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const loadEventsFn = useMemo(() => async () => {
    const data = await eventService.getEvents();
    return Array.isArray(data) ? (data as Event[]) : [];
  }, []);

  const {
    events,
    loading,
    query,
    setQuery,
    filterDate,
    setFilterDate,
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    filterMonth,
    setFilterMonth,
    sortOrder,
    setSortOrder,
    refresh,
    filteredEvents,
  } = useEventsListModel(loadEventsFn, { errorTitle: 'שגיאה', errorMessage: 'לא ניתן לטעון אירועים כרגע' });

  const [guestStatsByEventId, setGuestStatsByEventId] = useState<
    Record<string, { invitedPeople: number; comingPeople: number; seatedPeople: number }>
  >({});
  const [guestStatsLoading, setGuestStatsLoading] = useState(false);
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<Event | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [clients, setClients] = useState<UserWithMetadata[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setClientsLoading(true);

    userService
      .getClients()
      .then((data) => {
        if (cancelled) return;
        const sorted = [...data].sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        setClients(sorted);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load recent clients:', error);
          setClients([]);
        }
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const eventsForDashboard = useMemo(
    () =>
      filteredEvents.filter((event) => {
        const statusTone = getStatusMeta(event.date).tone;
        const eventType = inferEventType(event.title) || 'חתונה';

        if (statusFilter !== 'all' && statusTone !== statusFilter) {
          return false;
        }

        if (eventTypeFilter !== 'all' && eventType !== eventTypeFilter) {
          return false;
        }

        return true;
      }),
    [eventTypeFilter, filteredEvents, statusFilter]
  );

  const visibleEventIds = useMemo(
    () => eventsForDashboard.map((event) => String(event.id)).filter(Boolean),
    [eventsForDashboard]
  );

  const visibleEventIdsKey = useMemo(() => visibleEventIds.join(','), [visibleEventIds]);

  useEffect(() => {
    if (visibleEventIds.length === 0) {
      setGuestStatsByEventId({});
      return;
    }

    let cancelled = false;
    setGuestStatsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('guests')
        .select('event_id,status,number_of_people,table_id')
        .in('event_id', visibleEventIds);

      if (cancelled) return;

      if (error || !Array.isArray(data)) {
        console.error('Failed to load guests aggregates for events:', error);
        setGuestStatsByEventId({});
        return;
      }

      const next: Record<string, { invitedPeople: number; comingPeople: number; seatedPeople: number }> = {};

      for (const row of data as any[]) {
        const eventId = String(row?.event_id ?? '').trim();
        if (!eventId) continue;

        const people = Number(row?.number_of_people) || 1;
        const status = String(row?.status ?? '').trim();
        const hasTable = Boolean(row?.table_id);
        const prev = next[eventId] || { invitedPeople: 0, comingPeople: 0, seatedPeople: 0 };

        prev.invitedPeople += people;
        if (status === 'מגיע') prev.comingPeople += people;
        if (hasTable) prev.seatedPeople += people;

        next[eventId] = prev;
      }

      setGuestStatsByEventId(next);
    })()
      .catch((error) => {
        if (!cancelled) {
          console.error('Guests aggregates error:', error);
          setGuestStatsByEventId({});
        }
      })
      .finally(() => {
        if (!cancelled) setGuestStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visibleEventIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCount = (value: number) => (Number(value) || 0).toLocaleString('he-IL');

  const closeDeleteDialog = () => {
    if (deleteSaving) return;
    setDeleteConfirmEvent(null);
  };

  const handleDeletePress = (eventItem: Event, pressEvent?: any) => {
    pressEvent?.stopPropagation?.();
    pressEvent?.preventDefault?.();
    setDeleteConfirmEvent(eventItem);
  };

  const performDeleteEvent = async () => {
    const eventId = String(deleteConfirmEvent?.id ?? '').trim();
    if (!eventId || deleteSaving) return;

    setDeleteSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('delete-event', {
        body: { eventId },
      });
      if (fnError) throw fnError;
      if (data?.ok !== true) throw new Error(String(data?.error ?? 'Failed to delete event'));

      setDeleteConfirmEvent(null);
      await refresh();
      return;
    } catch (error) {
      try {
        await supabase.from('notifications').delete().eq('event_id', eventId);
      } catch {}

      try {
        await eventService.deleteEvent(eventId);
        setDeleteConfirmEvent(null);
        await refresh();
        return;
      } catch (fallbackError) {
        console.error('Delete event error:', fallbackError);
        Alert.alert('שגיאה', 'לא ניתן למחוק את האירוע כרגע');
      }
    } finally {
      setDeleteSaving(false);
    }
  };

  const eventTypeOptions = useMemo(() => {
    const uniqueTypes = new Set<string>();
    events.forEach((event) => uniqueTypes.add(inferEventType(event.title) || 'חתונה'));
    return Array.from(uniqueTypes);
  }, [events]);

  const statusCounts = useMemo(
    () => ({
      all: filteredEvents.length,
      active: filteredEvents.filter((event) => getStatusMeta(event.date).tone === 'active').length,
      planning: filteredEvents.filter((event) => getStatusMeta(event.date).tone === 'planning').length,
      past: filteredEvents.filter((event) => getStatusMeta(event.date).tone === 'past').length,
    }),
    [filteredEvents]
  );

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    const trimmedQuery = query.trim();

    if (trimmedQuery) labels.push(`חיפוש: ${trimmedQuery}`);

    if (filterDate) {
      labels.push(`תאריך: ${formatDateLabel(filterDate)}`);
    } else if (filterStartDate || filterEndDate) {
      const from = filterStartDate ? formatDateLabel(filterStartDate) : 'מההתחלה';
      const to = filterEndDate ? formatDateLabel(filterEndDate) : 'ללא סוף';
      labels.push(`טווח: ${from} - ${to}`);
    } else if (filterMonth) {
      labels.push(`חודש: ${MONTHS[Number(filterMonth)] ?? 'נבחר'}`);
    }

    if (statusFilter !== 'all') {
      labels.push(
        statusFilter === 'active'
          ? 'סטטוס: פעילים'
          : statusFilter === 'planning'
            ? 'סטטוס: בתכנון'
            : 'סטטוס: הסתיימו'
      );
    }

    if (eventTypeFilter !== 'all') {
      labels.push(`סוג: ${eventTypeFilter}`);
    }

    if (sortOrder === 'desc') labels.push('מיון: חדש לישן');
    return labels;
  }, [eventTypeFilter, filterDate, filterEndDate, filterMonth, filterStartDate, query, sortOrder, statusFilter]);

  const openPicker = (mode: 'exact' | 'start' | 'end') => {
    setDatePickerMode(mode);
    setShowDatePicker(true);
  };

  const resetFilters = () => {
    setQuery('');
    setFilterDate(null);
    setFilterStartDate(null);
    setFilterEndDate(null);
    setFilterMonth('');
    setSortOrder('asc');
    setStatusFilter('all');
    setEventTypeFilter('all');
  };

  const hasExactDateFilter = Boolean(filterDate);
  const hasRangeFilter = Boolean(filterStartDate || filterEndDate);
  const hasMonthFilter = Boolean(filterMonth) && !hasExactDateFilter && !hasRangeFilter;

  const upcomingEvents = useMemo(
    () =>
      [...eventsForDashboard]
        .filter((event) => {
          const date = new Date(event.date);
          return Number.isFinite(date.getTime()) && date.getTime() >= Date.now();
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3),
    [eventsForDashboard]
  );

  const nextUpcoming = upcomingEvents[0] ?? null;

  const invitedTotal = useMemo(
    () =>
      eventsForDashboard.reduce((sum, event) => {
        const guestStats = guestStatsByEventId[String(event.id)];
        return sum + (guestStats?.invitedPeople ?? Number(event.guests) ?? 0);
      }, 0),
    [eventsForDashboard, guestStatsByEventId]
  );

  const confirmedTotal = useMemo(
    () =>
      eventsForDashboard.reduce((sum, event) => {
        const guestStats = guestStatsByEventId[String(event.id)];
        return sum + (guestStats?.comingPeople ?? 0);
      }, 0),
    [eventsForDashboard, guestStatsByEventId]
  );

  const seatedTotal = useMemo(
    () =>
      eventsForDashboard.reduce((sum, event) => {
        const guestStats = guestStatsByEventId[String(event.id)];
        return sum + (guestStats?.seatedPeople ?? 0);
      }, 0),
    [eventsForDashboard, guestStatsByEventId]
  );

  const rsvpRate = invitedTotal > 0 ? Math.round((confirmedTotal / invitedTotal) * 100) : 0;
  const seatingRate = confirmedTotal > 0 ? Math.round((seatedTotal / confirmedTotal) * 100) : 0;

  const ownerlessEventsCount = useMemo(
    () => eventsForDashboard.filter((event) => !String((event as any).userName || event.userName || '').trim()).length,
    [eventsForDashboard]
  );

  const urgentEventsCount = useMemo(
    () =>
      eventsForDashboard.filter((event) => {
        const date = new Date(event.date);
        if (!Number.isFinite(date.getTime())) return false;
        const diff = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 7;
      }).length,
    [eventsForDashboard]
  );

  const seatingPendingCount = useMemo(
    () =>
      eventsForDashboard.filter((event) => {
        const guestStats = guestStatsByEventId[String(event.id)];
        if (!guestStats) return false;
        return guestStats.comingPeople > guestStats.seatedPeople;
      }).length,
    [eventsForDashboard, guestStatsByEventId]
  );

  const recentEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 4),
    [events]
  );
  const recentClients = useMemo(() => clients.slice(0, 5), [clients]);
  const eventsThisYear = useMemo(
    () =>
      events.filter((event) => {
        const date = new Date(event.date);
        return Number.isFinite(date.getTime()) && date.getFullYear() === selectedYear;
      }),
    [events, selectedYear]
  );
  const yearTotalGuests = useMemo(
    () => eventsThisYear.reduce((sum, event) => sum + (Number(event.guests) || 0), 0),
    [eventsThisYear]
  );
  const yearTotalBudget = useMemo(
    () => eventsThisYear.reduce((sum, event) => sum + (Number(event.budget) || 0), 0),
    [eventsThisYear]
  );
  const canPrevYear = true;
  const canNextYear = true;
  const bars12 = useMemo(() => {
    const valuesByMonth = Array(12).fill(0);
    events.forEach((event) => {
      const date = new Date(event.date);
      if (!Number.isFinite(date.getTime()) || date.getFullYear() !== selectedYear) return;
      valuesByMonth[date.getMonth()] += 1;
    });
    return Array.from({ length: 12 }).map((_, monthIndex) => ({
      monthIndex,
      label: SHORT_MONTHS_HE[monthIndex] ?? '',
      value: valuesByMonth[monthIndex] ?? 0,
    }));
  }, [events, selectedYear]);
  const yearTotalEvents = useMemo(() => bars12.reduce((sum, item) => sum + item.value, 0), [bars12]);
  const maxBar = useMemo(() => Math.max(1, ...bars12.map((item) => item.value)), [bars12]);
  const now = new Date();
  const isCurrentYear = selectedYear === now.getFullYear();
  const profileStyleStats = useMemo(
    () => [
      {
        key: 'events',
        title: 'אירועים השנה',
        value: loading ? '...' : formatCount(yearTotalEvents),
        subtitle: `בשנת ${selectedYear}`,
        icon: 'calendar-outline' as const,
        tone: 'accent' as const,
        badgeText: yearTotalEvents ? `${Math.round((yearTotalEvents / 12) * 10) / 10} / חודש` : undefined,
      },
      {
        key: 'guests',
        title: 'מוזמנים השנה',
        value: loading ? '...' : formatCount(yearTotalGuests),
        subtitle: 'סכום מוזמנים לכל האירועים',
        icon: 'people-outline' as const,
        tone: 'default' as const,
      },
      {
        key: 'clients',
        title: 'לקוחות פעילים',
        value: clientsLoading ? '...' : formatCount(clients.length),
        subtitle: 'בעלי אירוע במערכת',
        icon: 'briefcase-outline' as const,
        tone: 'gold' as const,
      },
      {
        key: 'performance',
        title: 'ביצועי שנה',
        value: loading ? '...' : formatCurrencyILS(yearTotalBudget),
        subtitle: 'תקציב כולל לכל האירועים',
        icon: 'analytics-outline' as const,
        tone: 'dark' as const,
      },
    ],
    [clients.length, clientsLoading, loading, selectedYear, yearTotalBudget, yearTotalEvents, yearTotalGuests]
  );

  return (
    <View style={dashboardStyles.page}>
      <ScrollView style={dashboardStyles.scroll} contentContainerStyle={dashboardStyles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={dashboardStyles.heroShell}>
          <AdminWebPageHeader eyebrow="ניהול אירועים" title="דשבורד אירועים למנהל" />

          <View style={dashboardStyles.heroCard}>
            <View style={dashboardStyles.heroChartCard}>
              <View style={dashboardStyles.sectionHeader}>
                <View style={dashboardStyles.sectionHeaderTextWrap}>
                  <Text style={dashboardStyles.sectionEyebrow}>גרף פעילות</Text>
                  <Text style={dashboardStyles.sectionTitle}>ביצועים חודשיים</Text>
                </View>
                <View style={dashboardStyles.yearControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="שנה קודמת"
                    onPress={() => setSelectedYear((year) => year - 1)}
                    disabled={!canPrevYear}
                    style={({ hovered, pressed }: any) => [
                      dashboardStyles.yearBtn,
                      Platform.OS === 'web' && hovered ? dashboardStyles.yearBtnHover : null,
                      pressed ? { opacity: 0.92 } : null,
                      !canPrevYear ? { opacity: 0.4 } : null,
                    ]}
                  >
                    <Ionicons name="chevron-back" size={18} color={colors.text} />
                  </Pressable>

                  <View style={dashboardStyles.yearPill}>
                    <Ionicons name="calendar-outline" size={14} color={colors.text} />
                    <Text style={dashboardStyles.yearPillText}>{selectedYear}</Text>
                    <View style={dashboardStyles.pillDot} />
                    <Text style={dashboardStyles.yearPillText}>סה"כ {yearTotalEvents}</Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="שנה הבאה"
                    onPress={() => setSelectedYear((year) => year + 1)}
                    disabled={!canNextYear}
                    style={({ hovered, pressed }: any) => [
                      dashboardStyles.yearBtn,
                      Platform.OS === 'web' && hovered ? dashboardStyles.yearBtnHover : null,
                      pressed ? { opacity: 0.92 } : null,
                      !canNextYear ? { opacity: 0.4 } : null,
                    ]}
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.text} />
                  </Pressable>
                </View>
              </View>

              <View style={dashboardStyles.chartBarsWrap}>
                {bars12.map((bar) => {
                  const isCurrentMonth = isCurrentYear && bar.monthIndex === now.getMonth();
                  const hasValue = bar.value > 0;
                  const pct = bar.value === 0 ? 0 : Math.max(0.06, bar.value / maxBar);

                  return (
                    <Pressable
                      key={`${selectedYear}-${bar.monthIndex}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${bar.label}: ${bar.value}`}
                      onPress={() => null}
                      style={({ hovered, pressed }: any) => [
                        dashboardStyles.chartBarCol,
                        pressed ? { opacity: 0.96 } : null,
                        Platform.OS === 'web' && hovered ? dashboardStyles.chartBarColHover : null,
                      ]}
                    >
                      {({ hovered }: any) => (
                        <>
                          <View
                            style={[
                              dashboardStyles.chartBarTrack,
                              Platform.OS === 'web' && hovered ? dashboardStyles.chartBarTrackHover : null,
                            ]}
                          >
                            <View style={dashboardStyles.chartBarBg} />
                            <LinearGradient
                              colors={
                                hasValue
                                  ? ['#1D4ED8', '#3B82F6']
                                  : ['rgba(11,27,61,0.18)', 'rgba(59,130,246,0.10)']
                              }
                              start={{ x: 0.5, y: 1 }}
                              end={{ x: 0.5, y: 0 }}
                              style={[
                                dashboardStyles.chartBarFill,
                                { height: `${Math.round(pct * 100)}%` } as any,
                                isCurrentMonth ? dashboardStyles.chartBarFillHot : null,
                              ]}
                            />
                            <View
                              style={[
                                dashboardStyles.chartBarTooltip,
                                Platform.OS === 'web' ? (hovered ? { opacity: 1 } : null) : ({ display: 'none' } as any),
                              ]}
                            >
                              <Text style={dashboardStyles.chartBarTooltipText}>{bar.value}</Text>
                            </View>
                          </View>
                          <Text style={[dashboardStyles.chartBarLabel, isCurrentMonth ? dashboardStyles.chartBarLabelHot : null]}>
                            {bar.label}
                          </Text>
                          <Text style={[dashboardStyles.chartBarValue, isCurrentMonth ? dashboardStyles.chartBarValueHot : null]}>
                            {bar.value}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        <View style={dashboardStyles.filterCard}>
          <View style={dashboardStyles.searchRow}>
            <View style={dashboardStyles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={dashboardStyles.searchIcon} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש לפי שם אירוע, לקוח, אולם או עיר..."
                placeholderTextColor={colors.gray[500]}
                style={dashboardStyles.searchInput}
                textAlign="right"
                returnKeyType="search"
              />
              {query.trim() ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="נקה חיפוש"
                  onPress={() => setQuery('')}
                  style={({ pressed }: any) => [dashboardStyles.clearSearchBtnModern, pressed ? { opacity: 0.72 } : null]}
                >
                  <Ionicons name="close" size={14} color={colors.gray[600]} />
                </Pressable>
              ) : null}
            </View>

            <View style={dashboardStyles.searchSummary}>
              <View style={dashboardStyles.activeFiltersBadge}>
                <Ionicons name="options-outline" size={15} color={colors.primary} />
                <Text style={dashboardStyles.activeFiltersBadgeText}>
                  {activeFilterLabels.length > 0 ? `${activeFilterLabels.length} מסננים פעילים` : 'ללא מסננים פעילים'}
                </Text>
              </View>
              <Text style={dashboardStyles.searchSummaryText}>
                מציג <Text style={dashboardStyles.searchSummaryStrong}>{formatCount(eventsForDashboard.length)}</Text> מתוך {formatCount(events.length)} אירועים
              </Text>
            </View>
          </View>

          <View style={dashboardStyles.filtersTopRow}>
            <View style={dashboardStyles.statusTabsRow}>
              {[
                { key: 'all', label: 'הכל', count: statusCounts.all },
                { key: 'active', label: 'פעילים', count: statusCounts.active },
                { key: 'planning', label: 'בתכנון', count: statusCounts.planning },
                { key: 'past', label: 'הסתיימו', count: statusCounts.past },
              ].map((item) => {
                const active = statusFilter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={`סינון לפי ${item.label}`}
                    onPress={() => setStatusFilter(item.key as 'all' | 'active' | 'planning' | 'past')}
                    style={({ hovered, pressed }: any) => [
                      dashboardStyles.statusTab,
                      active ? dashboardStyles.statusTabActive : null,
                      Platform.OS === 'web' && hovered && !active ? dashboardStyles.statusTabHover : null,
                      pressed ? dashboardStyles.actionPressed : null,
                    ]}
                  >
                    <Text style={[dashboardStyles.statusTabText, active ? dashboardStyles.statusTabTextActive : null]}>
                      {item.label}
                    </Text>
                    <Text style={[dashboardStyles.statusTabCount, active ? dashboardStyles.statusTabCountActive : null]}>
                      {formatCount(item.count)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={dashboardStyles.controlsRow}>
              <View style={dashboardStyles.controlSelect}>
                <View pointerEvents="none" style={dashboardStyles.controlSelectIconWrap}>
                  <Ionicons name="calendar-outline" size={14} color={colors.gray[600]} />
                </View>
                <Picker
                  selectedValue={filterMonth}
                  onValueChange={(value) => {
                    const nextValue = String(value ?? '');
                    setFilterMonth(nextValue);
                    if (nextValue) {
                      setFilterDate(null);
                      setFilterStartDate(null);
                      setFilterEndDate(null);
                    }
                  }}
                  style={[dashboardStyles.controlPicker, dashboardStyles.controlPickerWithIcon]}
                  dropdownIconColor={colors.gray[700]}
                >
                  <Picker.Item label="כל החודשים" value="" />
                  {MONTHS.map((month, index) => (
                    <Picker.Item key={month} label={month} value={String(index)} />
                  ))}
                </Picker>
              </View>

              <View style={dashboardStyles.controlSelect}>
                <View pointerEvents="none" style={dashboardStyles.controlSelectIconWrap}>
                  <Ionicons name="albums-outline" size={14} color={colors.gray[600]} />
                </View>
                <Picker
                  selectedValue={eventTypeFilter}
                  onValueChange={(value) => setEventTypeFilter(String(value ?? 'all'))}
                  style={[dashboardStyles.controlPicker, dashboardStyles.controlPickerWithIcon]}
                  dropdownIconColor={colors.gray[700]}
                >
                  <Picker.Item label="כל סוגי האירועים" value="all" />
                  {eventTypeOptions.map((eventType) => (
                    <Picker.Item key={eventType} label={eventType} value={eventType} />
                  ))}
                </Picker>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={filtersOpen ? 'סגור סינון מתקדם' : 'פתח סינון מתקדם'}
                onPress={() => setFiltersOpen((prev) => !prev)}
                style={({ hovered, pressed }: any) => [
                  dashboardStyles.secondaryActionBtn,
                  Platform.OS === 'web' && hovered ? dashboardStyles.secondaryActionBtnHover : null,
                  pressed ? dashboardStyles.actionPressed : null,
                ]}
              >
                <View style={dashboardStyles.secondaryActionBtnIconWrap}>
                  <Ionicons name={filtersOpen ? 'chevron-up-outline' : 'options-outline'} size={13} color={colors.primary} />
                </View>
                <Text style={dashboardStyles.secondaryActionBtnText}>סינון מתקדם</Text>
              </Pressable>
            </View>
          </View>

          {activeFilterLabels.length > 0 ? (
            <View style={dashboardStyles.activeChipsRow}>
              {activeFilterLabels.map((label) => (
                <View key={label} style={dashboardStyles.filterChip}>
                  <Text style={dashboardStyles.filterChipText}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {filtersOpen ? (
            <View style={dashboardStyles.advancedPanel}>
              <View style={dashboardStyles.advancedPanelHeader}>
                <View style={dashboardStyles.advancedTitleWrap}>
                  <Text style={dashboardStyles.advancedEyebrow}>סינון מתקדם</Text>
                  <Text style={dashboardStyles.advancedTitle}>דייק את רשימת האירועים</Text>
                  <Text style={dashboardStyles.advancedSubtitle}>
                    אפשר לשלב תאריך מדויק, טווח תאריכים, חודש וסדר מיון כדי למקד את התצוגה.
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="איפוס פילטרים"
                  onPress={resetFilters}
                  style={({ hovered, pressed }: any) => [
                    dashboardStyles.resetFiltersBtn,
                    Platform.OS === 'web' && hovered ? dashboardStyles.resetFiltersBtnHover : null,
                    pressed ? dashboardStyles.actionPressed : null,
                  ]}
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.primary} />
                  <Text style={dashboardStyles.resetFiltersBtnText}>איפוס</Text>
                </Pressable>
              </View>

              <View style={dashboardStyles.advancedGrid}>
                <View style={dashboardStyles.advancedField}>
                  <Text style={dashboardStyles.advancedFieldLabel}>מיון</Text>
                  <View style={dashboardStyles.controlSelectWide}>
                    <Picker
                      selectedValue={sortOrder}
                      onValueChange={(value) => setSortOrder(value as any)}
                      style={dashboardStyles.controlPicker}
                      dropdownIconColor={colors.gray[700]}
                    >
                      <Picker.Item label="תאריך (ישן לחדש)" value="asc" />
                      <Picker.Item label="תאריך (חדש לישן)" value="desc" />
                    </Picker>
                  </View>
                </View>

                <View style={dashboardStyles.advancedField}>
                  <Text style={dashboardStyles.advancedFieldLabel}>תאריך מדויק</Text>
                  <View style={[dashboardStyles.dateInputShell, hasExactDateFilter ? dashboardStyles.dateInputShellActive : null]}>
                    {/* @ts-expect-error web-only element */}
                    <input
                      aria-label="בחירת תאריך מדויק"
                      value={formatDateInputValue(filterDate)}
                      onChange={(e: any) => {
                        const value = String(e?.target?.value || '');
                        setFilterMonth('');
                        setFilterStartDate(null);
                        setFilterEndDate(null);
                        setFilterDate(value ? new Date(`${value}T00:00:00`) : null);
                      }}
                      type="date"
                      style={dashboardStyles.webDateInput as any}
                    />
                  </View>
                </View>

                <View style={dashboardStyles.advancedField}>
                  <Text style={dashboardStyles.advancedFieldLabel}>מתאריך</Text>
                  <View style={[dashboardStyles.dateInputShell, filterStartDate ? dashboardStyles.dateInputShellActive : null]}>
                    <Ionicons name="arrow-forward-outline" size={14} color={colors.gray[700]} style={dashboardStyles.webDateIcon} />
                    {/* @ts-expect-error web-only element */}
                    <input
                      aria-label="בחירת תאריך התחלה"
                      value={formatDateInputValue(filterStartDate)}
                      onChange={(e: any) => {
                        const value = String(e?.target?.value || '');
                        setFilterDate(null);
                        setFilterMonth('');
                        if (!value) {
                          setFilterStartDate(null);
                          return;
                        }
                        const nextStart = new Date(`${value}T00:00:00`);
                        setFilterStartDate(nextStart);
                        if (filterEndDate && nextStart.getTime() > new Date(filterEndDate).getTime()) {
                          setFilterEndDate(nextStart);
                        }
                      }}
                      type="date"
                      max={filterEndDate ? formatDateInputValue(filterEndDate) : undefined}
                      style={dashboardStyles.webDateInputWithIcon as any}
                    />
                  </View>
                </View>

                <View style={dashboardStyles.advancedField}>
                  <Text style={dashboardStyles.advancedFieldLabel}>עד תאריך</Text>
                  <View style={[dashboardStyles.dateInputShell, filterEndDate ? dashboardStyles.dateInputShellActive : null]}>
                    <Ionicons name="arrow-back-outline" size={14} color={colors.gray[700]} style={dashboardStyles.webDateIcon} />
                    {/* @ts-expect-error web-only element */}
                    <input
                      aria-label="בחירת תאריך סיום"
                      value={formatDateInputValue(filterEndDate)}
                      onChange={(e: any) => {
                        const value = String(e?.target?.value || '');
                        setFilterDate(null);
                        setFilterMonth('');
                        if (!value) {
                          setFilterEndDate(null);
                          return;
                        }
                        const nextEnd = new Date(`${value}T00:00:00`);
                        setFilterEndDate(nextEnd);
                        if (filterStartDate && nextEnd.getTime() < new Date(filterStartDate).getTime()) {
                          setFilterStartDate(nextEnd);
                        }
                      }}
                      type="date"
                      min={filterStartDate ? formatDateInputValue(filterStartDate) : undefined}
                      style={dashboardStyles.webDateInputWithIcon as any}
                    />
                  </View>
                </View>
              </View>
            </View>
          ) : null}
        </View>

        <View style={[dashboardStyles.contentGrid, isCompactDesktop ? dashboardStyles.contentGridCompact : null]}>
          <View style={dashboardStyles.dashboardMainColumn}>
            <View style={dashboardStyles.sectionCard}>
              <View style={[dashboardStyles.overviewStatsSection, dashboardStyles.overviewStatsSectionFirst]}>
                <View style={dashboardStyles.overviewStatsHeader}>
                  <Text style={dashboardStyles.overviewStatsEyebrow}>מדדי פרופיל</Text>
                  <Text style={dashboardStyles.overviewStatsTitle}>תמונת שנה מהירה</Text>
                </View>
                <View style={dashboardStyles.overviewStatsGrid}>
                  {profileStyleStats.map((item) => (
                    <DashboardStatCard
                      key={item.key}
                      title={item.title}
                      value={item.value}
                      subtitle={item.subtitle}
                      icon={item.icon}
                      tone={item.tone}
                      badgeText={item.badgeText}
                    />
                  ))}
                </View>
              </View>

              <View style={dashboardStyles.recentEventsSection}>
                <View style={dashboardStyles.overviewStatsDivider} />
                <View style={dashboardStyles.sectionHeader}>
                  <View style={dashboardStyles.sectionHeaderTextWrap}>
                    <Text style={dashboardStyles.sectionEyebrow}>אירועים אחרונים</Text>
                    <Text style={dashboardStyles.sectionTitle}>הפעילות האחרונה במערכת</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="מעבר לכל האירועים"
                    onPress={() => router.push('/(admin)/admin-events-list')}
                    style={({ hovered, pressed }: any) => [
                      dashboardStyles.inlineActionBtn,
                      Platform.OS === 'web' && hovered ? dashboardStyles.inlineActionBtnHover : null,
                      pressed ? dashboardStyles.actionPressed : null,
                    ]}
                  >
                    <Text style={dashboardStyles.inlineActionBtnText}>לכל האירועים</Text>
                  </Pressable>
                </View>

                {loading ? (
                  <View style={dashboardStyles.sectionState}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={dashboardStyles.sectionStateText}>טוען אירועים...</Text>
                  </View>
                ) : (
                  <View style={dashboardStyles.recentEventsList}>
                    {recentEvents.map((event) => {
                      const coverSource: any = String(event.invitationImageUrl ?? '').trim()
                        ? { uri: String(event.invitationImageUrl).trim() }
                        : getHeroImageSource(event.title);
                      const eventType = inferEventType(event.title) || 'חתונה';
                      const eventTypeMeta = EVENT_TYPE_META[eventType as keyof typeof EVENT_TYPE_META] ?? EVENT_TYPE_META['אירוע חברה'];

                      return (
                        <Pressable
                          key={event.id}
                          accessibilityRole="button"
                          accessibilityLabel={`פתיחת אירוע ${event.title}`}
                          onPress={() => router.push({ pathname: '/(admin)/admin-event-details', params: { id: event.id } })}
                          style={({ hovered, pressed }: any) => [
                            dashboardStyles.recentEventItem,
                            Platform.OS === 'web' && hovered ? dashboardStyles.recentEventItemHover : null,
                            pressed ? dashboardStyles.actionPressed : null,
                          ]}
                        >
                          <View style={dashboardStyles.recentEventThumbWrap}>
                            <Image source={coverSource} style={dashboardStyles.recentEventThumb} contentFit="cover" transition={0} />
                          </View>

                          <View style={dashboardStyles.recentEventContent}>
                            <View style={dashboardStyles.recentEventTitleRow}>
                              <Text style={dashboardStyles.recentEventTitle} numberOfLines={1}>
                                {event.title}
                              </Text>
                              <View
                                style={[
                                  dashboardStyles.recentEventTypeBadge,
                                  { backgroundColor: eventTypeMeta.background, borderColor: eventTypeMeta.border },
                                ]}
                              >
                                <Text style={[dashboardStyles.recentEventTypeBadgeText, { color: eventTypeMeta.text }]}>{eventType}</Text>
                              </View>
                            </View>
                            <Text style={dashboardStyles.recentEventSubtitle} numberOfLines={1}>
                              {getEventSubtitle(event) || 'ללא פרטים נוספים'}
                            </Text>
                            <View style={dashboardStyles.recentEventMetaRow}>
                              <Text style={dashboardStyles.recentEventMetaText}>{formatDateLabel(event.date)}</Text>
                              <View style={dashboardStyles.metaDot} />
                              <Text style={dashboardStyles.recentEventMetaText} numberOfLines={1}>
                                {[event.location, event.city].filter(Boolean).join(' • ') || 'ללא מיקום'}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

          </View>

          <View style={[dashboardStyles.dashboardSideColumn, isCompactDesktop ? dashboardStyles.dashboardSideColumnCompact : null]}>
            <View style={[dashboardStyles.sectionCard, isCompactDesktop ? dashboardStyles.dashboardSideSectionCardCompact : null]}>
              <View style={dashboardStyles.sectionHeader}>
                <View style={dashboardStyles.sectionHeaderTextWrap}>
                  <Text style={dashboardStyles.sectionEyebrow}>לקוחות אחרונים</Text>
                  <Text style={dashboardStyles.sectionTitle}>הלקוחות שהצטרפו לאחרונה</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="מעבר לעמוד משתמשים"
                  onPress={() => router.push('/(admin)/users')}
                  style={({ hovered, pressed }: any) => [
                    dashboardStyles.inlineActionBtn,
                    Platform.OS === 'web' && hovered ? dashboardStyles.inlineActionBtnHover : null,
                    pressed ? dashboardStyles.actionPressed : null,
                  ]}
                >
                  <Text style={dashboardStyles.inlineActionBtnText}>למשתמשים</Text>
                </Pressable>
              </View>

              {clientsLoading ? (
                <View style={dashboardStyles.sectionState}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={dashboardStyles.sectionStateText}>טוען לקוחות...</Text>
                </View>
              ) : (
                <View style={dashboardStyles.clientList}>
                  {recentClients.map((client) => (
                    <Pressable
                      key={client.id}
                      accessibilityRole="button"
                      accessibilityLabel={`פתיחת עמוד משתמשים עבור ${client.name}`}
                      onPress={() => router.push('/(admin)/users')}
                      style={({ hovered, pressed }: any) => [
                        dashboardStyles.clientItem,
                        Platform.OS === 'web' && hovered ? dashboardStyles.clientItemHover : null,
                        pressed ? dashboardStyles.actionPressed : null,
                      ]}
                    >
                      <View style={dashboardStyles.clientAvatar}>
                        <Text style={dashboardStyles.clientAvatarText}>{initialsLabel(client.name || client.email || 'U')}</Text>
                      </View>
                      <View style={dashboardStyles.clientContent}>
                        <Text style={dashboardStyles.clientName} numberOfLines={1}>
                          {client.name || 'ללא שם'}
                        </Text>
                        <Text style={dashboardStyles.clientMeta} numberOfLines={1}>
                          {client.email}
                        </Text>
                      </View>
                      <Text style={dashboardStyles.clientDateText}>{formatHebrewDate(client.created_at)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={[dashboardStyles.sectionCard, isCompactDesktop ? dashboardStyles.dashboardSideSectionCardCompact : null]}>
              <View style={dashboardStyles.sectionHeader}>
                <View style={dashboardStyles.sectionHeaderTextWrap}>
                  <Text style={dashboardStyles.sectionEyebrow}>סטטיסטיקות</Text>
                  <Text style={dashboardStyles.sectionTitle}>תמונת מצב מהירה</Text>
                </View>
              </View>

              <View style={dashboardStyles.quickStatsGrid}>
                <View style={dashboardStyles.quickStatCard}>
                  <Text style={dashboardStyles.quickStatValue}>{formatCount(clients.length)}</Text>
                  <Text style={dashboardStyles.quickStatLabel}>לקוחות</Text>
                </View>
                <View style={dashboardStyles.quickStatCard}>
                  <Text style={dashboardStyles.quickStatValue}>{formatCount(urgentEventsCount)}</Text>
                  <Text style={dashboardStyles.quickStatLabel}>אירועים קרובים</Text>
                </View>
                <View style={dashboardStyles.quickStatCard}>
                  <Text style={dashboardStyles.quickStatValue}>{rsvpRate}%</Text>
                  <Text style={dashboardStyles.quickStatLabel}>אישורי הגעה</Text>
                </View>
                <View style={dashboardStyles.quickStatCard}>
                  <Text style={dashboardStyles.quickStatValue}>{seatingRate}%</Text>
                  <Text style={dashboardStyles.quickStatLabel}>הושבה</Text>
                </View>
              </View>
            </View>

          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={Boolean(deleteConfirmEvent)} animationType="fade" onRequestClose={closeDeleteDialog}>
        <Pressable style={dashboardStyles.deleteOverlayModern} onPress={closeDeleteDialog}>
          <Pressable style={dashboardStyles.deleteCardModern} onPress={() => null}>
            <View style={dashboardStyles.deleteHeaderRowModern}>
              <View style={dashboardStyles.deleteIconWrapModern}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </View>
              <View style={dashboardStyles.deleteTitleWrapModern}>
                <Text style={dashboardStyles.deleteTitleModern}>מחיקת אירוע</Text>
                <Text style={dashboardStyles.deleteSubtitleModern}>פעולה זו אינה ניתנת לביטול</Text>
              </View>
            </View>

            <Text style={dashboardStyles.deleteBodyModern}>
              האם אתה בטוח שברצונך למחוק את האירוע "{deleteConfirmEvent?.title || 'ללא שם'}"?
            </Text>
            <Text style={dashboardStyles.deleteHintModern}>
              המחיקה תסיר גם נתונים קשורים כמו מוזמנים, הודעות, משימות ומפת הושבה.
            </Text>

            <View style={dashboardStyles.deleteActionsModern}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול מחיקה"
                onPress={closeDeleteDialog}
                disabled={deleteSaving}
                style={({ hovered, pressed }: any) => [
                  dashboardStyles.deleteCancelBtnModern,
                  Platform.OS === 'web' && hovered ? dashboardStyles.deleteCancelBtnHoverModern : null,
                  pressed ? dashboardStyles.actionPressed : null,
                ]}
              >
                <Text style={dashboardStyles.deleteCancelBtnTextModern}>ביטול</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="אישור מחיקה"
                onPress={() => void performDeleteEvent()}
                disabled={deleteSaving}
                style={({ hovered, pressed }: any) => [
                  dashboardStyles.deleteConfirmBtnModern,
                  Platform.OS === 'web' && hovered ? dashboardStyles.deleteConfirmBtnHoverModern : null,
                  pressed ? dashboardStyles.actionPressed : null,
                ]}
              >
                {deleteSaving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={colors.white} />
                    <Text style={dashboardStyles.deleteConfirmBtnTextModern}>מחק אירוע</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {Platform.OS !== 'web' ? (
        <DateTimePickerModal
          isVisible={showDatePicker}
          mode="date"
          onConfirm={(date) => {
            setShowDatePicker(false);
            if (datePickerMode === 'exact') {
              setFilterDate(date as Date);
              setFilterMonth('');
              setFilterStartDate(null);
              setFilterEndDate(null);
              return;
            }

            if (datePickerMode === 'start') {
              const nextStart = date as Date;
              setFilterDate(null);
              setFilterMonth('');
              setFilterStartDate(nextStart);
              if (filterEndDate && nextStart.getTime() > new Date(filterEndDate).getTime()) {
                setFilterEndDate(nextStart);
              }
              return;
            }

            const nextEnd = date as Date;
            setFilterDate(null);
            setFilterMonth('');
            setFilterEndDate(nextEnd);
            if (filterStartDate && nextEnd.getTime() < new Date(filterStartDate).getTime()) {
              setFilterStartDate(nextEnd);
            }
          }}
          onCancel={() => setShowDatePicker(false)}
          minimumDate={datePickerMode === 'end' && filterStartDate ? new Date(filterStartDate) : undefined}
          locale="he-IL"
        />
      ) : null}
    </View>
  );
}

const dashboardStyles = StyleSheet.create({
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 22,
  },
  heroShell: {
    gap: 18,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    padding: 24,
    gap: 24,
    shadowColor: '#0B1C41',
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  heroChartCard: {
    marginTop: 2,
    borderRadius: 24,
    backgroundColor: '#FBFCFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    padding: 20,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  heroIdentity: {
    flex: 1,
    alignItems: 'stretch',
    gap: 18,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroLogoWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  heroLogoImg: {
    width: '78%',
    height: '78%',
  },
  heroTitleTextWrap: {
    flex: 1,
    alignItems: 'stretch',
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  heroNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroNavItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  heroNavItemActive: {
    backgroundColor: 'rgba(25,93,230,0.08)',
  },
  heroNavText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  heroNavTextActive: {
    color: '#195de6',
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  iconActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconActionBtnHover: {
    backgroundColor: '#F8FAFD',
  },
  iconActionDot: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: colors.white,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#195de6',
    shadowColor: '#195de6',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryActionBtnHover: {
    opacity: 0.96,
  },
  primaryActionBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  actionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  kpiCard: {
    flex: 1,
    minWidth: 220,
    borderRadius: 22,
    backgroundColor: '#FBFCFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 10,
  },
  kpiCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 18,
  },
  kpiCaptionStrong: {
    color: colors.text,
    fontWeight: '900',
  },
  kpiValueRow: {
    minHeight: 40,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  kpiValue: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  kpiDeltaPositive: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.10)',
  },
  kpiDeltaPositiveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    textAlign: 'right',
  },
  kpiDeltaPrimary: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(25,93,230,0.10)',
  },
  kpiDeltaPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  kpiSubtleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
  },
  progressTrack: {
    width: 82,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E7ECF5',
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#195de6',
  },
  filterCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    padding: 20,
    gap: 16,
    shadowColor: '#0B1C41',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  searchWrap: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    justifyContent: 'center',
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    right: 16,
    top: 18,
  },
  searchInput: {
    minHeight: 54,
    paddingRight: 46,
    paddingLeft: 44,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  clearSearchBtnModern: {
    position: 'absolute',
    left: 12,
    top: 13,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSummary: {
    alignItems: 'flex-end',
    gap: 8,
    minWidth: 230,
  },
  activeFiltersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(25,93,230,0.08)',
  },
  activeFiltersBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  searchSummaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  searchSummaryStrong: {
    color: colors.text,
    fontWeight: '900',
  },
  filtersTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  statusTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  statusTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F5F7FB',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  statusTabHover: {
    backgroundColor: '#EEF2F8',
  },
  statusTabActive: {
    backgroundColor: '#195de6',
    borderColor: '#195de6',
    shadowColor: '#195de6',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  statusTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
  },
  statusTabTextActive: {
    color: colors.white,
  },
  statusTabCount: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[500],
  },
  statusTabCountActive: {
    color: 'rgba(255,255,255,0.86)',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  controlSelect: {
    width: 162,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    position: 'relative',
    justifyContent: 'center',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  controlSelectIconWrap: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    pointerEvents: 'none',
  },
  controlSelectWide: {
    width: '100%',
    height: 50,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  controlPicker: {
    width: '100%',
    height: '100%',
    color: colors.text,
  },
  controlPickerWithIcon: {
    paddingRight: 30,
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(245,249,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0B1C41',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  secondaryActionBtnHover: {
    backgroundColor: 'rgba(236,244,255,1)',
  },
  secondaryActionBtnIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(25,93,230,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  activeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  advancedPanel: {
    borderRadius: 22,
    backgroundColor: '#FAFBFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    padding: 16,
    gap: 16,
  },
  advancedPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  advancedTitleWrap: {
    flex: 1,
    alignItems: 'stretch',
    gap: 4,
  },
  advancedEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  advancedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  advancedSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.gray[600],
    textAlign: 'right',
  },
  resetFiltersBtn: {
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(25,93,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetFiltersBtnHover: {
    backgroundColor: 'rgba(25,93,230,0.12)',
  },
  resetFiltersBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  advancedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  advancedField: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    gap: 8,
  },
  advancedFieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  dateInputShell: {
    height: 50,
    borderRadius: 16,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    position: 'relative',
    overflow: 'hidden',
  },
  dateInputShellActive: {
    backgroundColor: 'rgba(25,93,230,0.06)',
    borderColor: 'rgba(25,93,230,0.18)',
  },
  webDateInput: {
    width: '100%',
    height: '100%',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: colors.text,
    fontSize: '13px',
    fontWeight: 800,
    fontFamily: 'inherit',
    textAlign: 'right',
    direction: 'rtl',
    cursor: 'pointer',
    paddingLeft: '12px',
    paddingRight: '12px',
  } as any,
  webDateInputWithIcon: {
    width: '100%',
    height: '100%',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: colors.text,
    fontSize: '13px',
    fontWeight: 800,
    fontFamily: 'inherit',
    textAlign: 'right',
    direction: 'rtl',
    cursor: 'pointer',
    paddingLeft: '36px',
    paddingRight: '12px',
  } as any,
  webDateIcon: {
    position: 'absolute',
    left: 12,
    top: 18,
    pointerEvents: 'none',
  } as any,
  contentGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  contentGridCompact: {
    flexDirection: 'column',
    gap: 16,
  },
  tableColumn: {
    flex: 1,
    minWidth: 0,
  },
  sidebarColumn: {
    width: 300,
    gap: 18,
  },
  sidebarColumnCompact: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
  },
  dashboardMainColumn: {
    flex: 1.2,
    minWidth: 0,
    gap: 18,
  },
  dashboardSideColumn: {
    width: 340,
    gap: 18,
  },
  dashboardSideColumnCompact: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    alignContent: 'stretch',
    gap: 14,
  },
  dashboardSideSectionCardCompact: {
    flex: 1,
    minWidth: 280,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    padding: 20,
    gap: 16,
    shadowColor: '#0B1C41',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionHeaderTextWrap: {
    flex: 1,
    alignItems: 'stretch',
    gap: 4,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  inlineActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(25,93,230,0.08)',
  },
  inlineActionBtnHover: {
    backgroundColor: 'rgba(25,93,230,0.12)',
  },
  inlineActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'center',
  },
  sectionState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  sectionStateText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
  },
  recentEventsList: {
    gap: 12,
  },
  recentEventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.04)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  recentEventItemHover: {
    borderColor: 'rgba(25,93,230,0.10)',
    backgroundColor: '#FFFFFF',
  },
  recentEventThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E6ECF7',
  },
  recentEventThumb: {
    width: '100%',
    height: '100%',
  },
  recentEventContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  recentEventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentEventTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  recentEventTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  recentEventTypeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'right',
  },
  recentEventSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  recentEventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentEventMetaText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
    maxWidth: '46%',
  },
  chartSummaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  yearControls: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  yearBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearBtnHover: {
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  yearPill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  yearPillText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  pillDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.30)',
  },
  chartBarsWrap: {
    height: 260,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
  },
  chartBarCol: {
    flex: 1,
    minWidth: 42,
    alignItems: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  chartBarColHover: {},
  chartBarTrack: {
    width: '100%',
    maxWidth: 56,
    height: 200,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  chartBarTrackHover: {
    borderColor: 'rgba(59,130,246,0.22)',
    backgroundColor: 'rgba(59,130,246,0.05)',
  },
  chartBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,27,61,0.03)',
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 14,
  },
  chartBarFillHot: {
    shadowColor: '#3B82F6',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  chartBarTooltip: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    alignItems: 'center',
    opacity: 0,
    pointerEvents: 'none',
  },
  chartBarTooltipText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  chartBarLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
  },
  chartBarLabelHot: {
    color: colors.primary,
  },
  chartBarValue: {
    marginTop: -6,
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(15,23,42,0.55)',
  },
  chartBarValueHot: {
    color: colors.primary,
  },
  clientList: {
    gap: 10,
  },
  clientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.04)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  clientItemHover: {
    borderColor: 'rgba(25,93,230,0.10)',
    backgroundColor: '#FFFFFF',
  },
  clientAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8EEF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
  },
  clientContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  clientName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  clientMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  clientDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'left',
  },
  quickStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  quickStatCard: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: 120,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F8FAFD',
    alignItems: 'center',
    gap: 4,
  },
  quickStatValue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  quickStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'center',
  },
  overviewStatsSection: {
    marginTop: 22,
    gap: 16,
  },
  overviewStatsSectionFirst: {
    marginTop: 0,
  },
  overviewStatsDivider: {
    height: 1,
    backgroundColor: 'rgba(6,23,62,0.08)',
  },
  recentEventsSection: {
    marginTop: 22,
    gap: 16,
  },
  overviewStatsHeader: {
    gap: 4,
    alignItems: 'flex-start',
  },
  overviewStatsEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195DE6',
    textAlign: 'right',
  },
  overviewStatsTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  overviewStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  overviewStatCard: {
    flexGrow: 1,
    flexBasis: 230,
    minHeight: 148,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    justifyContent: 'space-between',
    gap: 10,
  },
  overviewStatCardDark: {
    backgroundColor: '#152B57',
    borderColor: 'rgba(21,43,87,0.50)',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  overviewStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  overviewStatIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  overviewStatIconBoxDark: {
    borderColor: 'rgba(255,255,255,0.12)',
  },
  overviewStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(22,163,74,0.08)',
  },
  overviewStatBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F8A43',
    textAlign: 'right',
  },
  overviewStatTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  overviewStatTitleDark: {
    color: 'rgba(255,255,255,0.78)',
  },
  overviewStatValue: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  overviewStatValueDark: {
    color: '#FFFFFF',
  },
  overviewStatSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
  },
  overviewStatSubtitleDark: {
    color: 'rgba(255,255,255,0.72)',
  },
  tableCardModern: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    overflow: 'hidden',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  tableHeaderTop: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.05)',
  },
  tableHeaderTopCompact: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 12,
  },
  tableHeaderTitleWrap: {
    flex: 1,
    alignItems: 'stretch',
    gap: 4,
  },
  tableHeaderEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  tableHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  tableHeaderSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  tableHeaderSummary: {
    minWidth: 90,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    alignItems: 'center',
  },
  tableHeaderSummaryValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#195de6',
    textAlign: 'center',
  },
  tableHeaderSummaryText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
  },
  tableColumnsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    backgroundColor: '#FAFBFE',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.05)',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  tableColumnsHeaderCompact: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tableColumnsText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colEvent: {
    flex: 1.7,
    minWidth: 0,
  },
  colEventCompact: {
    flex: 1.45,
  },
  colDate: {
    width: 150,
  },
  colDateCompact: {
    width: 108,
  },
  colMetrics: {
    width: 230,
  },
  colMetricsCompact: {
    width: 150,
  },
  colStatus: {
    width: 125,
  },
  colStatusCompact: {
    width: 96,
  },
  colActions: {
    width: 130,
  },
  colActionsCompact: {
    width: 92,
  },
  rowsWrap: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  rowsWrapCompact: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.04)',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  eventRowCompact: {
    gap: 8,
    marginHorizontal: 8,
    marginVertical: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
  },
  eventRowHover: {
    backgroundColor: '#FBFDFF',
    borderColor: 'rgba(25,93,230,0.12)',
  },
  eventMainCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  eventMainCellCompact: {
    gap: 10,
  },
  eventThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E6ECF7',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  eventThumbWrapCompact: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  eventThumb: {
    width: '100%',
    height: '100%',
  },
  eventTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eventTextWrapCompact: {
    gap: 3,
  },
  eventTitleLine: {
    width: '100%',
  },
  eventTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  eventTitleCompact: {
    fontSize: 13,
  },
  eventTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  eventTypeBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  eventTypeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'right',
  },
  eventTypeBadgeTextCompact: {
    fontSize: 9,
  },
  eventSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  eventSubtitleCompact: {
    fontSize: 11,
  },
  eventMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventMetaLineCompact: {
    gap: 6,
  },
  eventMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    maxWidth: '45%',
  },
  eventMetaTextCompact: {
    fontSize: 10,
    maxWidth: '46%',
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[400],
  },
  dateCellModern: {
    alignItems: 'flex-start',
    gap: 4,
  },
  dateMainText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  dateMainTextCompact: {
    fontSize: 12,
  },
  dateSubText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
  },
  dateSubTextCompact: {
    fontSize: 10,
  },
  metricsCell: {
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  metricComboCard: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFD',
    alignItems: 'center',
    gap: 4,
  },
  metricComboCardCompact: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 2,
  },
  metricComboValue: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  metricComboValueCompact: {
    fontSize: 13,
  },
  metricComboDivider: {
    color: colors.gray[500],
    fontWeight: '800',
  },
  metricComboLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'center',
  },
  metricComboLabelCompact: {
    fontSize: 9,
  },
  statusCellModern: {
    alignItems: 'flex-start',
    gap: 6,
  },
  statusCellModernCompact: {
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.20)',
  },
  statusBadgePlanning: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.20)',
  },
  statusBadgePast: {
    backgroundColor: 'rgba(148,163,184,0.16)',
    borderColor: 'rgba(148,163,184,0.20)',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusBadgeTextCompact: {
    fontSize: 9,
  },
  statusBadgeTextActive: {
    color: '#047857',
  },
  statusBadgeTextPlanning: {
    color: '#B45309',
  },
  statusBadgeTextPast: {
    color: '#475569',
  },
  statusSubText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
  },
  statusSubTextCompact: {
    fontSize: 10,
  },
  actionsCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  actionsCellCompact: {
    gap: 6,
  },
  detailsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(25,93,230,0.08)',
  },
  detailsBtnCompact: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
  },
  detailsBtnHover: {
    backgroundColor: 'rgba(25,93,230,0.12)',
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#195de6',
    textAlign: 'center',
  },
  detailsBtnTextCompact: {
    fontSize: 10,
  },
  deleteIconBtnModern: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  deleteIconBtnModernCompact: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  deleteIconBtnModernHover: {
    backgroundColor: 'rgba(239,68,68,0.14)',
  },
  tableFooterModern: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(6,23,62,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableFooterTextModern: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  tableFooterTextMuted: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 46,
    paddingHorizontal: 20,
    gap: 10,
  },
  centerStateTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  centerStateText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'center',
  },
  emptyCreateBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#195de6',
  },
  emptyCreateBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  widgetCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    padding: 18,
    gap: 14,
    shadowColor: '#0B1C41',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  widgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  widgetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  widgetBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(25,93,230,0.08)',
  },
  widgetBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#195de6',
    textAlign: 'right',
  },
  widgetEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 20,
  },
  widgetList: {
    gap: 12,
  },
  upcomingItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingVertical: 4,
  },
  upcomingItemHover: {
    opacity: 0.92,
  },
  upcomingAccent: {
    width: 5,
    borderRadius: 999,
  },
  upcomingAccentPrimary: {
    backgroundColor: '#195de6',
  },
  upcomingAccentWarning: {
    backgroundColor: '#F59E0B',
  },
  upcomingAccentMuted: {
    backgroundColor: '#CBD5E1',
  },
  upcomingTextWrap: {
    flex: 1,
    gap: 3,
  },
  upcomingOverline: {
    fontSize: 10,
    fontWeight: '900',
    color: '#195de6',
    textAlign: 'right',
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  upcomingLocation: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
  },
  insightCard: {
    borderRadius: 24,
    padding: 20,
    gap: 14,
    shadowColor: '#195de6',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
  },
  insightSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'right',
  },
  insightList: {
    gap: 12,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  insightCheck: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  insightItemText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'right',
    lineHeight: 18,
  },
  deleteOverlayModern: {
    flex: 1,
    backgroundColor: 'rgba(9,15,26,0.44)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  deleteCardModern: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    padding: 22,
    gap: 14,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 28px 60px rgba(0,0,0,0.18)' } as any) : null),
  },
  deleteHeaderRowModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteIconWrapModern: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTitleWrapModern: {
    flex: 1,
    alignItems: 'stretch',
    gap: 4,
  },
  deleteTitleModern: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  deleteSubtitleModern: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  deleteBodyModern: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    lineHeight: 22,
  },
  deleteHintModern: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 18,
  },
  deleteActionsModern: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteCancelBtnModern: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelBtnHoverModern: {
    backgroundColor: 'rgba(6,23,62,0.08)',
  },
  deleteCancelBtnTextModern: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  deleteConfirmBtnModern: {
    flex: 1.3,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteConfirmBtnHoverModern: {
    opacity: 0.96,
  },
  deleteConfirmBtnTextModern: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
  },
});

