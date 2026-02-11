import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopShell from '@/components/desktop/DesktopShell';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import { useUserStore } from '@/store/userStore';
import { getDesktopNavForUserType } from '@/components/desktop/desktopNav';
import SeatingEditScreen from './edit.tsx';

export default function SeatingEditWebPage() {
  const { userType } = useUserStore();
  const nav = getDesktopNavForUserType(userType);

  return (
    <DesktopShell title={nav.title} navItems={nav.navItems} fullWidth>
      <View style={styles.page}>
        <DesktopTopBar title="עריכת הושבה" subtitle="מצב דסקטופי" />
        <View style={styles.content}>
          <SeatingEditScreen />
        </View>
      </View>
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

