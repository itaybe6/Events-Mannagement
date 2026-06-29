import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';

const NAV_ITEMS = [
  { href: '/(couple)', label: 'בית', icon: 'home-outline' },
  { href: '/(couple)/guests', label: 'אישורי הגעה', icon: 'checkbox-outline' },
  { href: '/(couple)/BrideGroomSeating', label: 'מפת הושבה', icon: 'grid-outline' },
  { href: '/(couple)/TablesList', label: 'רשימת שולחנות', icon: 'list-outline' },
  { href: '/(couple)/automatic-notifications', label: 'עריכת הודעות', icon: 'chatbox-ellipses-outline' },
  { href: '/(couple)/brideGroomProfile', label: 'פרופיל', icon: 'person-outline' },
] as const;

function normalizeHref(path: string) {
  return path.replace(/\/\([^/]+\)/g, '') || '/';
}

type Props = {
  eventId?: string | null;
};

export default function CoupleWebTopNav({ eventId }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const normalizedPathname = normalizeHref(pathname || '/');

  // On mobile web, hide the "עריכת הודעות" (notifications editor) entry.
  const visibleNavItems = isMobile
    ? NAV_ITEMS.filter((item) => item.href !== '/(couple)/automatic-notifications')
    : NAV_ITEMS;

  const items = visibleNavItems.map((item) => {
    const normalizedHref = normalizeHref(item.href);
    const active =
      normalizedPathname === normalizedHref || normalizedPathname.startsWith(normalizedHref + '/');

    return (
      <Pressable
        key={item.href}
        accessibilityRole="button"
        accessibilityLabel={`מעבר לעמוד ${item.label}`}
        onPress={() =>
          router.push({
            pathname: item.href as any,
            params: eventId ? { eventId } : undefined,
          })
        }
        style={({ hovered, pressed }: any) => [
          styles.item,
          isMobile ? styles.itemMobile : null,
          active ? styles.itemActive : null,
          Platform.OS === 'web' && hovered && !active ? styles.itemHover : null,
          pressed ? styles.itemPressed : null,
        ]}
      >
        <View style={styles.itemContent}>
          <Ionicons
            name={item.icon}
            size={16}
            color={active ? '#FFFFFF' : '#6C7A90'}
          />
          <Text style={[styles.text, active ? styles.textActive : null]}>{item.label}</Text>
        </View>
      </Pressable>
    );
  });

  // On phones, keep the nav on a single horizontally-scrollable row so it
  // doesn't consume several vertical rows above the page content.
  if (isMobile) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.mobileScroll}
        contentContainerStyle={styles.mobileScrollContent}
      >
        {items}
      </ScrollView>
    );
  }

  return <View style={styles.row}>{items}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
  },
  mobileScroll: {
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  mobileScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 2,
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
  itemMobile: {
    paddingHorizontal: 14,
    minHeight: 40,
    backgroundColor: '#F4F7FC',
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
  textActive: {
    color: '#FFFFFF',
  },
});
