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
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { useUsersModel, type UserFilter } from '@/features/users/useUsersModel';
import type { UserWithMetadata } from '@/lib/services/userService';

const USER_FILTERS: Array<{ label: string; value: UserFilter }> = [
  { label: 'הכל', value: 'all' },
  { label: 'מנהלים', value: 'admin' },
  { label: 'בעלי אירוע', value: 'event_owner' },
  { label: 'עובדים', value: 'employee' },
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

function getTagStyle(type: UserWithMetadata['userType']) {
  if (type === 'admin') return { bg: 'rgba(6, 23, 62, 0.10)', fg: colors.primary };
  if (type === 'event_owner') return { bg: 'rgba(204, 160, 0, 0.14)', fg: colors.secondary };
  return { bg: 'rgba(52, 58, 64, 0.08)', fg: colors.gray[700] };
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

  const title = useMemo(() => (selectedUser ? selectedUser.name : 'משתמשים'), [selectedUser]);

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
      <DesktopTopBar
        title={title}
        subtitle="ניהול משתמשים בממשק דסקטופי"
        leftActions={<TopBarIconButton icon="refresh" label="רענון" onPress={() => void refreshUsers()} />}
        rightActions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הוספת משתמש"
            onPress={() => router.push('/(admin)/add-user-v2')}
            style={({ hovered, pressed }: any) => [
              styles.primaryBtn,
              Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Ionicons name="person-add-outline" size={18} color={colors.white} />
            <Text style={styles.primaryBtnText}>הוסף משתמש</Text>
          </Pressable>
        }
      />

      <View style={styles.contentRow}>
        <View style={styles.main}>
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: 64 }]} />
              <Text style={[styles.th, { flex: 1 }]}>שם</Text>
              <Text style={[styles.th, { width: 140 }]}>תפקיד</Text>
              <Text style={[styles.th, { flex: 1 }]}>אימייל</Text>
              <Text style={[styles.th, { width: 130 }]}>טלפון</Text>
              <Text style={[styles.th, { width: 120 }]}>נוצר</Text>
            </View>

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>טוען משתמשים...</Text>
              </View>
            ) : filteredUsers.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                <Text style={styles.emptyTitle}>לא נמצאו משתמשים</Text>
                <Text style={styles.emptyText}>נסה לשנות חיפוש או פילטר.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                {filteredUsers.map((u) => {
                  const tag = getTagStyle(u.userType);
                  const hasAvatar = !!u.avatar_url && !avatarLoadErrors[u.id];
                  const active = selectedUser?.id === u.id;
                  return (
                    <Pressable
                      key={u.id}
                      accessibilityRole="button"
                      accessibilityLabel={`בחירת משתמש ${u.name}`}
                      onPress={() => setSelectedUser(u)}
                      style={({ hovered, pressed }: any) => [
                        styles.tr,
                        active ? styles.trActive : null,
                        Platform.OS === 'web' && hovered ? styles.trHover : null,
                        pressed ? { opacity: 0.96 } : null,
                      ]}
                    >
                      <View style={[styles.avatarCell, { width: 64 }]}>
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
                            <Text style={styles.avatarFallbackText}>{getInitials(u.name)}</Text>
                          </View>
                        )}
                      </View>

                      <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                        {u.name}
                      </Text>

                      <View style={{ width: 140, alignItems: 'flex-end' }}>
                        <View style={[styles.roleTag, { backgroundColor: tag.bg }]}>
                          <Text style={[styles.roleTagText, { color: tag.fg }]}>{getUserTypeLabel(u.userType)}</Text>
                        </View>
                      </View>

                      <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                        {u.email}
                      </Text>

                      <Text style={[styles.td, { width: 130 }]} numberOfLines={1}>
                        {u.phone || '—'}
                      </Text>

                      <Text style={[styles.td, { width: 120 }]} numberOfLines={1}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('he-IL') : '—'}
                      </Text>
                    </Pressable>
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
                placeholder="חיפוש עובד או תפקיד..."
                placeholderTextColor={colors.gray[500]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                textAlign="right"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.pillsRow}>
              {USER_FILTERS.map((f) => {
                const active = userFilter === f.value;
                return (
                  <Pressable
                    key={f.value}
                    accessibilityRole="button"
                    accessibilityLabel={f.label}
                    onPress={() => setUserFilter(f.value)}
                    style={({ hovered, pressed }: any) => [
                      styles.pill,
                      active ? styles.pillActive : null,
                      Platform.OS === 'web' && hovered ? styles.pillHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {selectedUser ? (
            <View style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {selectedUser.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="סגירת פרטי משתמש"
                  onPress={() => setSelectedUser(null)}
                  style={styles.iconCircle}
                >
                  <Ionicons name="close" size={18} color={colors.gray[700]} />
                </Pressable>
              </View>

              <Text style={styles.detailRow}>{`תפקיד: ${getUserTypeLabel(selectedUser.userType)}`}</Text>
              <Text style={styles.detailRow} numberOfLines={1}>{`אימייל: ${selectedUser.email}`}</Text>
              <Text style={styles.detailRow}>{`טלפון: ${selectedUser.phone || '—'}`}</Text>

              <View style={styles.detailActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="החלפת תמונה"
                  onPress={() => void pickAvatarForSelectedUser()}
                  disabled={avatarUploading}
                  style={({ hovered, pressed }: any) => [
                    styles.secondaryBtn,
                    Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                    avatarUploading ? { opacity: 0.75 } : null,
                  ]}
                >
                  {avatarUploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="image" size={16} color={colors.primary} />
                  )}
                  <Text style={styles.secondaryBtnText}>{avatarUploading ? 'מעלה...' : 'החלף תמונה'}</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="מחיקת משתמש"
                  onPress={() => confirmDelete(selectedUser)}
                  style={({ hovered, pressed }: any) => [
                    styles.dangerBtn,
                    Platform.OS === 'web' && hovered ? styles.dangerBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Ionicons name="trash" size={16} color={colors.white} />
                  <Text style={styles.dangerBtnText}>מחק</Text>
                </Pressable>
              </View>

              {isDemoMode ? (
                <View style={styles.demoNoteRow}>
                  <Ionicons name="information-circle" size={16} color={colors.gray[500]} />
                  <Text style={styles.demoNote}>מצב דמו: חלק מהפעולות אינן נשמרות בדאטאבייס.</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  contentRow: { flex: 1, flexDirection: 'row-reverse', gap: 16, paddingTop: 16, alignItems: 'stretch' },
  main: { flex: 1, minWidth: 0 },
  filters: { width: 360, gap: 16 },

  primaryBtn: {
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
  tableHeader: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(15,23,42,0.03)', borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)', gap: 10 },
  th: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  tr: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)', backgroundColor: 'rgba(255,255,255,0.98)', gap: 10 },
  trHover: { backgroundColor: 'rgba(15,23,42,0.03)' },
  trActive: { backgroundColor: 'rgba(15,69,230,0.06)' },
  td: { fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'right' },

  avatarCell: { alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 38, height: 38, borderRadius: 14, backgroundColor: colors.gray[100] },
  avatarFallback: { width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(15,69,230,0.10)', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  roleTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  roleTagText: { fontSize: 11, fontWeight: '900' },

  loadingRow: { paddingVertical: 34, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },
  emptyRow: { paddingVertical: 34, paddingHorizontal: 16, alignItems: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  filterCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', padding: 14, gap: 12 },
  cardTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },
  searchWrap: { height: 44, borderRadius: 14, backgroundColor: 'rgba(15,23,42,0.05)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 12 },
  searchInput: { paddingLeft: 40, paddingRight: 12, fontSize: 14, fontWeight: '800', color: colors.text },
  pillsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  pillHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700] },
  pillTextActive: { color: colors.white },

  detailCard: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', padding: 14, gap: 12 },
  detailHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  iconCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  detailRow: { fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'right' },
  detailActionsRow: { flexDirection: 'row-reverse', gap: 10 },
  secondaryBtn: { flex: 1, height: 44, borderRadius: 14, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  secondaryBtnText: { fontSize: 12, fontWeight: '900', color: colors.text },
  dangerBtn: { flex: 1, height: 44, borderRadius: 14, backgroundColor: '#ef4444', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  dangerBtnHover: { opacity: 0.95 },
  dangerBtnText: { fontSize: 12, fontWeight: '900', color: colors.white },
  demoNoteRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 4 },
  demoNote: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
});

