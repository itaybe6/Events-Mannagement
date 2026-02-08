import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, Pressable, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { CountdownTimer } from '@/components/CountdownTimer';
import { Ionicons } from '@expo/vector-icons';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { giftService } from '@/lib/services/giftService';
import { BlurView } from 'expo-blur';

export default function HomeScreen() {
  const { isLoggedIn, userData, initializeAuth } = useUserStore();
  const router = useRouter();
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    const loadData = async () => {
      try {
        setLoading(true);
        let eventId = userData?.event_id;
        if (!eventId) {
          await initializeAuth();
          eventId = useUserStore.getState().userData?.event_id;
        }
        if (!eventId) {
          setCurrentEvent(null);
          setGuests([]);
          setGifts([]);
          setLoading(false);
          return;
        }
        const event = await eventService.getEvent(eventId);
        if (event) {
          setCurrentEvent(event);
          const guestsData = await guestService.getGuests(event.id);
          setGuests(guestsData);
          try {
            const giftsData = await giftService.getGifts(event.id);
            setGifts(giftsData);
          } catch (e) {
            setGifts([]);
          }
        } else {
          setCurrentEvent(null);
          setGuests([]);
          setGifts([]);
        }
      } catch (error) {
        setCurrentEvent(null);
        setGuests([]);
        setGifts([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isLoggedIn, router, userData]);

  // טען מחדש נתונים כשהמסך חוזר למוקד
  useFocusEffect(
    React.useCallback(() => {
      if (isLoggedIn && userData?.event_id) {
        const reloadData = async () => {
          try {
            const event = await eventService.getEvent(userData!.event_id as string);
            setCurrentEvent(event);
            if (event) {
              const guestsData = await guestService.getGuests(event.id);
              setGuests(guestsData);
              try {
                const giftsData = await giftService.getGifts(event.id);
                setGifts(giftsData);
              } catch (e) {
                setGifts([]);
              }
            } else {
              setGuests([]);
              setGifts([]);
            }
          } catch (error) {
            setGuests([]);
            setGifts([]);
          }
        };
        reloadData();
      }
    }, [isLoggedIn, userData])
  );

  if (!isLoggedIn) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>אין אירוע פעיל</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>טוען...</Text>
      </View>
    );
  }

  if (!currentEvent) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalGifts = gifts.reduce((sum, gift) => sum + gift.amount, 0);
  const confirmedGuests = guests.filter(guest => guest.status === 'מגיע').length;
  const pendingGuests = guests.filter(guest => guest.status === 'ממתין').length;
  const totalGuests = guests.length;
  const seatedGuests = guests.filter(guest => guest.status === 'מגיע' && guest.table_id).length;

  const getInitials = (name?: string) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const first = parts[0][0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
    return (first + last).toUpperCase();
  };

  const StatPill = ({
    title,
    value,
    iconName,
    tintColor,
    iconBg,
  }: {
    title: string;
    value: string | number;
    iconName: keyof typeof Ionicons.glyphMap;
    tintColor: string;
    iconBg: string;
  }) => (
    <BlurView intensity={28} tint={Platform.OS === 'web' ? 'light' : 'light'} style={styles.statPill}>
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={18} color={tintColor} />
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </BlurView>
  );

  const ActionTile = ({
    title,
    subtitle,
    iconName,
    variant = 'square',
    onPress,
  }: {
    title: string;
    subtitle: string;
    iconName: keyof typeof Ionicons.glyphMap;
    variant?: 'square' | 'wide';
    onPress?: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered, pressed }) => [
        styles.actionTile,
        variant === 'wide' && styles.actionTileWide,
        (hovered || pressed) && styles.actionTilePressed,
      ]}
    >
      <BlurView intensity={24} tint="light" style={styles.actionTileInner}>
        <View style={styles.actionTileTopRow}>
          <View style={styles.actionTileIconBox}>
            <Ionicons name={iconName} size={22} color={colors.text} />
          </View>
          <View style={styles.actionTileDot} />
        </View>
        <View>
          <Text style={styles.actionTileTitle}>{title}</Text>
          <Text style={styles.actionTileSubtitle}>{subtitle}</Text>
        </View>
      </BlurView>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bgBlobs}>
        <View style={styles.blobTopRight} />
        <View style={styles.blobBottomLeft} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.hero}>
          <View style={styles.heroAvatar}>
            {userData?.avatar_url ? (
              <Image source={{ uri: userData.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                {getInitials(userData?.name) ? (
                  <Text style={styles.avatarInitials}>{getInitials(userData?.name)}</Text>
                ) : (
                  <Ionicons name="person" size={28} color={stylesVars.primaryBlue} />
                )}
              </View>
            )}
          </View>
          <Text style={styles.heroDate}>{formatDate(currentEvent.date)}</Text>

          <BlurView intensity={28} tint="light" style={styles.locationPill}>
            <Ionicons name="location" size={16} color={stylesVars.primaryBlue} />
            <Text style={styles.locationPillText}>{currentEvent.location}</Text>
          </BlurView>
        </View>

        <View style={styles.countdownSection}>
          <CountdownTimer targetDate={currentEvent.date} />
          <View style={styles.countdownCaption}>
            <Ionicons name="heart" size={14} color={stylesVars.primaryBlue} />
            <Text style={styles.countdownCaptionText}>עד החופה</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
          style={styles.statsScroll}
        >
          <StatPill
            title="אורחים מאושרים"
            value={`${confirmedGuests}/${totalGuests}`}
            iconName="people"
            tintColor={stylesVars.primaryBlue}
            iconBg="rgba(19, 91, 236, 0.12)"
          />
          <StatPill
            title="מתנות שהתקבלו"
            value={`₪${totalGifts}`}
            iconName="gift"
            tintColor={stylesVars.purple}
            iconBg="rgba(124, 58, 237, 0.12)"
          />
          <StatPill
            title="אורחים שצריך להושיב"
            value={Math.max(0, confirmedGuests - seatedGuests)}
            iconName="alert-circle"
            tintColor={stylesVars.red}
            iconBg="rgba(239, 68, 68, 0.10)"
          />
          <StatPill
            title="אורחים בהמתנה"
            value={pendingGuests}
            iconName="time-outline"
            tintColor={stylesVars.amber}
            iconBg="rgba(245, 158, 11, 0.12)"
          />
        </ScrollView>

        <View style={styles.actionsGrid}>
          <View style={styles.actionTileWrapper}>
            <ActionTile
              title={'רשימת\nמוזמנים'}
              subtitle="נהל אישורי הגעה"
              iconName="list"
              onPress={() => router.push('/(couple)/guests')}
            />
          </View>

          <View style={styles.actionTileWrapper}>
            <ActionTile
              title={'סידור\nהושבה'}
              subtitle="גרור ושחרר אורחים"
              iconName="grid"
              onPress={() => router.push('/(couple)/BrideGroomSeating')}
            />
          </View>

          <View style={styles.actionTileWrapperWide}>
            <ActionTile
              variant="wide"
              title={'הגדרות\nהודעות'}
              subtitle="נהל הודעות אוטומטיות"
              iconName="notifications-outline"
              onPress={() => router.push('/(couple)/brideGroomProfile?focus=notifications')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const stylesVars = {
  primaryBlue: '#135bec',
  purple: '#7c3aed',
  red: '#ef4444',
  amber: '#f59e0b',
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f6f8',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f6f6f8',
    padding: 24,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  bgBlobs: {
    ...StyleSheet.absoluteFillObject,
    opacity: Platform.OS === 'web' ? 0.6 : 0.5,
  },
  blobTopRight: {
    position: 'absolute',
    top: -80,
    right: -90,
    width: 520,
    height: 520,
    borderRadius: 520,
    backgroundColor: 'rgba(19, 91, 236, 0.14)',
    transform: [{ scaleX: 1.05 }],
  },
  blobBottomLeft: {
    position: 'absolute',
    bottom: -90,
    left: -140,
    width: 420,
    height: 420,
    borderRadius: 420,
    backgroundColor: 'rgba(99, 102, 241, 0.10)',
  },
  container: { flex: 1, backgroundColor: 'transparent' },
  contentContainer: {
    paddingHorizontal: 24,
    // header is transparent (76px), keep content below it
    paddingTop: 18 + 76,
    paddingBottom: 130,
  },

  hero: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 16,
  },
  heroAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 91, 236, 0.08)',
  },
  avatarInitials: {
    fontSize: 34,
    fontWeight: '900',
    color: stylesVars.primaryBlue,
  },
  heroDate: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
  },
  locationPill: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.35)' : 'transparent',
  },
  locationPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },

  countdownSection: {
    marginTop: 4,
    marginBottom: 18,
    alignItems: 'center',
  },
  countdownCaption: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    opacity: 0.85,
  },
  countdownCaptionText: {
    fontSize: 13,
    fontWeight: '800',
    color: stylesVars.primaryBlue,
  },

  statsScroll: {
    marginBottom: 18,
  },
  statsRow: {
    paddingHorizontal: 2,
    gap: 12,
  },
  statPill: {
    minWidth: 170,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.60)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.35)' : 'transparent',
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTextWrap: {
    alignItems: 'flex-end',
  },
  statTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.gray[600],
    letterSpacing: 1.0,
  },
  statValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },

  actionsHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },

  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionTileWrapper: {
    width: '48%',
  },
  actionTileWrapperWide: {
    width: '100%',
  },
  actionTile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  actionTileWide: {
    aspectRatio: undefined,
    minHeight: 110,
  },
  actionTilePressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.98,
  },
  actionTileInner: {
    flex: 1,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.55)' : 'transparent',
    justifyContent: 'space-between',
  },
  actionTileTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  actionTileIconBox: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  actionTileDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(19, 91, 236, 0.22)',
  },
  actionTileTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    lineHeight: 26,
  },
  actionTileSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
});


