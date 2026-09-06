import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { ROW_DIR } from '@/lib/rtl';

import type { GuestCheckInFilter } from './useGuestCheckInModel';

export type CheckInStatusFilterKey = Extract<GuestCheckInFilter, 'all' | 'checked_in' | 'not_checked_in'>;

const OPTIONS: { key: CheckInStatusFilterKey; label: string }[] = [
  { key: 'all', label: 'כל המוזמנים' },
  { key: 'checked_in', label: 'הגיעו' },
  { key: 'not_checked_in', label: 'טרם הגיעו' },
];

export function CheckInStatusFilter({
  value,
  onChange,
  counts,
  compact,
}: {
  value: GuestCheckInFilter;
  onChange: (next: CheckInStatusFilterKey) => void;
  counts: { all: number; checkedIn: number; pending: number };
  compact?: boolean;
}) {
  const options = useMemo(
    () =>
      OPTIONS.map((option) => ({
        ...option,
        count: option.key === 'all' ? counts.all : option.key === 'checked_in' ? counts.checkedIn : counts.pending,
      })),
    [counts.all, counts.checkedIn, counts.pending]
  );

  return (
    <View style={[styles.track, compact ? styles.trackCompact : null]} accessibilityRole="tablist">
      {options.map((option) => {
        const active = value === option.key;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`סינון: ${option.label}, ${option.count}`}
            onPress={() => onChange(option.key)}
            style={({ hovered, pressed }: any) => [
              styles.seg,
              compact ? styles.segCompact : null,
              active ? styles.segActive : null,
              Platform.OS === 'web' && hovered && !active ? styles.segHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Text style={[styles.count, compact ? styles.countCompact : null, active ? styles.countActive : null]}>
              {option.count}
            </Text>
            <Text
              style={[styles.label, compact ? styles.labelCompact : null, active ? styles.labelActive : null]}
              numberOfLines={2}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: ROW_DIR,
    alignItems: 'stretch',
    gap: 4,
    padding: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
  },
  trackCompact: {
    padding: 3,
    borderRadius: 16,
    gap: 3,
  },
  seg: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 14,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transition: 'background-color 140ms ease, transform 140ms ease',
        } as object)
      : null),
  },
  segCompact: {
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 13,
  },
  segHover: {
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  segActive: {
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 18px rgba(6,23,62,0.22)' } as object)
      : {
          shadowColor: colors.primary,
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        }),
  },
  count: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 20,
  },
  countCompact: {
    fontSize: 15,
    lineHeight: 18,
  },
  countActive: {
    color: colors.white,
  },
  label: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(6,23,62,0.62)',
    textAlign: 'center',
    lineHeight: 14,
  },
  labelCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  labelActive: {
    color: 'rgba(255,255,255,0.92)',
  },
});
