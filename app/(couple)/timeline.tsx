import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';

export default function TimelineScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>לוח זמנים</Text>
      <Text style={styles.subtitle}>בקרוב</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
  },
});

