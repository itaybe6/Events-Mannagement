import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import GuestsScreen from './guests.tsx';

export default function CoupleGuestsWebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="אורחים" subtitle="ניהול אורחים בממשק דסקטופי" />
      <View style={styles.content}>
        <GuestsScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

