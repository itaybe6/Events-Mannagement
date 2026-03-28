import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import TablesListWebScreen from '../(couple)/TablesList.web';

export default function AdminTablesListWebWrapper() {
  return (
    <View style={styles.root}>
      <TablesListWebScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
});
