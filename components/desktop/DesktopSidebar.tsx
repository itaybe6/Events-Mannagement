import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors } from '@/constants/colors';

export type DesktopNavItem = {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const APP_LOGO = require('../../assets/images/logoMoon.png');

type Props = {
  title?: string;
  subtitle?: string;
  navItems: DesktopNavItem[];
  footer?: React.ReactNode;
};

export default function DesktopSidebar({ title, subtitle, navItems, footer }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const hasBrandText = Boolean(title) || Boolean(subtitle);

  return (
    <View style={styles.sidebar}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <Image source={APP_LOGO} style={styles.logoImg} contentFit="contain" transition={0} />
            </View>
            {hasBrandText ? (
              <View style={styles.brandText}>
                {title ? (
                  <Text style={styles.brandTitle} numberOfLines={1}>
                    {title}
                  </Text>
                ) : null}
                {subtitle ? (
                  <Text style={styles.brandSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
                <View style={styles.brandDivider} />
              </View>
            ) : null}
          </View>
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
                  Platform.OS === 'web' && hovered && !active ? styles.navItemHover : null,
                  Platform.OS === 'web' && hovered && active ? styles.navItemActiveHover : null,
                  pressed ? styles.navItemPressed : null,
                ]}
              >
                {({ hovered, pressed }: any) => {
                  const isHover = Platform.OS === 'web' && hovered;
                  const iconColor = active
                    ? isHover
                      ? colors.white
                      : colors.secondary
                    : isHover
                      ? colors.secondary
                      : colors.gray[400];
                  const labelStyles = [
                    styles.navLabel,
                    active ? styles.navLabelActive : null,
                    isHover && !active ? styles.navLabelHover : null,
                    pressed ? styles.navLabelPressed : null,
                  ];

                  return (
                    <>
                      <Text style={labelStyles} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Ionicons name={item.icon} size={18} color={iconColor} style={styles.navIcon} />
                    </>
                  );
                }}
              </Pressable>
            );
          })}
        </View>
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: colors.white,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(15,23,42,0.06)',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    flexDirection: 'column',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          height: '100vh',
          alignSelf: 'flex-start',
        } as any)
      : null),
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: -2, height: 0 },
  },
  top: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 0,
    flex: 1,
  },
  brand: {
    paddingBottom: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.04)',
  },
  brandRow: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  logoBox: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: 52 },
  brandText: { width: '100%', minWidth: 0, alignItems: 'center' },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  brandSubtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.gray[500],
    textAlign: 'center',
  },
  brandDivider: {
    marginTop: 8,
    height: 1,
    width: 40,
    backgroundColor: 'rgba(204,160,0,0.4)',
    borderRadius: 999,
  },
  nav: {
    flex: 1,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  navItemHover: {
    backgroundColor: 'rgba(15,23,42,0.02)',
    borderColor: 'rgba(15,23,42,0.04)',
    transform: [{ scale: 1 }],
  },
  navItemActive: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.1)',
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    ...(Platform.OS === 'android' ? ({ elevation: 2 } as any) : null),
  },
  navItemActiveHover: {
    transform: [{ scale: 1 }],
  },
  navItemPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  navIcon: {
    marginLeft: 8,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    flex: 1,
    minWidth: 0,
  },
  navLabelActive: {
    color: colors.white,
  },
  navLabelHover: {
    color: colors.primary,
    transform: [{ translateX: -2 }],
  },
  navLabelPressed: {
    opacity: 0.9,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(249,250,251,0.4)',
  },
});

