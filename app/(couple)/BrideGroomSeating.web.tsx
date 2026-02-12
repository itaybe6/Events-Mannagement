import React from 'react';
import { StyleSheet, View } from 'react-native';
import BrideGroomSeating from './BrideGroomSeating.tsx';

export default function CoupleSeatingWebScreen() {
  return (
    <View style={styles.page}>
      <BrideGroomSeating />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});

