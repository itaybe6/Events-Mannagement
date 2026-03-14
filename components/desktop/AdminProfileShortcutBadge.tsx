import React, { useMemo } from 'react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';

function initialsLabel(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[1]?.[0] ?? '' : '';
  return (a + b).toUpperCase() || 'U';
}

export default function AdminProfileShortcutBadge() {
  const router = useRouter();
  const userData = useUserStore((state) => state.userData);

  const adminName = String(userData?.name || '').trim() || 'מנהל מערכת';
  const adminInitials = initialsLabel(adminName);
  const adminAvatarUri = useMemo(() => {
    const direct = String(userData?.avatar_url ?? '').trim();
    if (direct) return direct;
    const seed = encodeURIComponent(userData?.email ?? 'admin');
    return `https://i.pravatar.cc/256?u=${seed}`;
  }, [userData?.avatar_url, userData?.email]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`מעבר לעמוד הפרופיל של ${adminName}`}
      onPress={() => router.push('/(admin)/admin-profile')}
      style={({ hovered, pressed }: any) => [
        styles.profileBadge,
        Platform.OS === 'web' && hovered ? styles.profileBadgeHover : null,
        pressed ? styles.actionPressed : null,
      ]}
    >
      <View style={styles.profileBadgeAvatar}>
        {adminAvatarUri ? (
          <Image source={{ uri: adminAvatarUri }} style={styles.profileBadgeImage} contentFit="cover" transition={0} />
        ) : (
          <Text style={styles.profileBadgeText}>{adminInitials}</Text>
        )}
      </View>

      <Text style={styles.profileBadgeName} numberOfLines={1}>
        {adminName}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  profileBadgeHover: {
    shadowColor: '#195DE6',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    backgroundColor: '#FFFFFF',
  },
  actionPressed: {
    opacity: 0.9,
  },
  profileBadgeAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8EEF8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    overflow: 'hidden',
    flexShrink: 0,
  },
  profileBadgeImage: {
    width: '100%',
    height: '100%',
  },
  profileBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
  },
  profileBadgeName: {
    maxWidth: 160,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
});
