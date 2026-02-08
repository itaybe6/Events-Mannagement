import React, { useMemo } from 'react';
import { I18nManager, Platform, Pressable, SectionList, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const isRTL = I18nManager.isRTL;

  const ui = useMemo(() => {
    const bg = isDark ? '#0f172a' : '#f8fafc';
    const card = isDark ? '#1e293b' : colors.white;
    const text = isDark ? '#f1f5f9' : colors.text;
    const muted = isDark ? '#94a3b8' : colors.gray[600];
    const faint = isDark ? 'rgba(148, 163, 184, 0.55)' : colors.gray[500];
    const border = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(15, 23, 42, 0.06)';

    return { bg, card, text, muted, faint, border };
  }, [isDark]);

  type NotificationType = 'guest' | 'task' | 'gift' | 'payment' | 'vendor' | 'system';
  type Notification = {
    id: string;
    title: string;
    message: string;
    time: string;
    read: boolean;
    type: NotificationType;
    avatarUrl?: string | null;
    dimmed?: boolean;
  };

  const sections: Array<{ title: string; data: Notification[] }> = useMemo(() => {
    const today: Notification[] = [
      {
        id: '1',
        title: 'אורח חדש אישר הגעה',
        message: 'יוסי כהן אישר הגעה לאירוע החתונה',
        time: 'לפני 5 דקות',
        read: false,
        type: 'guest',
        avatarUrl: 'https://i.pravatar.cc/96?u=yossi-cohen',
      },
      {
        id: '2',
        title: 'תזכורת משימה',
        message: 'יש להזמין פרחים למרכז שולחן עד מחר בבוקר',
        time: 'לפני 2 שעות',
        read: false,
        type: 'task',
        avatarUrl: 'https://i.pravatar.cc/96?u=task-owner',
      },
      {
        id: '3',
        title: 'תשלום התקבל',
        message: 'התקבל תשלום מקדמה על סך 2,000₪',
        time: 'לפני 4 שעות',
        read: true,
        type: 'payment',
        avatarUrl: 'https://i.pravatar.cc/96?u=finance',
      },
    ];

    const yesterday: Notification[] = [
      {
        id: '4',
        title: 'מתנה חדשה התקבלה',
        message: 'התקבלה מתנה בסך 500₪ ממשפחת לוי',
        time: 'אתמול, 14:30',
        read: true,
        type: 'gift',
        avatarUrl: 'https://i.pravatar.cc/96?u=levi-family',
        dimmed: true,
      },
      {
        id: '5',
        title: 'הודעה מספק',
        message: 'הצלם שלח את התמונות לאישור סופי',
        time: 'אתמול, 09:15',
        read: true,
        type: 'vendor',
        avatarUrl: 'https://i.pravatar.cc/96?u=vendor-photographer',
        dimmed: true,
      },
    ];

    const earlier: Notification[] = [
      {
        id: '6',
        title: 'עדכון מערכת',
        message: 'גרסה חדשה של האפליקציה זמינה',
        time: 'יום ראשון',
        read: true,
        type: 'system',
        avatarUrl: null,
        dimmed: true,
      },
    ];

    return [
      { title: 'היום', data: today },
      { title: 'אתמול', data: yesterday },
      { title: 'מוקדם יותר השבוע', data: earlier },
    ];
  }, []);

  const getBadge = (type: NotificationType) => {
    switch (type) {
      case 'guest':
        return { icon: 'people', bg: isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.15)', fg: isDark ? '#93c5fd' : '#1d4ed8' };
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
      <HeaderSurface>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 6 }]}>
          <Pressable
            accessibilityRole="button"
            style={[styles.backButton, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.04)' }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-forward" size={22} color={ui.text} />
          </Pressable>

          <Text style={[styles.title, { color: isDark ? '#60a5fa' : colors.primary }]}>התראות</Text>
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
              onPress={() => {
                // placeholder for future "open notification" action
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
                        backgroundColor: colors.primary,
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
});