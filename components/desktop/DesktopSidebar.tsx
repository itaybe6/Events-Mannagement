import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
            <Pressable
              onPress={() => null}
              accessibilityRole="image"
              accessibilityLabel="לוגו המערכת"
              style={({ hovered, pressed }: any) => [
                styles.logoBox,
                Platform.OS === 'web' && hovered ? styles.logoBoxHover : null,
                pressed ? styles.logoBoxPressed : null,
              ]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(198,168,91,0.22)', 'rgba(11,28,65,0.06)', 'rgba(11,28,65,0.00)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGlow}
              />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.00)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.logoShine}
              />
              <Image source={APP_LOGO} style={styles.logoImg} contentFit="contain" transition={0} />
            </Pressable>
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

        <ScrollView
          style={styles.navScroll}
          contentContainerStyle={styles.nav}
          showsVerticalScrollIndicator={false}
          // @ts-expect-error - react-native-web supports these props on ScrollView
          alwaysBounceVertical={false}
        >
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
        </ScrollView>
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 270,
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
          height: '100dvh',
          minHeight: '100vh',
          alignSelf: 'flex-start',
          zIndex: 20,
          overflow: 'hidden',
        } as any)
      : null),
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: -2, height: 0 },
  },
  top: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flex: 1,
    minHeight: 0,
  },
  navScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web'
      ? ({
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        } as any)
      : null),
  },
  brand: {
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    ...(Platform.OS === 'web'
      ? ((
          {
            // @ts-expect-error - react-native-web supports backgroundImage/backdropFilter
            backgroundImage:
              'radial-gradient(circle at 30% 20%, rgba(198,168,91,0.12) 0%, rgba(11,28,65,0.00) 55%)',
            backdropFilter: 'blur(6px)',
          } as any
        ) as any)
      : null),
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  brandRow: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoBox: {
    width: '100%',
    height: 78,
    borderRadius: 16,
    backgroundColor: 'rgba(11,28,65,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(11,28,65,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null),
  },
  logoBoxHover: {
    borderColor: 'rgba(198,168,91,0.32)',
    backgroundColor: 'rgba(11,28,65,0.03)',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    transform: [{ translateY: -1 }],
  },
  logoBoxPressed: {
    opacity: 0.98,
    transform: [{ scale: 0.99 }],
  },
  logoImg: { width: '100%', height: 78 },
  logoGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  logoShine: {
    position: 'absolute',
    top: -22,
    left: -40,
    width: 140,
    height: 60,
    transform: [{ rotate: '-18deg' }],
    opacity: 0.9,
  },
  brandText: { width: '100%', minWidth: 0, alignItems: 'center' },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  brandSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.gray[500],
    textAlign: 'center',
  },
  brandDivider: {
    marginTop: 8,
    height: 2,
    width: 48,
    backgroundColor: 'rgba(198,168,91,0.85)',
    borderRadius: 999,
  },
  nav: {
    gap: 8,
    paddingTop: 6,
    paddingBottom: 12,
    ...(Platform.OS === 'web' ? ({ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' } as any) : null),
  },
  navItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  navItemHover: {
    backgroundColor: 'rgba(11,28,65,0.04)',
    borderColor: 'rgba(11,28,65,0.10)',
    transform: [{ translateY: -0.5 }],
  },
  navItemActive: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.18)',
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    ...(Platform.OS === 'android' ? ({ elevation: 2 } as any) : null),
  },
  navItemActiveHover: {
    transform: [{ translateY: -0.5 }],
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
    fontWeight: '800',
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
  },
  navLabelPressed: {
    opacity: 0.9,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    backgroundColor: 'rgba(248,250,252,0.75)',
  },
});

