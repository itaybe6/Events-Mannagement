import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
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
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { eventService } from '@/lib/services/eventService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuestCategorySelectionSheet } from '@/components/GuestCategorySelectionSheet';
import { useLayoutStore } from '@/store/layoutStore';
import BackSwipe from '@/components/BackSwipe';
import { ALIGN_RIGHT, IS_RTL, ROW_DIR, RTL_MARK } from '@/lib/rtl';

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
  const [initialCategoryName, setInitialCategoryName] = useState('');
  const [guestsInCategory, setGuestsInCategory] = useState<any[]>([]);
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<any[]>([]);
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);
  const [enableSides, setEnableSides] = useState(true);
  const [confirmMoveVisible, setConfirmMoveVisible] = useState(false);
  const [pendingMoveTarget, setPendingMoveTarget] = useState<any | null>(null);

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
      const nextCategoryName = String(cat?.name ?? '');
      setCategoryName(nextCategoryName);
      setInitialCategoryName(nextCategoryName);
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
      setInitialCategoryName(name);
      Alert.alert('נשמר', 'שם הקטגוריה עודכן בהצלחה');
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
  const isNameDirty = categoryName.trim() !== initialCategoryName.trim();

  const requestMoveToCategory = (target: any) => {
    if (!target?.id) return;
    const targetId = String(target.id);
    if (targetId === categoryId) {
      Alert.alert('שגיאה', 'בחר קטגוריה אחרת');
      return;
    }
    if (selectedToDelete.size === 0) return;
    setPendingMoveTarget(target);
    setConfirmMoveVisible(false);
    requestAnimationFrame(() => {
      setConfirmMoveVisible(true);
    });
  };

  const cancelMove = () => {
    setConfirmMoveVisible(false);
    setPendingMoveTarget(null);
  };

  const confirmMove = async () => {
    const target = pendingMoveTarget;
    if (!target?.id) return;
    setConfirmMoveVisible(false);
    await moveSelectedToCategory(target);
    setPendingMoveTarget(null);
  };

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
        <LinearGradient
          pointerEvents="none"
          colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pageBg}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.75, y: 0.55 }}
          style={styles.pageBgHighlight}
        />

      <GuestCategorySelectionSheet
        visible={moveSheetVisible}
        title="בחר קטגוריה להעברה"
        categories={(categories || []).filter((c: any) => String(c.id) !== categoryId)}
        selectedCategoryId={pendingMoveTarget ? String(pendingMoveTarget.id) : null}
        enableSides={enableSides}
        closeOnSelect={false}
        overlay={
          confirmMoveVisible ? (
            <View style={styles.confirmBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => (moving ? null : cancelMove())} />
              <View style={[styles.confirmCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                <View style={styles.confirmHeaderRow}>
                  <LinearGradient
                    colors={['#2F6BFF', '#135BEC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.confirmIconBadge}
                  >
                    <Ionicons name="swap-horizontal" size={20} color="#fff" />
                  </LinearGradient>
                  <View style={styles.confirmHeaderText}>
                    <Text style={[styles.confirmEyebrow, { color: '#135BEC' }]}>
                      {RTL_MARK}העברת אורחים
                    </Text>
                    <Text style={[styles.confirmTitle, { color: ui.text }]}>
                      {RTL_MARK}אישור העברה
                    </Text>
                  </View>
                </View>
                <View style={styles.confirmTextWrap}>
                  <Text style={[styles.confirmSubtitle, { color: ui.sub }]}>
                    {RTL_MARK}האם אתה בטוח שברצונך להעביר {selectedCount} אורחים לקטגוריה "{String(pendingMoveTarget?.name ?? '')}"?
                  </Text>
                </View>
                <View style={styles.confirmMetaRow}>
                  <View style={[styles.confirmMetaCard, styles.confirmMetaCardPrimary]}>
                    <Text style={styles.confirmMetaValue}>{selectedCount}</Text>
                    <Text style={styles.confirmMetaLabel}>אורחים נבחרו</Text>
                  </View>
                  <View style={styles.confirmMetaCard}>
                    <Text style={styles.confirmMetaValueDark} numberOfLines={1}>
                      {String(pendingMoveTarget?.name ?? '')}
                    </Text>
                    <Text style={styles.confirmMetaLabel}>קטגוריית יעד</Text>
                  </View>
                </View>

                <View style={styles.confirmButtonsRow}>
                  <TouchableOpacity
                    onPress={cancelMove}
                    disabled={moving}
                    activeOpacity={0.92}
                    style={[
                      styles.confirmBtn,
                      styles.confirmBtnSecondary,
                      { borderColor: 'rgba(148,163,184,0.22)', opacity: moving ? 0.6 : 1 },
                    ]}
                  >
                    <Ionicons name="close" size={16} color={ui.text} />
                    <Text style={[styles.confirmBtnText, { color: ui.text }]}>ביטול</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => void confirmMove()}
                    disabled={moving}
                    activeOpacity={0.92}
                    style={[
                      styles.confirmBtn,
                      styles.confirmBtnPrimary,
                      { backgroundColor: ui.primary, opacity: moving ? 0.7 : 1 },
                    ]}
                  >
                    <Ionicons name="swap-horizontal" size={18} color="#fff" />
                    <Text style={[styles.confirmBtnText, { color: '#fff' }]}>
                      {moving ? 'מאשר...' : 'אישור'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null
        }
        onClose={() => setMoveSheetVisible(false)}
        onSelect={(cat) => {
          requestMoveToCategory(cat as any);
        }}
        onCreateCategory={async (name, side) => {
          if (!eventId) throw new Error('Missing eventId');
          const created = await guestService.addGuestCategory(eventId, name, side);
          setCategories(prev => [...prev, created]);
          return created as any;
        }}
        onRenameCategory={async (category, nextName) => {
          const updated = await guestService.updateGuestCategory(String(category.id), { name: nextName.trim() });
          setCategories(prev =>
            prev.map((item: any) => (String(item.id) === String(category.id) ? { ...item, name: updated.name } : item))
          );
          setPendingMoveTarget(prev =>
            prev && String(prev.id) === String(category.id) ? { ...prev, name: updated.name } : prev
          );
          return updated as any;
        }}
        onDeleteCategory={async (category) => {
          if (!eventId) throw new Error('Missing eventId');
          const guests = await guestService.getGuests(eventId);
          const guestsInDeletedCategory = guests.filter((guest: any) => String(guest.category_id || '') === String(category.id));
          await Promise.all(
            guestsInDeletedCategory.map((guest: any) =>
              guestService.updateGuest(String(guest.id), { category_id: null })
            )
          );
          await guestService.deleteGuestCategory(String(category.id));
          setCategories(prev => prev.filter((item: any) => String(item.id) !== String(category.id)));
          setPendingMoveTarget(prev => (prev && String(prev.id) === String(category.id) ? null : prev));
          setConfirmMoveVisible(false);
          Alert.alert('נמחק', `הקטגוריה "${String(category.name || '')}" נמחקה`);
        }}
      />

      {/* Header */}
      <View
        style={[
          styles.headerWrap,
          { backgroundColor: ui.surface, borderBottomColor: ui.border, paddingTop: Math.max(12, insets.top + 10) },
        ]}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.headerSideSpacer} />

          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: ui.text }]}>{headerTitle}</Text>
            <Text style={[styles.headerSubtitle, { color: ui.sub }]}>עדכון שם הקטגוריה וניהול האורחים שבה</Text>
          </View>

          <TouchableOpacity
            onPress={goToGuests}
            style={[
              styles.headerBackBtn,
              { backgroundColor: ui.faint, borderColor: ui.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            activeOpacity={0.9}
          >
            <Ionicons name="chevron-back" size={18} color={ui.text} />
          </TouchableOpacity>
        </View>

      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
        </View>
      ) : (
        <>
          <AppKeyboardAwareScrollView
            style={styles.editorScroll}
            contentContainerStyle={[styles.content, { paddingBottom: bottomSafe + 140 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            alwaysBounceVertical={false}
          >
            <View style={[styles.inputBlock, styles.inputBlockInContent, { backgroundColor: ui.inputBg, borderColor: ui.border }]}>
              <Text style={[styles.inputLabel, { color: ui.sub }]}>שם הקטגוריה</Text>
              <View style={[styles.inputWrap, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                <TextInput
                  value={categoryName}
                  onChangeText={setCategoryName}
                  placeholder="הזן שם"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.input, { color: ui.text }]}
                  textAlign="right"
                />
                <TouchableOpacity
                  onPress={saveName}
                  disabled={saving || !isNameDirty}
                  accessibilityRole="button"
                  accessibilityLabel="שמור שם קטגוריה"
                  activeOpacity={0.9}
                  style={[
                    styles.inputSaveBtn,
                    {
                      backgroundColor: isNameDirty ? ui.primary : '#D1D5DB',
                      opacity: saving ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.inputIcon}>
                  <Ionicons name="create-outline" size={18} color="#9CA3AF" />
                </View>
              </View>
            </View>

            <View style={styles.sectionHeadRow}>
              <Text style={[styles.sectionTitle, { color: '#374151' }]}>בחר אורחים למחיקה/העברה</Text>
              <Text style={[styles.sectionMeta, { color: '#9CA3AF' }]}>
                {guestsInCategory.length} אורחים
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                <Text style={[styles.summaryValue, { color: ui.text }]}>{guestsInCategory.length}</Text>
                <Text style={[styles.summaryLabel, { color: ui.sub }]}>סה"כ בקטגוריה</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                <Text style={[styles.summaryValue, { color: ui.primary }]}>{selectedCount}</Text>
                <Text style={[styles.summaryLabel, { color: ui.sub }]}>נבחרו למחיקה/העברה</Text>
              </View>
            </View>

            <View style={[styles.listCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
              {guestsInCategory.length === 0 ? (
                <View style={styles.emptyStateCard}>
                  <View style={styles.emptyStateIcon}>
                    <Ionicons name="people-outline" size={22} color={ui.sub} />
                  </View>
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
                  const guestPeopleCount =
                    String(guest?.status ?? '').trim() === 'ממתין'
                      ? 1
                      : Number(guest?.numberOfPeople ?? guest?.number_of_people ?? 1) || 1;

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
                        <View style={styles.rowTextWrap}>
                          <Text style={[styles.rowName, { color: '#1F2937' }]} numberOfLines={1}>
                            {name}
                          </Text>
                          <View style={styles.rowMetaPill}>
                            <Ionicons name="people-outline" size={12} color="#6B7280" />
                            <Text style={styles.rowMetaPillText}>{guestPeopleCount}</Text>
                          </View>
                        </View>
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

          </AppKeyboardAwareScrollView>

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
            </View>
          </LinearGradient>
        </>
      )}
      </View>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageBg: {
    ...StyleSheet.absoluteFillObject,
  },
  pageBgHighlight: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
    alignItems: ALIGN_RIGHT,
  },
  confirmHeaderRow: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  confirmHeaderText: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  confirmIconBadge: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#135BEC',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  confirmTextWrap: {
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: 14,
    alignItems: ALIGN_RIGHT,
  },
  confirmEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    writingDirection: 'rtl',
    textAlign: 'right',
    width: '100%',
    marginBottom: 4,
  },
  confirmTitle: {
    fontSize: 26,
    fontWeight: '900',
    writingDirection: 'rtl',
    textAlign: 'right',
    width: '100%',
  },
  confirmSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 23,
    writingDirection: 'rtl',
    textAlign: 'right',
    width: '100%',
  },
  confirmMetaRow: {
    width: '100%',
    flexDirection: ROW_DIR,
    gap: 10,
    marginBottom: 16,
  },
  confirmMetaCard: {
    flex: 1,
    minHeight: 76,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  confirmMetaCardPrimary: {
    backgroundColor: '#EEF4FF',
    borderColor: 'rgba(19,91,236,0.16)',
  },
  confirmMetaValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#135BEC',
    textAlign: 'center',
  },
  confirmMetaValueDark: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  confirmMetaLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  confirmButtonsRow: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: ROW_DIR,
    gap: 12,
  },
  confirmBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
  },
  confirmBtnSecondary: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
  },
  confirmBtnPrimary: {
    borderWidth: 0,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerWrap: {
    position: 'relative',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    zIndex: 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  headerBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerSideSpacer: {
    width: 42,
    height: 42,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  inputBlock: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  inputBlockInContent: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'right',
    alignSelf: ALIGN_RIGHT,
  },
  inputWrap: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    position: 'relative',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    paddingEnd: 34,
    paddingStart: 82,
  },
  inputSaveBtn: {
    position: 'absolute',
    left: 12,
    top: 11,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputIcon: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  editorScroll: {
    flex: 1,
  },
  content: { paddingHorizontal: 18, paddingTop: 18 },
  sectionHeadRow: {
    flexDirection: ROW_DIR,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  sectionMeta: { fontSize: 12, fontWeight: '700' },
  summaryRow: {
    flexDirection: ROW_DIR,
    gap: 12,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  listCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  emptyStateCard: {
    paddingVertical: 28,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(15,23,42,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  listRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  rowLeft: { flexDirection: ROW_DIR, alignItems: 'center', gap: 12, flex: 1, paddingStart: 14 },
  avatar: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  rowTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    minWidth: 0,
  },
  rowName: { fontSize: 15, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  rowMetaPill: {
    marginTop: 6,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.06)',
    alignSelf: ALIGN_RIGHT,
  },
  rowMetaPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'right',
  },
  checkCircle: {
    width: 30,
    height: 30,
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
  bottomActionsRow: { flexDirection: ROW_DIR, gap: 12 },
  bottomBtn: {
    flex: 1,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bottomBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  bottomBtnDanger: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FED7D7',
  },
  bottomBtnText: { fontSize: 13, fontWeight: '900' },
});

