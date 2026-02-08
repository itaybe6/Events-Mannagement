import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, I18nManager, Platform, Pressable, SectionList, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { router, Stack } from 'expo-router';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService } from '@/lib/services/notificationService';
import { useFocusEffect } from '@react-navigation/native';
import type { Notification } from '@/types';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const forceLight = true; // match the provided design (light by default)
  const isDark = forceLight ? false : scheme === 'dark';
  const isRTL = I18nManager.isRTL;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const ui = useMemo(() => {
    // Palette aligned to the HTML sample
    const primary = '#1e3a8a';
    const bg = isDark ? '#0f172a' : '#f8fafc';
    const card = isDark ? '#1e293b' : '#ffffff';
    const text = isDark ? '#f1f5f9' : '#0f172a';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const faint = isDark ? '#94a3b8' : '#9ca3af';
    const border = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(226, 232, 240, 0.9)';

    return { primary, bg, card, text, muted, faint, border };
  }, [isDark]);

  type NotificationType = 'guest' | 'task' | 'gift' | 'payment' | 'vendor' | 'system';

  const formatRelativeHe = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'עכשיו';
    if (diffMin < 60) return `לפני ${diffMin} דקות`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `לפני ${diffH} שעות`;

    const d = date.toLocaleDateString('he-IL', { weekday: 'long' });
    const t = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `${d}, ${t}`;
  };

  const bucketTitle = (date: Date) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    if (date >= startOfToday) return 'היום';
    if (date >= startOfYesterday) return 'אתמול';
    return 'מוקדם יותר השבוע';
  };

  const sections = useMemo(() => {
    const groups: Record<string, Array<any>> = {
      'היום': [],
      'אתמול': [],
      'מוקדם יותר השבוע': [],
    };

    items.forEach((n) => {
      const createdAt = n.createdAt;
      const title = bucketTitle(createdAt);
      const meta = (n.metadata ?? {}) as any;

      const rawType = (n.type ?? 'system') as string;
      const displayType: NotificationType =
        rawType.startsWith('admin_event_') ? 'task' : ((rawType as NotificationType) || 'system');

      const mapped = {
        id: n.id,
        title: n.title,
        message: n.body,
        time: formatRelativeHe(createdAt),
        read: Boolean(n.readAt),
        type: displayType,
        avatarUrl: (meta.actor_avatar_url ?? meta.avatar_url ?? null) as string | null,
        dimmed: Boolean(n.readAt),
      };

      (groups[title] ?? (groups[title] = [])).push(mapped);
    });

    return Object.entries(groups)
      .map(([title, data]) => ({ title, data }))
      .filter((s) => s.data.length > 0);
  }, [items]);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);

    setLoadError(null);
    try {
      const data = await notificationService.getMyNotifications(60);
      setItems(data);
    } catch (e) {
      setLoadError('לא ניתן לטעון התראות כרגע');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('initial');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const getBadge = (type: NotificationType) => {
    switch (type) {
      case 'guest':
        return { icon: 'people', bg: isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(30, 58, 138, 0.10)', fg: isDark ? '#93c5fd' : ui.primary };
      case 'task':
        return { icon: 'calendar', bg: isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.16)', fg: isDark ? '#fcd34d' : '#b45309' };
      case 'gift':
        return { icon: 'gift', bg: isDark ? 'rgba(168, 85, 247, 0.22)' : 'rgba(168, 85, 247, 0.14)', fg: isDark ? '#d8b4fe' : '#7e22ce' };
      case 'payment':
        return { icon: 'card', bg: isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.14)', fg: isDark ? '#6ee7b7' : '#047857' };
      case 'vendor':
        return { icon: 'storefront', bg: isDark ? 'rgba(236, 72, 153, 0.22)' : 'rgba(236, 72, 153, 0.12)', fg: isDark ? '#f9a8d4' : '#be185d' };
      case 'system':
        return { icon: 'settings', bg: isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(100, 116, 139, 0.14)', fg: isDark ? '#cbd5e1' : '#475569' };
      default:
        return { icon: 'notifications', bg: isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(100, 116, 139, 0.14)', fg: isDark ? '#cbd5e1' : '#475569' };
    }
  };

  const HeaderSurface = ({ children }: { children: React.ReactNode }) => {
    if (Platform.OS === 'web') {
      return (
        <View
          style={[
            styles.headerSurface,
            { borderBottomColor: ui.border },
            // @ts-expect-error web-only style
            { backdropFilter: 'blur(18px)', backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(248, 250, 252, 0.85)' },
          ]}
        >
          {children}
        </View>
      );
    }
    return (
      <BlurView intensity={24} tint={isDark ? 'dark' : 'light'} style={[styles.headerSurface, { borderBottomColor: ui.border }]}>
        {children}
      </BlurView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <HeaderSurface>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 6 }]}>
          <Pressable
            accessibilityRole="button"
            style={[styles.backButton, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.04)' }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-forward" size={22} color={ui.text} />
          </Pressable>

          <Text style={[styles.title, { color: isDark ? '#60a5fa' : ui.primary }]}>התראות</Text>
          <View style={styles.placeholder} />
        </View>
      </HeaderSurface>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: Math.max(insets.top, 10) + 88, paddingBottom: 28 + insets.bottom },
        ]}
        stickySectionHeadersEnabled={false}
        onRefresh={() => load('refresh')}
        refreshing={refreshing}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={[styles.emptyText, { color: ui.muted }]}>טוען התראות...</Text>
            </View>
          ) : (
            <View style={styles.center}>
              <Ionicons name="notifications-outline" size={28} color={ui.faint} />
              <Text style={[styles.emptyTitle, { color: ui.text }]}>
                {loadError ?? 'אין התראות'}
              </Text>
              <Text style={[styles.emptyText, { color: ui.muted }]}>
                כשתהיה פעילות באירוע—היא תופיע כאן.
              </Text>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: ui.muted }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const badge = getBadge(item.type);
          const cardOpacity = item.dimmed ? (isDark ? 0.82 : 0.86) : 1;

          return (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.995 : 1 }] }]}
              onPress={async () => {
                if (item.read) return;
                setItems((prev) =>
                  prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date() } : n))
                );
                try {
                  await notificationService.markAsRead(item.id);
                } catch {
                  // best-effort; keep UI responsive even if update fails
                }
              }}
            >
              <Card
                elevation={2}
                style={[
                  styles.notificationCard,
                  {
                    backgroundColor: ui.card,
                    borderColor: ui.border,
                    opacity: cardOpacity,
                  },
                ]}
              >
                {!item.read && (
                  <View
                    style={[
                      styles.unreadDot,
                      {
                        backgroundColor: ui.primary,
                        borderColor: ui.card,
                      },
                    ]}
                  />
                )}

                <View style={styles.row}>
                  <View style={styles.avatarWrap}>
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={[styles.avatar, { borderColor: ui.border }]} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatarFallback, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.12)' : colors.gray[100], borderColor: ui.border }]}>
                        <Ionicons name="sparkles" size={20} color={ui.faint} />
                      </View>
                    )}

                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: badge.bg, borderColor: ui.card },
                        isRTL ? styles.badgeRTL : styles.badgeLTR,
                      ]}
                    >
                      <Ionicons name={badge.icon as any} size={11} color={badge.fg} />
                    </View>
                  </View>

                  <View style={styles.textContainer}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.notificationTitle,
                        { color: ui.text },
                        !item.read && styles.unreadTitle,
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.notificationMessage, { color: ui.muted }]}>{item.message}</Text>
                    <Text style={[styles.notificationTime, { color: ui.faint }]}>{item.time}</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 18,
    paddingHorizontal: 4,
  },
  notificationCard: {
    marginBottom: 12,
    marginVertical: 0,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarWrap: {
    width: 52,
    height: 52,
    marginStart: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeLTR: {
    right: -2,
  },
  badgeRTL: {
    left: -2,
  },
  textContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: 'bold',
  },
  notificationMessage: {
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 19,
  },
  notificationTime: {
    fontSize: 12,
  },
  unreadDot: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  center: {
    paddingTop: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});