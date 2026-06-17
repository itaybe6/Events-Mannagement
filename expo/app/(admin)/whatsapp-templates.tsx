import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '@/constants/colors';

// WhatsApp template management is a desktop (web) tool for managers.
export default function WhatsappTemplatesNativeScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'תבניות וואטסאפ' }} />
      <Text style={styles.title}>ניהול תבניות וואטסאפ</Text>
      <Text style={styles.subtitle}>ניהול התבניות והמכסה היומית זמין מהממשק במחשב (Web).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10, backgroundColor: '#F7FAFF' },
  title: { fontSize: 20, fontWeight: '900', color: colors.richBlack, textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '600', color: colors.gray[600], textAlign: 'center', lineHeight: 20 },
});
