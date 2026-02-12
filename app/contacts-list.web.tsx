import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopShell from '@/components/desktop/DesktopShell';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import { useUserStore } from '@/store/userStore';
import { getDesktopNavForUserType } from '@/components/desktop/desktopNav';
import ContactsListScreen from './contacts-list';

export default function ContactsListWebPage() {
  const { userType } = useUserStore();
  const nav = getDesktopNavForUserType(userType);

  return (
    <DesktopShell title={nav.title} navItems={nav.navItems} fullWidth>
      <View style={styles.page}>
        <DesktopTopBar title="אנשי קשר" subtitle="ייבוא אורחים מאנשי קשר" />
        <View style={styles.content}>
          <ContactsListScreen />
        </View>
      </View>
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

