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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { guestService } from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuestCategorySelectionSheet } from '@/components/GuestCategorySelectionSheet';
import { useLayoutStore } from '@/store/layoutStore';
import BackSwipe from '@/components/BackSwipe';

export default function EditCategoryScreen() {
  const router = useRouter();
  const { isLoggedIn, userData } = useUserStore();
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useLayoutStore();
  const params = useLocalSearchParams<{ categoryId?: string; eventId?: string }>();
  const categoryId = useMemo(() => String(params.categoryId || '').trim(), [params.categoryId]);
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const eventId = useMemo(
    () =>
      String(
        params.eventId ||
          (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
          userData?.event_id ||
          ''
      ).trim(),
    [params.eventId, userData?.id, activeUserId, activeEventId, userData?.event_id]
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);

  const [categoryName, setCategoryName] = useState('');
  const [guestsInCategory, setGuestsInCategory] = useState<any[]>([]);
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<any[]>([]);
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);
  const [enableSides, setEnableSides] = useState(true);

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
      const [cats, guests, evt] = await Promise.all([
        guestService.getGuestCategories(eventId),
        guestService.getGuests(eventId),
        eventService.getEvent(eventId),
      ]);
      const cat = (cats || []).find((c: any) => String(c.id) === categoryId);
      setCategoryName(String(cat?.name ?? ''));
      setCategories(cats || []);
      const title = String(evt?.title ?? '').trim();
      const groom = String(evt?.groomName ?? '').trim();
      const bride = String(evt?.brideName ?? '').trim();
      const inferredType =
        ['חתונה', 'בר מצווה', 'בת מצווה', 'ברית', 'אירוע חברה'].find(et => title.startsWith(et) || title.includes(et)) ||
        null;
      const shouldEnable = !!groom || !!bride ? true : inferredType && inferredType !== 'חתונה' ? false : true;
      setEnableSides(shouldEnable);

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

  useFocusEffect(
    useCallback(() => {
      // This is a full-screen editor: hide the tab bar while focused.
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  const moveSelectedToCategory = async (target: any) => {
    if (!target?.id) return;
    const targetId = String(target.id);
    if (targetId === categoryId) {
      Alert.alert('שגיאה', 'בחר קטגוריה אחרת');
      return;
    }
    if (selectedToDelete.size === 0) return;
    if (moving) return;
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

  const goToGuests = useCallback(() => {
    if (eventId) {
      router.replace({ pathname: '/(couple)/guests', params: { eventId } });
      return;
    }
    router.replace('/(couple)/guests');
  }, [eventId, router]);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (!categoryId) {
      goToGuests();
      return;
    }
    if (!eventId) {
      setLoading(false);
      return;
    }
    if (userData?.id) setActiveEvent(userData.id, eventId);
    void load();
  }, [categoryId, eventId, goToGuests, isLoggedIn, load, router, setActiveEvent, userData?.id]);

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
    <BackSwipe onBack={goToGuests}>
      <View style={[styles.page, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />

      <GuestCategorySelectionSheet
        visible={moveSheetVisible}
        title="בחר קטגוריה להעברה"
        categories={(categories || []).filter((c: any) => String(c.id) !== categoryId)}
        selectedCategoryId={null}
        enableSides={enableSides}
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
      <View
        style={[
          styles.headerWrap,
          { backgroundColor: ui.surface, borderBottomColor: ui.border, paddingTop: Math.max(12, insets.top + 10) + 10 },
        ]}
      >
        <TouchableOpacity
          onPress={goToGuests}
          style={[
            styles.headerBackBtn,
            styles.backBtnAbs,
            { backgroundColor: ui.faint, top: Math.max(8, insets.top + 6) },
          ]}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
          activeOpacity={0.9}
        >
          <Ionicons name="chevron-back" size={22} color={ui.sub} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={saveName}
          disabled={saving}
          style={[styles.headerSaveBtn, styles.saveBtnAbs, { top: Math.max(8, insets.top + 6) }]}
          accessibilityRole="button"
          accessibilityLabel="שמור"
          activeOpacity={0.9}
        >
          <Text style={[styles.headerSaveText, { color: ui.primary, opacity: saving ? 0.6 : 1 }]}>
            {saving ? 'שומר...' : 'שמור'}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: ui.text }]}>{headerTitle}</Text>
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
          <LinearGradient
            colors={['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 1 }}
            end={{ x: 0.5, y: 0 }}
            style={[
              styles.bottomBar,
              {
                paddingBottom: bottomSafe,
              },
            ]}
          >
            <View style={styles.bottomActionsRow}>
              <TouchableOpacity
                onPress={() => setMoveSheetVisible(true)}
                disabled={selectedCount === 0 || moving || deleting}
                activeOpacity={0.92}
                style={[
                  styles.bottomBtn,
                  styles.bottomBtnSecondary,
                  {
                    opacity: selectedCount === 0 || moving || deleting ? 0.6 : 1,
                  },
                ]}
              >
                <Ionicons name="swap-horizontal" size={20} color={ui.primary} />
                <Text style={[styles.bottomBtnText, { color: ui.primary }]}>
                  {moving ? 'מעביר...' : `העבר (${selectedCount})`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={deleteSelected}
                disabled={selectedCount === 0 || deleting}
                activeOpacity={0.92}
                style={[
                  styles.bottomBtn,
                  styles.bottomBtnDanger,
                  {
                    opacity: selectedCount === 0 || deleting ? 0.6 : 1,
                  },
                ]}
              >
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
                <Text style={[styles.bottomBtnText, { color: '#DC2626' }]}>מחק נבחרים</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </KeyboardAvoidingView>
      )}
      </View>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  headerWrap: {
    position: 'relative',
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSaveBtn: {
    height: 38,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnAbs: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 5,
  },
  saveBtnAbs: {
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSaveText: {
    fontSize: 14,
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
    paddingTop: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -10 },
    elevation: 10,
  },
  bottomActionsRow: { flexDirection: 'row-reverse', gap: 12 },
  bottomBtn: {
    flex: 1,
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bottomBtnSecondary: {
    backgroundColor: 'rgba(107,114,128,0.12)',
  },
  bottomBtnDanger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  bottomBtnText: { fontSize: 13, fontWeight: '800' },
});

