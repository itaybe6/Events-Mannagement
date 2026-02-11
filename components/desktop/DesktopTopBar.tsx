import React from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';

type Props = {
  title: string;
  subtitle?: string;
  rightActions?: React.ReactNode;
  leftActions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function DesktopTopBar({ title, subtitle, rightActions, leftActions, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        <View style={styles.rightSlot}>{rightActions}</View>

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

        <View style={styles.leftSlot}>{leftActions}</View>
      </View>
    </View>
  );
}

export function TopBarIconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.iconBtn,
        Platform.OS === 'web' && hovered ? styles.iconBtnHover : null,
        pressed ? { opacity: 0.9 } : null,
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  rightSlot: {
    minWidth: 140,
    alignItems: 'flex-end',
    flexDirection: 'row-reverse',
    gap: 10,
  },
  leftSlot: {
    minWidth: 140,
    alignItems: 'flex-start',
    flexDirection: 'row-reverse',
    gap: 10,
  },
  center: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnHover: {
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
});

