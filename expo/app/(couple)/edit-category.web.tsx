import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import EditCategoryScreen from './edit-category.tsx';

export default function EditCategoryWebScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  return (
    <View style={styles.page}>
      <View style={[styles.headerWrap, isMobile ? styles.headerWrapMobile : null]}>
        <AdminWebPageHeader
          eyebrow="ניהול אורחים"
          title="עריכת קטגוריה"
          subtitle="עריכת שם הקטגוריה ושיוכה מתוך ממשק הדסקטופ המעודכן."
          showNav={false}
          useDefaultActions={false}
        />
      </View>
      <View style={styles.content}>
        <EditCategoryScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  headerWrap: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    ...(Platform.OS === 'web' ? ({ backgroundColor: 'transparent' } as any) : null),
  },
  headerWrapMobile: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  content: { flex: 1 },
});

