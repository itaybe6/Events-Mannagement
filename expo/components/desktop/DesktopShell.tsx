import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/colors';
import DesktopSidebar, { type DesktopNavItem } from '@/components/desktop/DesktopSidebar';
import { useResponsive } from '@/lib/responsive';

type Props = {
  title?: string;
  subtitle?: string;
  navItems: DesktopNavItem[];
  footer?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
};

export default function DesktopShell({ title, subtitle, navItems, footer, fullWidth, children }: Props) {
  const { gutter, gap, sidebarMode, isTablet } = useResponsive();

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.container,
          fullWidth ? styles.containerFull : null,
          // Tablets should use the whole viewport; the 1280px cap only helps on
          // a wide monitor.
          isTablet ? styles.containerTablet : null,
          { padding: gutter, gap },
        ]}
      >
        <View style={styles.main}>{children}</View>
        <DesktopSidebar
          title={title}
          subtitle={subtitle}
          navItems={navItems}
          footer={footer}
          mode={sidebarMode}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  container: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    justifyContent: 'center',
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? ({
          minHeight: '100dvh',
        } as any)
      : null),
  },
  containerFull: {
    maxWidth: 1600,
  },
  containerTablet: {
    maxWidth: '100%',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
});

