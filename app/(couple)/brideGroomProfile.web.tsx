import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import BrideGroomProfile from './brideGroomProfile.tsx';

export default function BrideGroomProfileWebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="פרופיל" subtitle="פרטי משתמש ואירוע" />
      <View style={styles.content}>
        <BrideGroomProfile />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

