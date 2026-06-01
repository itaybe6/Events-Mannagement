import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DonutChart, type DonutSegment } from '@/components/couple/DonutChart';
import { NavyCardBackground } from '@/components/couple/NavyCardBackground';
import { ROW_DIR } from '@/lib/rtl';
import { colors } from '@/constants/colors';

const DACC = '#1E3A6E';
const DNAVY = '#152949';

const RSVP_COLORS = {
  coming: '#5ED6A0',
  maybe: '#7FA8E8',
  pending: '#F0C475',
  declined: '#EC8C9C',
} as const;

export type CountdownValues = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

type CoupleHomeDashboardCardsProps = {
  eventTitle: string;
  eventDateLabel: string;
  locationLabel: string;
  countdown: CountdownValues | null;
  guestInviteCount: number;
  guestCounts: {
    coming: number;
    maybe: number;
    pending: number;
    declined: number;
  };
  confirmedPeople: number;
  seatedGuests: number;
  notSeatedPeople: number;
  tablesCount: number;
  onPressRsvp: () => void;
  onPressSeating: () => void;
  middleSlot?: React.ReactNode;
};

function CountdownRow({ countdown }: { countdown: CountdownValues }) {
  const unit = (value: number, label: string) => (
    <View style={styles.countdownUnit}>
      <Text style={styles.countdownValue}>{String(value).padStart(2, '0')}</Text>
      <Text style={styles.countdownLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.countdownRow}>
      {unit(countdown.days, 'ימים')}
      <Text style={styles.countdownSep}>:</Text>
      {unit(countdown.hours, 'שעות')}
      <Text style={styles.countdownSep}>:</Text>
      {unit(countdown.minutes, 'דקות')}
      <Text style={styles.countdownSep}>:</Text>
      {unit(countdown.seconds, 'שניות')}
    </View>
  );
}

function RsvpLegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.legendRow}>
      <Text style={styles.legendValue}>{value}</Text>
      <Text style={styles.legendLabel}>{label}</Text>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
    </View>
  );
}

