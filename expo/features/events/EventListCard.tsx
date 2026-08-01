import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { colors } from '@/constants/colors';
import { Event } from '@/types';
import { ROW_DIR, rtlText } from '@/lib/rtl';
import {
  EVENT_BADGE_META,
  EVENT_BLUE,
  EVENT_IMAGE_BY_TYPE,
  inferEventType,
  type EventType,
} from '@/features/events/eventsConstants';

function getEventDisplayTitle(rawTitle: string) {
  const title = String(rawTitle || '').trim();
  if (!title) return '';
  const eventType = inferEventType(title);
  if (!eventType) return title;
  const withoutTypePrefix = title.replace(new RegExp(`^${eventType}\\s*[–—-]\\s*`), '').trim();
  return withoutTypePrefix || title;
}

function getDaysLeftLabel(date: Date | string) {
  const d = new Date(date);
  const diff = Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'היום!';
  if (diff === 1) return 'מחר';
  if (diff > 1) return `עוד ${diff} ימים`;
  if (diff === -1) return 'אתמול';
  return 'הסתיים';
}

function getCountdownTone(date: Date | string): 'today' | 'future' | 'past' {
  const diff = Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'today';
  if (diff > 0) return 'future';
  return 'past';
}

const COUNTDOWN_GRADIENT: Record<'today' | 'future' | 'past', [string, string]> = {
  today: ['rgba(14,165,233,0.94)', 'rgba(30,79,216,0.94)'],
  future: ['rgba(11,37,96,0.86)', 'rgba(30,79,216,0.86)'],
  past: ['rgba(71,85,105,0.86)', 'rgba(51,65,85,0.86)'],
};

type EventListCardProps = {
  event: Event;
  index: number;
  onPress: () => void;
  onToggleApproval: (event: Event, nextValue: boolean) => void;
  approvingEventId: string | null;
};

