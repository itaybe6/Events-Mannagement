import React, { useMemo } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';

import { colors } from '@/constants/colors';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { useRsvpApprovalsModel } from '@/features/rsvp/useRsvpApprovalsModel';
import { Guest } from '@/types';

const sanitizePhone = (raw: string) => (raw || '').replace(/[^\d+]/g, '');

function StatusBadge({ status }: { status: Guest['status'] }) {
  const meta =
    status === 'מגיע'
      ? { bg: 'rgba(52, 199, 89, 0.14)', bd: 'rgba(52, 199, 89, 0.22)', fg: colors.success }
      : status === 'ממתין'
        ? { bg: 'rgba(255, 193, 7, 0.16)', bd: 'rgba(255, 193, 7, 0.22)', fg: '#92400e' }
        : { bg: 'rgba(255, 59, 48, 0.14)', bd: 'rgba(255, 59, 48, 0.18)', fg: '#dc2626' };

  return (
    <View style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.bd }]}>
      <Text style={[styles.badgeText, { color: meta.fg }]}>{status}</Text>
    </View>
  );
}

export default function AdminRsvpApprovalsWebScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);

  const {
    loading,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    savingId,
    editingId,
    setEditingId,
    collapsed,
    toggleCollapsed,
    stats,
    sections,
    callGuest,
    setStatus,
    refresh,
  } = useRsvpApprovalsModel(resolvedEventId);

  if (!resolvedEventId) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.gray[600]} />
        <Text style={styles.errorTitle}>חסר מזהה אירוע</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חזרה לאירועים"
          onPress={() => router.replace('/(admin)/admin-events')}
          style={({ hovered, pressed }: any) => [
            styles.primaryBtn,
            Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
            pressed ? { opacity: 0.92 } : null,
          ]}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
          <Text style={styles.primaryBtnText}>חזרה לאירועים</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <DesktopTopBar
        title="אישורי הגעה"
        subtitle="ניהול מוזמנים לפי קטגוריות וסטטוס"
        leftActions={<TopBarIconButton icon="refresh" label="רענון" onPress={() => void refresh()} />}
      />

      <View style={styles.contentRow}>
        <View style={styles.main}>
          <View style={styles.tableCard}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>טוען...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                {sections.map((sec) => {
                  const isCollapsed = collapsed.has(sec.name);
                  return (
                    <View key={sec.name} style={styles.section}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`קטגוריה ${sec.name}`}
                        onPress={() => toggleCollapsed(sec.name)}
                        style={({ hovered, pressed }: any) => [
                          styles.sectionHeader,
                          Platform.OS === 'web' && hovered ? styles.sectionHeaderHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={colors.gray[600]} />
                        <Text style={styles.sectionTitle} numberOfLines={1}>
                          {`${sec.name} (${sec.data.length})`}
                        </Text>
                      </Pressable>

                      {!isCollapsed ? (
                        <View>
                          <View style={styles.tableHeader}>
                            <Text style={[styles.th, { flex: 1 }]}>שם</Text>
                            <Text style={[styles.th, { width: 130 }]}>סטטוס</Text>
                            <Text style={[styles.th, { width: 180 }]}>פעולות</Text>
                          </View>

                          {sec.data.map((g) => {
                            const isSaving = savingId === g.id;
                            const phoneOk = Boolean(sanitizePhone(g.phone));
                            const isEditing = editingId === g.id;
                            const showActionButtons = g.status === 'ממתין' || isEditing;

                            return (
                              <View key={g.id} style={styles.tr}>
                                <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                                  {g.name}
                                </Text>

                                <View style={{ width: 130, alignItems: 'flex-start' }}>
                                  {showActionButtons ? (
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={`ביטול עריכה עבור ${g.name}`}
                                      onPress={() => setEditingId(isEditing ? null : g.id)}
                                      style={({ hovered, pressed }: any) => [
                                        styles.smallBtn,
                                        Platform.OS === 'web' && hovered ? styles.smallBtnHover : null,
                                        pressed ? { opacity: 0.92 } : null,
                                      ]}
                                    >
                                      <StatusBadge status={g.status} />
                                      <Ionicons name={isEditing ? 'close' : 'pencil'} size={14} color={colors.gray[600]} />
                                    </Pressable>
                                  ) : (
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={`שינוי סטטוס עבור ${g.name}`}
                                      onPress={() => setEditingId(g.id)}
                                      style={({ hovered, pressed }: any) => [
                                        styles.smallBtn,
                                        Platform.OS === 'web' && hovered ? styles.smallBtnHover : null,
                                        pressed ? { opacity: 0.92 } : null,
                                      ]}
                                    >
                                      <StatusBadge status={g.status} />
                                      <Ionicons name="pencil" size={14} color={colors.gray[600]} />
                                    </Pressable>
                                  )}
                                </View>

                                <View style={[styles.actionsCell, { width: 180 }]}>
                                  {isSaving ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={phoneOk ? `התקשר אל ${g.name}` : `אין מספר טלפון ל${g.name}`}
                                    onPress={() => void callGuest(g.phone)}
                                    disabled={!phoneOk || isSaving}
                                    style={({ hovered, pressed }: any) => [
                                      styles.iconBtn,
                                      !phoneOk ? { opacity: 0.35 } : null,
                                      Platform.OS === 'web' && hovered ? styles.iconBtnHover : null,
                                      pressed ? { opacity: 0.92 } : null,
                                    ]}
                                  >
                                    <Ionicons name="call" size={16} color={colors.gray[600]} />
                                  </Pressable>

                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`סימון לא מגיע ל${g.name}`}
                                    onPress={() => void setStatus(g.id, 'לא מגיע')}
                                    disabled={isSaving}
                                    style={({ hovered, pressed }: any) => [
                                      styles.iconBtn,
                                      styles.iconBtnDecline,
                                      Platform.OS === 'web' && hovered ? styles.iconBtnHover : null,
                                      pressed ? { opacity: 0.92 } : null,
                                    ]}
                                  >
                                    <Ionicons name="close" size={16} color={'#f87171'} />
                                  </Pressable>

                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`אישור הגעה ל${g.name}`}
                                    onPress={() => void setStatus(g.id, 'מגיע')}
                                    disabled={isSaving}
                                    style={({ hovered, pressed }: any) => [
                                      styles.iconBtn,
                                      styles.iconBtnConfirm,
                                      Platform.OS === 'web' && hovered ? styles.iconBtnHover : null,
                                      pressed ? { opacity: 0.92 } : null,
                                    ]}
                                  >
                                    <Ionicons name="checkmark" size={16} color={colors.primary} />
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                {sections.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                    <Text style={styles.emptyTitle}>לא נמצאו מוזמנים</Text>
                    <Text style={styles.emptyText}>נסה לשנות את החיפוש או הסינון</Text>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>

        <View style={styles.filters}>
          <View style={styles.filterCard}>
            <Text style={styles.cardTitle}>סינון</Text>

            <View style={styles.pillsRow}>
              {[
                { key: 'all' as const, label: `${stats.total} סה״כ` },
                { key: 'מגיע' as const, label: `${stats.coming} אישרו` },
                { key: 'ממתין' as const, label: `${stats.pending} ממתינים` },
                { key: 'לא מגיע' as const, label: `${stats.notComing} לא מגיעים` },
              ].map((p) => {
                const active = statusFilter === p.key;
                return (
                  <Pressable
                    key={p.key}
                    accessibilityRole="button"
                    accessibilityLabel={p.label}
                    onPress={() => setStatusFilter(p.key)}
                    style={({ hovered, pressed }: any) => [
                      styles.pill,
                      active ? styles.pillActive : null,
                      Platform.OS === 'web' && hovered ? styles.pillHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש מוזמנים..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign="right"
                returnKeyType="search"
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  contentRow: { flex: 1, flexDirection: 'row-reverse', gap: 16, paddingTop: 16, alignItems: 'stretch' },
  main: { flex: 1, minWidth: 0 },
  filters: { width: 340 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
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

  tableCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', overflow: 'hidden' },
  loadingRow: { paddingVertical: 34, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },

  section: { marginTop: 12, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', backgroundColor: 'rgba(255,255,255,0.98)' },
  sectionHeader: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(15,23,42,0.03)' },
  sectionHeaderHover: { backgroundColor: 'rgba(15,23,42,0.05)' },
  sectionTitle: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

  tableHeader: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(15,23,42,0.06)', gap: 10 },
  th: { fontSize: 12, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },
  tr: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(15,23,42,0.06)', gap: 10 },
  td: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },

  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '900' },
  smallBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 12 },
  smallBtnHover: { backgroundColor: 'rgba(15,23,42,0.04)' },

  actionsCell: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, justifyContent: 'flex-start' },
  iconBtn: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  iconBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  iconBtnDecline: { backgroundColor: 'rgba(255, 59, 48, 0.10)', borderColor: 'rgba(255, 59, 48, 0.16)' },
  iconBtnConfirm: { backgroundColor: 'rgba(17, 82, 212, 0.10)', borderColor: 'rgba(17, 82, 212, 0.16)' },

  emptyRow: { paddingVertical: 34, paddingHorizontal: 16, alignItems: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  filterCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', padding: 14, gap: 12 },
  cardTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },
  pillsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  pillHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700] },
  pillTextActive: { color: colors.white },
  searchWrap: { height: 44, borderRadius: 14, backgroundColor: 'rgba(15,23,42,0.05)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 12 },
  searchInput: { paddingLeft: 40, paddingRight: 12, fontSize: 14, fontWeight: '800', color: colors.text },
});

