import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import GuestsWebScreen from '../(couple)/guests.web';

export default function AdminGuestsWebWrapper() {
  return (
    <View style={styles.root}>
      <GuestsWebScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
});
