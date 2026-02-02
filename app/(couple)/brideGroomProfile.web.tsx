import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';

export default function BrideGroomProfileWebScreen() {
  const router = useRouter();
  const { userData, logout } = useUserStore();

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRight}>
          <Ionicons name="settings" size={22} color={colors.primary} />
          <Text style={styles.title}>הגדרות</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>פרטי משתמש</Text>
        <Text style={styles.rowText}>שם: {userData?.name || '—'}</Text>
        <Text style={styles.rowText}>אימייל: {userData?.email || '—'}</Text>
        <Text style={styles.rowText}>Event ID: {userData?.event_id || '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>הודעות והתראות</Text>
        <Text style={styles.note}>
          בחלק מהפיצ׳רים בעמוד זה (תזמון הודעות/בחירת תאריך) יש תלות ברכיבי מובייל.
          בינתיים בווב ניתן לצפות בהתראות ולהמשיך את השאר באפליקציה.
        </Text>
        <Pressable
          onPress={() => router.push('/notifications')}
          style={({ hovered, pressed }) => [
            styles.ghostButton,
            (hovered || pressed) && styles.ghostButtonHover,
          ]}
        >
          <Ionicons name="notifications-outline" size={18} color={colors.text} />
          <Text style={styles.ghostButtonText}>מעבר להתראות</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onLogout}
        style={({ hovered, pressed }) => [styles.logout, (hovered || pressed) && styles.logoutHover]}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.white} />
        <Text style={styles.logoutText}>התנתקות</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  rowText: {
    fontSize: 13,
    color: colors.gray[700],
    textAlign: 'right',
  },
  note: {
    fontSize: 13,
    color: colors.gray[700],
    textAlign: 'right',
    lineHeight: 18,
  },
  ghostButton: {
    marginTop: 8,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
  },
  ghostButtonHover: {
    backgroundColor: colors.gray[200],
  },
  ghostButtonText: {
    color: colors.text,
    fontWeight: '900',
  },
  logout: {
    backgroundColor: colors.oxfordBlue,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
  },
  logoutHover: {
    opacity: 0.92,
  },
  logoutText: {
    color: colors.white,
    fontWeight: '900',
  },
});

