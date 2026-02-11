import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import HomeScreen from './index.tsx';

export default function CoupleHomeWebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="דשבורד" subtitle="תצוגת אירוע בממשק דסקטופי" />
      <View style={styles.content}>
        <HomeScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

