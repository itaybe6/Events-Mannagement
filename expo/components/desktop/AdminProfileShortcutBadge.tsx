import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
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
  const pathname = usePathname();
  const userData = useUserStore((state) => state.userData);
  const logout = useUserStore((state) => state.logout);
  const wrapperRef = useRef<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const adminName = String(userData?.name || '').trim() || 'מנהל מערכת';
  const adminInitials = initialsLabel(adminName);
  const normalizedPathname = String(pathname || '').replace(/\/\([^/]+\)/g, '') || '/';
  const isProfilePage = normalizedPathname === '/admin-profile';
  const adminAvatarUri = useMemo(() => {
    const direct = String(userData?.avatar_url ?? '').trim();
    if (direct) return direct;
    const seed = encodeURIComponent(userData?.email ?? 'admin');
    return `https://i.pravatar.cc/256?u=${seed}`;
  }, [userData?.avatar_url, userData?.email]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const root = wrapperRef.current;
      if (root?.contains?.(event.target as Node)) return;
      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const handleOpenProfile = () => {
    setMenuOpen(false);
    if (!isProfilePage) {
      router.push('/(admin)/admin-profile');
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setMenuOpen(false);
    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      console.error(error);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View ref={wrapperRef} style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`פתיחת תפריט הפרופיל של ${adminName}`}
        accessibilityState={{ expanded: menuOpen, busy: loggingOut }}
        onPress={() => setMenuOpen((prev) => !prev)}
        style={({ hovered, pressed }: any) => [
          styles.profileBadge,
          menuOpen ? styles.profileBadgeActive : null,
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

        <Ionicons
          name={menuOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.gray[600]}
          style={styles.chevron}
        />
      </Pressable>

      {menuOpen ? (
        <View style={styles.menuLayer}>
          <View style={styles.menu}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="מעבר לפרופיל שלי"
              onPress={handleOpenProfile}
              style={({ hovered, pressed }: any) => [
                styles.menuItem,
                styles.menuItemProfile,
                isProfilePage ? styles.menuItemProfileCurrent : null,
                Platform.OS === 'web' && hovered ? styles.menuItemHover : null,
                pressed ? styles.actionPressed : null,
              ]}
            >
              <View style={styles.menuItemContent}>
                <Ionicons name="person-circle-outline" size={18} color={isProfilePage ? colors.primary : colors.text} />
                <Text style={[styles.menuText, isProfilePage ? styles.menuTextCurrent : null]}>הפרופיל שלי</Text>
              </View>
            </Pressable>

            <View style={styles.menuDivider} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="התנתקות"
              disabled={loggingOut}
              onPress={() => void handleLogout()}
              style={({ hovered, pressed }: any) => [
                styles.menuItem,
                styles.menuItemDanger,
                loggingOut ? styles.menuItemDisabled : null,
                Platform.OS === 'web' && hovered && !loggingOut ? styles.menuItemDangerHover : null,
                pressed && !loggingOut ? styles.actionPressed : null,
              ]}
            >
              <View style={styles.menuItemContent}>
                <Ionicons
                  name="log-out-outline"
                  size={18}
                  color={loggingOut ? 'rgba(220,38,38,0.45)' : '#DC2626'}
                />
                <Text style={[styles.menuText, styles.menuTextDanger, loggingOut ? styles.menuTextDangerDisabled : null]}>
                  {loggingOut ? 'מתנתק...' : 'התנתק'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 40,
  },
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
  profileBadgeActive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(25,93,230,0.22)',
    shadowColor: '#195DE6',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
  chevron: {
    flexShrink: 0,
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
  menuLayer: {
    position: 'absolute',
    top: '100%',
    marginTop: 10,
    left: '50%',
    paddingHorizontal: 12,
    transform: [{ translateX: -110 }],
    zIndex: 60,
  },
  menu: {
    minWidth: 220,
    padding: 10,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    alignItems: 'stretch',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 18px 40px rgba(15,23,42,0.14)',
        } as any)
      : {
          shadowColor: '#0F172A',
          shadowOpacity: 0.14,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        }),
  },
  menuItem: {
    minHeight: 44,
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  menuItemContent: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  menuItemHover: {
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  menuItemProfileCurrent: {
    backgroundColor: 'rgba(25,93,230,0.04)',
  },
  menuItemDanger: {
  },
  menuItemDangerHover: {
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  menuItemDisabled: {
    opacity: 0.7,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: 14,
    marginVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  menuText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  menuTextCurrent: {
    color: colors.primary,
  },
  menuTextDanger: {
    color: '#DC2626',
  },
  menuTextDangerDisabled: {
    color: 'rgba(220,38,38,0.45)',
  },
});
