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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { colors } from '@/constants/colors';
import { useGuestCheckInModel } from '@/features/guests/useGuestCheckInModel';
import { tableService } from '@/lib/services/tableService';
import type { Guest, Table } from '@/types';

const NO_TABLE_KEY = '__no_table__' as const;

function statusTag(status: Guest['status']) {
  if (status === 'מגיע') return { bg: 'rgba(34,197,94,0.12)', fg: '#15803D' };
  if (status === 'לא מגיע') return { bg: 'rgba(244,63,94,0.12)', fg: '#BE123C' };
  return { bg: 'rgba(15,23,42,0.06)', fg: colors.gray[700] };
}

function initialsFromName(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  const s = `${a}${b}`.trim();
  return s ? s.toUpperCase() : '•';
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function Switch({
  checked,
  disabled,
  onPress,
  accessibilityLabel,
  saving,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ hovered, pressed }: any) => [
        ui.switchWrap,
        checked ? ui.switchWrapOn : null,
        disabled ? { opacity: 0.6 } : null,
        Platform.OS === 'web' && hovered ? ui.switchHover : null,
        pressed ? { opacity: 0.92 } : null,
      ]}
    >
      <View style={[ui.switchTrack, checked ? ui.switchTrackOn : null]} />
      <View style={[ui.switchThumb, checked ? ui.switchThumbOn : null]}>
        {saving ? <ActivityIndicator size={12} color={colors.primary} /> : null}
      </View>
    </Pressable>
  );
}

export default function EmployeeGuestCheckinWebScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const { width } = useWindowDimensions();
  const isLg = width >= 1024;
  const [tableFilter, setTableFilter] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableNumberById, setTableNumberById] = useState<Map<string, number | null>>(() => new Map());

  const {
    loading,
    guests,
    filteredGuests,
    counts,
    query,
    setQuery,
    filter,
    setFilter,
    refresh,
    toggleCheckIn,
    savingId,
    setCheckedInCount,
    savingCountId,
  } = useGuestCheckInModel({
    eventId: resolvedEventId ? resolvedEventId : null,
    errorTitle: 'שגיאה',
    errorMessage: 'לא ניתן לטעון את רשימת האורחים',
  });

  const loadTables = useCallback(async () => {
    if (!resolvedEventId) {
      setTables([]);
      setTableNumberById(new Map());
      return;
    }

    try {
      const rows = await tableService.getTables(resolvedEventId);
      const next = new Map<string, number | null>();
      rows.forEach((t) => {
        next.set(t.id, typeof t.number === 'number' ? t.number : null);
      });
      setTables(rows);
      setTableNumberById(next);
    } catch (e) {
      console.error('Load tables error:', e);
      setTables([]);
      setTableNumberById(new Map());
    }
  }, [resolvedEventId]);

  useEffect(() => {
    void refresh();
    void loadTables();
  }, [refresh, loadTables]);

  const tablesSorted = useMemo(() => {
    const copy = [...tables];
    copy.sort((a, b) => {
      const an = typeof a.number === 'number' ? a.number : Number.POSITIVE_INFINITY;
      const bn = typeof b.number === 'number' ? b.number : Number.POSITIVE_INFINITY;
      if (an !== bn) return an - bn;
      return String(a.name || '').localeCompare(String(b.name || ''), 'he');
    });
    return copy;
  }, [tables]);

  const tableLabelById = useMemo(() => {
    const m = new Map<string, string>();
    tablesSorted.forEach((t) => {
      const n = typeof t.number === 'number' ? t.number : null;
      const name = String(t.name || '').trim();
      const label = n !== null ? `שולחן ${n}` : name ? `שולחן ${name}` : 'שולחן';
      m.set(t.id, label);
    });
    return m;
  }, [tablesSorted]);

  const activeTableLabel = useMemo(() => {
    if (!tableFilter) return 'הכל';
    if (tableFilter === NO_TABLE_KEY) return 'ללא שולחן';
    return tableLabelById.get(tableFilter) || 'שולחן';
  }, [tableFilter, tableLabelById]);

  const tableStats = useMemo(() => {
    const grouped = new Map<string, { checkedIn: number; total: number }>();
    guests.forEach((g) => {
      const key = g.tableId ? String(g.tableId) : NO_TABLE_KEY;
      const prev = grouped.get(key) || { checkedIn: 0, total: 0 };
      const next = { checkedIn: prev.checkedIn + (g.checkedIn ? 1 : 0), total: prev.total + 1 };
      grouped.set(key, next);
    });
    return grouped;
  }, [guests]);

  const tableRows = useMemo(() => {
    const rows: Array<{
      key: string;
      label: string;
      checkedIn: number;
      total: number;
    }> = tablesSorted.map((t) => {
      const stats = tableStats.get(t.id) || { checkedIn: 0, total: 0 };
      return { key: t.id, label: tableLabelById.get(t.id) || 'שולחן', checkedIn: stats.checkedIn, total: stats.total };
    });

    const noTableStats = tableStats.get(NO_TABLE_KEY);
    if (noTableStats) {
      rows.push({ key: NO_TABLE_KEY, label: 'ללא שולחן', checkedIn: noTableStats.checkedIn, total: noTableStats.total });
    }

    // Handle guests referencing a tableId that isn't in the tables list.
    const known = new Set(rows.map((r) => r.key));
    tableStats.forEach((stats, key) => {
      if (known.has(key)) return;
      if (key === NO_TABLE_KEY) return;
      const n = tableNumberById.get(key) ?? null;
      rows.push({
        key,
        label: n !== null ? `שולחן ${n}` : 'שולחן (לא ידוע)',
        checkedIn: stats.checkedIn,
        total: stats.total,
      });
    });

    return rows;
  }, [tableLabelById, tableNumberById, tableStats, tablesSorted]);

  const eventOverview = useMemo(() => {
    const invitedPeople = guests.reduce((sum, g) => sum + (Number(g.numberOfPeople) || 1), 0);
    const arrivedPeople = guests.reduce((sum, g) => {
      if (!g.checkedIn) return sum;
      const actual = g.checkedInCount === null || g.checkedInCount === undefined ? null : Number(g.checkedInCount);
      const n = actual !== null && Number.isFinite(actual) ? actual : Number(g.numberOfPeople) || 1;
      return sum + n;
    }, 0);
    const arrivingNotArrivedGuests = guests.filter((g) => g.status === 'מגיע' && !g.checkedIn).length;

    const reserveTables = tables.filter((t) => t.shape === 'reserve');
    const regularTables = tables.filter((t) => t.shape !== 'reserve');

    const occupiedCount = (t: Table) => (Array.isArray(t.guests) ? t.guests.length : 0);
    const fullTables = regularTables.filter((t) => (t.capacity || 0) > 0 && occupiedCount(t) >= (t.capacity || 0));
    const emptyTables = regularTables.filter((t) => occupiedCount(t) === 0);

    return {
      invitedPeople,
      arrivedPeople,
      arrivingNotArrivedGuests,
      fullTables: fullTables.length,
      emptyTables: emptyTables.length,
      reserveTables: reserveTables.length,
    };
  }, [guests, tables]);

  const visibleGuests = useMemo(() => {
    if (!tableFilter) return filteredGuests;
    if (tableFilter === NO_TABLE_KEY) return filteredGuests.filter((g) => !g.tableId);
    return filteredGuests.filter((g) => String(g.tableId || '') === tableFilter);
  }, [filteredGuests, tableFilter]);

  return (
    <View style={styles.page}>
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
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.content, !isLg ? styles.contentSm : null]}>
            <View style={[styles.aside, !isLg ? styles.asideSm : null]}>
              <View style={[styles.asideSticky, Platform.OS === 'web' ? ({ position: 'sticky', top: 16 } as any) : null]}>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>דשבורד אירוע</Text>

                  <View style={[styles.dashboardGrid, !isLg ? styles.dashboardGridSm : null]}>
                    <View style={styles.metricCard}>
                      <View style={styles.metricIcon}>
                        <Ionicons name="people" size={16} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.metricLabel}>מוזמנים</Text>
                        <Text style={styles.metricValue}>{eventOverview.invitedPeople}</Text>
                      </View>
                    </View>

                    <View style={[styles.metricCard, { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.18)' }]}>
                      <View style={[styles.metricIcon, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                        <Ionicons name="checkmark-circle" size={16} color="#0F766E" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.metricLabel}>הגיעו</Text>
                        <Text style={[styles.metricValue, { color: '#0F766E' }]}>{eventOverview.arrivedPeople}</Text>
                      </View>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIcon, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                        <Ionicons name="time" size={16} color="#B45309" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.metricLabel}>אישר ועדיין לא הגיע</Text>
                        <Text style={[styles.metricValue, { color: '#B45309' }]}>{eventOverview.arrivingNotArrivedGuests}</Text>
                      </View>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIcon, { backgroundColor: 'rgba(79,70,229,0.10)' }]}>
                        <Ionicons name="grid" size={16} color="#4338CA" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.metricLabel}>שולחנות מלאים</Text>
                        <Text style={[styles.metricValue, { color: '#4338CA' }]}>{eventOverview.fullTables}</Text>
                      </View>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIcon, { backgroundColor: 'rgba(148,163,184,0.18)' }]}>
                        <Ionicons name="remove-circle" size={16} color={colors.gray[700]} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.metricLabel}>שולחנות ריקים</Text>
                        <Text style={styles.metricValue}>{eventOverview.emptyTables}</Text>
                      </View>
                    </View>

                    <View style={styles.metricCard}>
                      <View style={[styles.metricIcon, { backgroundColor: 'rgba(204,160,0,0.12)' }]}>
                        <Ionicons name="shield" size={16} color={colors.secondary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.metricLabel}>שולחנות רזרבה</Text>
                        <Text style={[styles.metricValue, { color: colors.secondary }]}>{eventOverview.reserveTables}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.sectionTitle}>סינון מהיר</Text>
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

                  <View style={styles.summaryRow}>
                    <View style={styles.summaryPill}>
                      <Text style={styles.summaryPillText}>
                        {counts.total ? `${counts.checkedIn}/${counts.total} הגיעו` : 'אין נתונים'}
                      </Text>
                    </View>
                    <View style={[styles.summaryPill, { backgroundColor: 'rgba(34,197,94,0.10)' }]}>
                      <Text style={[styles.summaryPillText, { color: '#15803D' }]}>
                        {counts.total ? `${Math.round((counts.checkedIn / counts.total) * 100)}%` : '0%'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>סטטוס הגעה לפי שולחנות</Text>
                    {tableFilter ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="נקה סינון שולחן"
                        onPress={() => setTableFilter(null)}
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

                  <Text style={styles.helperText}>פעיל: {activeTableLabel}</Text>

                  <View style={{ gap: 10, marginTop: 12 }}>
                    {tableRows.map((row) => {
                      const active = tableFilter === row.key;
                      const ratio = row.total ? row.checkedIn / row.total : 0;
                      const pct = Math.round(clamp01(ratio) * 100);
                      return (
                        <Pressable
                          key={row.key}
                          accessibilityRole="button"
                          accessibilityLabel={`סינון שולחן ${row.label}`}
                          onPress={() => setTableFilter(String(row.key))}
                          style={({ hovered, pressed }: any) => [
                            styles.statCard,
                            active ? styles.statCardActive : null,
                            Platform.OS === 'web' && hovered ? styles.statCardHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <View style={styles.statTopRow}>
                            <Text style={styles.statName} numberOfLines={1}>
                              {row.label}
                            </Text>
                            <View style={styles.statPctPill}>
                              <Text style={styles.statPctText}>{pct}%</Text>
                            </View>
                          </View>

                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${Math.round(clamp01(ratio) * 100)}%` } as any]} />
                          </View>

                          <Text style={styles.statBottomText}>{`${row.checkedIn}/${row.total} הגיעו`}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.main}>
              <View style={styles.mainHeader}>
                <View style={[styles.mainSearchWrap, { flex: 1, minWidth: 0 }]}>
                  <View style={styles.searchIconRight}>
                    <Ionicons name="search" size={18} color={colors.gray[500]} />
                  </View>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="חיפוש אורח או שולחן..."
                    placeholderTextColor={colors.gray[500]}
                    value={query}
                    onChangeText={setQuery}
                    textAlign="right"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.listWrap}>
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>טוען אורחים…</Text>
                  </View>
                ) : visibleGuests.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                    <Text style={styles.emptyTitle}>לא נמצאו אורחים</Text>
                    <Text style={styles.emptyText}>נסה לשנות חיפוש / פילטר / קטגוריה.</Text>
                  </View>
                ) : (
                  <View style={{ paddingBottom: 16 }}>
                    {isLg ? (
                      <View style={styles.tableHeader}>
                        <Text style={[styles.th, { width: 76, textAlign: 'center' }]}>אותיות</Text>
                        <Text style={[styles.th, { flex: 1, paddingRight: 6 }]}>שם האורח</Text>
                        <Text style={[styles.th, { width: 110, textAlign: 'center' }]}>סטטוס</Text>
                        <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>שולחן</Text>
                        <Text style={[styles.th, { width: 120, textAlign: 'center' }]}>אנשים</Text>
                        <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>הגעה</Text>
                      </View>
                    ) : null}

                    <View style={{ gap: 10, marginTop: 10 }}>
                      {visibleGuests.map((g) => {
                        const checkedIn = Boolean(g.checkedIn);
                        const isSaving = savingId === g.id;
                        const tag = statusTag(g.status);
                        const tableNumber = g.tableId ? (tableNumberById.get(g.tableId) ?? null) : null;
                        const people = Number(g.numberOfPeople) || 1;
                        const arrivedCount =
                          g.checkedInCount === null || g.checkedInCount === undefined ? people : Number(g.checkedInCount) || 0;

                        return (
                          <View key={g.id} style={[styles.guestCard, !isLg ? styles.guestCardSm : null]}>
                            <View style={[styles.accentBar, checkedIn ? styles.accentBarOn : null]} />

                            {isLg ? (
                              <View style={styles.guestRow}>
                                <View style={[styles.cell, { width: 76, alignItems: 'center' }]}>
                                  <View style={[styles.avatar, checkedIn ? styles.avatarOn : null]}>
                                    <Text style={styles.avatarText}>{initialsFromName(g.name)}</Text>
                                  </View>
                                </View>

                                <View style={[styles.cell, { flex: 1, minWidth: 0, paddingRight: 6 }]}>
                                  <Text style={styles.guestName} numberOfLines={1}>
                                    {g.name}
                                  </Text>
                                  <Text style={styles.guestSub} numberOfLines={1}>
                                    {g.phone ? `${g.phone}${people > 1 ? ` • +${people - 1}` : ''}` : people > 1 ? `+${people - 1}` : ''}
                                  </Text>
                                </View>

                                <View style={[styles.cell, { width: 110, alignItems: 'flex-end' }]}>
                                  <View style={[styles.statusTag, { backgroundColor: tag.bg }]}>
                                    <Text style={[styles.statusTagText, { color: tag.fg }]}>{g.status}</Text>
                                  </View>
                                </View>

                                <View style={[styles.cell, { width: 90, alignItems: 'center' }]}>
                                  <Text style={styles.cellText}>{tableNumber ?? '—'}</Text>
                                </View>

                                <View style={[styles.cell, { width: 120, alignItems: 'center' }]}>
                                  {checkedIn ? (
                                    <View style={styles.countStepper}>
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`הפחת כמות שהגיעה עבור ${g.name}`}
                                        onPress={() => void setCheckedInCount(g, Math.max(0, arrivedCount - 1))}
                                        disabled={savingCountId === g.id || arrivedCount <= 0}
                                        style={({ hovered, pressed }: any) => [
                                          styles.stepBtn,
                                          (savingCountId === g.id || arrivedCount <= 0) ? styles.stepBtnDisabled : null,
                                          Platform.OS === 'web' && hovered ? styles.stepBtnHover : null,
                                          pressed ? { opacity: 0.92 } : null,
                                        ]}
                                      >
                                        <Text style={styles.stepBtnText}>-</Text>
                                      </Pressable>

                                      <View style={styles.countValueWrap}>
                                        {savingCountId === g.id ? (
                                          <ActivityIndicator size={14} color={colors.primary} />
                                        ) : (
                                          <Text style={styles.countValueText}>{arrivedCount}</Text>
                                        )}
                                        <Text style={styles.countValueSub}>הגיעו</Text>
                                      </View>

                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`הגדל כמות שהגיעה עבור ${g.name}`}
                                        onPress={() => void setCheckedInCount(g, arrivedCount + 1)}
                                        disabled={savingCountId === g.id}
                                        style={({ hovered, pressed }: any) => [
                                          styles.stepBtn,
                                          savingCountId === g.id ? styles.stepBtnDisabled : null,
                                          Platform.OS === 'web' && hovered ? styles.stepBtnHover : null,
                                          pressed ? { opacity: 0.92 } : null,
                                        ]}
                                      >
                                        <Text style={styles.stepBtnText}>+</Text>
                                      </Pressable>
                                    </View>
                                  ) : (
                                    <Text style={styles.cellText}>{people}</Text>
                                  )}
                                </View>

                                <View style={[styles.cell, { width: 90, alignItems: 'center' }]}>
                                  <Switch
                                    checked={checkedIn}
                                    saving={isSaving}
                                    disabled={isSaving}
                                    accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                                    onPress={() => void toggleCheckIn(g)}
                                  />
                                </View>
                              </View>
                            ) : (
                              <View style={{ gap: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                  <View style={[styles.avatar, checkedIn ? styles.avatarOn : null]}>
                                    <Text style={styles.avatarText}>{initialsFromName(g.name)}</Text>
                                  </View>
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.guestName} numberOfLines={1}>
                                      {g.name}
                                    </Text>
                                    <Text style={styles.guestSub} numberOfLines={1}>
                                      {g.phone || '—'}
                                    </Text>
                                  </View>
                                  <Switch
                                    checked={checkedIn}
                                    saving={isSaving}
                                    disabled={isSaving}
                                    accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                                    onPress={() => void toggleCheckIn(g)}
                                  />
                                </View>

                                <View style={styles.kvRow}>
                                  <Text style={styles.kvLabel}>סטטוס</Text>
                                  <View style={[styles.statusTag, { backgroundColor: tag.bg }]}>
                                    <Text style={[styles.statusTagText, { color: tag.fg }]}>{g.status}</Text>
                                  </View>
                                </View>

                                <View style={styles.kvRow}>
                                  <Text style={styles.kvLabel}>שולחן</Text>
                                  <Text style={styles.kvValue}>{tableNumber ?? '—'}</Text>
                                </View>

                                <View style={styles.kvRow}>
                                  <Text style={styles.kvLabel}>אנשים</Text>
                                  {checkedIn ? (
                                    <View style={{ alignItems: 'flex-end' }}>
                                      <Text style={styles.kvValue}>{arrivedCount}</Text>
                                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                                        <Pressable
                                          accessibilityRole="button"
                                          accessibilityLabel={`הפחת כמות שהגיעה עבור ${g.name}`}
                                          onPress={() => void setCheckedInCount(g, Math.max(0, arrivedCount - 1))}
                                          disabled={savingCountId === g.id || arrivedCount <= 0}
                                          style={({ hovered, pressed }: any) => [
                                            styles.miniBtn,
                                            (savingCountId === g.id || arrivedCount <= 0) ? styles.miniBtnDisabled : null,
                                            Platform.OS === 'web' && hovered ? styles.miniBtnHover : null,
                                            pressed ? { opacity: 0.92 } : null,
                                          ]}
                                        >
                                          <Text style={styles.miniBtnText}>-</Text>
                                        </Pressable>
                                        <Pressable
                                          accessibilityRole="button"
                                          accessibilityLabel={`הגדל כמות שהגיעה עבור ${g.name}`}
                                          onPress={() => void setCheckedInCount(g, arrivedCount + 1)}
                                          disabled={savingCountId === g.id}
                                          style={({ hovered, pressed }: any) => [
                                            styles.miniBtn,
                                            savingCountId === g.id ? styles.miniBtnDisabled : null,
                                            Platform.OS === 'web' && hovered ? styles.miniBtnHover : null,
                                            pressed ? { opacity: 0.92 } : null,
                                          ]}
                                        >
                                          <Text style={styles.miniBtnText}>+</Text>
                                        </Pressable>
                                      </View>
                                    </View>
                                  ) : (
                                    <Text style={styles.kvValue}>{people}</Text>
                                  )}
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>

                    <View style={{ marginTop: 16, alignItems: 'center' }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="טען עוד אורחים"
                        onPress={() => {}}
                        style={({ hovered, pressed }: any) => [
                          styles.loadMoreBtn,
                          Platform.OS === 'web' && hovered ? styles.loadMoreBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name="chevron-down" size={18} color={colors.gray[700]} />
                        <Text style={styles.loadMoreText}>טען עוד אורחים</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F6F4',
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh', direction: 'rtl' } as any) : null),
  },
  pageScroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ overflowY: 'auto', overscrollBehavior: 'contain' } as any) : null),
  },

  screen: {
    width: '100%',
    maxWidth: 1600,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 18,
  },

  content: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  contentSm: { flexDirection: 'column', gap: 14 },
  aside: { width: 380, flexShrink: 0 },
  asideSm: { width: '100%' },
  asideSticky: { gap: 14 },
  main: { flex: 1, minWidth: 0 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 16,
    shadowColor: colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  cardTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },

  dashboardGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dashboardGridSm: {
    flexDirection: 'column',
  },
  metricCard: {
    width: '48%',
    minWidth: 140,
    backgroundColor: 'rgba(6,23,62,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },
  metricValue: { marginTop: 2, fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[500],
    textAlign: 'right',
    textTransform: 'uppercase' as any,
    letterSpacing: 0.8,
  },

  searchWrap: {
    marginTop: 12,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  mainSearchWrap: {
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  searchIconRight: { position: 'absolute', right: 12 },
  searchInput: { paddingRight: 42, paddingLeft: 12, fontSize: 14, fontWeight: '800', color: colors.text },

  pillsRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  pillHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.20)',
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  pillText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  pillTextActive: { color: colors.white },

  summaryRow: { marginTop: 14, flexDirection: 'row', gap: 10 },
  summaryPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(6,23,62,0.06)',
  },
  summaryPillText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.04)' },
  linkBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  linkBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  helperText: { marginTop: 8, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },

  statCard: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(15,23,42,0.03)',
  },
  statCardHover: { backgroundColor: 'rgba(255,255,255,0.96)' },
  statCardActive: { backgroundColor: 'rgba(6,23,62,0.04)', borderColor: 'rgba(6,23,62,0.12)' },
  statTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  statPctPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(204,160,0,0.10)' },
  statPctText: { fontSize: 12, fontWeight: '900', color: colors.secondary, textAlign: 'right' },
  progressTrack: {
    marginTop: 10,
    height: 6,
    backgroundColor: 'rgba(15,23,42,0.12)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.primary, borderRadius: 999 },
  statBottomText: { marginTop: 8, fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },

  mainHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  h2: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'right' },

  listWrap: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  th: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },

  loadingRow: { paddingVertical: 26, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },
  emptyRow: { paddingVertical: 30, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  statusTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusTagText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  guestCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  guestCardSm: { padding: 12 },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: 'rgba(148,163,184,0.7)' },
  accentBarOn: { backgroundColor: '#10B981' },
  guestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 10 },
  cell: { justifyContent: 'center' },
  cellText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'center' },

  countStepper: {
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnHover: { backgroundColor: 'rgba(255,255,255,1)' },
  stepBtnDisabled: { opacity: 0.55 },
  stepBtnText: { fontSize: 16, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  countValueWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 34 },
  countValueText: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'center' },
  countValueSub: { marginTop: -2, fontSize: 10, fontWeight: '900', color: colors.gray[600], textAlign: 'center' },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOn: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.20)' },
  avatarText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'center' },
  guestName: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },
  guestSub: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.gray[500], textAlign: 'right' },

  kvRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kvLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },
  kvValue: { fontSize: 13, fontWeight: '900', color: colors.gray[800], textAlign: 'left' },
  miniBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  miniBtnDisabled: { opacity: 0.55 },
  miniBtnText: { fontSize: 16, fontWeight: '900', color: colors.primary, textAlign: 'center' },

  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  loadMoreBtnHover: { backgroundColor: 'rgba(255,255,255,1)' },
  loadMoreText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

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

const ui = StyleSheet.create({
  switchWrap: {
    width: 46,
    height: 26,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  switchWrapOn: { backgroundColor: '#10B981', borderColor: 'rgba(16,185,129,0.35)' },
  switchHover: { opacity: 0.98 },
  switchTrack: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 999 },
  switchTrackOn: {},
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
  },
  switchThumbOn: { right: 22 - 2, backgroundColor: colors.white, borderColor: 'rgba(15,23,42,0.12)' },
});

