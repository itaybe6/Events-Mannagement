import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';

export type WebNavItem = {
  href: string;
  label: string;
  icon:
    | keyof typeof Ionicons.glyphMap
    | 'home'
    | 'people'
    | 'grid'
    | 'settings'
    | 'calendar-outline'
    | 'people-circle'
    | 'person-circle';
};

type Props = {
  title?: string;
  navItems: WebNavItem[];
  children: React.ReactNode;
};

export function WebScaffold({ title = 'ניהול אירועים', navItems, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { userData, userType, logout } = useUserStore();

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.root}>
      <View style={styles.sidebar}>
        <View style={styles.brand}>
          <Text style={styles.brandTitle}>{title}</Text>
          <Text style={styles.brandSubtitle}>
            {userData?.name ? userData.name : userData?.email || 'משתמש'} · {userType || ''}
          </Text>
        </View>

        <View style={styles.nav}>
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/' && pathname?.startsWith(item.href + '/')) ||
              (item.href !== '/' && pathname === item.href);

            return (
              <Pressable
                key={item.href}
                onPress={() => router.push(item.href)}
                style={({ hovered, pressed }) => [
                  styles.navItem,
                  active && styles.navItemActive,
                  (hovered || pressed) && styles.navItemHover,
                ]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={18}
                  color={active ? colors.white : colors.text}
                  style={styles.navIcon}
                />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={onLogout}
          style={({ hovered, pressed }) => [
            styles.logout,
            (hovered || pressed) && styles.logoutHover,
          ]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.white} style={styles.navIcon} />
          <Text style={styles.logoutText}>התנתקות</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.contentInner}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row-reverse', // RTL-friendly: sidebar on the right
    backgroundColor: colors.gray[50],
  },
  sidebar: {
    width: 280,
    backgroundColor: colors.white,
    borderLeftWidth: 1,
    borderLeftColor: colors.gray[200],
    padding: 16,
  },
  brand: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  brandSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[600],
    textAlign: 'right',
  },
  nav: {
    gap: 8,
    flex: 1,
  },
  navItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  navItemHover: {
    backgroundColor: colors.gray[100],
  },
  navItemActive: {
    backgroundColor: colors.primary,
  },
  navIcon: {
    marginLeft: 0,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
  },
  navLabelActive: {
    color: colors.white,
  },
  logout: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.oxfordBlue,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  logoutHover: {
    opacity: 0.92,
  },
  logoutText: {
    color: colors.white,
    fontWeight: '700',
    textAlign: 'right',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  contentInner: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
});

