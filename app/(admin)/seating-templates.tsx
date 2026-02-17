import React, { useEffect } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SeatingTemplatesScreen from '../seating/templates';

// Admin wrapper to render templates inside /(admin) Tabs layout (keeps admin tab bar).
export default function AdminSeatingTemplatesWrapper() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const rawEventId = params?.eventId;
  const eventId =
    typeof rawEventId === 'string' ? rawEventId : Array.isArray(rawEventId) ? rawEventId[0] : '';

  // We do not support sketch editing inside the app on web.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    Alert.alert('את הסקיצה ניתן לערוך רק מהאתר');
    if (eventId) {
      router.replace(`/(admin)/admin-event-details?id=${encodeURIComponent(eventId)}`);
      return;
    }
    router.replace('/(admin)/admin-events');
  }, [eventId, router]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.page}>
        {/* Redirecting away via the effect above. */}
      </View>
    );
  }

  return <SeatingTemplatesScreen />;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});

