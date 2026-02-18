import React, { useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import SeatingMapWebScreen from '../seating/web/SeatingMapWebScreen';

// Single cross-platform route. On web it renders the editor; on native it redirects safely.
export default function AdminSeatingMapRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const rawEventId = params?.eventId;
  const eventId = typeof rawEventId === 'string' ? rawEventId : Array.isArray(rawEventId) ? rawEventId[0] : '';

  if (Platform.OS === 'web') {
    return <SeatingMapWebScreen />;
  }

  useEffect(() => {
    Alert.alert('לא זמין', 'עריכת סקיצה זמינה רק בווב.');
    if (eventId) {
      router.replace(`/(admin)/admin-event-details?id=${encodeURIComponent(eventId)}`);
      return;
    }
    router.replace('/(admin)/admin-events');
  }, [eventId, router]);

  return <View style={{ flex: 1 }} />;
}

