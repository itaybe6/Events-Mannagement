import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';

// NOTE: This screen is already fairly desktop-friendly and uses its own modals and layout.
// We provide a web wrapper that adds a consistent desktop top bar.
import AddUserScreenV2 from './add-user-v2.tsx';

export default function AddUserV2WebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="הוספת משתמש" subtitle="יצירת משתמש חדש בממשק דסקטופי" />
      <View style={styles.content}>
        <AddUserScreenV2 />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

