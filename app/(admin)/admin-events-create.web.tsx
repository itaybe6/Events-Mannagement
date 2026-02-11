import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import { colors } from '@/constants/colors';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';

const EVENT_TYPES = [
  { label: 'חתונה', value: 'חתונה', icon: 'heart' as const, hint: 'יום מיוחד לזוג' },
  { label: 'בר מצווה', value: 'בר מצווה', icon: 'ribbon' as const, hint: 'אירוע משפחתי' },
  { label: 'בת מצווה', value: 'בת מצווה', icon: 'sparkles' as const, hint: 'חגיגה מרגשת' },
  { label: 'ברית', value: 'ברית', icon: 'star' as const, hint: 'מסורת וחיבור' },
  { label: 'אירוע חברה', value: 'אירוע חברה', icon: 'briefcase' as const, hint: 'עסקים ונטוורקינג' },
] as const;

type CoupleOption = { id: string; name: string; email: string };

export default function AdminEventsCreateWebScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  const [coupleOptions, setCoupleOptions] = useState<CoupleOption[]>([]);
  const [loadingCouples, setLoadingCouples] = useState(false);

  const [form, setForm] = useState({ user_id: '', title: '', date: '', location: '', city: '' });
  const [saving, setSaving] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (typeof userId === 'string' && userId) {
      setForm((f) => (f.user_id ? f : { ...f, user_id: userId }));
    }
  }, [userId]);

  const selectedUser = useMemo(() => coupleOptions.find((c) => c.id === form.user_id) || null, [coupleOptions, form.user_id]);

  const filteredCouples = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return coupleOptions;
    return coupleOptions.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [coupleOptions, userSearch]);

  const loadAvailableCouples = async () => {
    setLoadingCouples(true);
    try {
      const allCouples = await userService.getClients();
      setCoupleOptions(
        allCouples
          .filter((u) => (u.events_count || 0) === 0)
          .map((u) => ({ id: u.id, name: u.name, email: u.email }))
      );
    } finally {
      setLoadingCouples(false);
    }
  };

  useEffect(() => {
    void loadAvailableCouples();
  }, []);

  const formatDate = (dateString: string) =>
    dateString ? new Date(dateString).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

  const isFormValid = Boolean(form.user_id && form.title && form.date && form.location.trim() && form.city.trim());

  const handleAddEvent = async () => {
    if (!isFormValid) return;
    setSaving(true);
    try {
      await eventService.createEventForUser(form.user_id, {
        title: form.title,
        date: new Date(form.date),
        location: form.location.trim(),
        city: form.city.trim(),
        story: '',
        guests: 0,
        budget: 0,
      });
      router.replace('/(admin)/admin-events');
    } catch (e) {
      console.error('Create event error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.page}>
      <DesktopTopBar
        title="אירוע חדש"
        subtitle="יצירת אירוע בממשק דסקטופי"
        leftActions={
          <>
            <TopBarIconButton icon="arrow-forward" label="חזרה" onPress={() => router.replace('/(admin)/admin-events')} />
            <TopBarIconButton icon="refresh" label="רענון משתמשים" onPress={() => void loadAvailableCouples()} />
          </>
        }
        rightActions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="שמירה"
            disabled={!isFormValid || saving}
            onPress={() => void handleAddEvent()}
            style={({ hovered, pressed }: any) => [
              styles.primaryBtn,
              (!isFormValid || saving) ? { opacity: 0.55 } : null,
              Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            {saving ? <ActivityIndicator color={colors.white} /> : <Ionicons name="save-outline" size={18} color={colors.white} />}
            <Text style={styles.primaryBtnText}>{saving ? 'שומר...' : 'צור אירוע'}</Text>
          </Pressable>
        }
      />

      <View style={styles.grid}>
        <ScrollView style={styles.main} contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>משתמש</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="בחירת משתמש"
              onPress={() => setUserModalOpen(true)}
              style={({ hovered, pressed }: any) => [
                styles.selector,
                Platform.OS === 'web' && hovered ? styles.selectorHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <View style={styles.selectorLeft}>
                <Ionicons name="chevron-down" size={18} color={colors.gray[600]} />
              </View>
              <View style={styles.selectorText}>
                <Text style={styles.selectorTitle} numberOfLines={1}>
                  {selectedUser ? selectedUser.name : 'בחר משתמש'}
                </Text>
                <Text style={styles.selectorSubtitle} numberOfLines={1}>
                  {selectedUser ? selectedUser.email : 'הקצאת משתמש לאירוע'}
                </Text>
              </View>
              <View style={styles.selectorIcon}>
                <Ionicons name="person" size={18} color={colors.primary} />
              </View>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>סוג האירוע</Text>
            <View style={styles.typeGrid}>
              {EVENT_TYPES.map((t) => {
                const active = form.title === t.value;
                return (
                  <Pressable
                    key={t.value}
                    accessibilityRole="button"
                    accessibilityLabel={`בחירת סוג ${t.label}`}
                    onPress={() => setForm((f) => ({ ...f, title: t.value }))}
                    style={({ hovered, pressed }: any) => [
                      styles.typeTile,
                      active ? styles.typeTileActive : null,
                      Platform.OS === 'web' && hovered ? styles.typeTileHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <View style={[styles.typeIcon, active ? styles.typeIconActive : null]}>
                      <Ionicons name={t.icon} size={18} color={active ? colors.white : colors.text} />
                    </View>
                    <Text style={[styles.typeTitle, active ? styles.typeTitleActive : null]}>{t.label}</Text>
                    <Text style={[styles.typeHint, active ? styles.typeHintActive : null]} numberOfLines={1}>
                      {t.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>פרטי האירוע</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="בחירת תאריך"
              onPress={() => setShowDatePicker(true)}
              style={({ hovered, pressed }: any) => [
                styles.rowInput,
                Platform.OS === 'web' && hovered ? styles.rowInputHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="calendar" size={18} color={colors.primary} />
              <Text style={styles.rowInputText}>{form.date ? formatDate(form.date) : 'בחר תאריך לאירוע'}</Text>
              <Ionicons name="pencil" size={16} color={colors.gray[600]} />
            </Pressable>

            <View style={styles.field}>
              <Text style={styles.label}>מיקום</Text>
              <TextInput
                value={form.location}
                onChangeText={(v) => setForm((f) => ({ ...f, location: v }))}
                placeholder="הזן מיקום"
                placeholderTextColor={colors.gray[500]}
                style={styles.input}
                textAlign="right"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>עיר</Text>
              <TextInput
                value={form.city}
                onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                placeholder="הזן עיר"
                placeholderTextColor={colors.gray[500]}
                style={styles.input}
                textAlign="right"
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.side}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>סיכום</Text>
            <Text style={styles.summaryRow} numberOfLines={2}>
              {`משתמש: ${selectedUser ? selectedUser.name : '—'}`}
            </Text>
            <Text style={styles.summaryRow}>{`סוג: ${form.title || '—'}`}</Text>
            <Text style={styles.summaryRow}>{`תאריך: ${form.date ? formatDate(form.date) : '—'}`}</Text>
            <Text style={styles.summaryRow} numberOfLines={2}>{`מיקום: ${form.location?.trim() || '—'}`}</Text>
            <Text style={styles.summaryRow}>{`עיר: ${form.city?.trim() || '—'}`}</Text>

            <View style={{ height: 10 }} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="צור אירוע"
              disabled={!isFormValid || saving}
              onPress={() => void handleAddEvent()}
              style={({ hovered, pressed }: any) => [
                styles.primaryBtnWide,
                (!isFormValid || saving) ? { opacity: 0.55 } : null,
                Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              {saving ? <ActivityIndicator color={colors.white} /> : <Ionicons name="add" size={18} color={colors.white} />}
              <Text style={styles.primaryBtnText}>{saving ? 'שומר...' : 'צור אירוע'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="date"
        onConfirm={(date) => {
          setShowDatePicker(false);
          if (date) setForm((f) => ({ ...f, date: date.toISOString().split('T')[0] }));
        }}
        onCancel={() => setShowDatePicker(false)}
        minimumDate={new Date()}
        locale="he-IL"
        date={form.date ? new Date(form.date) : new Date()}
      />

      <Modal transparent visible={userModalOpen} animationType="fade" onRequestClose={() => setUserModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setUserModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>בחירת משתמש</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={() => setUserModalOpen(false)}
                style={styles.iconCircle}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
              <TextInput
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder="חיפוש משתמש..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign="right"
              />
            </View>

            {loadingCouples ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
                {filteredCouples.map((c) => {
                  const active = form.user_id === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityLabel={`בחירת ${c.name}`}
                      onPress={() => {
                        setForm((f) => ({ ...f, user_id: c.id }));
                        setUserModalOpen(false);
                      }}
                      style={({ hovered, pressed }: any) => [
                        styles.userRow,
                        active ? styles.userRowActive : null,
                        Platform.OS === 'web' && hovered ? styles.userRowHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <View style={styles.userRowText}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={styles.userEmail} numberOfLines={1}>
                          {c.email}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}

                {filteredCouples.length === 0 ? (
                  <View style={styles.modalEmpty}>
                    <Text style={styles.emptyText}>לא נמצאו משתמשים</Text>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  grid: { flex: 1, flexDirection: 'row-reverse', gap: 16, paddingTop: 16, alignItems: 'stretch' },
  main: { flex: 1, minWidth: 0 },
  mainContent: { paddingBottom: 24, gap: 16 },
  side: { width: 360 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },

  primaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnWide: {
    marginTop: 8,
    height: 44,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnHover: { opacity: 0.95 },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },

  selector: {
    marginTop: 12,
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 10,
  },
  selectorHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  selectorLeft: { width: 20, alignItems: 'flex-start' },
  selectorIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(15,69,230,0.10)', alignItems: 'center', justifyContent: 'center' },
  selectorText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  selectorTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  selectorSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },

  typeGrid: { marginTop: 12, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  typeTile: {
    width: 210,
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  typeTileHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  typeTileActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeIcon: { width: 36, height: 36, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  typeIconActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  typeTitle: { marginTop: 10, fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right' },
  typeTitleActive: { color: colors.white },
  typeHint: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  typeHintActive: { color: 'rgba(255,255,255,0.86)' },

  rowInput: {
    marginTop: 12,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  rowInputHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  rowInputText: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '900', color: colors.text, marginHorizontal: 10 },
  field: { marginTop: 12, gap: 8 },
  label: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  input: { height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', paddingHorizontal: 12, fontSize: 14, fontWeight: '800', color: colors.text },

  summaryRow: { marginTop: 10, fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'right' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 620, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', overflow: 'hidden', padding: 14, maxHeight: '86%' },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  iconCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  searchWrap: { marginTop: 12, height: 44, borderRadius: 14, backgroundColor: 'rgba(15,23,42,0.05)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 12 },
  searchInput: { paddingLeft: 40, paddingRight: 12, fontSize: 14, fontWeight: '800', color: colors.text },
  modalLoading: { paddingVertical: 24, alignItems: 'center' },
  userRow: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', backgroundColor: 'rgba(15,23,42,0.03)', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  userRowHover: { backgroundColor: 'rgba(15,23,42,0.05)' },
  userRowActive: { backgroundColor: 'rgba(15,69,230,0.06)', borderColor: 'rgba(15,69,230,0.16)' },
  userRowText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  userName: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },
  userEmail: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  modalEmpty: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 13, fontWeight: '800', color: colors.gray[600], textAlign: 'center' },
});

