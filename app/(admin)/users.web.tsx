import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { userService, type UserWithMetadata } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';
import type { Event } from '@/types';

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

function formatHebrewDate(value?: string | Date) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('he-IL');
}

export default function UsersWebScreen() {
  const router = useRouter();
  const demoUsers = useDemoUsersStore((s) => s.users);

  const {
    users,
    setUsers,
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
    refreshUsers,
    deleteUserNow,
  } = useUsersModel({ demoUsers });

  const [linkedEvents, setLinkedEvents] = useState<Array<Pick<Event, 'id' | 'title' | 'date' | 'location' | 'city'>>>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string;
    email: string;
    phone: string;
    userType: UserWithMetadata['userType'];
    password: string;
    confirmPassword: string;
  }>({ name: '', email: '', phone: '', userType: 'event_owner', password: '', confirmPassword: '' });

  useEffect(() => {
    void refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setEditForm({
      name: selectedUser.name ?? '',
      email: selectedUser.email ?? '',
      phone: selectedUser.phone ?? '',
      userType: selectedUser.userType ?? 'event_owner',
      password: '',
      confirmPassword: '',
    });
  }, [selectedUser?.id]);

  useEffect(() => {
    if (!showUserModal || !selectedUser?.id) {
      setLinkedEvents([]);
      setEventsLoading(false);
      setEventsError(null);
      return;
    }

    let cancelled = false;

    const loadLinkedEvents = async () => {
      try {
        setEventsLoading(true);
        setEventsError(null);
        const data = await eventService.getEventsForUser(selectedUser.id);
        if (!cancelled) {
          setLinkedEvents(data);
        }
      } catch {
        if (!cancelled) {
          setLinkedEvents([]);
          setEventsError('לא ניתן לטעון כרגע את האירועים המקושרים למשתמש.');
        }
      } finally {
        if (!cancelled) {
          setEventsLoading(false);
        }
      }
    };

    void loadLinkedEvents();

    return () => {
      cancelled = true;
    };
  }, [selectedUser?.id, showUserModal]);

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

  const openEdit = useCallback(() => {
    if (!selectedUser) return;
    setEditForm({
      name: selectedUser.name ?? '',
      email: selectedUser.email ?? '',
      phone: selectedUser.phone ?? '',
      userType: selectedUser.userType ?? 'event_owner',
      password: '',
      confirmPassword: '',
    });
    setShowUserModal(false);
    setEditOpen(true);
  }, [selectedUser, setShowUserModal]);

  const saveEdit = useCallback(async () => {
    if (!selectedUser) return;
    if (editSaving) return;

    const nextName = editForm.name.trim();
    const nextEmail = editForm.email.trim();
    const nextPhone = editForm.phone.trim();
    const nextRole = editForm.userType;
    const nextPassword = editForm.password;
    const confirm = editForm.confirmPassword;

    if (!nextName || !nextEmail) {
      Alert.alert('שגיאה', 'יש למלא שם ואימייל.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nextEmail)) {
      Alert.alert('שגיאה', 'כתובת אימייל לא תקינה.');
      return;
    }

    if (nextPassword || confirm) {
      if (nextPassword.length < 6) {
        Alert.alert('שגיאה', 'הסיסמה חייבת להכיל לפחות 6 תווים.');
        return;
      }
      if (nextPassword !== confirm) {
        Alert.alert('שגיאה', 'הסיסמאות אינן תואמות.');
        return;
      }
    }

    setEditSaving(true);
    try {
      const updates: Parameters<typeof userService.adminUpdateUser>[1] = {
        name: nextName,
        email: nextEmail,
        phone: nextPhone || undefined,
        userType: nextRole,
        ...(nextPassword ? { password: nextPassword } : null),
      };

      if (!isDemoMode) {
        await userService.adminUpdateUser(selectedUser.id, updates);
      }

      const mergedUser: UserWithMetadata = {
        ...selectedUser,
        name: nextName,
        email: nextEmail,
        phone: nextPhone || undefined,
        userType: nextRole,
        updated_at: new Date().toISOString(),
      };

      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? mergedUser : u)));
      setSelectedUser(mergedUser);
      setEditOpen(false);
      setEditForm((f) => ({ ...f, password: '', confirmPassword: '' }));
      Alert.alert('נשמר', isDemoMode ? 'מצב דמו: הפרטים עודכנו מקומית.' : 'פרטי המשתמש עודכנו בהצלחה.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לעדכן משתמש.\n\n${msg}`);
    } finally {
      setEditSaving(false);
    }
  }, [editForm, editSaving, isDemoMode, selectedUser, setSelectedUser, setUsers]);

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
                    onPress={() => {
                      setSelectedUser(u);
                      setShowUserModal(true);
                    }}
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

      <Modal
        transparent
        visible={showUserModal && !!selectedUser}
        animationType="fade"
        onRequestClose={() => setShowUserModal(false)}
      >
        <Pressable style={styles.userModalBackdrop} onPress={() => setShowUserModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <Pressable style={styles.userModalCard} onPress={(e) => e.stopPropagation()}>
              {selectedUser ? (
                <>
                  <View style={styles.userModalGlowPrimary} pointerEvents="none" />
                  <View style={styles.userModalGlowSecondary} pointerEvents="none" />

                  <View style={styles.userModalHeader}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="סגירת חלון המשתמש"
                      onPress={() => setShowUserModal(false)}
                      style={({ hovered, pressed }: any) => [
                        styles.userModalCloseBtn,
                        Platform.OS === 'web' && hovered ? styles.userModalCloseBtnHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <Ionicons name="close" size={18} color={colors.gray[700]} />
                    </Pressable>

                    <View style={styles.userModalHero}>
                      <View style={styles.userModalAvatarShell}>
                        <View style={styles.userModalAvatarRing}>
                          {selectedUser.avatar_url && !avatarLoadErrors[selectedUser.id] ? (
                            <Image
                              source={{ uri: selectedUser.avatar_url }}
                              style={styles.userModalAvatarImg}
                              contentFit="cover"
                              transition={0}
                              onError={() => setAvatarLoadErrors((prev) => ({ ...prev, [selectedUser.id]: true }))}
                            />
                          ) : (
                            <View style={styles.userModalAvatarFallback}>
                              <Text style={styles.userModalAvatarInitials}>{getInitials(selectedUser.name)}</Text>
                            </View>
                          )}
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="החלפת תמונת משתמש"
                          onPress={() => void pickAvatarForSelectedUser()}
                          disabled={avatarUploading}
                          style={({ hovered, pressed }: any) => [
                            styles.userModalAvatarBadge,
                            avatarUploading ? { opacity: 0.72 } : null,
                            Platform.OS === 'web' && hovered ? styles.userModalAvatarBadgeHover : null,
                            pressed ? { opacity: 0.9 } : null,
                          ]}
                        >
                          {avatarUploading ? (
                            <ActivityIndicator size="small" color={colors.white} />
                          ) : (
                            <Ionicons name="camera" size={16} color={colors.white} />
                          )}
                        </Pressable>
                      </View>

                      <View style={styles.userModalHeroText}>
                        <View style={styles.userModalBadge}>
                          <Ionicons name="shield-checkmark-outline" size={14} color={colors.secondary} />
                          <Text style={styles.userModalBadgeText}>{getUserTypeLabel(selectedUser.userType)}</Text>
                        </View>
                        <Text style={styles.userModalTitle}>{selectedUser.name}</Text>
                        <Text style={styles.userModalSubtitle}>
                          פרופיל משתמש מלא עם פרטי קשר, סטטוס והרשומות המקושרות אליו
                        </Text>
                      </View>
                    </View>
                  </View>

                  <ScrollView
                    style={styles.userModalScroll}
                    contentContainerStyle={styles.userModalScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.userModalStatsRow}>
                      <View style={styles.userModalStatCard}>
                        <Text style={styles.userModalStatValue}>{eventsLoading ? '...' : linkedEvents.length}</Text>
                        <Text style={styles.userModalStatLabel}>אירועים מקושרים</Text>
                      </View>
                      <View style={styles.userModalStatCard}>
                        <Text style={styles.userModalStatValue}>{formatHebrewDate(selectedUser.created_at)}</Text>
                        <Text style={styles.userModalStatLabel}>תאריך הצטרפות</Text>
                      </View>
                      <View style={styles.userModalStatCard}>
                        <Text style={styles.userModalStatValue}>{formatHebrewDate(selectedUser.updated_at)}</Text>
                        <Text style={styles.userModalStatLabel}>עדכון אחרון</Text>
                      </View>
                    </View>

                    <View style={styles.userModalSection}>
                      <Text style={styles.userModalSectionTitle}>פרטי משתמש</Text>
                      <View style={styles.userModalInfoGrid}>
                        <View style={styles.userModalInfoCard}>
                          <View style={[styles.userModalInfoIconWrap, styles.userModalInfoIconRole]}>
                            <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
                          </View>
                          <View style={styles.userModalInfoText}>
                            <Text style={styles.userModalInfoLabel}>תפקיד</Text>
                            <Text style={styles.userModalInfoValue}>{getUserTypeLabel(selectedUser.userType)}</Text>
                          </View>
                        </View>

                        <View style={styles.userModalInfoCard}>
                          <View style={[styles.userModalInfoIconWrap, styles.userModalInfoIconEmail]}>
                            <Ionicons name="mail-outline" size={18} color="#F97316" />
                          </View>
                          <View style={styles.userModalInfoText}>
                            <Text style={styles.userModalInfoLabel}>אימייל</Text>
                            <Text style={[styles.userModalInfoValue, styles.userModalInfoValueLtr]}>
                              {selectedUser.email}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.userModalInfoCard}>
                          <View style={[styles.userModalInfoIconWrap, styles.userModalInfoIconPhone]}>
                            <Ionicons name="call-outline" size={18} color="#16A34A" />
                          </View>
                          <View style={styles.userModalInfoText}>
                            <Text style={styles.userModalInfoLabel}>טלפון</Text>
                            <Text style={[styles.userModalInfoValue, styles.userModalInfoValueLtr]}>
                              {selectedUser.phone || '—'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.userModalInfoCard}>
                          <View style={[styles.userModalInfoIconWrap, styles.userModalInfoIconDate]}>
                            <Ionicons name="calendar-outline" size={18} color={colors.gray[700]} />
                          </View>
                          <View style={styles.userModalInfoText}>
                            <Text style={styles.userModalInfoLabel}>תאריך יצירה</Text>
                            <Text style={styles.userModalInfoValue}>{formatHebrewDate(selectedUser.created_at)}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.userModalSection}>
                      <View style={styles.userModalSectionHeader}>
                        <Text style={styles.userModalSectionTitle}>אירועים מקושרים</Text>
                        <View style={styles.userModalSectionBadge}>
                          <Text style={styles.userModalSectionBadgeText}>{linkedEvents.length}</Text>
                        </View>
                      </View>

                      {eventsLoading ? (
                        <View style={styles.userModalEventsState}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={styles.userModalEventsStateText}>טוען אירועים...</Text>
                        </View>
                      ) : eventsError ? (
                        <View style={styles.userModalEventsEmpty}>
                          <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
                          <Text style={styles.userModalEventsEmptyTitle}>אירעה שגיאה בטעינת האירועים</Text>
                          <Text style={styles.userModalEventsEmptyText}>{eventsError}</Text>
                        </View>
                      ) : linkedEvents.length === 0 ? (
                        <View style={styles.userModalEventsEmpty}>
                          <Ionicons name="calendar-clear-outline" size={20} color={colors.gray[500]} />
                          <Text style={styles.userModalEventsEmptyTitle}>אין עדיין אירועים מקושרים</Text>
                          <Text style={styles.userModalEventsEmptyText}>
                            כשהמשתמש יקושר לאירועים, הם יופיעו כאן בצורה מסודרת.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.userModalEventsList}>
                          {linkedEvents.map((eventItem) => (
                            <View key={eventItem.id} style={styles.userModalEventCard}>
                              <View style={styles.userModalEventHeader}>
                                <View style={styles.userModalEventDateBadge}>
                                  <Ionicons name="sparkles-outline" size={14} color={colors.secondary} />
                                  <Text style={styles.userModalEventDateBadgeText}>
                                    {formatHebrewDate(eventItem.date)}
                                  </Text>
                                </View>
                                <Text style={styles.userModalEventTitle} numberOfLines={1}>
                                  {eventItem.title}
                                </Text>
                              </View>

                              <View style={styles.userModalEventMetaRow}>
                                <View style={styles.userModalEventMetaPill}>
                                  <Ionicons name="location-outline" size={14} color={colors.primary} />
                                  <Text style={styles.userModalEventMetaText} numberOfLines={1}>
                                    {eventItem.location || 'ללא מיקום'}
                                  </Text>
                                </View>
                                <View style={styles.userModalEventMetaPill}>
                                  <Ionicons name="business-outline" size={14} color={colors.primary} />
                                  <Text style={styles.userModalEventMetaText} numberOfLines={1}>
                                    {eventItem.city || 'ללא עיר'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <View style={styles.userModalActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="עריכת משתמש"
                        onPress={openEdit}
                        style={({ hovered, pressed }: any) => [
                          styles.userModalActionBtn,
                          styles.userModalActionBtnPrimary,
                          Platform.OS === 'web' && hovered ? styles.userModalActionBtnPrimaryHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name="create-outline" size={16} color={colors.white} />
                        <Text style={styles.userModalActionBtnPrimaryText}>ערוך משתמש</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="מחיקת משתמש"
                        onPress={() => {
                          setShowUserModal(false);
                          confirmDelete(selectedUser);
                        }}
                        style={({ hovered, pressed }: any) => [
                          styles.userModalActionBtn,
                          styles.userModalActionBtnDanger,
                          Platform.OS === 'web' && hovered ? styles.userModalActionBtnDangerHover : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.white} />
                        <Text style={styles.userModalActionBtnDangerText}>מחק משתמש</Text>
                      </Pressable>
                    </View>

                    {isDemoMode ? (
                      <View style={styles.userModalDemoNote}>
                        <Ionicons name="information-circle-outline" size={16} color={colors.gray[600]} />
                        <Text style={styles.userModalDemoNoteText}>
                          מצב דמו: חלק מהפעולות אינן נשמרות בדאטאבייס.
                        </Text>
                      </View>
                    ) : null}
                  </ScrollView>
                </>
              ) : null}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Edit modal */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.editBackdrop} onPress={() => setEditOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <Pressable style={styles.editCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.editHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="סגירת חלון העריכה"
                  onPress={() => setEditOpen(false)}
                  style={({ hovered, pressed }: any) => [
                    styles.editCloseBtn,
                    Platform.OS === 'web' && hovered ? styles.editCloseBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Ionicons name="close" size={18} color={colors.gray[700]} />
                </Pressable>

                <View style={styles.editHeaderText}>
                  <View style={styles.editBadge}>
                    <Ionicons name="create-outline" size={14} color={colors.secondary} />
                    <Text style={styles.editBadgeText}>עריכת פרטי משתמש</Text>
                  </View>
                  <Text style={styles.editTitle}>עדכון פרופיל משתמש</Text>
                  <Text style={styles.editSubtitle}>
                    אפשר לעדכן כאן את פרטי הקשר, התפקיד והסיסמה של {editForm.name || 'המשתמש'}.
                  </Text>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editContent} bounces={false}>
                <View style={styles.editSection}>
                  <View style={styles.editSectionHeader}>
                    <Text style={styles.editSectionTitle}>פרטים בסיסיים</Text>
                    <Text style={styles.editSectionHint}>המידע הזה יוצג בכרטיס המשתמש ובמערכת.</Text>
                  </View>

                  <View style={[styles.editGrid, styles.editPasswordGrid]}>
                    <View style={[styles.editField, styles.editFieldFull]}>
                      <Text style={styles.editFieldLabel}>שם מלא</Text>
                      <View style={styles.editInputWrap}>
                        <View style={styles.editInputIconWrap}>
                          <Ionicons name="person-outline" size={18} color={colors.primary} />
                        </View>
                        <TextInput
                          value={editForm.name}
                          onChangeText={(t) => setEditForm((p) => ({ ...p, name: t }))}
                          placeholder="שם מלא"
                          placeholderTextColor={colors.gray[500]}
                          style={styles.editInput}
                          textAlign="right"
                        />
                      </View>
                    </View>

                    <View style={styles.editField}>
                      <Text style={styles.editFieldLabel}>אימייל</Text>
                      <View style={styles.editInputWrap}>
                        <View style={[styles.editInputIconWrap, styles.editInputIconEmail]}>
                          <Ionicons name="mail-outline" size={18} color="#F97316" />
                        </View>
                        <TextInput
                          value={editForm.email}
                          onChangeText={(t) => setEditForm((p) => ({ ...p, email: t }))}
                          placeholder="אימייל"
                          placeholderTextColor={colors.gray[500]}
                          style={[styles.editInput, styles.editInputLtr]}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          textAlign="left"
                        />
                      </View>
                    </View>

                    <View style={styles.editField}>
                      <Text style={styles.editFieldLabel}>טלפון</Text>
                      <View style={styles.editInputWrap}>
                        <View style={[styles.editInputIconWrap, styles.editInputIconPhone]}>
                          <Ionicons name="call-outline" size={18} color="#16A34A" />
                        </View>
                        <TextInput
                          value={editForm.phone}
                          onChangeText={(t) => setEditForm((p) => ({ ...p, phone: t }))}
                          placeholder="טלפון (אופציונלי)"
                          placeholderTextColor={colors.gray[500]}
                          style={[styles.editInput, styles.editInputLtr]}
                          keyboardType="phone-pad"
                          textAlign="left"
                        />
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.editSection}>
                  <View style={styles.editSectionHeader}>
                    <Text style={styles.editSectionTitle}>הרשאות ותפקיד</Text>
                    <Text style={styles.editSectionHint}>בחר את התפקיד המתאים למשתמש במערכת.</Text>
                  </View>

                  <View style={styles.roleRow}>
                    {(['event_owner', 'employee', 'admin'] as Array<UserWithMetadata['userType']>).map((role) => {
                      const active = editForm.userType === role;
                      return (
                        <Pressable
                          key={role}
                          accessibilityRole="button"
                          accessibilityLabel={`בחירת תפקיד ${getUserTypeLabel(role)}`}
                          onPress={() => setEditForm((p) => ({ ...p, userType: role }))}
                          style={({ hovered, pressed }: any) => [
                            styles.roleBtn,
                            active ? styles.roleBtnActive : null,
                            Platform.OS === 'web' && hovered ? styles.roleBtnHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Text style={[styles.roleBtnText, active ? styles.roleBtnTextActive : null]}>
                            {getUserTypeLabel(role)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.editSection}>
                  <View style={styles.editSectionHeader}>
                    <Text style={styles.editSectionTitle}>עדכון סיסמה</Text>
                    <Text style={styles.editSectionHint}>אפשר להשאיר ריק אם לא רוצים לשנות סיסמה.</Text>
                  </View>

                  <View style={styles.editGrid}>
                    <View style={styles.editField}>
                      <Text style={styles.editFieldLabel}>סיסמה חדשה</Text>
                      <View style={styles.editInputWrap}>
                        <View style={[styles.editInputIconWrap, styles.editInputIconNeutral]}>
                          <Ionicons name="lock-closed-outline" size={18} color={colors.gray[700]} />
                        </View>
                        <TextInput
                          value={editForm.password}
                          onChangeText={(t) => setEditForm((p) => ({ ...p, password: t }))}
                          placeholder="סיסמה חדשה (אופציונלי)"
                          placeholderTextColor={colors.gray[500]}
                          style={styles.editInput}
                          secureTextEntry
                          textAlign="right"
                        />
                      </View>
                    </View>

                    <View style={styles.editField}>
                      <Text style={styles.editFieldLabel}>אישור סיסמה</Text>
                      <View style={styles.editInputWrap}>
                        <View style={[styles.editInputIconWrap, styles.editInputIconNeutral]}>
                          <Ionicons name="shield-checkmark-outline" size={18} color={colors.gray[700]} />
                        </View>
                        <TextInput
                          value={editForm.confirmPassword}
                          onChangeText={(t) => setEditForm((p) => ({ ...p, confirmPassword: t }))}
                          placeholder="אישור סיסמה"
                          placeholderTextColor={colors.gray[500]}
                          style={styles.editInput}
                          secureTextEntry
                          textAlign="right"
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.editActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ביטול עריכה"
                  onPress={() => setEditOpen(false)}
                  style={({ hovered, pressed }: any) => [
                    styles.editBtn,
                    styles.editBtnGhost,
                    Platform.OS === 'web' && hovered ? styles.editBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Text style={styles.editBtnGhostText}>ביטול</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="שמירת עריכה"
                  onPress={() => void saveEdit()}
                  disabled={editSaving}
                  style={({ hovered, pressed }: any) => [
                    styles.editBtn,
                    styles.editBtnPrimary,
                    Platform.OS === 'web' && hovered ? styles.editBtnPrimaryHover : null,
                    pressed ? { opacity: 0.92 } : null,
                    editSaving ? { opacity: 0.8 } : null,
                  ]}
                >
                  {editSaving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.editBtnPrimaryText}>שמור</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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

  roleChipsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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

  userModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 11, 28, 0.58)',
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  userModalCard: {
    width: '100%',
    maxWidth: 920,
    maxHeight: '88%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    overflow: 'hidden',
    shadowColor: '#06173e',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
  },
  userModalGlowPrimary: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.18)',
  },
  userModalGlowSecondary: {
    position: 'absolute',
    bottom: -90,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.08)',
  },
  userModalHeader: {
    position: 'relative',
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 12,
  },
  userModalCloseBtn: {
    position: 'absolute',
    left: 28,
    top: 58,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  userModalCloseBtnHover: { backgroundColor: 'rgba(15,23,42,0.08)' },
  userModalHero: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 20,
  },
  userModalAvatarShell: {
    position: 'relative',
    width: 120,
    height: 120,
  },
  userModalAvatarRing: {
    width: 120,
    height: 120,
    borderRadius: 38,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  userModalAvatarImg: { width: '100%', height: '100%', borderRadius: 34 },
  userModalAvatarFallback: {
    flex: 1,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  userModalAvatarInitials: { fontSize: 34, fontWeight: '900', color: colors.white },
  userModalAvatarBadge: {
    position: 'absolute',
    left: -2,
    bottom: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderWidth: 3,
    borderColor: colors.white,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  userModalAvatarBadgeHover: { transform: [{ scale: 1.04 }] },
  userModalHeroText: { flex: 1, alignItems: 'flex-start', justifyContent: 'flex-start', gap: 8 },
  userModalBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  userModalBadgeText: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  userModalTitle: { fontSize: 30, fontWeight: '900', color: colors.text, textAlign: 'right' },
  userModalSubtitle: { fontSize: 14, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  userModalScroll: { maxHeight: '100%' },
  userModalScrollContent: { paddingHorizontal: 28, paddingBottom: 28, gap: 18 },
  userModalStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  userModalStatCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(248,250,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  userModalStatValue: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right' },
  userModalStatLabel: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  userModalSection: { gap: 12 },
  userModalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userModalSectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right' },
  userModalSectionBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,203,70,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.18)',
  },
  userModalSectionBadgeText: { fontSize: 13, fontWeight: '900', color: colors.secondary, textAlign: 'center' },
  userModalInfoGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  userModalInfoCard: {
    width: '48.8%',
    minWidth: 260,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  userModalInfoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userModalInfoIconRole: { backgroundColor: 'rgba(6,23,62,0.08)' },
  userModalInfoIconEmail: { backgroundColor: 'rgba(249,115,22,0.12)' },
  userModalInfoIconPhone: { backgroundColor: 'rgba(22,163,74,0.12)' },
  userModalInfoIconDate: { backgroundColor: 'rgba(71,85,105,0.12)' },
  userModalInfoText: { flex: 1, alignItems: 'flex-start' },
  userModalInfoLabel: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  userModalInfoValue: { marginTop: 4, fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },
  userModalInfoValueLtr: { writingDirection: 'ltr' as any, textAlign: 'right' as any },
  userModalEventsState: {
    minHeight: 108,
    borderRadius: 22,
    backgroundColor: 'rgba(248,250,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  userModalEventsStateText: { fontSize: 14, fontWeight: '800', color: colors.gray[600], textAlign: 'center' },
  userModalEventsEmpty: {
    minHeight: 118,
    borderRadius: 22,
    backgroundColor: 'rgba(248,250,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 8,
  },
  userModalEventsEmptyTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'center' },
  userModalEventsEmptyText: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
  userModalEventsList: { gap: 10 },
  userModalEventCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    gap: 12,
  },
  userModalEventHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  userModalEventDateBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.16)',
  },
  userModalEventDateBadgeText: { fontSize: 12, fontWeight: '900', color: colors.secondary, textAlign: 'right' },
  userModalEventTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  userModalEventMetaRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
  userModalEventMetaPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.05)',
  },
  userModalEventMetaText: { fontSize: 12, fontWeight: '800', color: colors.primary, textAlign: 'right' },
  userModalActions: { flexDirection: 'row-reverse', gap: 10 },
  userModalActionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  userModalActionBtnPrimary: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  userModalActionBtnPrimaryHover: { opacity: 0.96 },
  userModalActionBtnPrimaryText: { fontSize: 13, fontWeight: '900', color: colors.white, textAlign: 'right' },
  userModalActionBtnDanger: {
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  userModalActionBtnDangerHover: { opacity: 0.96 },
  userModalActionBtnDangerText: { fontSize: 13, fontWeight: '900', color: colors.white, textAlign: 'right' },
  userModalDemoNote: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 2 },
  userModalDemoNoteText: { flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'right', color: colors.gray[600] },

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

  editBackdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.48)', paddingHorizontal: 20, paddingVertical: 24, justifyContent: 'center' },
  editCard: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '88%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    gap: 16,
    shadowColor: '#06173e',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
  },
  editHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  editHeaderText: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', gap: 8 },
  editBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.16)',
  },
  editBadgeText: { fontSize: 12, fontWeight: '900', color: colors.secondary, textAlign: 'right' },
  editCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  editCloseBtnHover: { backgroundColor: 'rgba(15,23,42,0.08)' },
  editTitle: { fontSize: 28, fontWeight: '900', color: colors.text, textAlign: 'right' },
  editSubtitle: { fontSize: 14, fontWeight: '700', color: colors.gray[600], textAlign: 'right', lineHeight: 22 },
  editContent: { gap: 14, paddingTop: 8, paddingBottom: 6 },
  editSection: {
    backgroundColor: 'rgba(247,249,252,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 16,
    gap: 14,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  editSectionHeader: { gap: 4, alignItems: 'flex-start', justifyContent: 'flex-start' },
  editSectionTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },
  editSectionHint: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textAlign: 'right' },
  editGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  editPasswordGrid: { flexDirection: 'row', flexWrap: 'nowrap' },
  editField: { minWidth: 240, flexGrow: 1, gap: 8 },
  editFieldFull: { width: '100%' },
  editFieldLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },
  editInputWrap: {
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  editInputIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,69,230,0.08)',
  },
  editInputIconEmail: { backgroundColor: 'rgba(249,115,22,0.10)' },
  editInputIconPhone: { backgroundColor: 'rgba(22,163,74,0.10)' },
  editInputIconNeutral: { backgroundColor: 'rgba(15,23,42,0.06)' },
  editInput: {
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 2,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  editInputLtr: { writingDirection: 'ltr' as any },
  roleRow: { flexDirection: 'row', gap: 10, flexWrap: 'nowrap' },
  roleBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  roleBtnHover: { backgroundColor: 'rgba(15,23,42,0.03)' },
  roleBtnActive: { backgroundColor: 'rgba(15,69,230,0.10)', borderColor: 'rgba(15,69,230,0.22)' },
  roleBtnText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  roleBtnTextActive: { color: colors.primary },
  editActions: {
    flexDirection: 'row-reverse',
    gap: 12,
    paddingTop: 6,
  },
  editBtn: { flex: 1, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  editBtnGhost: { backgroundColor: 'rgba(15,23,42,0.05)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)' },
  editBtnHover: { backgroundColor: 'rgba(15,23,42,0.07)' },
  editBtnGhostText: { fontSize: 14, fontWeight: '900', color: colors.gray[700] },
  editBtnPrimary: { backgroundColor: colors.primary, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  editBtnPrimaryHover: { opacity: 0.96 },
  editBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: colors.white },
});

