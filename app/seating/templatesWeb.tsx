import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import SeatingTemplatesScreen from './templates';

export default function SeatingTemplatesWebPage() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();

  // On native we just render the same screen; this route is mainly for web.
  if (Platform.OS !== 'web') {
    return <SeatingTemplatesScreen />;
  }

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <View style={styles.topBarTitleWrap}>
          <Text style={styles.topBarTitle}>תצוגת Web</Text>
          <Text style={styles.topBarSubtitle}>מפת הושבה · עמוד ייעודי לדפדפן</Text>
        </View>

        <Pressable
          onPress={() => {
            const params: Record<string, string> = { keep: '1' };
            if (eventId) params.eventId = String(eventId);
            router.push({ pathname: '/seating/templates', params });
          }}
          style={({ hovered, pressed }) => [
            styles.editBtn,
            (hovered || pressed) && styles.editBtnHover,
          ]}
          accessibilityRole="button"
          accessibilityLabel="חזור לעריכה"
        >
          <Ionicons name="create-outline" size={18} color={colors.white} />
          <Text style={styles.editBtnText}>עריכה</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <SeatingTemplatesScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  topBar: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarTitleWrap: {
    flexShrink: 1,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  topBarSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.gray[600],
    textAlign: 'right',
  },
  editBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  editBtnHover: {
    opacity: 0.92,
  },
  editBtnText: {
    color: colors.white,
    fontWeight: '800',
    textAlign: 'right',
  },
  content: {
    flex: 1,
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
  },
});

