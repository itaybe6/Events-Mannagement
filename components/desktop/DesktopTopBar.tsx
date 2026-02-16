import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';

type Props = {
  title: string;
  subtitle?: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
};

export default function DesktopTopBar({ title, subtitle, leftActions, rightActions }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>{leftActions}</View>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>{rightActions}</View>
    </View>
  );
}

export function TopBarIconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ hovered, pressed }: any) => [
        styles.iconBtn,
        Platform.OS === 'web' && hovered && !disabled ? styles.iconBtnHover : null,
        pressed ? { opacity: 0.92 } : null,
        disabled ? { opacity: 0.5 } : null,
      ]}
    >
      <Text style={styles.iconBtnText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name={icon} size={16} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  left: {
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-start',
  },
  right: {
    minWidth: 120,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  iconBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  iconBtnHover: {
    backgroundColor: 'rgba(15,69,230,0.12)',
  },
  iconBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
