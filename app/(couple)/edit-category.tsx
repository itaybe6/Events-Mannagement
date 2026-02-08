import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '@/store/userStore';
import { guestService } from '@/lib/services/guestService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuestCategorySelectionSheet } from '@/components/GuestCategorySelectionSheet';

export default function EditCategoryScreen() {
  const router = useRouter();
  const { isLoggedIn, userData } = useUserStore();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = useMemo(() => String(params.categoryId || '').trim(), [params.categoryId]);

  const eventId = userData?.event_id ? String(userData.event_id) : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);

  const [categoryName, setCategoryName] = useState('');
  const [guestsInCategory, setGuestsInCategory] = useState<any[]>([]);
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<any[]>([]);
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);

  const ui = useMemo(() => {
    return {
      primary: '#0F172A',
      danger: '#F87171',
      bg: '#FFFFFF',
      surface: '#FFFFFF',
      border: '#E5E7EB',
      text: '#111827',
      sub: '#6B7280',
      faint: 'rgba(15,23,42,0.06)',
      inputBg: '#F9FAFB',
    };
  }, []);

  const load = useCallback(async () => {
    if (!eventId || !categoryId) return;
    setLoading(true);
    try {
      const [cats, guests] = await Promise.all([
        guestService.getGuestCategories(eventId),
        guestService.getGuests(eventId),
      ]);
      const cat = (cats || []).find((c: any) => String(c.id) === categoryId);
      setCategoryName(String(cat?.name ?? ''));
      setCategories(cats || []);

      const inCat = (guests || []).filter((g: any) => String(g.category_id) === categoryId);
      setGuestsInCategory(inCat);
      setSelectedToDelete(new Set());
    } catch (e) {
      console.error('EditCategory load error:', e);
      Alert.alert('שגיאה', 'לא ניתן לטעון את הקטגוריה');
    } finally {
      setLoading(false);
    }
  }, [categoryId, eventId]);

  const moveSelectedToCategory = async (target: any) => {
    if (!target?.id) return;
    const targetId = String(target.id);
    if (targetId === categoryId) {
      Alert.alert('שגיאה', 'בחר קטגוריה אחרת');
      return;
    }
    if (selectedToDelete.size === 0) return;
    if (moving) return;

    setMoveSheetVisible(false);
    setMoving(true);
    try {
      const ids = Array.from(selectedToDelete);
      for (const id of ids) {
        await guestService.updateGuest(id, { category_id: targetId });
      }
      setGuestsInCategory(prev => prev.filter(g => !selectedToDelete.has(String(g.id))));
      setSelectedToDelete(new Set());
      Alert.alert('הועבר', `הועברו ${ids.length} אורחים לקטגוריה "${String(target?.name ?? '')}"`);
    } catch (e) {
      console.error('Move guests error:', e);
      Alert.alert('שגיאה', 'לא ניתן להעביר אורחים');
    } finally {
      setMoving(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (!categoryId) {
      router.back();
      return;
    }
    if (!eventId) return;
    void load();
  }, [categoryId, eventId, isLoggedIn, load, router]);

  const toggleGuest = (guestId: string) => {
    setSelectedToDelete(prev => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const saveName = async () => {
    if (!categoryId) return;
    const name = (categoryName || '').trim();
    if (!name) {
      Alert.alert('שגיאה', 'יש להזין שם קטגוריה');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await guestService.updateGuestCategory(categoryId, { name });
      Alert.alert('נשמר', 'שם הקטגוריה עודכן בהצלחה', [
        {
          text: 'חזרה לרשימת אנשי קשר',
          onPress: () => {
            if (!eventId) {
              router.back();
              return;
            }
            router.replace({ pathname: '/contacts-list', params: { eventId } });
          },
        },
      ]);
    } catch (e) {
      console.error('Save category name error:', e);
      Alert.alert('שגיאה', 'לא ניתן לעדכן את שם הקטגוריה');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedToDelete.size === 0) return;
    if (deleting) return;

    const count = selectedToDelete.size;
    Alert.alert('מחיקת אורחים', `האם למחוק ${count} אורחים מהקטגוריה?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            for (const id of selectedToDelete) {
              await guestService.deleteGuest(id);
            }
            setGuestsInCategory(prev => prev.filter(g => !selectedToDelete.has(String(g.id))));
            setSelectedToDelete(new Set());
            Alert.alert('הושלם', 'האורחים נמחקו');
          } catch (e) {
            console.error('Delete selected guests error:', e);
            Alert.alert('שגיאה', 'לא ניתן למחוק אורחים');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const headerTitle = 'עריכת קטגוריה';

  const bottomSafe = Math.max(16, insets.bottom + 16);
  const selectedCount = selectedToDelete.size;

  const initials = (name?: string) => {
    const n = String(name || '').trim();
    if (!n) return 'א';
    const parts = n.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? n[0];
    const second = parts.length > 1 ? parts[1]?.[0] : n[1];
    return `${first ?? ''}${second ?? ''}`.slice(0, 2);
  };

  const avatarPalette = useMemo(() => {
    // Soft tints (light mode)
    return [
      { bg: '#EFF6FF', fg: '#0F172A' },
      { bg: '#FAF5FF', fg: '#7C3AED' },
      { bg: '#ECFDF5', fg: '#16A34A' },
      { bg: '#FFF7ED', fg: '#EA580C' },
    ];
  }, []);

  const avatarFor = (name?: string) => {
    const key = String(name || '').trim();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return avatarPalette[hash % avatarPalette.length];
  };

  return (
    <View style={[styles.page, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <GuestCategorySelectionSheet
        visible={moveSheetVisible}
        title="בחר קטגוריה להעברה"
        categories={(categories || []).filter((c: any) => String(c.id) !== categoryId)}
        selectedCategoryId={null}
        onClose={() => setMoveSheetVisible(false)}
        onSelect={(cat) => {
          void moveSelectedToCategory(cat as any);
        }}
        onCreateCategory={async (name, side) => {
          if (!eventId) throw new Error('Missing eventId');
          const created = await guestService.addGuestCategory(eventId, name, side);
          setCategories(prev => [...prev, created]);
          return created as any;
        }}
      />

      {/* Header */}
      <View style={[styles.headerWrap, { backgroundColor: ui.surface, borderBottomColor: ui.border, paddingTop: Math.max(12, insets.top + 10) }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.headerBackBtn, { backgroundColor: ui.faint }]}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            activeOpacity={0.9}
          >
            <Ionicons name="arrow-forward" size={20} color={ui.sub} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: ui.text }]}>{headerTitle}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.inputBlock}>
          <Text style={[styles.inputLabel, { color: ui.sub }]}>שם הקטגוריה</Text>
          <View style={[styles.inputWrap, { backgroundColor: ui.inputBg }]}>
            <TextInput
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="הזן שם"
              placeholderTextColor="#9CA3AF"
              style={[styles.input, { color: ui.text }]}
              textAlign="right"
            />
            <View style={styles.inputIcon}>
              <Ionicons name="create-outline" size={18} color="#9CA3AF" />
            </View>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomSafe + 140 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHeadRow}>
              <Text style={[styles.sectionTitle, { color: '#374151' }]}>בחר אורחים למחיקה</Text>
              <Text style={[styles.sectionMeta, { color: '#9CA3AF' }]}>
                {guestsInCategory.length} אורחים
              </Text>
            </View>

            <View style={[styles.listCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
              {guestsInCategory.length === 0 ? (
                <View style={{ paddingVertical: 18 }}>
                  <Text style={[styles.emptyText, { color: '#6B7280' }]}>אין אורחים בקטגוריה זו</Text>
                </View>
              ) : (
                guestsInCategory.map((guest, idx) => {
                  const id = String(guest?.id ?? '');
                  if (!id) return null;
                  const checked = selectedToDelete.has(id);
                  const name = String(guest?.name ?? 'שם לא זמין');
                  const pal = avatarFor(name);
                  const last = idx === guestsInCategory.length - 1;

                  return (
                    <TouchableOpacity
                      key={id}
                      style={[
                        styles.listRow,
                        { borderBottomColor: ui.border, backgroundColor: ui.surface },
                        last && { borderBottomWidth: 0 },
                      ]}
                      onPress={() => toggleGuest(id)}
                      activeOpacity={0.88}
                    >
                      <View style={styles.rowLeft}>
                        <View style={[styles.avatar, { backgroundColor: pal.bg }]}>
                          <Text style={[styles.avatarText, { color: pal.fg }]}>{initials(name)}</Text>
                        </View>
                        <Text style={[styles.rowName, { color: '#1F2937' }]} numberOfLines={1}>
                          {name}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.checkCircle,
                          checked
                            ? { backgroundColor: ui.primary, borderColor: ui.primary }
                            : { backgroundColor: 'transparent', borderColor: '#E5E7EB' },
                        ]}
                      >
                        {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

          </ScrollView>

          {/* Bottom floating actions (HTML-like) */}
          <View
            style={[
              styles.bottomBar,
              {
                paddingBottom: bottomSafe,
                backgroundColor: 'rgba(255,255,255,0.92)',
                borderTopColor: ui.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => setMoveSheetVisible(true)}
              disabled={selectedCount === 0 || moving || deleting || saving}
              activeOpacity={0.92}
              style={[
                styles.primaryWideBtn,
                {
                  backgroundColor: ui.primary,
                  opacity: selectedCount === 0 || moving || deleting || saving ? 0.6 : 1,
                },
              ]}
            >
              <Ionicons name="swap-horizontal" size={20} color="#fff" />
              <Text style={styles.primaryWideText}>
                {moving ? 'מעביר...' : `העבר נבחרים (${selectedCount}) לקטגוריה אחרת`}
              </Text>
            </TouchableOpacity>

            <View style={styles.bottomGrid}>
              <TouchableOpacity
                onPress={saveName}
                disabled={saving}
                activeOpacity={0.92}
                style={[styles.pillBtn, { backgroundColor: ui.primary, opacity: saving ? 0.75 : 1 }]}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.pillText}>{saving ? 'שומר...' : 'שמור שם'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={deleteSelected}
                disabled={selectedCount === 0 || deleting}
                activeOpacity={0.92}
                style={[
                  styles.pillBtn,
                  {
                    backgroundColor: ui.primary,
                    opacity: selectedCount === 0 || deleting ? 0.6 : 1,
                  },
                ]}
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={styles.pillText}>מחק נבחרים</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  headerWrap: {
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    zIndex: 2,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  inputBlock: {},
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'right',
  },
  inputWrap: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    paddingRight: 0,
    paddingLeft: 34,
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 18, paddingTop: 18 },
  sectionHeadRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  sectionMeta: { fontSize: 12, fontWeight: '600' },
  listCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  emptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  listRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flex: 1, paddingLeft: 14 },
  avatar: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  rowName: { fontSize: 15, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -10 },
    elevation: 10,
  },
  primaryWideBtn: {
    width: '100%',
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    marginBottom: 14,
  },
  primaryWideText: { color: '#fff', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  bottomGrid: { flexDirection: 'row-reverse', gap: 12 },
  pillBtn: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  pillText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});

