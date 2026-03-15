import React, { useEffect, useMemo } from 'react';
import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';

export default function EmployeeWebLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const { userType, isLoggedIn, loading } = useUserStore();

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>טוען...</Text>
      </View>
    );
  }

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
      <View style={topNav ? styles.contentTopNav : styles.content}>
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
});

