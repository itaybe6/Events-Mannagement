import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import TablesList from './TablesList.tsx';

export default function TablesListWebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="שולחנות" subtitle="ניהול רשימת שולחנות" />
      <View style={styles.content}>
        <TablesList />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

