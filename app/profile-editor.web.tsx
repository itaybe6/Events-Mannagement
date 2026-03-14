import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopShell from '@/components/desktop/DesktopShell';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import { useUserStore } from '@/store/userStore';
import { getDesktopNavForUserType } from '../components/desktop/desktopNav';

const ProfileEditor = require('./profile-editor.tsx').default;

export default function ProfileEditorWebPage() {
  const { userType } = useUserStore();
  const nav = getDesktopNavForUserType(userType);

  return (
    <DesktopShell title={nav.title} navItems={nav.navItems}>
      <View style={styles.page}>
        <DesktopTopBar title="עריכת פרופיל" subtitle="שם, אימייל, סיסמה ותמונה" />
        <View style={styles.content}>
          <ProfileEditor />
        </View>
      </View>
    </DesktopShell>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

