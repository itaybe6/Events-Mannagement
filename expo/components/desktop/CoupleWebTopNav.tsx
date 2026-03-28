import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const normalizedPathname = normalizeHref(pathname || '/');

  return (
    <View style={styles.row}>
      {NAV_ITEMS.map((item) => {
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
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
