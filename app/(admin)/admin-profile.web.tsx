import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import AdminProfileScreen from './admin-profile.tsx';

export default function AdminProfileWebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="פרופיל מנהל" subtitle="הגדרות וסטטיסטיקות" />
      <View style={styles.content}>
        <AdminProfileScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

