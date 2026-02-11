import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import BrideGroomSeating from './BrideGroomSeating.tsx';

export default function CoupleSeatingWebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="הושבה" subtitle="ניהול הושבה בממשק דסקטופי" />
      <View style={styles.content}>
        <BrideGroomSeating />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

