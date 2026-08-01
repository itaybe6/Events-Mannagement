import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';
import { colors } from '@/constants/colors';
import { Event } from '@/types';
import { ALIGN_RIGHT, ROW_DIR, rtlText } from '@/lib/rtl';
import {
  EVENT_BADGE_META,
  EVENT_IMAGE_BY_TYPE,
  MONTHS,
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
  const dayNum = dateObj.toLocaleDateString('he-IL', { day: '2-digit' });
  const monthName = MONTHS[dateObj.getMonth()];
  const weekdayLabel = rtlText(
    dateObj.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: 'long' })
  );
  const eventType = inferEventType(event.title) || 'חתונה';
  const badgeMeta = EVENT_BADGE_META[eventType as EventType];
  const invitationImageUrl = String(event.invitationImageUrl ?? '').trim();
  const coverSource = invitationImageUrl
    ? { uri: invitationImageUrl }
    : EVENT_IMAGE_BY_TYPE[eventType as EventType];
  const locationLabel = rtlText([event.location, event.city].filter(Boolean).join(' · '));
  const ownerNameLabel = rtlText(String(event.userName ?? '').trim());
  const eventTitleLabel = rtlText(getEventDisplayTitle(String(event.title ?? '')));
  const countdownLabel = getDaysLeftLabel(event.date);
  const countdownTone = getCountdownTone(event.date);
  const isApproved = event.isApproved !== false;
  const isApproving = approvingEventId === event.id;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 22, scale: 0.97 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: 'timing', duration: 520, delay: Math.min(index * 70, 420) }}
      style={styles.block}
    >
      <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.94}>
        <View style={styles.heroWrap}>
          <Image source={coverSource} style={styles.coverImg} contentFit="cover" transition={300} />

          <LinearGradient
            colors={['rgba(6,23,62,0.08)', 'rgba(6,23,62,0.18)', 'rgba(6,23,62,0.82)']}
            locations={[0, 0.42, 1]}
            style={styles.coverGradient}
          />

          <LinearGradient
            colors={['rgba(240,203,70,0.35)', 'rgba(240,203,70,0)']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.coverShimmer}
          />

          <View style={styles.dateBadgeOuter}>
            <BlurView intensity={Platform.OS === 'android' ? 42 : 28} tint="light" style={styles.dateBadgeBlur}>
              <View style={styles.dateBadgeInner}>
                <Text style={styles.dateBadgeDay}>{dayNum}</Text>
                <View style={styles.dateBadgeDivider} />
                <Text style={styles.dateBadgeMonth}>{monthName}</Text>
              </View>
            </BlurView>
          </View>

          <View style={styles.typePillHero}>
            <LinearGradient
              colors={[badgeMeta.tint, 'rgba(6,23,62,0.88)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.typePillHeroGradient}
            >
              <Ionicons name={badgeMeta.icon} size={13} color={colors.white} />
              <Text style={styles.typePillHeroText}>{eventType}</Text>
            </LinearGradient>
          </View>

          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {eventTitleLabel}
            </Text>
            <View style={styles.heroAccentRow}>
              <View style={styles.heroAccentLine} />
              <View style={styles.heroAccentDot} />
            </View>
          </View>
        </View>

        <View style={styles.bodyPanel}>
          <View style={styles.bodyPanelHandle} />

          <View style={styles.metaTopRow}>
            <View style={styles.weekdayChip}>
              <Ionicons name="calendar-outline" size={14} color={colors.secondary} />
              <Text style={styles.weekdayChipText} numberOfLines={1}>
                {weekdayLabel}
              </Text>
            </View>

            <LinearGradient
              colors={
                countdownTone === 'today'
                  ? ['#F0CB46', '#CCA000']
                  : countdownTone === 'future'
                    ? ['#06173e', '#003566']
                    : ['rgba(108,117,125,0.92)', 'rgba(73,80,87,0.92)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.countdownChip}
            >
              <Ionicons
                name={countdownTone === 'past' ? 'checkmark-done' : 'time-outline'}
                size={13}
                color={countdownTone === 'today' ? colors.primary : colors.white}
              />
              <Text
                style={[
                  styles.countdownChipText,
                  countdownTone === 'today' && styles.countdownChipTextToday,
                ]}
              >
                {countdownLabel}
              </Text>
            </LinearGradient>
          </View>

          {locationLabel ? (
            <View style={styles.locationRow}>
              <View style={styles.locationIconWrap}>
                <Ionicons name="location" size={14} color={colors.white} />
              </View>
              <Text style={styles.locationText} numberOfLines={2}>
                {locationLabel}
              </Text>
            </View>
          ) : null}

          <View style={styles.statsRow}>
            {ownerNameLabel ? (
              <View style={styles.statPill}>
                {event.userAvatarUrl ? (
                  <Image source={{ uri: event.userAvatarUrl }} style={styles.ownerAvatar} contentFit="cover" />
                ) : (
                  <View style={styles.ownerAvatarFallback}>
                    <Ionicons name="person" size={12} color={colors.white} />
                  </View>
                )}
                <Text style={styles.statPillText} numberOfLines={1}>
                  {ownerNameLabel}
                </Text>
              </View>
            ) : null}

            {typeof event.guests === 'number' && event.guests > 0 ? (
              <View style={styles.statPill}>
                <View style={styles.statIconWrap}>
                  <Ionicons name="people" size={13} color={colors.secondary} />
                </View>
                <Text style={styles.statPillText}>{event.guests} מוזמנים</Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation?.()}
            style={styles.approvalRow}
          >
            <View style={styles.approvalInfo}>
              {isApproved ? (
                <View style={styles.approvalBadgeApproved}>
                  <Ionicons name="shield-checkmark" size={13} color="#065F46" />
                  <Text style={styles.approvalBadgeApprovedText}>מאושר</Text>
                </View>
              ) : (
                <View style={styles.approvalBadgePending}>
                  <Ionicons name="hourglass-outline" size={13} color="#92400E" />
                  <Text style={styles.approvalBadgePendingText}>ממתין לאישור</Text>
                </View>
              )}
            </View>

            <View style={styles.approvalAction}>
              <Text style={styles.approvalLabel}>{isApproved ? 'ביטול אישור' : 'אשר אירוע'}</Text>
              <Switch
                value={isApproved}
                onValueChange={(val) => onToggleApproval(event, val)}
                disabled={isApproving}
                trackColor={{ false: '#FDE68A', true: '#A7F3D0' }}
                thumbColor={isApproved ? '#059669' : '#D97706'}
                ios_backgroundColor="#FDE68A"
              />
            </View>
          </TouchableOpacity>

          <LinearGradient
            colors={['#06173e', '#003566']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaButton}
          >
            <Text style={styles.ctaText}>לפרטי האירוע</Text>
            <View style={styles.ctaIconWrap}>
              <Ionicons name="chevron-back" size={16} color={colors.primary} />
            </View>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </MotiView>
  );
}

export { getEventDisplayTitle };

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: 2,
  },
  card: {
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  heroWrap: {
    width: '100%',
    aspectRatio: 4 / 4.6,
    position: 'relative',
    backgroundColor: colors.primary,
  },
  coverImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  coverShimmer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
  dateBadgeOuter: {
    position: 'absolute',
    top: 16,
    end: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dateBadgeBlur: {
    overflow: 'hidden',
  },
  dateBadgeInner: {
    minWidth: 62,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  dateBadgeDay: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  dateBadgeDivider: {
    width: 22,
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.secondary,
    marginVertical: 4,
  },
  dateBadgeMonth: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
  },
  typePillHero: {
    position: 'absolute',
    top: 16,
    start: 16,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  typePillHeroGradient: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  typePillHeroText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 0.2,
  },
  heroBottom: {
    position: 'absolute',
    start: 18,
    end: 18,
    bottom: 18,
    gap: 8,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
    writingDirection: 'rtl',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroAccentRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    alignSelf: ALIGN_RIGHT,
  },
  heroAccentLine: {
    width: 42,
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.secondary,
  },
  heroAccentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.yellow,
  },
  bodyPanel: {
    marginTop: -22,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.98)',
    gap: 12,
  },
  bodyPanelHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.08)',
    marginBottom: 2,
  },
  metaTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  weekdayChip: {
    flex: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(240,203,70,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.18)',
  },
  weekdayChipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  countdownChip: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  countdownChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
  },
  countdownChipTextToday: {
    color: colors.primary,
  },
  locationRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(6,23,62,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  locationIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    gap: 8,
  },
  statPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.07)',
    maxWidth: '100%',
  },
  statIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,203,70,0.18)',
  },
  statPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    maxWidth: 180,
  },
  ownerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gray[200],
  },
  ownerAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  approvalRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(248, 249, 250, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  approvalInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  approvalAction: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  approvalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  approvalBadgePending: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(254, 243, 199, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.28)',
  },
  approvalBadgePendingText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
  },
  approvalBadgeApproved: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(209, 250, 229, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.28)',
  },
  approvalBadgeApprovedText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#065F46',
  },
  ctaButton: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 0.2,
  },
  ctaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.yellow,
  },
});
