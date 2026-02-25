import React, { useEffect, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { colors } from '@/constants/colors';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { useUsersModel, type UserFilter } from '@/features/users/useUsersModel';
import type { UserWithMetadata } from '@/lib/services/userService';

type RoleFilter = Exclude<UserFilter, 'all'>;

const DEFAULT_FILTER: RoleFilter = 'event_owner';

const ROLE_FILTERS: Array<{ label: string; value: RoleFilter }> = [
  { label: 'בעלי אירוע', value: 'event_owner' },
  { label: 'עובדים', value: 'employee' },
  { label: 'מנהלים', value: 'admin' },
];

function getUserTypeLabel(type: UserWithMetadata['userType']) {
  switch (type) {
    case 'admin':
      return 'מנהל';
    case 'employee':
      return 'עובד';
    case 'event_owner':
    default:
      return 'בעל אירוע';
  }
}

function getInitials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + second).toUpperCase() || 'U';
}

export default function UsersWebScreen() {
  const router = useRouter();
  const demoUsers = useDemoUsersStore((s) => s.users);

  const {
    users,
    loading,
    isDemoMode,
    userFilter,
    setUserFilter,
    searchQuery,
    setSearchQuery,
    filteredUsers,
    selectedUser,
    setSelectedUser,
    avatarUploading,
    avatarLoadErrors,
    setAvatarLoadErrors,
    pickAvatarForSelectedUser,
    refreshUsers,
    deleteUserNow,
  } = useUsersModel({ demoUsers });

  useEffect(() => {
    void refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const base = { all: users.length, admin: 0, event_owner: 0, employee: 0 } as Record<UserFilter, number>;
    for (const u of users) {
      if (u.userType === 'admin') base.admin += 1;
      else if (u.userType === 'event_owner') base.event_owner += 1;
      else base.employee += 1;
    }
    return base;
  }, [users]);

  const totalFiltered = filteredUsers.length;

  const confirmDelete = (u: UserWithMetadata) => {
    Alert.alert('מחיקת משתמש', `האם אתה בטוח שברצונך למחוק את "${u.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteUserNow(u);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה';
            Alert.alert('שגיאה', `לא ניתן למחוק.\n\n${msg}`);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.page}>
      <View style={styles.filterBarOuter}>
        {/* Card 1: Search */}
        <View style={styles.searchCard}>
          <View style={styles.searchCardHeader}>
            <Ionicons name="search" size={18} color={colors.primary} />
            <Text style={styles.searchCardTitle}>חיפוש</Text>
          </View>

          <View style={styles.searchWrapInline}>
            <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIconInline} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="חיפוש משתמש..."
              placeholderTextColor={colors.gray[500]}
              style={styles.searchInputInline}
              textAlign="right"
              returnKeyType="search"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Role filter tags (no card background) */}
        <View style={styles.tagsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleChipsRow}>
            {ROLE_FILTERS.map((f) => {
              const active = userFilter === f.value;
              return (
                <Pressable
                  key={f.value}
                  accessibilityRole="button"
                  accessibilityLabel={`סינון לפי ${f.label}`}
                  onPress={() => setUserFilter(f.value)}
                  style={({ hovered, pressed }: any) => [
                    styles.roleChip,
                    active ? styles.roleChipActive : null,
                    Platform.OS === 'web' && hovered ? styles.roleChipHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Text style={[styles.roleChipText, active ? styles.roleChipTextActive : null]}>
                    {f.label} ({counts[f.value] ?? 0})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <View style={styles.contentRow}>
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 64, textAlign: 'center' }]}>תמונה</Text>
            <Text style={[styles.th, { width: 220 }]}>שם</Text>
            <Text style={[styles.th, { width: 140, textAlign: 'center' }]}>תפקיד</Text>
            <Text style={[styles.th, { flex: 1 }]}>אימייל</Text>
            <Text style={[styles.th, { width: 160 }]}>טלפון</Text>
            <Text style={[styles.th, { width: 140 }]}>הצטרפות</Text>
            <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>פעולה</Text>
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>טוען משתמשים...</Text>
            </View>
          ) : totalFiltered === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
              <Text style={styles.emptyTitle}>לא נמצאו משתמשים</Text>
              <Text style={styles.emptyText}>נסה לשנות את החיפוש או הסינון</Text>
            </View>
          ) : (
            <ScrollView style={styles.rowsScroll} contentContainerStyle={styles.rowsScrollContent} showsVerticalScrollIndicator={false}>
              {filteredUsers.map((u) => {
                const hasAvatar = !!u.avatar_url && !avatarLoadErrors[u.id];
                const joined = u.created_at ? new Date(u.created_at).toLocaleDateString('he-IL') : '—';
                const roleTone =
                  u.userType === 'admin'
                    ? 'admin'
                    : u.userType === 'event_owner'
                      ? 'owner'
                      : 'employee';
                const roleToneStyle =
                  roleTone === 'admin'
                    ? styles.rolePillAdmin
                    : roleTone === 'owner'
                      ? styles.rolePillOwner
                      : styles.rolePillEmployee;

                return (
                  <Pressable
                    key={u.id}
                    accessibilityRole="button"
                    accessibilityLabel={`בחירת משתמש ${u.name}`}
                    onPress={() => setSelectedUser(u)}
                    style={({ hovered, pressed }: any) => [
                      styles.tr,
                      selectedUser?.id === u.id ? styles.trActive : null,
                      Platform.OS === 'web' && hovered ? styles.trHover : null,
                      pressed ? { opacity: 0.96 } : null,
                    ]}
                  >
                    <View style={[styles.cell, { width: 64, alignItems: 'center' }]}>
                      <View style={styles.avatarRing}>
                        {hasAvatar ? (
                          <Image
                            source={{ uri: u.avatar_url as string }}
                            style={styles.avatarImg}
                            contentFit="cover"
                            transition={0}
                            onError={() => setAvatarLoadErrors((prev) => ({ ...prev, [u.id]: true }))}
                          />
                        ) : (
                          <View style={styles.avatarFallback}>
                            <Text style={styles.avatarInitials}>{getInitials(u.name)}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={[styles.cell, { width: 220 }]}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {u.name}
                      </Text>
                    </View>

                    <View style={[styles.cell, { width: 140, alignItems: 'center' }]}>
                      <View style={[styles.statusPill, roleToneStyle]}>
                        <Text style={styles.statusPillText}>{getUserTypeLabel(u.userType)}</Text>
                      </View>
                    </View>

                    <Text style={[styles.tdLtrRight, { flex: 1 }]} numberOfLines={1}>
                      {u.email}
                    </Text>

                    <Text style={[styles.tdLtrRight, { width: 160 }]} numberOfLines={1}>
                      {u.phone || '—'}
                    </Text>

                    <Text style={[styles.tdText, { width: 140 }]} numberOfLines={1}>
                      {joined}
                    </Text>

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
            <Text style={styles.tableFooterText}>מציג {totalFiltered} משתמשים</Text>
          </View>
        </View>

        {selectedUser ? (
          <View style={styles.sidePanel}>
            <View style={styles.sideHeader}>
              <Text style={styles.sideTitle} numberOfLines={1}>
                {selectedUser.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירת פרטי משתמש"
                onPress={() => setSelectedUser(null)}
                style={({ hovered, pressed }: any) => [
                  styles.closeBtn,
                  Platform.OS === 'web' && hovered ? styles.closeBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[600]} />
              </Pressable>
            </View>

            <Text style={styles.sideRow}>{`תפקיד: ${getUserTypeLabel(selectedUser.userType)}`}</Text>
            <Text style={styles.sideRowLtr} numberOfLines={1}>{`Email: ${selectedUser.email}`}</Text>
            <Text style={styles.sideRowLtr} numberOfLines={1}>{`Phone: ${selectedUser.phone || '—'}`}</Text>

            <View style={styles.sideActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="החלפת תמונה"
                onPress={() => void pickAvatarForSelectedUser()}
                disabled={avatarUploading}
                style={({ hovered, pressed }: any) => [
                  styles.sideActionBtn,
                  avatarUploading ? { opacity: 0.7 } : null,
                  Platform.OS === 'web' && hovered ? styles.sideActionBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                {avatarUploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="image-outline" size={16} color={colors.primary} />
                )}
                <Text style={styles.sideActionText}>{avatarUploading ? 'מעלה...' : 'החלף תמונה'}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="מחיקת משתמש"
                onPress={() => confirmDelete(selectedUser)}
                style={({ hovered, pressed }: any) => [
                  styles.sideDangerBtn,
                  Platform.OS === 'web' && hovered ? styles.sideDangerBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="trash-outline" size={16} color={colors.white} />
                <Text style={styles.sideDangerText}>מחק</Text>
              </Pressable>
            </View>

            {isDemoMode ? (
              <View style={styles.demoNoteRow}>
                <Ionicons name="information-circle-outline" size={16} color={colors.gray[600]} />
                <Text style={styles.demoNote}>מצב דמו: חלק מהפעולות אינן נשמרות בדאטאבייס.</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="משתמש חדש"
        // NOTE: `.web` is a filename suffix, not part of the Expo Router path.
        // Navigating to `/(admin)/add-user-v2` will automatically pick `add-user-v2.web.tsx` on web.
        onPress={() => router.push('/(admin)/add-user-v2')}
        style={({ hovered, pressed }: any) => [
          styles.fabCreate,
          Platform.OS === 'web' && hovered ? styles.fabCreateHover : null,
          pressed ? { opacity: 0.92 } : null,
        ]}
      >
        <Ionicons name="add" size={20} color={colors.white} />
        <Text style={styles.fabCreateText}>משתמש חדש</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f7f9' },

  filterBarOuter: { paddingHorizontal: 32, paddingBottom: 16, paddingTop: 18, gap: 12 },
  searchCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    gap: 10,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  searchCardHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  searchCardTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },

  searchWrapInline: {
    height: 42,
    minWidth: 260,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  searchIconInline: { position: 'absolute', right: 12 },
  searchInputInline: { paddingRight: 40, paddingLeft: 12, fontSize: 15, fontWeight: '600', color: colors.text },

  tagsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },

  roleChipsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  roleChip: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  roleChipHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  roleChipActive: {
    backgroundColor: 'rgba(15,69,230,0.10)',
    borderColor: 'rgba(15,69,230,0.22)',
  },
  roleChipText: { fontSize: 13, fontWeight: '800', color: colors.gray[700], textAlign: 'right' },
  roleChipTextActive: { color: colors.primary },

  contentRow: {
    flex: 1,
    paddingHorizontal: 32,
    paddingBottom: 24,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 16,
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
  th: { fontSize: 13, fontWeight: '800', color: colors.gray[500], textAlign: 'right' },
  rowsScroll: { flex: 1 },
  rowsScrollContent: { paddingBottom: 90 },
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
  trHover: { backgroundColor: 'rgba(15,69,230,0.04)' },
  trActive: { backgroundColor: 'rgba(15,69,230,0.06)' },
  cell: { minWidth: 0 },
  tdText: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'right' },
  tdLtrRight: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    writingDirection: 'ltr' as any,
    textAlign: 'right' as any,
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
  avatarInitials: { fontSize: 12, fontWeight: '900', color: colors.text },
  userName: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },

  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  statusPillText: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  rolePillAdmin: { backgroundColor: 'rgba(148,163,184,0.18)', borderColor: 'rgba(148,163,184,0.30)' },
  rolePillOwner: { backgroundColor: 'rgba(234,179,8,0.16)', borderColor: 'rgba(234,179,8,0.30)' },
  rolePillEmployee: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.22)' },

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
  openPillText: { fontSize: 12, fontWeight: '900', color: colors.primary },

  loadingRow: { flex: 1, paddingVertical: 34, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 14, fontWeight: '700', color: colors.gray[600] },
  emptyRow: { flex: 1, paddingVertical: 34, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 14, fontWeight: '600', color: colors.gray[600], textAlign: 'center' },

  tableFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  tableFooterText: { fontSize: 12, fontWeight: '600', color: colors.gray[600], textAlign: 'right' },

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
  fabCreateHover: { opacity: 0.96 },
  fabCreateText: { color: colors.white, fontSize: 14, fontWeight: '900', textAlign: 'right' },

  sidePanel: {
    width: 360,
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    gap: 10,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  sideHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sideTitle: { fontSize: 14, fontWeight: '900', textAlign: 'right', color: colors.text },
  closeBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  closeBtnHover: { backgroundColor: 'rgba(15,23,42,0.04)' },
  sideRow: { fontSize: 13, fontWeight: '800', textAlign: 'right', color: colors.gray[600] },
  sideRowLtr: { fontSize: 13, fontWeight: '800', writingDirection: 'ltr' as any, textAlign: 'left' as any, color: colors.gray[600] },
  sideActions: { marginTop: 8, gap: 10 },
  sideActionBtn: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: 'rgba(148,163,184,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  sideActionBtnHover: { backgroundColor: 'rgba(148,163,184,0.16)' },
  sideActionText: { fontSize: 12, fontWeight: '900', textAlign: 'right', color: colors.text },
  sideDangerBtn: {
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ef4444',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  sideDangerBtnHover: { opacity: 0.96 },
  sideDangerText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },

  demoNoteRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, marginTop: 2 },
  demoNote: { flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'right', color: colors.gray[600] },
});

