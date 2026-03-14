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
  variant?: 'default' | 'admin';
};

export default function DesktopSidebar({ title, subtitle, navItems, footer, variant = 'default' }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const hasBrandText = Boolean(title) || Boolean(subtitle);
  const isAdminVariant = variant === 'admin';

  return (
    <View style={[styles.sidebar, isAdminVariant ? styles.sidebarAdmin : null]}>
      <View style={[styles.top, isAdminVariant ? styles.topAdmin : null]}>
        <View style={[styles.brand, isAdminVariant ? styles.brandAdmin : null]}>
          <View style={styles.brandRow}>
            <Pressable
              onPress={() => null}
              accessibilityRole="image"
              accessibilityLabel="לוגו המערכת"
              style={({ hovered, pressed }: any) => [
                styles.logoBox,
                isAdminVariant ? styles.logoBoxAdmin : null,
                Platform.OS === 'web' && hovered ? (isAdminVariant ? styles.logoBoxAdminHover : styles.logoBoxHover) : null,
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
            {isAdminVariant ? (
              <View style={styles.adminIntro}>
                <Text style={styles.adminEyebrow}>ניהול מערכת</Text>
                <Text style={styles.adminIntroTitle}>לוח בקרה</Text>
                <Text style={styles.adminIntroText}>גישה מהירה לכל אזורי הניהול המרכזיים</Text>
              </View>
            ) : null}
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
          contentContainerStyle={[styles.nav, isAdminVariant ? styles.navAdmin : null]}
          showsVerticalScrollIndicator={false}
          // @ts-expect-error - react-native-web supports these props on ScrollView
          alwaysBounceVertical={false}
        >
          {isAdminVariant ? (
            <View style={styles.adminSectionHeader}>
              <Text style={styles.adminSectionEyebrow}>ניווט</Text>
              <View style={styles.adminSectionDivider} />
            </View>
          ) : null}
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
                  isAdminVariant ? styles.navItemAdmin : null,
                  active ? (isAdminVariant ? styles.navItemAdminActive : styles.navItemActive) : null,
                  Platform.OS === 'web' && hovered && !active
                    ? isAdminVariant
                      ? styles.navItemAdminHover
                      : styles.navItemHover
                    : null,
                  Platform.OS === 'web' && hovered && active
                    ? isAdminVariant
                      ? styles.navItemAdminActiveHover
                      : styles.navItemActiveHover
                    : null,
                  pressed ? styles.navItemPressed : null,
                ]}
              >
                {({ hovered, pressed }: any) => {
                  const isHover = Platform.OS === 'web' && hovered;
                  const iconColor = active
                    ? isAdminVariant
                      ? colors.primary
                      : isHover
                        ? colors.white
                        : colors.secondary
                    : isHover
                      ? isAdminVariant
                        ? colors.primary
                        : colors.secondary
                      : colors.gray[400];
                  const labelStyles = [
                    styles.navLabel,
                    isAdminVariant ? styles.navLabelAdmin : null,
                    active ? (isAdminVariant ? styles.navLabelAdminActive : styles.navLabelActive) : null,
                    isHover && !active ? (isAdminVariant ? styles.navLabelAdminHover : styles.navLabelHover) : null,
                    pressed ? styles.navLabelPressed : null,
                  ];

                  return (
                    <>
                      {active && isAdminVariant ? <View style={styles.navActiveRail} /> : null}
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

      {footer ? <View style={[styles.footer, isAdminVariant ? styles.footerAdmin : null]}>{footer}</View> : null}
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
          height: '100vh',
          maxHeight: '100vh',
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
  sidebarAdmin: {
    width: 298,
    backgroundColor: '#F8FAFD',
    borderLeftColor: 'rgba(6,23,62,0.04)',
    shadowOpacity: 0.04,
    shadowRadius: 20,
    shadowOffset: { width: -4, height: 0 },
  },
  top: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flex: 1,
    minHeight: 0,
  },
  topAdmin: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
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
  brandAdmin: {
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    shadowColor: colors.primary,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
  logoBoxAdmin: {
    height: 68,
    borderRadius: 18,
    backgroundColor: '#FDFEFF',
    borderColor: 'rgba(25,93,230,0.08)',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  logoBoxHover: {
    borderColor: 'rgba(198,168,91,0.32)',
    backgroundColor: 'rgba(11,28,65,0.03)',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    transform: [{ translateY: -1 }],
  },
  logoBoxAdminHover: {
    borderColor: 'rgba(25,93,230,0.18)',
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0.06,
    shadowRadius: 14,
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
  adminIntro: {
    width: '100%',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingHorizontal: 2,
    gap: 5,
  },
  adminEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#195DE6',
    textAlign: 'right',
  },
  adminIntroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  adminIntroText: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
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
  navAdmin: {
    gap: 8,
    paddingTop: 4,
  },
  adminSectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  adminSectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.gray[500],
    textAlign: 'right',
  },
  adminSectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(6,23,62,0.06)',
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
  navItemAdmin: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: colors.primary,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  navItemHover: {
    backgroundColor: 'rgba(11,28,65,0.04)',
    borderColor: 'rgba(11,28,65,0.10)',
    transform: [{ translateY: -0.5 }],
  },
  navItemAdminHover: {
    backgroundColor: 'rgba(25,93,230,0.05)',
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
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
  navItemAdminActive: {
    backgroundColor: 'rgba(25,93,230,0.10)',
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  navItemActiveHover: {
    transform: [{ translateY: -0.5 }],
  },
  navItemAdminActiveHover: {
    backgroundColor: 'rgba(25,93,230,0.14)',
    transform: [{ translateY: -0.5 }],
  },
  navItemPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  navActiveRail: {
    position: 'absolute',
    right: 0,
    top: 11,
    bottom: 11,
    width: 3,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    backgroundColor: '#195DE6',
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
  navLabelAdmin: {
    color: colors.gray[700],
    fontSize: 14,
  },
  navLabelActive: {
    color: colors.white,
  },
  navLabelAdminActive: {
    color: '#195DE6',
  },
  navLabelHover: {
    color: colors.primary,
  },
  navLabelAdminHover: {
    color: '#195DE6',
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
    ...(Platform.OS === 'web'
      ? ({
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        } as any)
      : null),
  },
  footerAdmin: {
    backgroundColor: 'rgba(248,250,253,0.98)',
    borderTopColor: 'rgba(6,23,62,0.04)',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});

