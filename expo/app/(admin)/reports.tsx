import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';

// Reports are a desktop/web-only admin tool. On native we show a short hint.
export default function AdminReportsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="bar-chart-outline" size={42} color={colors.gray[400]} />
      <Text style={styles.title}>דוחות הודעות</Text>
      <Text style={styles.text}>עמוד הדוחות זמין בממשק הווב של המנהל.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'center',
  },
});
