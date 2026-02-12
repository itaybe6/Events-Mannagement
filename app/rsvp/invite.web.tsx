import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopShell from '@/components/desktop/DesktopShell';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import { useUserStore } from '@/store/userStore';
import { getDesktopNavForUserType } from '@/components/desktop/desktopNav';
import InviteScreen from './invite';

export default function InviteWebPage() {
  const { userType } = useUserStore();
  const nav = getDesktopNavForUserType(userType);

  return (
    <DesktopShell title={nav.title} navItems={nav.navItems}>
      <View style={styles.page}>
        <DesktopTopBar title="הזמנת אורחים" subtitle="שליחה / שיתוף הזמנה" />
        <View style={styles.content}>
          <InviteScreen />
        </View>
      </View>
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

