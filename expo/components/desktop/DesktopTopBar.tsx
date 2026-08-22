import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { useWebAppShell } from '@/components/desktop/WebAppShell';
import WebAppMenu from '@/components/desktop/WebAppMenu';

type DesktopTopBarProps = {
  title?: string;
  subtitle?: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
};

export default function DesktopTopBar({ title, subtitle, leftActions, rightActions }: DesktopTopBarProps) {
  const hasTitle = Boolean(title);
  const hasSubtitle = Boolean(subtitle);
  const { hasSidebar } = useWebAppShell();

  return (
    <View style={styles.wrap}>
      <View style={styles.inner}>
        <View style={styles.actionsRight}>
          {hasSidebar ? null : <WebAppMenu compact />}
          {rightActions}
        </View>

        <View style={styles.titleBlock}>
          {hasTitle ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {hasSubtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionsLeft}>{leftActions}</View>
      </View>
    </View>
  );
}

type TopBarIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function TopBarIconButton({ icon, label, onPress, disabled, style }: TopBarIconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ hovered, pressed }: any) => [
        styles.iconBtn,
        Platform.OS === 'web' && hovered && !disabled ? styles.iconBtnHover : null,
        pressed && !disabled ? styles.iconBtnPressed : null,
        disabled ? styles.iconBtnDisabled : null,
        style,
      ]}
    >
      <Text style={[styles.iconBtnText, disabled ? styles.iconBtnTextDisabled : null]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name={icon} size={16} color={disabled ? 'rgba(17,24,39,0.35)' : colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(10px)',
        } as any)
      : null),
  },
  inner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
  },
  actionsRight: {
    minWidth: 160,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-start',
  },
  actionsLeft: {
    minWidth: 160,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-end',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
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
  iconBtnHover: { backgroundColor: 'rgba(15,69,230,0.12)' },
  iconBtnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  iconBtnDisabled: { opacity: 0.65 },
  iconBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  iconBtnTextDisabled: { color: 'rgba(17,24,39,0.45)' },
});
