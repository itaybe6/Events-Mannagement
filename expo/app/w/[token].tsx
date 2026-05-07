import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { colors } from '@/constants/colors';
import { invitationService } from '@/lib/services/invitationService';
import { buildEventLocationText, buildWazeNavigationUrl } from '@/lib/navigationLinks';

export default function WazeRedirectScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const inviteToken = useMemo(() => String(token ?? '').trim(), [token]);
  const [statusText, setStatusText] = useState('פותח ניווט...');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!inviteToken) {
        setStatusText('קישור הניווט אינו תקין.');
        return;
      }

      try {
        const info = await invitationService.getInvitationByToken(inviteToken);
        if (cancelled) return;
        if (!info?.event) {
          setStatusText('לא נמצאו פרטי אירוע עבור הקישור הזה.');
          return;
        }

        const destinationLabel = buildEventLocationText(info.event.location, info.event.city);
        const wazeUrl = buildWazeNavigationUrl(info.event.location, info.event.city);
        if (!wazeUrl) {
          setStatusText('לא הוגדר מיקום תקין לאירוע הזה.');
          return;
        }

        setStatusText(destinationLabel ? `מעביר ל-Waze עבור ${destinationLabel}...` : 'מעביר ל-Waze...');

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.replace(wazeUrl);
          return;
        }

        const canOpen = await Linking.canOpenURL(wazeUrl);
        if (!canOpen) {
          setStatusText('לא ניתן לפתוח את Waze במכשיר הזה.');
          return;
        }
        await Linking.openURL(wazeUrl);
      } catch (error) {
        console.error('Waze redirect failed:', error);
        if (!cancelled) {
          setStatusText('לא הצלחנו לפתוח את קישור הניווט כרגע.');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>פותח את Waze</Text>
        <Text style={styles.subtitle}>{statusText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F6F8FC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(22,45,156,0.10)',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 22,
  },
});
