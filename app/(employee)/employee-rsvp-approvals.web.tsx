import React, { useMemo, useState } from 'react';
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

function StatusPill({ status, count }: { status: Guest['status']; count?: number }) {
  const meta =
    status === 'מגיע'
      ? {
          label: `מאושר${count ? ` (${count})` : ''}`,
          bg: 'rgba(34, 197, 94, 0.14)',
          bd: 'rgba(34, 197, 94, 0.22)',
          fg: '#166534',
          dot: '#22c55e',
        }
      : status === 'ממתין'
        ? {
            label: 'ממתין',
            bg: 'rgba(245, 158, 11, 0.14)',
            bd: 'rgba(245, 158, 11, 0.22)',
            fg: '#92400e',
            dot: '#f59e0b',
          }
        : {
            label: 'נדחה',
            bg: 'rgba(239, 68, 68, 0.12)',
            bd: 'rgba(239, 68, 68, 0.18)',
            fg: '#991b1b',
            dot: '#ef4444',
          };

  return (
    <View style={[styles.pillBadge, { backgroundColor: meta.bg, borderColor: meta.bd }]}>
      <View style={[styles.pillDot, { backgroundColor: meta.dot }]} />
      <Text style={[styles.pillBadgeText, { color: meta.fg }]} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
  );
}

