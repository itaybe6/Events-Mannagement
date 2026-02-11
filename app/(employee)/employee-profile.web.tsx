import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import EmployeeProfileScreen from './employee-profile.tsx';

export default function EmployeeProfileWebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="פרופיל" subtitle="פרטי עובד" />
      <View style={styles.content}>
        <EmployeeProfileScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

