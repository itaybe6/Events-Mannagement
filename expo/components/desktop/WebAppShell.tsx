import React, { createContext, useContext, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import WebAppSidebar from '@/components/desktop/WebAppSidebar';
import { useResponsive } from '@/lib/responsive';

type WebAppShellContextValue = {
  hasSidebar: boolean;
  /** Live rail width, including the collapsed/rail state. */
  sidebarInset: number;
};

const WebAppShellContext = createContext<WebAppShellContextValue>({
  hasSidebar: false,
  sidebarInset: 0,
});

export function useWebAppShell() {
  return useContext(WebAppShellContext);
}

type Props = {
  children: React.ReactNode;
};

export default function WebAppShell({ children }: Props) {
  const { sidebarMode, sidebarWidth } = useResponsive();
  const hasSidebar = Platform.OS === 'web' && sidebarMode !== 'hidden';
  const [sidebarInset, setSidebarInset] = useState(() => (hasSidebar ? sidebarWidth || 300 : 0));

  return (
    <WebAppShellContext.Provider value={{ hasSidebar, sidebarInset: hasSidebar ? sidebarInset : 0 }}>
      {/* Document is RTL on web, so the first row child sits on the RIGHT. */}
      <View style={styles.root}>
        {hasSidebar ? <WebAppSidebar onWidthChange={setSidebarInset} /> : null}
        <View style={styles.main}>{children}</View>
      </View>
    </WebAppShellContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          minHeight: '100dvh',
          height: '100dvh',
        } as any)
      : null),
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
});
