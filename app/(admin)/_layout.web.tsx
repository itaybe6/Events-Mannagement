import React, { useEffect } from 'react';
import { Slot, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import DesktopSidebar from '@/components/desktop/DesktopSidebar';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

export default function AdminWebLayout() {
  const router = useRouter();
  const { userType, isLoggedIn, loading, logout, userData } = useUserStore();
  
  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (userType === 'employee') {
      router.replace('/(employee)/employee-events');
      return;
    }
    if (userType !== 'admin') {
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

  const userName = userData?.name || 'אדמין';
  const avatarUrl = String(userData?.avatar_url || '').trim();
  const initials = userName
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
            { href: '/(admin)/admin-events', label: 'אירועים', icon: 'calendar-outline' },
            { href: '/(admin)/users', label: 'משתמשים', icon: 'people-circle' },
            { href: '/(admin)/admin-profile', label: 'פרופיל', icon: 'person-circle' },
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
                style={({ hovered, pressed }: any) => [
                  styles.logoutBtn,
                  Platform.OS === 'web' && hovered ? styles.logoutBtnHover : null,
                  pressed ? styles.logoutBtnPressed : null,
                ]}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.gray[500]} />
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
  logoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  logoutBtnHover: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderColor: 'rgba(239,68,68,0.1)',
  },
  logoutBtnPressed: {
    opacity: 0.7,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[500],
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
});