function MetaPill({ icon, label }: { icon?: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metaPill}>
      {icon ? <Ionicons name={icon} size={14} color={colors.gray[600]} /> : null}
      <Text style={styles.metaPillText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <View style={[styles.statAccent, { backgroundColor: accent }]} />
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function getInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase() || '•';
}

export default function EmployeeRsvpApprovalsWebScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

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
          onPress={() => router.replace('/(employee)/employee-events')}
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
        title="ניהול מוזמנים"
        subtitle="אישורי הגעה לפי קטגוריות"
        leftActions={<TopBarIconButton icon="refresh" label="רענון" onPress={() => void refresh()} />}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.statsRow}>
          <StatCard label="סה״כ" value={stats.total} accent={colors.primary} />
          <StatCard label="אישרו" value={stats.coming} accent="#16a34a" />
          <StatCard label="ממתינים" value={stats.pending} accent="#f59e0b" />
          <StatCard label="לא מגיעים" value={stats.notComing} accent="#ef4444" />
        </View>

        <View style={styles.toolbar}>
          <View style={styles.toolbarRight}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIconRtl} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש אורח, טלפון או סטטוס..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign="right"
                returnKeyType="search"
              />
            </View>

            <View style={{ position: 'relative' as any }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סינון"
                onPress={() => setFilterOpen((v) => !v)}
                style={({ hovered, pressed }: any) => [
                  styles.filterBtn,
                  Platform.OS === 'web' && hovered ? styles.filterBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="funnel-outline" size={18} color={colors.gray[700]} />
                <Text style={styles.filterBtnText} numberOfLines={1}>
                  {statusFilter === 'all' ? 'סינון' : statusFilter}
                </Text>
                <Ionicons name={filterOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray[600]} />
              </Pressable>

              {filterOpen ? (
                <View style={styles.filterMenu}>
                  {[
                    { key: 'all' as const, label: 'הכל' },
                    { key: 'מגיע' as const, label: 'מגיע' },
                    { key: 'ממתין' as const, label: 'ממתין' },
                    { key: 'לא מגיע' as const, label: 'לא מגיע' },
                  ].map((it) => {
                    const active = statusFilter === it.key;
                    return (
                      <Pressable
                        key={it.key}
                        accessibilityRole="button"
                        accessibilityLabel={it.label}
                        onPress={() => {
                          setStatusFilter(it.key);
                          setFilterOpen(false);
                        }}
                        style={({ hovered, pressed }: any) => [
                          styles.filterMenuItem,
                          active ? styles.filterMenuItemActive : null,
                          Platform.OS === 'web' && hovered ? styles.filterMenuItemHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Text style={[styles.filterMenuText, active ? styles.filterMenuTextActive : null]}>{it.label}</Text>
                        {active ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.toolbarLeft}>
            <View style={styles.avatarStack} accessibilityLabel="אורחים אחרונים">
              {sections
                .flatMap((s) => s.data)
                .slice(0, 3)
                .map((g, idx) => (
                  <View key={g.id} style={[styles.avatarCircle, { marginRight: idx === 0 ? 0 : -10 }]}>
                    <Text style={styles.avatarText}>{getInitials(g.name)}</Text>
                  </View>
                ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ייבא"
              onPress={() => {}}
              style={({ hovered, pressed }: any) => [
                styles.secondaryBtn,
                Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="download-outline" size={18} color={colors.gray[700]} />
              <Text style={styles.secondaryBtnText}>ייבא</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="הוסף אורח"
              onPress={() => {}}
              style={({ hovered, pressed }: any) => [
                styles.primaryActionBtn,
                Platform.OS === 'web' && hovered ? styles.primaryActionBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Text style={styles.primaryActionBtnText}>הוסף אורח</Text>
              <Ionicons name="add" size={18} color={colors.white} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>טוען...</Text>
          </View>
        ) : (
          <View style={styles.sectionsWrap}>
            {sections.map((sec) => {
              const isCollapsed = collapsed.has(sec.name);
              const isExpanded = expandedSections.has(sec.name);
              const visibleCount = isExpanded ? sec.data.length : Math.min(sec.data.length, 3);
              const hiddenCount = Math.max(0, sec.data.length - visibleCount);

              return (
                <View key={sec.name} style={styles.sectionCard}>
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
                    <View style={styles.sectionHeaderRight}>
                      <View style={styles.sectionAccentBar} />
                      <View style={{ minWidth: 0 }}>
                        <Text style={styles.sectionTitle} numberOfLines={1}>
                          {sec.name}
                        </Text>
                        <Text style={styles.sectionSubtitle} numberOfLines={1}>
                          צד החתן: {sec.name}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.sectionHeaderLeft}>
                      <View style={styles.countPill}>
                        <Text style={styles.countPillText}>{sec.data.length} מוזמנים</Text>
                      </View>
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[600]} />
                      <Ionicons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={colors.gray[600]} />
                    </View>
                  </Pressable>

                  {!isCollapsed ? (
                    <View style={styles.sectionBody}>
                      {sec.data.slice(0, visibleCount).map((g) => {
                        const isSaving = savingId === g.id;
                        const phoneOk = Boolean(sanitizePhone(g.phone));
                        const isEditing = editingId === g.id;
                        const showApprovalActions = g.status === 'ממתין' || isEditing;

                        const tableLabel = (() => {
                          const t = String(g.tableId || '').trim();
                          if (!t) return null;
                          if (/^\d+$/.test(t) || t.length <= 6) return `שולחן ${t}`;
                          return null;
                        })();

                        return (
                          <View key={g.id} style={styles.guestRow}>
                            <View style={styles.guestRight}>
                              <View style={styles.guestAvatar}>
                                <Text style={styles.guestAvatarText}>{getInitials(g.name)}</Text>
                              </View>
                              <View style={styles.guestMeta}>
                                <Text style={styles.guestName} numberOfLines={1}>
                                  {g.name}
                                </Text>
                                <View style={styles.phoneRow}>
                                  <Ionicons name="call-outline" size={14} color={colors.gray[500]} />
                                  <Text style={styles.guestPhone} numberOfLines={1}>
                                    {g.phone || '—'}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            <View style={styles.guestLeft}>
                              <StatusPill status={g.status} count={g.numberOfPeople || 1} />
                              <MetaPill icon="people-outline" label={`אורחים ${g.numberOfPeople || 1}`} />
                              <MetaPill icon="grid-outline" label={tableLabel || 'ללא שולחן'} />

                              <View style={styles.rowActions}>
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
                                  <Ionicons name="call" size={16} color={colors.gray[700]} />
                                </Pressable>

                                {showApprovalActions ? (
                                  <>
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
                                      <Ionicons name="close" size={16} color={'#ef4444'} />
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
                                  </>
                                ) : (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`שינוי סטטוס עבור ${g.name}`}
                                    onPress={() => setEditingId(g.id)}
                                    style={({ hovered, pressed }: any) => [
                                      styles.iconBtn,
                                      Platform.OS === 'web' && hovered ? styles.iconBtnHover : null,
                                      pressed ? { opacity: 0.92 } : null,
                                    ]}
                                  >
                                    <Ionicons name="pencil" size={16} color={colors.gray[700]} />
                                  </Pressable>
                                )}
                              </View>

                              {isSaving ? (
                                <View style={styles.savingOverlay}>
                                  <ActivityIndicator size="small" color={colors.primary} />
                                </View>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}

                      {hiddenCount > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="הצג עוד אורחים"
                          onPress={() =>
                            setExpandedSections((prev) => {
                              const next = new Set(prev);
                              if (next.has(sec.name)) next.delete(sec.name);
                              else next.add(sec.name);
                              return next;
                            })
                          }
                          style={({ hovered, pressed }: any) => [
                            styles.showMoreRow,
                            Platform.OS === 'web' && hovered ? styles.showMoreRowHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Text style={styles.showMoreText}>הצג עוד {hiddenCount} אורחים</Text>
                          <Ionicons name="chevron-down" size={18} color={colors.gray[600]} />
                        </Pressable>
                      ) : sec.data.length > 3 && isExpanded ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="הצג פחות"
                          onPress={() =>
                            setExpandedSections((prev) => {
                              const next = new Set(prev);
                              next.delete(sec.name);
                              return next;
                            })
                          }
                          style={({ hovered, pressed }: any) => [
                            styles.showMoreRow,
                            Platform.OS === 'web' && hovered ? styles.showMoreRowHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Text style={styles.showMoreText}>הצג פחות</Text>
                          <Ionicons name="chevron-up" size={18} color={colors.gray[600]} />
                        </Pressable>
                      ) : null}
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
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F7FB' },
  container: { paddingTop: 16, paddingBottom: 28, paddingHorizontal: 16, gap: 14 },

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

  loadingRow: {
    paddingVertical: 34,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },

  emptyRow: { paddingVertical: 34, paddingHorizontal: 16, alignItems: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  statsRow: {
    flexDirection: 'row-reverse',
    gap: 14,
    alignItems: 'stretch',
    flexWrap: 'wrap',
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'right' },
  statAccent: { height: 3, borderRadius: 999, marginTop: 6, width: 44, alignSelf: 'flex-end' },
  statLabel: { marginTop: 8, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },

  toolbar: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    flexWrap: 'wrap',
  },
  toolbarRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 320 },
  toolbarLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },

  searchBox: {
    height: 46,
    flex: 1,
    minWidth: 280,
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    justifyContent: 'center',
  },
  searchIconRtl: { position: 'absolute', right: 12 },
  searchInput: { paddingRight: 40, paddingLeft: 12, fontSize: 14, fontWeight: '800', color: colors.text },

  filterBtn: {
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  filterBtnHover: { backgroundColor: 'rgba(241,245,249,1)' },
  filterBtnText: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', maxWidth: 140 },
  filterMenu: {
    position: 'absolute',
    top: 50,
    right: 0,
    width: 220,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0px 18px 40px rgba(2,6,23,0.14)',
          zIndex: 60,
        } as any)
      : null),
  },
  filterMenuItem: { paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  filterMenuItemHover: { backgroundColor: 'rgba(15,23,42,0.04)' },
  filterMenuItemActive: { backgroundColor: 'rgba(6, 23, 62, 0.06)' },
  filterMenuText: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  filterMenuTextActive: { color: colors.primary },

  primaryActionBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  primaryActionBtnHover: { opacity: 0.95 },
  primaryActionBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },

  secondaryBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  secondaryBtnHover: { backgroundColor: 'rgba(248,250,252,1)' },
  secondaryBtnText: { color: colors.text, fontSize: 13, fontWeight: '900', textAlign: 'right' },

  avatarStack: { flexDirection: 'row-reverse', alignItems: 'center', marginRight: 2 },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(6, 23, 62, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 10, fontWeight: '900', color: colors.primary, textAlign: 'center' },

  sectionsWrap: { gap: 14 },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 18px 42px rgba(2,6,23,0.06)' } as any) : null),
  },
  sectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(248,250,252,1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  sectionHeaderHover: { backgroundColor: 'rgba(241,245,249,1)' },
  sectionHeaderRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  sectionAccentBar: { width: 4, height: 28, borderRadius: 999, backgroundColor: '#2563eb' },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },
  sectionSubtitle: { marginTop: 2, fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  sectionHeaderLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  countPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  countPillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

  sectionBody: { paddingHorizontal: 6, paddingVertical: 6 },
  guestRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  guestRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  guestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAvatarText: { fontSize: 12, fontWeight: '900', color: '#1d4ed8', textAlign: 'center' },
  guestMeta: { flex: 1, minWidth: 0 },
  guestName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  phoneRow: { marginTop: 4, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  guestPhone: { fontSize: 12, fontWeight: '800', color: colors.gray[500], textAlign: 'right' },

  guestLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-start' },
  pillBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, maxWidth: 160 },
  pillDot: { width: 7, height: 7, borderRadius: 999 },
  pillBadgeText: { fontSize: 11, fontWeight: '900', textAlign: 'right' },

  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(15,23,42,0.03)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  metaPillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },

  rowActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginRight: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  iconBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  iconBtnDecline: { backgroundColor: 'rgba(239, 68, 68, 0.10)', borderColor: 'rgba(239, 68, 68, 0.16)' },
  iconBtnConfirm: { backgroundColor: 'rgba(37, 99, 235, 0.10)', borderColor: 'rgba(37, 99, 235, 0.16)' },
  savingOverlay: { marginRight: 6 },

  showMoreRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  showMoreRowHover: { backgroundColor: 'rgba(15,23,42,0.03)' },
  showMoreText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
});

