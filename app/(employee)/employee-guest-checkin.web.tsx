import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { colors } from '@/constants/colors';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { useGuestCheckInModel } from '@/features/guests/useGuestCheckInModel';
import type { Guest } from '@/types';

const UNCATEGORIZED_KEY = '__uncategorized__' as const;

function normalizeCategoryId(raw: unknown) {
  const s = String(raw ?? '').trim();
  return s ? s.toLowerCase() : null;
}

function statusTag(status: Guest['status']) {
  if (status === 'מגיע') return { bg: 'rgba(34,197,94,0.12)', fg: '#15803D' };
  if (status === 'לא מגיע') return { bg: 'rgba(244,63,94,0.12)', fg: '#BE123C' };
  return { bg: 'rgba(15,23,42,0.06)', fg: colors.gray[700] };
}

export default function EmployeeGuestCheckinWebScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const fallbackToDetails = useMemo(
    () =>
      resolvedEventId
        ? `/(employee)/employee-event-details?id=${resolvedEventId}`
        : '/(employee)/employee-events',
    [resolvedEventId]
  );

  const {
    loading,
    categories,
    filteredGuests,
    counts,
    sections,
    query,
    setQuery,
    filter,
    setFilter,
    refresh,
    toggleCheckIn,
    savingId,
  } = useGuestCheckInModel({
    eventId: resolvedEventId ? resolvedEventId : null,
    errorTitle: 'שגיאה',
    errorMessage: 'לא ניתן לטעון את רשימת האורחים',
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const categoryLabelById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => {
      const norm = normalizeCategoryId(c?.id);
      if (!norm) return;
      m.set(norm, String(c.name || '').trim() || 'קטגוריה');
    });
    return m;
  }, [categories]);

  const categoryLabel = useMemo(() => {
    if (!categoryFilter) return 'הכל';
    if (categoryFilter === UNCATEGORIZED_KEY) return 'ללא קטגוריה';
    return categoryLabelById.get(categoryFilter) || 'קטגוריה';
  }, [categoryFilter, categoryLabelById]);

  const visibleGuests = useMemo(() => {
    if (!categoryFilter) return filteredGuests;
    return filteredGuests.filter((g) => {
      const norm = normalizeCategoryId((g as any)?.category_id);
      const key = norm ? norm : UNCATEGORIZED_KEY;
      return key === categoryFilter;
    });
  }, [categoryFilter, filteredGuests]);

  const phoneToTel = (raw: string) => {
    const cleaned = String(raw || '').replace(/[^\d+]/g, '').trim();
    return cleaned || null;
  };

  const callGuest = async (rawPhone: string, guestName?: string) => {
    const tel = phoneToTel(rawPhone);
    if (!tel) return;
    const url = `tel:${tel}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('שגיאה', 'הדפדפן לא תומך בחיוג');
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.error('Call guest error:', e);
      Alert.alert('שגיאה', `לא ניתן לפתוח שיחה${guestName ? ` ל-${guestName}` : ''}`);
    }
  };

  return (
    <View style={styles.page}>
      <DesktopTopBar
        title="צ׳ק-אין אורחים"
        subtitle={`${counts.checkedIn}/${counts.total} הגיעו${resolvedEventId ? ` · אירוע: ${resolvedEventId}` : ''}`}
        leftActions={
          <>
            <TopBarIconButton icon="arrow-forward" label="חזרה" onPress={() => router.replace(fallbackToDetails)} />
            <TopBarIconButton icon="refresh" label="רענון" onPress={() => void refresh()} />
          </>
        }
      />

      {!resolvedEventId ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.gray[500]} />
          <Text style={styles.emptyTitle}>חסר מזהה אירוע</Text>
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
            <Text style={styles.primaryBtnText}>חזרה לרשימת אירועים</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.contentRow}>
          <View style={styles.main}>
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { width: 120, textAlign: 'center' }]}>צ׳ק-אין</Text>
                <Text style={[styles.th, { flex: 1 }]}>שם</Text>
                <Text style={[styles.th, { width: 160 }]}>טלפון</Text>
                <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>אנשים</Text>
                <Text style={[styles.th, { width: 220 }]}>קטגוריה</Text>
                <Text style={[styles.th, { width: 120, textAlign: 'center' }]}>סטטוס</Text>
              </View>

              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>טוען אורחים...</Text>
                </View>
              ) : visibleGuests.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                  <Text style={styles.emptyTitle}>לא נמצאו אורחים</Text>
                  <Text style={styles.emptyText}>נסה לשנות חיפוש / פילטר / קטגוריה.</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                  {visibleGuests.map((g) => {
                    const checkedIn = Boolean(g.checkedIn);
                    const isSaving = savingId === g.id;
                    const tel = phoneToTel(g.phone);
                    const catKey = normalizeCategoryId((g as any)?.category_id) || UNCATEGORIZED_KEY;
                    const catName =
                      catKey === UNCATEGORIZED_KEY ? 'ללא קטגוריה' : categoryLabelById.get(catKey) || 'קטגוריה';
                    const tag = statusTag(g.status);

                    return (
                      <View key={g.id} style={styles.tr}>
                        <View style={[styles.td, { width: 120, alignItems: 'center' }]}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                            onPress={() => void toggleCheckIn(g)}
                            disabled={isSaving}
                            style={({ hovered, pressed }: any) => [
                              styles.checkinBtn,
                              checkedIn ? styles.checkinBtnOn : null,
                              Platform.OS === 'web' && hovered ? styles.checkinBtnHover : null,
                              pressed ? { opacity: 0.92 } : null,
                              isSaving ? { opacity: 0.7 } : null,
                            ]}
                          >
                            {isSaving ? (
                              <ActivityIndicator color={checkedIn ? colors.white : colors.primary} />
                            ) : (
                              <Ionicons
                                name={checkedIn ? 'checkmark-circle' : 'ellipse-outline'}
                                size={16}
                                color={checkedIn ? colors.white : colors.primary}
                              />
                            )}
                            <Text style={[styles.checkinBtnText, checkedIn ? { color: colors.white } : { color: colors.primary }]}>
                              הגיע
                            </Text>
                          </Pressable>
                        </View>

                        <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                          {g.name}
                        </Text>

                        <View style={[styles.td, { width: 160, flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }]}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={tel ? `התקשר ל-${g.name}` : `אין מספר טלפון עבור ${g.name}`}
                            disabled={!tel}
                            onPress={() => void callGuest(g.phone, g.name)}
                            style={({ hovered, pressed }: any) => [
                              styles.phoneBtn,
                              !tel ? styles.phoneBtnDisabled : null,
                              Platform.OS === 'web' && hovered ? styles.phoneBtnHover : null,
                              pressed ? { opacity: 0.92 } : null,
                            ]}
                          >
                            <Ionicons name="call-outline" size={14} color={tel ? colors.primary : 'rgba(17,24,39,0.35)'} />
                          </Pressable>
                          <Text style={[styles.phoneText, { flex: 1 }]} numberOfLines={1}>
                            {g.phone || '—'}
                          </Text>
                        </View>

                        <Text style={[styles.td, { width: 90, textAlign: 'center' }]}>{Number(g.numberOfPeople) || 1}</Text>

                        <Text style={[styles.td, { width: 220 }]} numberOfLines={1}>
                          {catName}
                        </Text>

                        <View style={[styles.td, { width: 120, alignItems: 'center' }]}>
                          <View style={[styles.statusTag, { backgroundColor: tag.bg }]}>
                            <Text style={[styles.statusTagText, { color: tag.fg }]}>{g.status}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>

          <View style={styles.filters}>
            <View style={styles.filterCard}>
              <Text style={styles.cardTitle}>חיפוש וסינון</Text>

              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="חיפוש שם/טלפון..."
                  placeholderTextColor={colors.gray[500]}
                  value={query}
                  onChangeText={setQuery}
                  textAlign="right"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.pillsRow}>
                {[
                  { key: 'all' as const, label: 'הכל' },
                  { key: 'checked_in' as const, label: 'הגיעו' },
                  { key: 'not_checked_in' as const, label: 'לא הגיעו' },
                ].map((opt) => {
                  const active = filter === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}
                      onPress={() => setFilter(opt.key)}
                      style={({ hovered, pressed }: any) => [
                        styles.pill,
                        active ? styles.pillActive : null,
                        Platform.OS === 'web' && hovered ? styles.pillHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.filterCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>קטגוריות</Text>
                {categoryFilter ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="נקה סינון קטגוריה"
                    onPress={() => setCategoryFilter(null)}
                    style={({ hovered, pressed }: any) => [
                      styles.linkBtn,
                      Platform.OS === 'web' && hovered ? styles.linkBtnHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={styles.linkBtnText}>נקה</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.helperText}>פעיל: {categoryLabel}</Text>

              <View style={{ gap: 10, marginTop: 12 }}>
                {sections.map((sec) => {
                  const active = categoryFilter === sec.key;
                  const pct = sec.total ? Math.round((sec.checkedIn / sec.total) * 100) : 0;
                  return (
                    <Pressable
                      key={sec.key}
                      accessibilityRole="button"
                      accessibilityLabel={`סינון קטגוריה ${sec.name}`}
                      onPress={() => setCategoryFilter(String(sec.key))}
                      style={({ hovered, pressed }: any) => [
                        styles.catRow,
                        active ? styles.catRowActive : null,
                        Platform.OS === 'web' && hovered ? styles.catRowHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <View style={styles.catRowLeft}>
                        <View style={styles.catPill}>
                          <Text style={styles.catPillText}>{`${sec.checkedIn}/${sec.total}`}</Text>
                        </View>
                        <View style={styles.catPctPill}>
                          <Text style={styles.catPctText}>{`${pct}%`}</Text>
                        </View>
                      </View>
                      <View style={styles.catRowRight}>
                        <Text style={styles.catName} numberOfLines={1}>
                          {sec.name}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      )}
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
  filters: { width: 360 },

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
  },
  th: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

  tr: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'transparent',
  },
  td: { fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'right' },

  loadingRow: { paddingVertical: 26, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },
  emptyRow: { paddingVertical: 30, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  checkinBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  checkinBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkinBtnHover: { opacity: 0.95 },
  checkinBtnText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  phoneBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  phoneBtnDisabled: { opacity: 0.6 },
  phoneText: { fontSize: 12, fontWeight: '800', color: colors.gray[800], textAlign: 'right' },

  statusTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusTagText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  filterCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },

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

  pillsRow: { marginTop: 12, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  pillHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  pillActive: { backgroundColor: 'rgba(15,69,230,0.10)', borderColor: 'rgba(15,69,230,0.22)' },
  pillText: { fontSize: 12, fontWeight: '900', color: colors.gray[800], textAlign: 'right' },
  pillTextActive: { color: colors.primary },

  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.04)' },
  linkBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  linkBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  helperText: { marginTop: 8, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },

  catRow: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(15,23,42,0.03)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  catRowHover: { backgroundColor: 'rgba(15,23,42,0.05)' },
  catRowActive: { backgroundColor: 'rgba(15,69,230,0.06)', borderColor: 'rgba(15,69,230,0.16)' },
  catRowRight: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  catName: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right' },
  catRowLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  catPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(15,23,42,0.05)' },
  catPillText: { fontSize: 12, fontWeight: '900', color: colors.gray[800] },
  catPctPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(15,69,230,0.08)' },
  catPctText: { fontSize: 12, fontWeight: '900', color: colors.primary },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  primaryBtn: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnHover: { opacity: 0.95 },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'center' },
});

