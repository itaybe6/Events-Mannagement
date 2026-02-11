import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import EmployeeSeatingMapScreen from './employee-seating-map.tsx';

export default function EmployeeSeatingMapWebScreen() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);

  return (
    <View style={styles.page}>
      <DesktopTopBar title="מפת הושבה" subtitle={resolvedEventId ? `אירוע: ${resolvedEventId}` : undefined} />
      <View style={styles.content}>
        <EmployeeSeatingMapScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