export function EventListCard({
  event,
  index,
  onPress,
  onToggleApproval,
  approvingEventId,
}: EventListCardProps) {
  const dateObj = useMemo(() => new Date(event.date), [event.date]);
  const dateLabel = rtlText(
    dateObj.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: 'long' })
  );
  const eventType = inferEventType(event.title) || 'חתונה';
  const badgeMeta = EVENT_BADGE_META[eventType as EventType];
  const invitationImageUrl = String(event.invitationImageUrl ?? '').trim();
  const coverSource = invitationImageUrl
    ? { uri: invitationImageUrl }
    : EVENT_IMAGE_BY_TYPE[eventType as EventType];

  const ownerName = String(event.userName ?? '').trim();
  const displayTitle = getEventDisplayTitle(String(event.title ?? ''));
  // Most events are stored with the type as their whole title, so showing both a
  // type chip and that same word as the heading wastes the most prominent line.
  const heading = displayTitle && displayTitle !== eventType ? displayTitle : ownerName || eventType;
  const showOwnerRow = Boolean(ownerName) && ownerName !== heading;

  const headingLabel = rtlText(heading);
  const ownerNameLabel = rtlText(ownerName);
  const locationLabel = rtlText([event.location, event.city].filter(Boolean).join(' · '));
  const countdownLabel = getDaysLeftLabel(event.date);
  const countdownTone = getCountdownTone(event.date);
  const guestsCount = typeof event.guests === 'number' && event.guests > 0 ? event.guests : null;
  const isApproved = event.isApproved !== false;
  const isApproving = approvingEventId === event.id;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 340, delay: Math.min(index * 55, 330) }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.topRow}>
          <View style={styles.posterWrap}>
            <Image source={coverSource} style={styles.poster} contentFit="cover" transition={220} />
            <LinearGradient
              colors={['rgba(6,23,62,0.34)', 'rgba(6,23,62,0.02)', 'rgba(6,23,62,0.72)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.typeChip}>
              <Ionicons name={badgeMeta.icon} size={10} color={EVENT_BLUE.mid} />
              <Text style={styles.typeChipText} numberOfLines={1}>
                {eventType}
              </Text>
            </View>

            <LinearGradient
              colors={COUNTDOWN_GRADIENT[countdownTone]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.countdownPill}
            >
              <Ionicons
                name={countdownTone === 'past' ? 'checkmark-done' : 'time-outline'}
                size={11}
                color={colors.white}
              />
              <Text style={styles.countdownText} numberOfLines={1}>
                {countdownLabel}
              </Text>
            </LinearGradient>
          </View>

          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={2}>
              {headingLabel}
            </Text>

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={13} color={EVENT_BLUE.mid} />
              <Text style={styles.metaText} numberOfLines={1}>
                {dateLabel}
              </Text>
            </View>

            {locationLabel ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={13} color={EVENT_BLUE.mid} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {locationLabel}
                </Text>
              </View>
            ) : null}

            {showOwnerRow || guestsCount ? (
              <View style={styles.tagRow}>
                {showOwnerRow ? (
                  <View style={styles.tag}>
                    {event.userAvatarUrl ? (
                      <Image
                        source={{ uri: event.userAvatarUrl }}
                        style={styles.ownerAvatar}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name="person-outline" size={11} color={EVENT_BLUE.deep} />
                    )}
                    <Text style={styles.tagText} numberOfLines={1}>
                      {ownerNameLabel}
                    </Text>
                  </View>
                ) : null}

                {guestsCount ? (
                  <View style={styles.tag}>
                    <Ionicons name="people-outline" size={11} color={EVENT_BLUE.deep} />
                    <Text style={styles.tagText}>{guestsCount}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={[styles.statusPill, isApproved ? styles.statusPillOn : styles.statusPillOff]}>
            {isApproving ? (
              <ActivityIndicator size="small" color={isApproved ? EVENT_BLUE.mid : EVENT_BLUE.muted} />
            ) : (
              <Ionicons
                name={isApproved ? 'shield-checkmark' : 'hourglass-outline'}
                size={12}
                color={isApproved ? EVENT_BLUE.mid : EVENT_BLUE.muted}
              />
            )}
            <Text
              style={[styles.statusText, isApproved ? styles.statusTextOn : styles.statusTextOff]}
            >
              {isApproved ? 'מאושר' : 'ממתין לאישור'}
            </Text>
          </View>

          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={styles.switchWrap}
            accessibilityRole="switch"
            accessibilityLabel={isApproved ? 'ביטול אישור האירוע' : 'אישור האירוע'}
            accessibilityState={{ checked: isApproved }}
          >
            <Switch
              value={isApproved}
              onValueChange={(val) => onToggleApproval(event, val)}
              disabled={isApproving}
              trackColor={{ false: '#DDE3EF', true: 'rgba(30,79,216,0.34)' }}
              thumbColor={isApproved ? EVENT_BLUE.mid : '#94A3B8'}
              ios_backgroundColor="#DDE3EF"
              style={styles.approvalSwitch}
            />
          </Pressable>
        </View>
      </Pressable>
    </MotiView>
  );
}

export { getEventDisplayTitle };

const POSTER_WIDTH = 104;
const POSTER_HEIGHT = 132;

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    padding: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: EVENT_BLUE.line,
    shadowColor: EVENT_BLUE.deep,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  topRow: {
    flexDirection: ROW_DIR,
    gap: 12,
  },
  posterWrap: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: EVENT_BLUE.ink,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  typeChip: {
    position: 'absolute',
    top: 8,
    start: 8,
    end: 8,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  typeChipText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '900',
    color: EVENT_BLUE.deep,
  },
  countdownPill: {
    position: 'absolute',
    bottom: 8,
    start: 8,
    end: 8,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 999,
  },
  countdownText: {
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: '900',
    color: colors.white,
  },
  content: {
    flex: 1,
    minHeight: POSTER_HEIGHT,
    gap: 6,
    paddingTop: 2,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    color: EVENT_BLUE.ink,
    textAlign: 'right',
    writingDirection: 'rtl',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: EVENT_BLUE.muted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tagRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 'auto',
  },
  tag: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: EVENT_BLUE.tint,
    maxWidth: '100%',
  },
  tagText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    color: EVENT_BLUE.deep,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ownerAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.gray[200],
  },
  footer: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: EVENT_BLUE.line,
  },
  switchWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  statusPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillOn: {
    backgroundColor: EVENT_BLUE.tint,
    borderColor: EVENT_BLUE.tintStrong,
  },
  statusPillOff: {
    backgroundColor: 'rgba(100,116,139,0.08)',
    borderColor: 'rgba(100,116,139,0.16)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
  },
  statusTextOn: {
    color: EVENT_BLUE.mid,
  },
  statusTextOff: {
    color: EVENT_BLUE.muted,
  },
});
