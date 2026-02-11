import React from 'react';
import { StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import EditCategoryScreen from './edit-category.tsx';

export default function EditCategoryWebScreen() {
  return (
    <View style={styles.page}>
      <DesktopTopBar title="עריכת קטגוריה" subtitle="עריכה בממשק דסקטופי" />
      <View style={styles.content}>
        <EditCategoryScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