export function CoupleHomeDashboardCards({
  eventTitle,
  eventDateLabel,
  locationLabel,
  countdown,
  guestInviteCount,
  guestCounts,
  confirmedPeople,
  seatedGuests,
  notSeatedPeople,
  tablesCount,
  onPressRsvp,
  onPressSeating,
  middleSlot,
}: CoupleHomeDashboardCardsProps) {
  const seatPct = confirmedPeople > 0 ? Math.round((seatedGuests / confirmedPeople) * 100) : 0;

  const donutSegments: DonutSegment[] = useMemo(
    () => [
      { value: guestCounts.coming, color: RSVP_COLORS.coming },
      { value: guestCounts.maybe, color: RSVP_COLORS.maybe },
      { value: guestCounts.pending, color: RSVP_COLORS.pending },
      { value: guestCounts.declined, color: RSVP_COLORS.declined },
    ],
    [guestCounts]
  );

  return (
    <View style={styles.stack}>
      <View style={styles.countdownCard}>
        <View style={styles.countdownGlow} pointerEvents="none" />
        <Text style={styles.countdownEyebrow}>הספירה לחתונה שלכם</Text>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {eventTitle}
        </Text>
        {countdown ? (
          <CountdownRow countdown={countdown} />
        ) : (
          <Text style={styles.countdownFallback}>--:--</Text>
        )}
        <View style={styles.divider} />
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={17} color={DACC} />
            <Text style={styles.metaText} numberOfLines={1}>
              {eventDateLabel || '—'}
            </Text>
          </View>
          {locationLabel ? (
            <View style={[styles.metaItem, styles.metaItemFlex]}>
              <Ionicons name="location-outline" size={17} color={DACC} />
              <Text style={styles.metaText} numberOfLines={1}>
                {locationLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {middleSlot}

      <Pressable
        onPress={onPressRsvp}
        accessibilityRole="button"
        style={({ pressed }) => [styles.rsvpCard, pressed && styles.cardPressed]}
      >
        <NavyCardBackground variant="full" />
        <View style={styles.rsvpContent}>
        <View style={styles.rsvpHeader}>
          <Text style={styles.rsvpCountLabel}>{guestInviteCount} הזמנות</Text>
          <Text style={styles.rsvpTitle}>אישורי הגעה</Text>
        </View>
        <View style={styles.rsvpBody}>
          <View style={styles.legendCol}>
            <RsvpLegendItem color={RSVP_COLORS.coming} label="מגיעים" value={guestCounts.coming} />
            <RsvpLegendItem color={RSVP_COLORS.maybe} label="אולי" value={guestCounts.maybe} />
            <RsvpLegendItem color={RSVP_COLORS.pending} label="ממתינים" value={guestCounts.pending} />
            <RsvpLegendItem color={RSVP_COLORS.declined} label="לא מגיעים" value={guestCounts.declined} />
          </View>
          <DonutChart segments={donutSegments} size={150} stroke={14}>
            <Text style={styles.donutValue}>{confirmedPeople}</Text>
            <Text style={styles.donutLabel}>מגיעים בפועל</Text>
          </DonutChart>
        </View>
        </View>
      </Pressable>

      <Pressable
        onPress={onPressSeating}
        accessibilityRole="button"
        style={({ pressed }) => [styles.seatingCard, pressed && styles.cardPressed]}
      >
        <View style={styles.seatingHeader}>
          <Text style={styles.seatingPct}>{seatPct}%</Text>
          <View style={styles.seatingTitleRow}>
            <Text style={styles.seatingTitle}>הושבה</Text>
            <View style={styles.seatingIconWrap}>
              <Ionicons name="grid-outline" size={20} color={DACC} />
            </View>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${seatPct}%` }]} />
        </View>
        <View style={styles.seatingFooter}>
          {notSeatedPeople > 0 ? (
            <View style={styles.seatingPendingRow}>
              <Ionicons name="chevron-back" size={14} color={RSVP_COLORS.pending} />
              <Text style={styles.seatingPendingText}>{notSeatedPeople} ממתינים לשיבוץ</Text>
            </View>
          ) : (
            <View />
          )}
          <Text style={styles.seatingStats}>
            {seatedGuests} שובצו · {tablesCount} שולחנות
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
    width: '100%',
  },
  countdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.08)',
    padding: 20,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  countdownGlow: {
    position: 'absolute',
    top: -50,
    left: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(30, 58, 110, 0.07)',
  },
  countdownEyebrow: {
    fontSize: 13,
    fontWeight: '600',
    color: DACC,
    textAlign: 'right',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 18,
    lineHeight: 34,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 2,
  },
  countdownUnit: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  countdownValue: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
  countdownLabel: {
    fontSize: 11,
    color: colors.gray[600],
    letterSpacing: 0.5,
  },
  countdownSep: {
    fontSize: 26,
    fontWeight: '300',
    color: 'rgba(30, 58, 110, 0.35)',
    marginTop: 2,
  },
  countdownFallback: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(11, 28, 65, 0.08)',
    marginVertical: 18,
  },
  metaRow: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    gap: 18,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 7,
  },
  metaItemFlex: {
    flex: 1,
    minWidth: 0,
  },
  metaText: {
    fontSize: 13,
    color: colors.gray[600],
    textAlign: 'right',
    flexShrink: 1,
  },
  rsvpCard: {
    backgroundColor: DNAVY,
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    shadowColor: DNAVY,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  cardPressed: {
    opacity: 0.94,
  },
  rsvpContent: {
    position: 'relative',
    zIndex: 2,
  },
  rsvpHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  rsvpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'right',
  },
  rsvpCountLabel: {
    fontSize: 13,
    color: 'rgba(220, 228, 245, 0.7)',
  },
  rsvpBody: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 20,
  },
  legendCol: {
    flex: 1,
    gap: 11,
  },
  legendRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 9,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(220, 228, 245, 0.92)',
    textAlign: 'right',
  },
  legendValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  donutValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 34,
    textAlign: 'center',
  },
  donutLabel: {
    fontSize: 11.5,
    color: 'rgba(220, 228, 245, 0.65)',
    textAlign: 'center',
    marginTop: 2,
  },
  seatingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.08)',
    padding: 18,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  seatingHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  seatingTitleRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
  },
  seatingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(30, 58, 110, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
  },
  seatingPct: {
    fontSize: 20,
    fontWeight: '700',
    color: DACC,
  },
  progressTrack: {
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(30, 58, 110, 0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: DACC,
    minWidth: 0,
  },
  seatingFooter: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 11,
    gap: 8,
  },
  seatingStats: {
    fontSize: 12.5,
    color: colors.gray[600],
    textAlign: 'right',
    flex: 1,
  },
  seatingPendingRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 4,
  },
  seatingPendingText: {
    fontSize: 12.5,
    color: RSVP_COLORS.pending,
    fontWeight: '600',
  },
});
