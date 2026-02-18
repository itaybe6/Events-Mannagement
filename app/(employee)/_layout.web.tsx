import React, { useEffect, useMemo } from 'react';
import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DesktopSidebar from '@/components/desktop/DesktopSidebar';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

export default function EmployeeWebLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const { userType, isLoggedIn, loading, logout, userData } = useUserStore();

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
    if (userType !== 'employee') {
      router.replace('/(couple)');
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

  const topNav = useMemo(() => {
    const seg = Array.isArray(segments) ? segments.map((s) => String(s)) : [];
    const segStr = seg.join('/');
    const pFromHook = String(pathname || '');
    const pFromLocation =
      Platform.OS === 'web' ? String((globalThis as any)?.location?.pathname || '') : '';
    const hay = `${segStr} ${pFromHook} ${pFromLocation}`.toLowerCase();
    // Be tolerant: route path can differ on web (groups may be omitted).
    return hay.includes('employee-guest-checkin') || hay.includes('guest-checkin');
  }, [pathname, segments]);

  return (
    <View style={[styles.container, topNav ? styles.containerTopNav : null]}>
      {topNav ? (
        <>
          <View style={styles.contentTopNav}>
            <Slot />
          </View>
        </>
      ) : (
        <>
          <View style={styles.sidebarWrap}>
            <DesktopSidebar
              title=""
              navItems={[
                { href: '/(employee)/employee-events', label: 'אירועים', icon: 'calendar-outline' },
                { href: '/(employee)/employee-profile', label: 'פרופיל', icon: 'person-circle' },
              ]}
              footer={
                <View style={styles.sidebarFooter}>
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
        </>
      )}
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
  containerTopNav: {
    flexDirection: 'column',
  },
  content: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
  contentTopNav: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
  guestCheckinTopBar: {
    position: 'relative',
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestCheckinTopBarTitle: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  guestCheckinTopBarIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestCheckinTopBarH1: { fontSize: 15, fontWeight: '900', color: '#fff', textAlign: 'right' },
  guestCheckinTopBarSub: { marginTop: 2, fontSize: 11, fontWeight: '800', color: 'rgba(209,213,219,0.95)', textAlign: 'right' },
  guestCheckinBackBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  guestCheckinBackBtnHover: { backgroundColor: 'rgba(255,255,255,0.14)' },
  guestCheckinBackText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },
  guestCheckinTopBarGlow: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.22)',
    ...(Platform.OS === 'web' ? ({ filter: 'blur(28px)' } as any) : null),
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
  topAvatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: 'rgba(15,23,42,0.05)',
  },
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

