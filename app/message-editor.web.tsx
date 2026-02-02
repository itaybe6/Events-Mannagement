import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';

export default function MessageEditorWebScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRight}>
          <Ionicons name="create-outline" size={22} color={colors.primary} />
          <Text style={styles.title}>עורך הודעות</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          style={({ hovered, pressed }) => [styles.ghost, (hovered || pressed) && styles.ghostHover]}
        >
          <Text style={styles.ghostText}>חזרה</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>עדיין לא זמין בווב</Text>
        <Text style={styles.text}>
          העמוד הזה משתמש בבוחר תאריך/שעה במובייל. כדי לשמור על הרצה חלקה בווב, הצגנו כאן גרסת ווב
          זמנית. אם תרצה, אפשר ליישם גרסה מלאה בווב עם טפסים/תאריכים באמצעות רכיבי HTML.
        </Text>
        <Text style={styles.text}>בינתיים אפשר להמשיך לניהול התראות בעמוד `התראות` או להשתמש באפליקציה.</Text>

        <Pressable
          onPress={() => router.push('/notifications')}
          style={({ hovered, pressed }) => [styles.primary, (hovered || pressed) && styles.primaryHover]}
        >
          <Ionicons name="notifications-outline" size={18} color={colors.white} />
          <Text style={styles.primaryText}>מעבר להתראות</Text>
        </Pressable>
      </View>
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
    gap: 12,
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
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  text: {
    fontSize: 13,
    color: colors.gray[700],
    textAlign: 'right',
    lineHeight: 18,
  },
  primary: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
  },
  primaryHover: {
    opacity: 0.92,
  },
  primaryText: {
    color: colors.white,
    fontWeight: '900',
  },
  ghost: {
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  ghostHover: {
    backgroundColor: colors.gray[200],
  },
  ghostText: {
    fontWeight: '900',
    color: colors.text,
  },
});

