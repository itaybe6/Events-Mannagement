import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import SeatingTemplatesScreen from './templates';
import SeatingMapWebScreen from './web/SeatingMapWebScreen';

export default function SeatingTemplatesWebPage() {
  // On native we just render the same screen; this route is mainly for web.
  if (Platform.OS !== 'web') {
    return <SeatingTemplatesScreen />;
  }

  return (
    <View style={styles.page}>
      <SeatingMapWebScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
});

