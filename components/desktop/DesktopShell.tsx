import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/colors';
import DesktopSidebar, { type DesktopNavItem } from '@/components/desktop/DesktopSidebar';

type Props = {
  title?: string;
  subtitle?: string;
  navItems: DesktopNavItem[];
  footer?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
};

/**
 * Desktop-only wrapper used by `*.web.tsx` routes.
 * If it ends up bundled on native, it still renders safely.
 */
export default function DesktopShell({ title, subtitle, navItems, footer, fullWidth, children }: Props) {
  return (
    <View style={styles.root}>
      <View style={[styles.main, !fullWidth ? styles.mainConstrained : null]}>{children}</View>
      <DesktopSidebar title={title} subtitle={subtitle} navItems={navItems} footer={footer} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : null),
  },
  main: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  // Keep content readable on large screens (unless a page asks for fullWidth)
  mainConstrained: {
    maxWidth: 1280,
    width: '100%',
  } as any,
});

