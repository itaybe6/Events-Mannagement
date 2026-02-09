import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
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
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { authService } from '@/lib/services/authService';
import { userService, UserWithMetadata } from '@/lib/services/userService';
import { avatarService } from '@/lib/services/avatarService';

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

function hashStringToHue(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export default function UsersScreen() {
  const router = useRouter();
  const { isLoggedIn, userType } = useUserStore();
  const demoUsers = useDemoUsersStore((s) => s.users);

  const [users, setUsers] = useState<UserWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedUser, setSelectedUser] = useState<UserWithMetadata | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarLoadErrors, setAvatarLoadErrors] = useState<Record<string, boolean>>({});

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
      void loadUsers();
    }, [isLoggedIn, userType, demoUsers])
  );

  const testConnection = async () => {
    try {
      const connectionResult = await authService.testConnection();
      if (!connectionResult.success) {
        setIsDemoMode(true);
        Alert.alert('אבחון בעיות דאטאבייס', connectionResult.message, [{ text: 'הבנתי' }]);
      } else {
        setIsDemoMode(false);
      }
    } catch {
      setIsDemoMode(true);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersData = await userService.getAllUsers();
      setUsers(usersData);
      setIsDemoMode(false);
    } catch (error) {
      const isNetworkError =
        error instanceof Error && (error.message.includes('Network') || error.message.includes('fetch'));

      if (isNetworkError) {
        setIsDemoMode(true);
        setUsers(demoUsers);
        Alert.alert(
          '🌐 מצב דמו',
          'לא ניתן להתחבר לדאטאבייס. האפליקציה פועלת במצב דמו עם נתונים לדוגמה.\n\nתוכל לנסות שוב מאוחר יותר כשהחיבור יחזור.',
          [{ text: 'הבנתי', style: 'default' }]
        );
      } else {
        setUsers([]);
        let errorMessage = 'לא ניתן לטעון את רשימת המשתמשים מהדאטאבייס';
        if (error instanceof Error) errorMessage += `\n\nפרטי השגיאה: ${error.message}`;

        Alert.alert('שגיאה בחיבור לדאטאבייס', errorMessage, [
          { text: 'אישור', style: 'default' },
          {
            text: 'נסה שוב',
            style: 'default',
            onPress: () => {
              setIsDemoMode(false);
              void loadUsers();
            },
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = (u: UserWithMetadata) => {
    Alert.alert('מחיקת משתמש', `האם אתה בטוח שברצונך למחוק את "${u.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!isDemoMode) {
              await userService.deleteUser(u.id);
            }
            setUsers((prev) => prev.filter((x) => x.id !== u.id));
          } catch (error) {
            let errorMessage = 'לא ניתן למחוק את המשתמש מהדאטאבייס';
            if (error instanceof Error) errorMessage += `\n\nפרטי השגיאה: ${error.message}`;
            Alert.alert('שגיאה במחיקה', errorMessage, [{ text: 'אישור', style: 'default' }]);
          }
        },
      },
    ]);
  };

  const filteredUsers = useMemo(() => {
    return users
      .filter((u) => {
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        const matchesFilter = userFilter === 'all' || u.userType === userFilter;
        return matchesSearch && matchesFilter;
      });
  }, [users, searchQuery, userFilter]);

  const handlePickAvatarForSelectedUser = useCallback(async () => {
    if (!selectedUser) return;
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('הרשאה נדרשת', 'כדי לבחור תמונה יש לאשר גישה לגלריה');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setAvatarUploading(true);

      // Demo mode: keep locally (won't persist to DB)
      if (isDemoMode) {
        setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, avatar_url: asset.uri } : u)));
        setSelectedUser((prev) => (prev ? { ...prev, avatar_url: asset.uri } : prev));
        setAvatarLoadErrors((prev) => ({ ...prev, [selectedUser.id]: false }));
        Alert.alert('הועלה בהצלחה', 'התמונה עודכנה מקומית (מצב דמו).', [{ text: 'אישור' }]);
        return;
      }

      const publicUrl = await avatarService.uploadUserAvatar(selectedUser.id, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: (asset as any)?.file,
        base64: asset.base64,
      });

      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, avatar_url: publicUrl } : u)));
      setSelectedUser((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      setAvatarLoadErrors((prev) => ({ ...prev, [selectedUser.id]: false }));

      Alert.alert('הועלה בהצלחה', 'תמונת הפרופיל עודכנה.', [{ text: 'אישור' }]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן להעלות תמונה.\n\n${message}`);
    } finally {
      setAvatarUploading(false);
    }
  }, [selectedUser, isDemoMode]);

  return (
    <View style={styles.screen}>
      {/* Background decoration */}
      <View pointerEvents="none" style={styles.bgWrap}>
        <View style={styles.bgBlobTopRight} />
        <View style={styles.bgBlobBottomLeft} />
      </View>

      {/* Header (styled like the reference) */}
      <View style={styles.header}>
        {/* Search */}
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
      </View>

      {/* Filters */}
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

      {/* List */}
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
          <ScrollView contentContainerStyle={styles.cardsList} showsVerticalScrollIndicator={false}>
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
                    <View
                      style={[
                        styles.presenceDot,
                        { backgroundColor: getPresenceDotColor(u.userType) },
                      ]}
                    />
                  </View>

                  <View style={styles.userInfo}>
                    <View style={styles.userTitleRow}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {u.name}
                      </Text>
                      <View style={[styles.roleTag, { backgroundColor: tag.bg }]}>
                        <Text style={[styles.roleTagText, { color: tag.fg }]}>{getUserTypeLabel(u.userType)}</Text>
                      </View>
                    </View>
                    <Text style={styles.userSubtitle} numberOfLines={1}>
                      {u.name} • {getUserTypeSubtitle(u.userType)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={{ height: 140 }} />
          </ScrollView>
        )}
      </View>

      {/* Floating Action Button */}
      <View style={styles.fabWrap}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/(admin)/add-user-v2')}
          activeOpacity={0.92}
        >
          <Ionicons name="add" size={32} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Details modal */}
      <Modal visible={showUserModal} transparent animationType="fade" onRequestClose={() => setShowUserModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
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
                    <View style={styles.modalStatusDot}>
                      <View
                        style={[
                          styles.modalStatusDotInner,
                          { backgroundColor: getPresenceDotColor(selectedUser.userType) },
                        ]}
                      />
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
                      <Text style={styles.modalSubtitle}>{getUserTypeSubtitle(selectedUser.userType)}</Text>
                    </View>
                  </View>
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
                    style={[styles.modalActionSecondary, avatarUploading && styles.modalPrimaryDisabled]}
                    onPress={handlePickAvatarForSelectedUser}
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
                </View>

                {isDemoMode && (
                  <View style={styles.demoNoteRow}>
                    <Ionicons name="information-circle" size={16} color={colors.gray[500]} />
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
    backgroundColor: '#F5F7F8',
  },
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bgBlobTopRight: {
    position: 'absolute',
    top: -80,
    right: -90,
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 53, 102, 0.10)',
    transform: [{ scaleX: 1.05 }],
  },
  bgBlobBottomLeft: {
    position: 'absolute',
    bottom: -100,
    left: -110,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: 'rgba(204, 160, 0, 0.12)',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: 'rgba(245, 247, 248, 0.96)',
  },
  headerNavRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchWrap: {
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingRight: 14,
    paddingLeft: 12,
  },
  searchIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    paddingVertical: 10,
  },
  filtersWrap: {
    paddingVertical: 8,
  },
  filtersRow: {
    paddingHorizontal: 18,
    gap: 10,
  },
  filterChip: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
    flex: 1,
    paddingHorizontal: 18,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
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
    flexDirection: 'row-reverse',
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
    paddingTop: 4,
    gap: 12,
  },
  userCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    marginLeft: 12,
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
  presenceDot: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.white,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  userTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: 4,
  },
  userName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    marginLeft: 10,
  },
  roleTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  roleTagText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },
  userSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  moreButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  emptyCard: {
    marginTop: 18,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
  fabWrap: {
    position: 'absolute',
    left: 18,
    bottom: 108,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    overflow: 'hidden',
  },
  modalAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'rgba(240, 243, 255, 0.8)',
  },
  modalHandleRow: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 2,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(120, 130, 155, 0.3)',
  },
  modalClose: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 14,
    gap: 14,
  },
  modalAvatarShell: {
    width: 86,
    height: 86,
    borderRadius: 43,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  modalAvatarWrap: {
    flex: 1,
    borderRadius: 40,
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
  modalStatusDot: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  modalStatusDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalHeaderText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  modalBadgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  modalBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  modalInfoGrid: {
    gap: 12,
    paddingBottom: 10,
  },
  modalInfoTile: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  modalInfoIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
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
    alignItems: 'flex-end',
  },
  modalInfoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  modalInfoValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  modalInfoValueLtr: {
    writingDirection: 'ltr',
    textAlign: 'right',
  },
  modalActionsBar: {
    flexDirection: 'row-reverse',
    gap: 12,
    paddingTop: 6,
  },
  modalActionSecondary: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 23, 62, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.2)',
  },
  modalActionSecondaryText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'right',
  },
  modalActionDanger: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.error,
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  demoNote: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
});