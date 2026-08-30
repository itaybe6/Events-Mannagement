import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { colors } from '@/constants/colors';
import { Event } from '@/types';
import { ALIGN_RIGHT, ROW_DIR, TEXT_RIGHT, rtlText } from '@/lib/rtl';
import { softTileShadow } from '@/lib/platformShadow';
import {
  EVENT_BLUE,
  getEventBadgeMeta,
  getEventHeading,
  getEventImageByType,
} from '@/features/events/eventsConstants';

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
  isLast?: boolean;
  onPress: () => void;
  onToggleApproval: (event: Event, nextValue: boolean) => void;
  approvingEventId: string | null;
};

export function EventListCard({
  event,
  index,
  isLast = false,
  onPress,
  onToggleApproval,
  approvingEventId,
}: EventListCardProps) {
  const dateObj = useMemo(() => new Date(event.date), [event.date]);
  const dateLabel = rtlText(
    dateObj.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: 'long' })
  );
  const { eventType, heading } = getEventHeading(event);
  const badgeMeta = getEventBadgeMeta(eventType);
  const invitationImageUrl = String(event.invitationImageUrl ?? '').trim();
  const coverSource = invitationImageUrl ? { uri: invitationImageUrl } : getEventImageByType(eventType);

  const ownerName = String(event.userName ?? '').trim();
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
      style={styles.block}
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

            <View style={styles.ownerRow}>
              <View style={styles.tagGroup}>
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

              <Pressable
                onPress={(e) => e.stopPropagation?.()}
                style={styles.toggleWrap}
                accessibilityRole="switch"
                accessibilityLabel={isApproved ? 'ביטול אישור האירוע' : 'אישור האירוע'}
                accessibilityState={{ checked: isApproved, disabled: isApproving }}
              >
                <Switch
                  value={isApproved}
                  onValueChange={(val) => onToggleApproval(event, val)}
                  disabled={isApproving}
                  trackColor={{ false: '#DDE3EF', true: 'rgba(30,79,216,0.34)' }}
                  thumbColor={isApproved ? EVENT_BLUE.mid : '#94A3B8'}
                  ios_backgroundColor="#DDE3EF"
                />
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>

      {!isLast ? <View style={styles.divider} /> : null}
    </MotiView>
  );
}

const POSTER_WIDTH = 104;
const POSTER_HEIGHT = 132;

const styles = StyleSheet.create({
  block: {
    gap: 0,
  },
  card: {
    borderRadius: 26,
    padding: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: EVENT_BLUE.line,
    ...softTileShadow({
      color: EVENT_BLUE.deep,
      opacity: 0.1,
      radius: 18,
      y: 10,
      androidElevation: 1,
    }),
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
  // Invitation photos are often near-white, so a translucent chip disappears on
  // them. Opaque fill + hairline border keeps it readable over any cover.
  typeChip: {
    position: 'absolute',
    top: 8,
    start: 8,
    end: 8,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(11,37,96,0.12)',
    ...softTileShadow({
      color: EVENT_BLUE.ink,
      opacity: 0.22,
      radius: 6,
      y: 2,
      androidElevation: 0,
    }),
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
    textAlign: TEXT_RIGHT,
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
    textAlign: TEXT_RIGHT,
    writingDirection: 'rtl',
  },
  ownerRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 'auto',
  },
  tagGroup: {
    flex: 1,
    flexShrink: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: ALIGN_RIGHT,
    gap: 6,
  },
  tag: {
    flexShrink: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 5,
    minHeight: 26,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: '#EAF0FF',
    borderWidth: 1,
    borderColor: 'rgba(30,79,216,0.18)',
  },
  tagText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    color: EVENT_BLUE.deep,
    textAlign: TEXT_RIGHT,
    writingDirection: 'rtl',
  },
  ownerAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.gray[200],
  },
  toggleWrap: {
    flexShrink: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginTop: 18,
    marginBottom: 18,
    marginHorizontal: 8,
    backgroundColor: EVENT_BLUE.lineStrong,
    borderRadius: 999,
    opacity: 0.72,
  },
});
