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

import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { supabase } from '@/lib/supabase';
import { Event } from '@/types';
import { MONTHS } from '@/features/events/eventsConstants';
import { useEventsListModel } from '@/features/events/useEventsListModel';
import AdminEventsScreen from './admin-events';

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

function formatDateInputValue(date: Date | string | null | undefined) {
  if (!date) return '';
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
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
  return { label: 'בתכנון', tone: 'planning' as const };
}

export default function AdminEventsWebScreen() {
  const { width } = useWindowDimensions();

  if (width < 900) {
    return <AdminEventsScreen />;
  }

  const router = useRouter();
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  return (
    <View style={styles.page}>
      <View style={styles.filterBarOuter}>
        <View style={styles.toolbarCard}>
          <View style={styles.toolbarTopRow}>
            <View style={styles.toolbarTitleWrap}>
              <Text style={styles.toolbarEyebrow}>ניהול אירועים</Text>
              <Text style={styles.toolbarTitle}>טבלת אירועים</Text>
            </View>
            <View style={styles.toolbarStats}>
              <View style={styles.toolbarStatChip}>
                <Text style={styles.toolbarStatValue}>{formatCount(filteredEvents.length)}</Text>
                <Text style={styles.toolbarStatLabel}>מוצגים</Text>
              </View>
              <View style={styles.toolbarStatChipMuted}>
                <Text style={styles.toolbarStatValueMuted}>{formatCount(events.length)}</Text>
                <Text style={styles.toolbarStatLabel}>סה"כ</Text>
              </View>
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
        <View style={styles.tableCard}>
          <View style={styles.tableTopBar}>
            <View style={styles.tableTopTextWrap}>
              <Text style={styles.tableTopTitle}>כל האירועים במערכת</Text>
              <Text style={styles.tableTopSubtitle}>מעקב מהיר אחרי בעלי האירוע, תאריכים וסטטוס הושבה.</Text>
            </View>
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 64, textAlign: 'center' }]}>תמונה</Text>
            <Text style={[styles.th, { width: 160 }]}>לקוח</Text>
            <Text style={[styles.th, { width: 110 }]}>תאריך</Text>
            <Text style={[styles.th, { flex: 1 }]}>כותרת</Text>
            <Text style={[styles.th, { flex: 1 }]}>מיקום</Text>
            <Text style={[styles.th, { width: 100, textAlign: 'center' }]}>מוזמנים</Text>
            <Text style={[styles.th, { width: 100, textAlign: 'center' }]}>מגיעים</Text>
            <Text style={[styles.th, { width: 100, textAlign: 'center' }]}>הושבו</Text>
            <Text style={[styles.th, { width: 120 }]}>זמן</Text>
            <Text style={[styles.th, { width: 100, textAlign: 'center' }]}>סטטוס</Text>
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
              {filteredEvents.map((e, index) => {
                const ownerName = String((e as any).userName || e.userName || '').trim();
                const invitationImageUrl = String((e as any).invitationImageUrl ?? e.invitationImageUrl ?? '').trim();
                const subtitle = getEventSubtitle(e);
                const status = getStatusMeta(e.date);
                const guestStats = guestStatsByEventId[String(e.id)] || null;
                const coverSource: any = invitationImageUrl ? { uri: invitationImageUrl } : getHeroImageSource(e.title);
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
                      styles.tr,
                      index % 2 === 1 ? styles.trAlt : null,
                      Platform.OS === 'web' && hovered ? styles.trHover : null,
                      pressed ? { opacity: 0.96 } : null,
                    ]}
                  >
                    <View style={[styles.cell, { width: 64, alignItems: 'center' }]}>
                      <View style={styles.avatarRing}>
                        <Image source={coverSource} style={styles.avatarImg} contentFit="cover" transition={0} />
                      </View>
                    </View>

                    <View style={[styles.cell, { width: 160 }]}>
                      <Text style={styles.ownerName} numberOfLines={1}>
                        {ownerName || '—'}
                      </Text>
                    </View>

                    <View style={[styles.cell, styles.dateCell]}>
                      <View style={styles.dateBadge}>
                        <Text style={styles.dateDay}>{formatDay(e.date)}</Text>
                        <Text style={styles.dateMonth}>{formatMonthYear(e.date)}</Text>
                      </View>
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

                    <View style={[styles.cell, { flex: 1 }]}>
                      <Text style={styles.locationMain} numberOfLines={1}>
                        {e.location || '—'}
                      </Text>
                      <Text style={styles.locationSub} numberOfLines={1}>
                        {e.city || 'ללא עיר'}
                      </Text>
                    </View>

                    <View style={[styles.cell, { width: 100, alignItems: 'center' }]}>
                      <Text style={styles.guestsMetaMain}>
                        {guestStatsLoading ? '…' : guestStats ? formatCount(guestStats.invitedPeople) : '—'}
                      </Text>
                    </View>

                    <View style={[styles.cell, { width: 100, alignItems: 'center' }]}>
                      <Text style={styles.guestsMetaMain}>
                        {guestStatsLoading ? '…' : guestStats ? formatCount(guestStats.comingPeople) : '—'}
                      </Text>
                    </View>

                    <View style={[styles.cell, { width: 100, alignItems: 'center' }]}>
                      <Text style={styles.guestsMetaMain}>
                        {guestStatsLoading ? '…' : guestStats ? formatCount(guestStats.seatedPeople) : '—'}
                      </Text>
                    </View>

                    <View style={[styles.cell, { width: 120 }]}>
                      <Text style={styles.timeMain}>{daysLeftLabel(e.date)}</Text>
                      <Text style={styles.timeSub}>{formatDateLabel(e.date)}</Text>
                    </View>

                    <View style={[styles.cell, { width: 100, alignItems: 'center' }]}>
                      <View style={[styles.statusPill, statusToneStyle]}>
                        <Text style={[styles.statusPillText, statusTextToneStyle]}>{status.label}</Text>
                      </View>
                    </View>

                    <View style={[styles.cell, { width: 90, alignItems: 'center' }]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`מחיקת אירוע ${e.title}`}
                        onPress={(pressEvent) => handleDeletePress(e, pressEvent)}
                        style={({ hovered, pressed }: any) => [
                          styles.deleteActionBtn,
                          Platform.OS === 'web' && hovered ? styles.deleteActionBtnHover : null,
                          pressed ? styles.deleteActionBtnPressed : null,
                        ]}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </Pressable>
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
  toolbarStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toolbarStatChip: {
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    alignItems: 'center',
  },
  toolbarStatChipMuted: {
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
  },
  toolbarStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  toolbarStatValueMuted: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  toolbarStatLabel: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
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
    color: '#15803d',
  },
  statusPillTextPlanning: {
    color: '#a16207',
  },
  statusPillTextMuted: {
    color: '#475569',
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

