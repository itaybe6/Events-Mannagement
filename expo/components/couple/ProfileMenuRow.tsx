import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { softTileShadow } from '@/lib/platformShadow';
import { ROW_DIR } from '@/lib/rtl';

export const profileMenuUi = {
  text: '#1A2A4A',
  faint: '#9AA0B4',
  line: 'rgba(22,29,56,0.07)',
  navy: '#152949',
  iconBg: '#E8EEF5',
  danger: '#DC2626',
  dangerIconBg: '#FEECEC',
};

type ProfileMenuRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  last?: boolean;
  variant?: 'default' | 'danger';
  accessibilityLabel?: string;
};

export function ProfileMenuCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.menuCard}>{children}</View>;
}

export function ProfileMenuRow({
  icon,
  label,
  detail,
  onPress,
  last = false,
  variant = 'default',
  accessibilityLabel,
}: ProfileMenuRowProps) {
  const isDanger = variant === 'danger';
  const iconColor = isDanger ? profileMenuUi.danger : profileMenuUi.navy;
  const iconBackgroundColor = isDanger ? profileMenuUi.dangerIconBg : profileMenuUi.iconBg;

  return (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={[styles.menuRowIconBox, { backgroundColor: iconBackgroundColor }]}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <Text style={styles.menuRowLabel}>{label}</Text>
      {detail ? (
        <Text style={styles.menuRowDetail} numberOfLines={1}>
          {detail}
        </Text>
      ) : (
        <View style={styles.menuRowDetailSpacer} />
      )}
      <Ionicons name="chevron-back" size={18} color={profileMenuUi.faint} />
      {!last ? <View style={styles.menuRowDivider} pointerEvents="none" /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: profileMenuUi.line,
    paddingHorizontal: 14,
    paddingVertical: 6,
    ...softTileShadow({
      color: '#161D38',
      opacity: 0.08,
      radius: 16,
      y: 4,
    }),
  },
  menuRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 4,
    position: 'relative',
  },
  menuRowIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15.5,
    fontWeight: '600',
    color: profileMenuUi.text,
    textAlign: 'right',
  },
  menuRowDetail: {
    maxWidth: '34%',
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: '500',
    color: profileMenuUi.faint,
    textAlign: 'left',
  },
  menuRowDetailSpacer: {
    width: 8,
  },
  menuRowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 49,
    left: 0,
    height: 1,
    backgroundColor: profileMenuUi.line,
  },
});
