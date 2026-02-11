import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';

export type DesktopNavItem = {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type Props = {
  title: string;
  subtitle?: string;
  navItems: DesktopNavItem[];
  footer?: React.ReactNode;
};

export default function DesktopSidebar({ title, subtitle, navItems, footer }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.brandSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
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
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ hovered, pressed }: any) => [
                styles.navItem,
                active ? styles.navItemActive : null,
                Platform.OS === 'web' && hovered ? styles.navItemHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? colors.white : colors.text}
                style={styles.navIcon}
              />
              <Text style={[styles.navLabel, active ? styles.navLabelActive : null]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 292,
    backgroundColor: colors.white,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(15,23,42,0.10)',
    padding: 16,
  },
  brand: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  brandSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  nav: {
    flex: 1,
    gap: 8,
  },
  navItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navItemHover: {
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderColor: 'rgba(15,23,42,0.06)',
  },
  navItemActive: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  navIcon: {},
  navLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  navLabelActive: {
    color: colors.white,
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.08)',
  },
});

