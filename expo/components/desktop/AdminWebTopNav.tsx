import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { colors } from '@/constants/colors';
import { TOUCH_TARGET, useResponsive } from '@/lib/responsive';
import { useUserStore } from '@/store/userStore';

const NAV_ITEMS = [
  { href: '/(admin)/admin-events', label: 'לוח בקרה', icon: 'speedometer-outline' },
  { href: '/(admin)/admin-events-list', label: 'אירועים', icon: 'calendar-outline' },
  { href: '/(admin)/whatsapp-templates', label: 'וואטסאפ', icon: 'logo-whatsapp' },
  { href: '/(admin)/reports', label: 'דוחות', icon: 'bar-chart-outline' },
  { href: '/(admin)/users', label: 'משתמשים', icon: 'people-outline' },
  { href: '/(admin)/admin-profile', label: 'פרופיל', icon: 'person-outline' },
] as const;

const EMPLOYEE_WEB_NAV_ITEMS = [
  { href: '/(admin)/admin-events-list', label: 'אירועים', icon: 'calendar-outline' },
  { href: '/(admin)/employee-profile-tab', label: 'פרופיל', icon: 'person-outline' },
] as const;

function normalizeHref(path: string) {
  return path.replace(/\/\([^/]+\)/g, '') || '/';
}

type Props = {
  inset?: boolean;
};

export default function AdminWebTopNav({ inset = false }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const userType = useUserStore((state) => state.userType);
  const { isTouchLayout, isTablet } = useResponsive();
  const normalizedPathname = normalizeHref(pathname || '/');
  const navItems = userType === 'employee' ? EMPLOYEE_WEB_NAV_ITEMS : NAV_ITEMS;

  const items = navItems.map((item) => {
    const normalizedHref = normalizeHref(item.href);
    const active =
      normalizedPathname === normalizedHref || normalizedPathname.startsWith(normalizedHref + '/');

    return (
      <Pressable
        key={item.href}
        accessibilityRole="button"
        accessibilityLabel={`מעבר לעמוד ${item.label}`}
        onPress={() => router.push(item.href)}
        style={({ hovered, pressed }: any) => [
          styles.item,
          isTouchLayout ? styles.itemTouch : null,
          active ? styles.itemActive : null,
          Platform.OS === 'web' && hovered && !active ? styles.itemHover : null,
          pressed ? styles.itemPressed : null,
        ]}
      >
        <View style={styles.itemContent}>
          <Ionicons
            name={item.icon}
            size={isTouchLayout ? 19 : 16}
            color={active ? '#FFFFFF' : '#6C7A90'}
          />
          <Text style={[styles.text, isTouchLayout ? styles.textTouch : null, active ? styles.textActive : null]}>
            {item.label}
          </Text>
        </View>
      </Pressable>
    );
  });

  // On a tablet the nav would otherwise wrap to two or three rows and push the
  // actual page content below the fold. Scroll it sideways instead.
  if (isTablet) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.scroll, inset ? styles.rowInset : null]}
        contentContainerStyle={styles.scrollContent}
      >
        {items}
      </ScrollView>
    );
  }

  return <View style={[styles.row, inset ? styles.rowInset : null]}>{items}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
  },
  rowInset: {
    marginBottom: 18,
  },
  scroll: {
    alignSelf: 'stretch',
    flexGrow: 0,
    ...(Platform.OS === 'web' ? ({ overscrollBehaviorX: 'contain' } as any) : null),
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  item: {
    minHeight: 42,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  itemTouch: {
    minHeight: TOUCH_TARGET + 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  itemActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  itemHover: {
    backgroundColor: 'rgba(25,93,230,0.05)',
  },
  itemPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  text: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6C7A90',
    textAlign: 'right',
  },
  textTouch: {
    fontSize: 15,
  },
  textActive: {
    color: '#FFFFFF',
  },
});
