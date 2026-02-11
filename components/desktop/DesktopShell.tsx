import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import DesktopSidebar, { DesktopNavItem } from './DesktopSidebar';
import Container from '@/components/layout/Container';
import { useBreakpoint } from '@/hooks/useBreakpoint';

type Props = {
  title: string;
  navItems: DesktopNavItem[];
  children: React.ReactNode;
  fullWidth?: boolean;
};

export default function DesktopShell({ title, navItems, children, fullWidth }: Props) {
  const router = useRouter();
  const { userData, userType, logout } = useUserStore();
  const { contentMaxWidth } = useBreakpoint();

  const subtitle = `${userData?.name ? userData.name : userData?.email || 'משתמש'} · ${userType || ''}`;

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.root}>
      <View style={styles.main}>
        <View style={styles.bg}>
          <View style={styles.bgBlobPrimary} />
          <View style={styles.bgBlobSecondary} />
        </View>

        {fullWidth ? (
          <View style={styles.mainInner}>{children}</View>
        ) : (
          <View style={styles.mainInner}>
            <Container maxWidth={contentMaxWidth ?? 1200}>{children}</Container>
          </View>
        )}
      </View>

      <DesktopSidebar
        title={title}
        subtitle={subtitle}
        navItems={navItems}
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="התנתקות"
            onPress={onLogout}
            style={({ hovered, pressed }: any) => [
              styles.logoutBtn,
              Platform.OS === 'web' && hovered ? styles.logoutBtnHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.white} />
            <Text style={styles.logoutText}>התנתקות</Text>
          </Pressable>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row-reverse', // RTL: sidebar on the right
    backgroundColor: colors.gray[50],
  },
  main: {
    flex: 1,
    position: 'relative',
  },
  mainInner: {
    flex: 1,
    padding: 20,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.gray[100],
  },
  bgBlobPrimary: {
    position: 'absolute',
    width: 640,
    height: 640,
    borderRadius: 320,
    backgroundColor: colors.primary,
    opacity: 0.06,
    top: -220,
    right: -180,
  },
  bgBlobSecondary: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: colors.accent,
    opacity: 0.08,
    top: 140,
    left: -220,
  },
  logoutBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.oxfordBlue,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  logoutBtnHover: {
    opacity: 0.95,
  },
  logoutText: {
    color: colors.white,
    fontWeight: '900',
    textAlign: 'right',
  },
});

