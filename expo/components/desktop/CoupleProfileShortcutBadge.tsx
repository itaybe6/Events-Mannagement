import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { EventSwitcher } from '@/components/EventSwitcher';
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

type Props = {
  userId?: string;
  selectedEventId?: string | null;
  onSelectEventId: (eventId: string) => void;
  variant?: 'header' | 'sidebar';
  /** `onDark` restyles the trigger for the midnight sidebar; the popover stays light. */
  tone?: 'onLight' | 'onDark';
  compact?: boolean;
};

export default function CoupleProfileShortcutBadge({
  userId,
  selectedEventId,
  onSelectEventId,
  variant = 'header',
  tone = 'onLight',
  compact = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isSidebar = variant === 'sidebar';
  const onDark = tone === 'onDark';
  const hideName = compact || (isMobile && !isSidebar);
  const userData = useUserStore((state) => state.userData);
  const logout = useUserStore((state) => state.logout);
  const wrapperRef = useRef<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [hasMultipleEvents, setHasMultipleEvents] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);

  const userName = String(userData?.name || '').trim() || 'בעל אירוע';
  const userInitials = initialsLabel(userName);
  const normalizedPathname = String(pathname || '').replace(/\/\([^/]+\)/g, '') || '/';
  const isProfilePage = normalizedPathname === '/brideGroomProfile';
  const avatarUri = useMemo(() => {
    const direct = String(userData?.avatar_url ?? '').trim();
    if (direct) return direct;
    const seed = encodeURIComponent(userData?.email ?? 'couple');
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
      if (event.key === 'Escape') setMenuOpen(false);
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
      router.push('/(couple)/brideGroomProfile');
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
    <View ref={wrapperRef} style={[styles.wrapper, isSidebar ? styles.wrapperSidebar : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`פתיחת תפריט הפרופיל של ${userName}`}
        accessibilityState={{ expanded: menuOpen, busy: loggingOut }}
        onPress={() => setMenuOpen((prev) => !prev)}
        style={({ hovered, pressed }: any) => [
          styles.profileBadge,
          isMobile && !isSidebar ? styles.profileBadgeMobile : null,
          isSidebar ? styles.profileBadgeSidebar : null,
          onDark ? styles.profileBadgeDark : null,
          compact ? styles.profileBadgeCompact : null,
          menuOpen ? (onDark ? styles.profileBadgeDarkActive : styles.profileBadgeActive) : null,
          Platform.OS === 'web' && hovered
            ? onDark
              ? styles.profileBadgeDarkHover
              : styles.profileBadgeHover
            : null,
          pressed ? styles.actionPressed : null,
        ]}
      >
        <View style={[styles.profileBadgeAvatar, onDark ? styles.profileBadgeAvatarDark : null, isMobile && !isSidebar ? styles.profileBadgeAvatarMobile : null]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.profileBadgeImage} contentFit="cover" transition={0} />
          ) : (
            <Text style={styles.profileBadgeText}>{userInitials}</Text>
          )}
        </View>

        {!hideName ? (
          <Text style={[styles.profileBadgeName, isSidebar ? styles.profileBadgeNameSidebar : null, onDark ? styles.profileBadgeNameDark : null]} numberOfLines={1}>
            {userName}
          </Text>
        ) : null}

        {!compact ? (
          <Ionicons
            name={menuOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={onDark ? 'rgba(226,234,250,0.85)' : colors.gray[600]}
            style={styles.chevron}
          />
        ) : null}
      </Pressable>

      {menuOpen ? (
        <View style={[styles.menuLayer, isMobile && !isSidebar ? styles.menuLayerMobile : null, isSidebar ? styles.menuLayerSidebar : null]}>
          <View style={styles.menu}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="מעבר לפרופיל שלי"
              onPress={handleOpenProfile}
              style={({ hovered, pressed }: any) => [
                styles.menuItem,
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

            {hasMultipleEvents ? (
              <>
                <View style={styles.menuDivider} />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="בחירת אירוע"
                  onPress={() => {
                    setMenuOpen(false);
                    setEventDialogOpen(true);
                  }}
                  style={({ hovered, pressed }: any) => [
                    styles.menuItem,
                    Platform.OS === 'web' && hovered ? styles.menuItemHover : null,
                    pressed ? styles.actionPressed : null,
                  ]}
                >
                  <View style={styles.menuItemContent}>
                    <Ionicons name="calendar-outline" size={18} color={colors.text} />
                    <Text style={styles.menuText}>בחר אירוע</Text>
                  </View>
                </Pressable>
              </>
            ) : null}

            <View style={styles.menuDivider} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="התנתקות"
              disabled={loggingOut}
              onPress={() => void handleLogout()}
              style={({ hovered, pressed }: any) => [
                styles.menuItem,
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

      <EventSwitcher
        userId={userId}
        selectedEventId={selectedEventId}
        onSelectEventId={onSelectEventId}
        onHasMultipleChange={setHasMultipleEvents}
        triggerMode="none"
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 1000,
  },
  wrapperSidebar: {
    width: '100%',
    zIndex: 80,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  profileBadgeSidebar: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(29,93,230,0.16)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 6px 16px rgba(29,93,230,0.08)' } as any)
      : null),
  },
  profileBadgeDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(12px)',
          boxShadow: '0 10px 26px rgba(3,7,20,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
        } as any)
      : null),
  },
  profileBadgeDarkHover: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  profileBadgeDarkActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.42)',
  },
  profileBadgeAvatarDark: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.42)',
  },
  profileBadgeNameDark: {
    color: '#F5F8FF',
  },
  profileBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignSelf: 'center',
    width: 'auto',
  },
  profileBadgeMobile: {
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: 'flex-end',
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
  profileBadgeAvatarMobile: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    flex: 1,
  },
  profileBadgeNameSidebar: {
    maxWidth: '100%',
  },
  menuLayer: {
    position: 'absolute',
    top: '100%',
    marginTop: 10,
    left: '50%',
    paddingHorizontal: 12,
    transform: [{ translateX: -110 }],
    zIndex: 1100,
  },
  menuLayerSidebar: {
    top: 'auto',
    bottom: '100%',
    marginTop: 0,
    marginBottom: 10,
    left: 0,
    right: 0,
    paddingHorizontal: 0,
    transform: [{ translateX: 0 }],
    alignItems: 'stretch',
  },
  menuLayerMobile: {
    left: 'auto',
    right: 0,
    transform: [{ translateX: 0 }],
    paddingHorizontal: 0,
    alignItems: 'flex-end',
  },
  menu: {
    minWidth: 220,
    padding: 10,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    alignItems: 'stretch',
    zIndex: 1200,
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
