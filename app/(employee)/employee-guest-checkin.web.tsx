import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { colors } from '@/constants/colors';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import EmployeeGuestCheckInScreen from './employee-guest-checkin.tsx';

// For now we wrap the existing screen (it already has robust logic and grouping).
// Next iteration can replace its mobile sticky header with a full desktop table UI.
export default function EmployeeGuestCheckinWebScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);

  return (
    <View style={styles.page}>
      <DesktopTopBar
        title="צ׳ק-אין אורחים"
        subtitle={resolvedEventId ? `אירוע: ${resolvedEventId}` : undefined}
        leftActions={
          <TopBarIconButton
            icon="arrow-forward"
            label="חזרה"
            onPress={() =>
              router.replace(
                resolvedEventId
                  ? `/(employee)/employee-event-details?id=${resolvedEventId}`
                  : '/(employee)/employee-events'
              )
            }
          />
        }
      />
      <View style={styles.content}>
        <EmployeeGuestCheckInScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1 },
});

