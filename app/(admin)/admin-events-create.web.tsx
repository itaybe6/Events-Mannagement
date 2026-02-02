import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';

const EVENT_TYPES = [
  { label: 'חתונה', value: 'חתונה' },
  { label: 'בר מצווה', value: 'בר מצווה' },
  { label: 'בת מצווה', value: 'בת מצווה' },
  { label: 'ברית', value: 'ברית' },
  { label: 'אירוע חברה', value: 'אירוע חברה' },
];

export default function AdminEventsCreateWebScreen() {
  const router = useRouter();
  const [coupleOptions, setCoupleOptions] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    user_id: '',
    title: EVENT_TYPES[0].value,
    date: '',
    location: '',
    city: '',
  });

  useEffect(() => {
    void loadAvailableCouples();
  }, []);

  const loadAvailableCouples = async () => {
    const allCouples = await userService.getClients();
    setCoupleOptions(
      allCouples
        .filter((u) => (u.events_count || 0) === 0)
        .map((u) => ({ id: u.id, name: u.name, email: u.email }))
    );
  };

  const coupleLabel = useMemo(() => {
    const c = coupleOptions.find((x) => x.id === form.user_id);
    return c ? `${c.name} (${c.email})` : 'בחר משתמש';
  }, [coupleOptions, form.user_id]);

  const isValid =
    !!form.user_id && !!form.title && !!form.date && !!form.location.trim() && !!form.city.trim();

  const handleSubmit = async () => {
    if (!isValid) {
      Alert.alert('שגיאה', 'יש למלא את כל השדות');
      return;
    }

    setLoading(true);
    try {
      await eventService.createEventForUser(form.user_id, {
        title: form.title,
        date: new Date(form.date),
        location: form.location.trim(),
        city: form.city.trim(),
        image: '',
        story: '',
        guests: 0,
        budget: 0,
      });
      router.replace('/(admin)/admin-events');
    } catch (e) {
      Alert.alert('שגיאה', 'לא ניתן להוסיף את האירוע');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerRight}>
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={styles.title}>הוסף אירוע חדש</Text>
          </View>
          <Pressable
            onPress={() => router.replace('/(admin)/admin-events')}
            style={({ hovered, pressed }) => [
              styles.ghostButton,
              (hovered || pressed) && styles.ghostButtonHover,
            ]}
          >
            <Text style={styles.ghostButtonText}>חזרה</Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          <View style={styles.field}>
            <Text style={styles.label}>משתמש</Text>
            <select
              value={form.user_id}
              onChange={(e) => setForm((p) => ({ ...p, user_id: (e.target as HTMLSelectElement).value }))}
              style={styles.webSelect as any}
            >
              <option value="">{coupleOptions.length ? 'בחר משתמש' : 'אין משתמשים זמינים'}</option>
              {coupleOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
            <Text style={styles.helper}>{coupleLabel}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>סוג אירוע</Text>
            <select
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: (e.target as HTMLSelectElement).value }))}
              style={styles.webSelect as any}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>תאריך</Text>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: (e.target as HTMLInputElement).value }))}
              style={styles.webInput as any}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>מיקום</Text>
            <input
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: (e.target as HTMLInputElement).value }))}
              placeholder="אולם / גן אירועים"
              style={styles.webInput as any}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>עיר</Text>
            <input
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: (e.target as HTMLInputElement).value }))}
              placeholder="תל אביב"
              style={styles.webInput as any}
            />
          </View>
        </View>

        <Pressable
          disabled={!isValid || loading}
          onPress={handleSubmit}
          style={({ hovered, pressed }) => [
            styles.primaryButton,
            (!isValid || loading) && styles.primaryButtonDisabled,
            (hovered || pressed) && isValid && !loading && styles.primaryButtonHover,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color={colors.white} />
              <Text style={styles.primaryButtonText}>שמור אירוע</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 24,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 1000,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 16,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  headerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  field: {
    flexBasis: 'calc(50% - 6px)' as any,
    flexGrow: 1,
    minWidth: 280,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
    marginBottom: 6,
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
    color: colors.gray[600],
    textAlign: 'right',
  },
  webInput: {
    height: 42,
    borderRadius: 12,
    border: `1px solid ${colors.gray[200]}`,
    background: colors.gray[50],
    padding: '0 12px',
    fontSize: 14,
    color: colors.text,
    direction: 'rtl',
    outline: 'none',
  },
  webSelect: {
    height: 42,
    borderRadius: 12,
    border: `1px solid ${colors.gray[200]}`,
    background: colors.gray[50],
    padding: '0 12px',
    fontSize: 14,
    color: colors.text,
    direction: 'rtl',
    outline: 'none',
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  primaryButtonHover: {
    opacity: 0.92,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.gray[400],
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 14,
  },
  ghostButton: {
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  ghostButtonHover: {
    backgroundColor: colors.gray[200],
  },
  ghostButtonText: {
    color: colors.text,
    fontWeight: '900',
  },
});

