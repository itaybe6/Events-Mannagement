import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Slot, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DesktopSidebar from '@/components/desktop/DesktopSidebar';
import { EventSwitcher } from '@/components/EventSwitcher';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

export default function CoupleWebLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ eventId?: string | string[] }>();
  const { userType, isLoggedIn, loading, logout, userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const [hasMultipleEvents, setHasMultipleEvents] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (userType === 'admin') {
      router.replace('/(admin)/admin-events');
      return;
    }
    if (userType === 'employee') {
      router.replace('/(employee)/employee-events');
    }
  }, [isLoggedIn, userType, loading, router]);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/login');
    } catch (e) {
      console.error(e);
    }
  };

  const queryEventId = Array.isArray(globalParams.eventId) ? globalParams.eventId[0] : globalParams.eventId;
  const resolvedEventId = useMemo(() => {
    return (
      String(
        queryEventId ||
          (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
          userData?.event_id ||
          ''
      ).trim() || null
    );
  }, [activeEventId, activeUserId, queryEventId, userData?.event_id, userData?.id]);

  const handleSelectEventId = (nextEventId: string) => {
    if (userData?.id) setActiveEvent(userData.id, nextEventId);

    const cleanedParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(globalParams || {})) {
      if (typeof v === 'string') cleanedParams[k] = v;
    }
    cleanedParams.eventId = nextEventId;

    router.replace({
      // expo-router web usually exposes pathname without group segments
      pathname: (pathname || '/(couple)') as any,
      params: cleanedParams as any,
    });
  };

  const handleHasMultipleChange = useCallback((value: boolean) => {
    setHasMultipleEvents(value);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>טוען...</Text>
      </View>
    );
  }

  const userName = userData?.name || userData?.email || 'משתמש';
  const avatarUrl = String(userData?.avatar_url || '').trim();
  const initials = String(userName)
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.sidebarWrap}>
        <DesktopSidebar
          title=""
          navItems={[
            { href: '/(couple)', label: 'בית', icon: 'home' },
            { href: '/(couple)/guests', label: 'אורחים', icon: 'people' },
            { href: '/(couple)/BrideGroomSeating', label: 'הושבה', icon: 'grid' },
            { href: '/(couple)/brideGroomProfile', label: 'פרופיל', icon: 'person-circle' },
          ]}
          footer={
            <View style={styles.sidebarFooter}>
              <View style={[styles.sidebarEventSwitcherWrap, !hasMultipleEvents ? styles.sidebarEventSwitcherWrapHidden : null]}>
                <EventSwitcher
                  userId={userData?.id}
                  selectedEventId={resolvedEventId}
                  onSelectEventId={handleSelectEventId}
                  label="אירוע פעיל"
                  onHasMultipleChange={handleHasMultipleChange}
                />
              </View>

              <View style={styles.userCard}>
                <View style={styles.userMeta}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {userName}
                  </Text>
                </View>
                <View style={styles.userAvatarRing}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.userAvatarImg} contentFit="cover" transition={0} />
                  ) : (
                    <View style={styles.userAvatarFallback}>
                      <Text style={styles.userAvatarInitials}>{initials || 'U'}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.footerDivider} />

              <Pressable
                onPress={handleLogout}
                accessibilityRole="button"
                accessibilityLabel="התנתקות"
                style={({ hovered, pressed }: any) => [
                  styles.logoutBtn,
                  Platform.OS === 'web' && hovered ? styles.logoutBtnHover : null,
                  pressed ? styles.logoutBtnPressed : null,
                ]}
              >
                <Ionicons name="log-out-outline" size={18} color="#fff" />
                <Text style={styles.logoutText}>התנתקות</Text>
              </Pressable>
            </View>
          }
        />
      </View>
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    height: '100%',
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : null),
  },
  content: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
  sidebarWrap: {},
  center: {
    flex: 1,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.gray[600],
  },
  sidebarFooter: {
    gap: 10,
    position: 'relative',
  },
  sidebarEventSwitcherWrap: {
    width: '100%',
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 4,
  },
  sidebarEventSwitcherWrapHidden: {
    height: 0,
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  userCard: {
    // Force deterministic layout (avatar on the right)
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  userAvatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: 'rgba(15,23,42,0.05)',
  },
  userAvatarImg: { width: '100%', height: '100%' },
  userAvatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userAvatarInitials: { fontSize: 12, fontWeight: '900', color: colors.primary },
  userMeta: {
    flex: 1,
    minWidth: 0,
    // left side of the avatar
    alignItems: 'flex-start',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  userName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  footerDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  logoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  logoutBtnHover: {
    backgroundColor: colors.oxfordBlue,
    borderColor: colors.oxfordBlue,
  },
  logoutBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

