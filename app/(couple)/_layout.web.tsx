import React, { useEffect } from 'react';
import { Slot, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import DesktopShell from '@/components/desktop/DesktopShell';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';

export default function CoupleWebLayout() {
  const router = useRouter();
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
    if (userType === 'employee') {
      router.replace('/(employee)/employee-events');
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

  return (
    <DesktopShell
      title="ניהול אירוע"
      navItems={[
        { href: '/(couple)', label: 'בית', icon: 'home' },
        { href: '/(couple)/guests', label: 'אורחים', icon: 'people' },
        { href: '/(couple)/BrideGroomSeating', label: 'הושבה', icon: 'grid' },
        { href: '/(couple)/brideGroomProfile', label: 'פרופיל', icon: 'person-circle' },
      ]}
    >
      <Slot />
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
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

