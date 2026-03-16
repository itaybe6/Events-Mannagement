import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { UserWithMetadata } from '@/lib/services/userService';
import { useUsersModel } from '@/features/users/useUsersModel';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';

type UserFilter = 'all' | 'admin' | 'event_owner' | 'employee';

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

function getUserTypeSubtitle(type: UserWithMetadata['userType']) {
  switch (type) {
    case 'admin':
      return 'מנהל מערכת';
    case 'employee':
      return 'עובד';
    case 'event_owner':
    default:
      return 'בעלי אירוע';
  }
}

function getPresenceDotColor(type: UserWithMetadata['userType']) {
  if (type === 'admin') return '#22c55e'; // green
  if (type === 'event_owner') return '#fbbf24'; // amber
  return colors.gray[300];
}

function getTagStyle(type: UserWithMetadata['userType']) {
  if (type === 'admin') {
    return { bg: 'rgba(6, 23, 62, 0.10)', fg: colors.primary };
  }
  if (type === 'event_owner') {
    return { bg: 'rgba(204, 160, 0, 0.14)', fg: colors.secondary };
  }
  return { bg: 'rgba(52, 58, 64, 0.08)', fg: colors.gray[700] };
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + second).toUpperCase() || 'U';
}

export default function UsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoggedIn, userType } = useUserStore();
  const demoUsers = useDemoUsersStore((s) => s.users);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(insets.top + 76);

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
    showUserModal,
    setShowUserModal,
    avatarUploading,
    avatarLoadErrors,
    setAvatarLoadErrors,
    pickAvatarForSelectedUser,
    testConnection,
    refreshUsers,
    deleteUserNow,
  } = useUsersModel({ demoUsers });

  useEffect(() => {
    if (!isLoggedIn || userType !== 'admin') {
      router.replace('/login');
      return;
    }
    void testConnection();
  }, [isLoggedIn, userType, router]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn || userType !== 'admin') return;
      void refreshUsers();
    }, [isLoggedIn, userType, demoUsers, refreshUsers])
  );

  const handleDeleteUser = (u: UserWithMetadata) => {
    Alert.alert('מחיקת משתמש', `האם אתה בטוח שברצונך למחוק את "${u.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteUserNow(u);
          } catch (error) {
            let errorMessage = 'לא ניתן למחוק את המשתמש מהדאטאבייס';
            if (error instanceof Error) errorMessage += `\n\nפרטי השגיאה: ${error.message}`;
            Alert.alert('שגיאה במחיקה', errorMessage, [{ text: 'אישור', style: 'default' }]);
          }
        },
      },
    ]);
  };

  const headerBackdropColor = scrollY.interpolate({
    inputRange: [0, 14],
    outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.98)'],
    extrapolate: 'clamp',
  });
  const headerBorderColor = scrollY.interpolate({
    inputRange: [0, 14],
    outputRange: ['rgba(6,23,62,0)', 'rgba(6,23,62,0.05)'],
    extrapolate: 'clamp',
  });
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 14],
    outputRange: [0, 0.08],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.75, y: 0.55 }}
        style={styles.bgHighlight}
      />
      <LinearGradient
        colors={['rgba(232,196,122,0.58)', 'rgba(244,224,186,0.22)', 'rgba(244,224,186,0)']}
        start={{ x: 1, y: 0.95 }}
        end={{ x: 0.18, y: 0.22 }}
        style={styles.bgWarmGlow}
      />

      <Animated.View
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setHeaderHeight((prev) => (prev === nextHeight ? prev : nextHeight));
        }}
        style={[
          styles.floatingHeaderWrap,
          {
            paddingTop: insets.top + 10,
            paddingBottom: 10,
            backgroundColor: headerBackdropColor,
            borderBottomColor: headerBorderColor,
            shadowOpacity: headerShadowOpacity,
          },
        ]}
      >
        <View style={styles.headerHeroRow}>
          <View style={styles.headerActionSlot} />

          <View style={styles.headerTitleWrap}>
            <Image
              source={require('../../assets/images/logoMoon.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.headerActionSlot}>
            <TouchableOpacity
              style={styles.heroPrimaryBtn}
              onPress={() => router.push('/(admin)/add-user-v2')}
              activeOpacity={0.88}
            >
              <Ionicons name="add" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <AppKeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.pageContent, { paddingTop: headerHeight + 8 }]}
        scrollEventThrottle={16}
        onScroll={(event: any) => {
          const offsetY = Number(event?.nativeEvent?.contentOffset?.y ?? 0);
          scrollY.setValue(Math.max(offsetY, 0));
        }}
      >
        <View style={styles.header}>
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

          <View style={styles.filtersWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersRow}
            >
              {USER_FILTERS.map((f) => {
                const active = userFilter === f.value;
                return (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setUserFilter(f.value)}
                    activeOpacity={0.92}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <View style={styles.listWrap}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={44} color={colors.gray[500]} />
            <Text style={styles.emptyTitle}>לא נמצאו משתמשים</Text>
            <Text style={styles.emptyText}>נסה לשנות חיפוש או פילטר.</Text>
          </View>
        ) : (
          <View style={styles.cardsList}>
            {filteredUsers.map((u) => {
              const tag = getTagStyle(u.userType);
              const hasAvatar = !!u.avatar_url && !avatarLoadErrors[u.id];

              return (
                <TouchableOpacity
                  key={u.id}
                  activeOpacity={0.96}
                  style={styles.userCard}
                  onPress={() => {
                    setSelectedUser(u);
                    setShowUserModal(true);
                  }}
                >
                  <View style={styles.avatarWrap}>
                    {hasAvatar ? (
                      <Image
                        source={{ uri: u.avatar_url as string }}
                        style={styles.avatarImg}
                        onError={() => setAvatarLoadErrors((prev) => ({ ...prev, [u.id]: true }))}
                      />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarFallbackText}>{getInitials(u.name)}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.userInfo}>
                    <View style={styles.userNameTag}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {u.name}
                      </Text>
                    </View>
                    <View style={[styles.userTypeTagInline, { backgroundColor: tag.bg }]}>
                      <Text style={[styles.roleTagText, { color: tag.fg }]}>{getUserTypeLabel(u.userType)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={{ height: 140 }} />
          </View>
        )}
        </View>
      </AppKeyboardAwareScrollView>

      {/* Details modal */}
      <Modal visible={showUserModal} transparent animationType="fade" onRequestClose={() => setShowUserModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <LinearGradient
              colors={['rgba(247,250,255,0.98)', 'rgba(255,255,255,0.94)', 'rgba(244,224,186,0.36)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalCardGradient}
            />
            <LinearGradient
              colors={['rgba(232,196,122,0.28)', 'rgba(232,196,122,0.04)', 'rgba(232,196,122,0)']}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.2, y: 0.6 }}
              style={styles.modalGlowTop}
            />
            <View style={styles.modalAccent} />
            <View style={styles.modalHandleRow}>
              <View style={styles.modalHandle} />
            </View>

            <TouchableOpacity style={styles.modalClose} onPress={() => setShowUserModal(false)}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>

            {selectedUser && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalAvatarShell}>
                    <View style={styles.modalAvatarWrap}>
                      {selectedUser.avatar_url && !avatarLoadErrors[selectedUser.id] ? (
                        <Image
                          source={{ uri: selectedUser.avatar_url }}
                          style={styles.modalAvatarImg}
                          onError={() => setAvatarLoadErrors((prev) => ({ ...prev, [selectedUser.id]: true }))}
                        />
                      ) : (
                        <View style={styles.modalAvatarFallback}>
                          <Text style={styles.modalAvatarFallbackText}>{getInitials(selectedUser.name)}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.modalHeaderText}>
                    <Text style={styles.modalTitle}>{selectedUser.name}</Text>
                    <View style={styles.modalBadgeRow}>
                      <View style={styles.modalBadge}>
                        <View
                          style={[
                            styles.modalBadgeDot,
                            { backgroundColor: getPresenceDotColor(selectedUser.userType) },
                          ]}
                        />
                        <Text style={styles.modalBadgeText}>{getUserTypeLabel(selectedUser.userType)}</Text>
                      </View>
                    </View>
                    <Text style={styles.modalHelperText}>פרטי משתמש, הרשאות ואפשרויות ניהול</Text>
                  </View>
                </View>

                <View style={styles.modalSectionIntro}>
                  <Text style={styles.modalSectionTitle}>פרטי המשתמש</Text>
                </View>

                <View style={styles.modalInfoGrid}>
                  <View style={styles.modalInfoTile}>
                    <View style={[styles.modalInfoIcon, styles.modalInfoIconRole]}>
                      <Ionicons name="briefcase" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.modalInfoTextWrap}>
                      <Text style={styles.modalInfoLabel}>תפקיד</Text>
                      <Text style={styles.modalInfoValue}>{getUserTypeLabel(selectedUser.userType)}</Text>
                    </View>
                  </View>

                  <View style={styles.modalInfoTile}>
                    <View style={[styles.modalInfoIcon, styles.modalInfoIconEmail]}>
                      <Ionicons name="mail" size={18} color="#F97316" />
                    </View>
                    <View style={styles.modalInfoTextWrap}>
                      <Text style={styles.modalInfoLabel}>אימייל</Text>
                      <Text style={[styles.modalInfoValue, styles.modalInfoValueLtr]} numberOfLines={1}>
                        {selectedUser.email}
                      </Text>
                    </View>
                  </View>

                  {!!selectedUser.phone && (
                    <View style={styles.modalInfoTile}>
                      <View style={[styles.modalInfoIcon, styles.modalInfoIconPhone]}>
                        <Ionicons name="call" size={18} color="#16A34A" />
                      </View>
                      <View style={styles.modalInfoTextWrap}>
                        <Text style={styles.modalInfoLabel}>טלפון</Text>
                        <Text style={[styles.modalInfoValue, styles.modalInfoValueLtr]}>{selectedUser.phone}</Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.modalInfoTile}>
                    <View style={[styles.modalInfoIcon, styles.modalInfoIconDate]}>
                      <Ionicons name="calendar" size={18} color={colors.gray[700]} />
                    </View>
                    <View style={styles.modalInfoTextWrap}>
                      <Text style={styles.modalInfoLabel}>נוצר</Text>
                      <Text style={styles.modalInfoValue}>
                        {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString('he-IL') : '-'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.modalActionsBar}>
                  <TouchableOpacity
                    style={styles.modalActionDanger}
                    onPress={() => {
                      setShowUserModal(false);
                      handleDeleteUser(selectedUser);
                    }}
                  >
                    <Ionicons name="trash" size={18} color={colors.white} />
                    <Text style={styles.modalActionDangerText}>מחק</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalActionSecondary, avatarUploading && styles.modalPrimaryDisabled]}
                    onPress={pickAvatarForSelectedUser}
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="image" size={18} color={colors.primary} />
                    )}
                    <Text style={styles.modalActionSecondaryText}>
                      {avatarUploading ? 'מעלה...' : 'החלף תמונה'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {isDemoMode && (
                  <View style={styles.demoNoteRow}>
                    <View style={styles.demoNoteIconWrap}>
                      <Ionicons name="information-circle" size={16} color={colors.primary} />
                    </View>
                    <Text style={styles.demoNote}>
                      מצב דמו: חלק מהפעולות אינן נשמרות בדאטאבייס.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#E8F1FF',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  floatingHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    borderBottomWidth: 1,
    shadowColor: colors.black,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pageContent: {
    paddingBottom: 24,
  },
  headerHeroRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 12,
    gap: 12,
  },
  headerActionSlot: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  headerLogo: {
    width: 275,
    height: 66,
  },
  heroPrimaryBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  searchWrap: {
    height: 56,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingStart: 14,
    paddingEnd: 12,
  },
  searchIcon: {
    marginStart: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    paddingVertical: 10,
  },
  filtersWrap: {
    paddingTop: 12,
    paddingBottom: 6,
  },
  filtersRow: {
    paddingHorizontal: 2,
    gap: 10,
    flexDirection: ROW_DIR,
    justifyContent: 'center',
    minWidth: '100%',
  },
  filterChip: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6, 23, 62, 0.20)',
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
  },
  filterChipTextActive: {
    color: colors.white,
  },
  listWrap: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  sectionHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.gray[800],
    textAlign: 'right',
  },
  sortButton: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
  },
  cardsList: {
    paddingTop: 6,
    paddingHorizontal: 4,
    gap: 12,
  },
  userCard: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    padding: 14,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    position: 'relative',
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    marginStart: 12,
    position: 'relative',
    backgroundColor: colors.gray[100],
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingStart: 12,
  },
  userNameTag: {
    alignSelf: ALIGN_RIGHT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  userName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  roleTagText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },
  userTypeTagInline: {
    alignSelf: ALIGN_RIGHT,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    width: '100%',
  },
  moreButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: 6,
  },
  emptyCard: {
    marginTop: 18,
    borderRadius: 26,
    paddingVertical: 28,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 18, 32, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    shadowColor: colors.black,
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
    overflow: 'hidden',
  },
  modalCardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  modalGlowTop: {
    position: 'absolute',
    top: -18,
    right: -28,
    width: 180,
    height: 180,
    borderRadius: 999,
  },
  modalAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 96,
    backgroundColor: 'rgba(240, 243, 255, 0.42)',
  },
  modalHandleRow: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
  },
  modalHandle: {
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(120, 130, 155, 0.24)',
  },
  modalClose: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.86)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
  },
  modalHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 18,
    gap: 16,
  },
  modalAvatarShell: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  modalAvatarWrap: {
    flex: 1,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: colors.gray[100],
  },
  modalAvatarImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  modalAvatarFallback: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarFallbackText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalHeaderText: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    gap: 4,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  modalBadgeRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    alignSelf: ALIGN_RIGHT,
    flexWrap: 'wrap',
  },
  modalBadge: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  modalBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  modalHelperText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  modalSectionIntro: {
    marginBottom: 10,
    alignItems: ALIGN_RIGHT,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  modalInfoGrid: {
    gap: 12,
    paddingBottom: 14,
  },
  modalInfoTile: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  modalInfoIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInfoIconRole: {
    backgroundColor: 'rgba(6, 23, 62, 0.12)',
  },
  modalInfoIconEmail: {
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
  },
  modalInfoIconPhone: {
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
  },
  modalInfoIconDate: {
    backgroundColor: 'rgba(71, 85, 105, 0.12)',
  },
  modalInfoTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  modalInfoLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  modalInfoValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  modalInfoValueLtr: {
    writingDirection: 'ltr',
    textAlign: 'right',
  },
  modalActionsBar: {
    flexDirection: ROW_DIR,
    gap: 12,
    paddingTop: 2,
  },
  modalActionSecondary: {
    flex: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.12)',
  },
  modalActionSecondaryText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'right',
  },
  modalActionDanger: {
    flex: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: colors.error,
    shadowColor: colors.error,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  modalActionDangerText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'right',
  },
  modalPrimaryDisabled: {
    opacity: 0.7,
  },
  demoNoteRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  demoNoteIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(6,23,62,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoNote: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
});