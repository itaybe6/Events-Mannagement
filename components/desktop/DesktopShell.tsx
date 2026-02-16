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

<<<<<<< HEAD
/**
 * Desktop-only wrapper used by `*.web.tsx` routes.
 * If it ends up bundled on native, it still renders safely.
 */
export default function DesktopShell({ title, subtitle, navItems, footer, fullWidth, children }: Props) {
  return (
    <View style={styles.root}>
      <View style={[styles.main, !fullWidth ? styles.mainConstrained : null]}>{children}</View>
      <DesktopSidebar title={title} subtitle={subtitle} navItems={navItems} footer={footer} />
=======
export default function DesktopShell({ title, subtitle, navItems, footer, fullWidth, children }: Props) {
  return (
    <View style={styles.root}>
      <View style={[styles.container, fullWidth ? styles.containerFull : null]}>
        <View style={styles.main}>{children}</View>
        <DesktopSidebar title={title} subtitle={subtitle} navItems={navItems} footer={footer} />
      </View>
>>>>>>> 3558f3ae8e5b25a21d8573649d06e4f6a567c2c6
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
<<<<<<< HEAD
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : null),
=======
    backgroundColor: colors.gray[100],
  },
  container: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 16,
    padding: 16,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? ({
          minHeight: '100vh',
        } as any)
      : null),
  },
  containerFull: {
    maxWidth: 1600,
>>>>>>> 3558f3ae8e5b25a21d8573649d06e4f6a567c2c6
  },
  main: {
    flex: 1,
    minWidth: 0,
<<<<<<< HEAD
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  // Keep content readable on large screens (unless a page asks for fullWidth)
  mainConstrained: {
    maxWidth: 1280,
    width: '100%',
  } as any,
=======
  },
>>>>>>> 3558f3ae8e5b25a21d8573649d06e4f6a567c2c6
});

