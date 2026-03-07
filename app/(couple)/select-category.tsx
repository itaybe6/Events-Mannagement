import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { guestService } from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { useLayoutStore } from '@/store/layoutStore';
import { colors } from '@/constants/colors';
import { ROW_DIR, ROW_REVERSE_DIR } from '@/lib/rtl';

type Side = 'groom' | 'bride';
type Mode = 'existing' | 'new';

type GuestCategory = {
  id: string;
  name: string;
  side: Side;
};

const PRIMARY = '#1D4ED8';
const PRIMARY_SOFT = 'rgba(29,78,216,0.09)';
const PRIMARY_BORDER = 'rgba(29,78,216,0.22)';
const NAVY = '#0F172A';
const BG_TEXT = '#1E293B';
const SUBTEXT = '#64748B';
const BG_LIGHT = '#F8FAFC';
const ACCENT_PINK = '#F472B6';
const ACCENT_BLUE = '#60A5FA';
const ICON_PINK = '#EC4899';
const ICON_BLUE = '#3B82F6';
const CARD_DARK = '#1E293B';
const TEXT_DARK = '#F1F5F9';
const SUBTEXT_DARK = '#94A3B8';
const BORDER_LIGHT = 'rgba(0,0,0,0.06)';
const UI_REV = 'select-category-ui-rev-2026-02-28-3';

export default function SelectCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTabBarVisible = useLayoutStore((s) => s.setTabBarVisible);
  // Force light theme for this screen (always white/bright background).
  const isDark = false;
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ eventId?: string; categoryId?: string }>();

  const eventId = useMemo(() => String(params.eventId || '').trim(), [params.eventId]);
  const initialCategoryId = useMemo(() => String(params.categoryId || '').trim(), [params.categoryId]);

  const [loading, setLoading] = useState(true);
  const [enableSides, setEnableSides] = useState(true);
  const [categories, setCategories] = useState<GuestCategory[]>([]);
  const [guestCountByCategoryId, setGuestCountByCategoryId] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode>('existing');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSide, setNewSide] = useState<Side>('groom');
  const [saving, setSaving] = useState(false);
  const [segWidth, setSegWidth] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  useEffect(() => {
    setTabBarVisible(false);
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]);

  useEffect(() => {
    const load = async () => {
      if (!eventId) { setLoading(false); return; }
      setLoading(true);
      try {
        const [catsRaw, guestsRaw, evt] = await Promise.all([
          guestService.getGuestCategories(eventId),
          guestService.getGuests(eventId),
          eventService.getEvent(eventId),
        ]);
        const title = String((evt as any)?.title ?? '').trim();
        const groom = String((evt as any)?.groomName ?? '').trim();
        const bride = String((evt as any)?.brideName ?? '').trim();
        const inferredType =
          ['חתונה', 'בר מצווה', 'בת מצווה', 'ברית', 'אירוע חברה'].find(
            (et) => title.startsWith(et) || title.includes(et)
          ) || null;
        const shouldEnable = !!groom || !!bride ? true : inferredType && inferredType !== 'חתונה' ? false : true;
        setEnableSides(shouldEnable);
        const normalized: GuestCategory[] = (catsRaw || []).map((c: any) => ({
          id: String(c.id),
          name: String(c.name || ''),
          side: (String(c.side || 'groom') as Side) || 'groom',
        }));
        setCategories(normalized);
        setSelectedId(initialCategoryId || (normalized[0]?.id ?? null));

        const counts: Record<string, number> = {};
        for (const g of (guestsRaw || []) as any[]) {
          const cid = String((g as any)?.category_id ?? '').trim();
          if (!cid) continue;
          const n = Number((g as any)?.numberOfPeople ?? 1) || 1;
          counts[cid] = (counts[cid] || 0) + Math.max(1, n);
        }
        setGuestCountByCategoryId(counts);
      } catch (e) {
        console.error('SelectCategory load error:', e);
        Alert.alert('שגיאה', 'לא ניתן לטעון קטגוריות');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [eventId, initialCategoryId]);

  useEffect(() => {
    if (!enableSides) setNewSide('groom');
  }, [enableSides]);

  const selectedCategory = useMemo(() => {
    if (!selectedId) return null;
    return categories.find((c) => c.id === selectedId) ?? null;
  }, [categories, selectedId]);

  const bottomPadding = Math.max(20, insets.bottom + 16);

  const gridGap = 14;
  const colPad = 16;
  const gridSidePad = Math.max(0, colPad - gridGap / 2);

  const goBack = () => {
    // Always return to the guests screen (not navigation history).
    router.replace({ pathname: '/(couple)/guests', params: eventId ? { eventId } : undefined });
  };

  const goToContacts = (catId: string) => {
    router.replace({ pathname: '/contacts-list', params: { eventId, categoryId: catId } });
  };

  const handleNext = async () => {
    if (!eventId || saving) return;
    if (mode === 'existing') {
      if (!selectedCategory) return;
      goToContacts(selectedCategory.id);
      return;
    }
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = (await guestService.addGuestCategory(eventId, name, newSide)) as any;
      const cat: GuestCategory = {
        id: String(created?.id),
        name: String(created?.name || name),
        side: (String(created?.side || newSide) as Side) || newSide,
      };
      setCategories((prev) => [...prev, cat]);
      goToContacts(cat.id);
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || e?.details || 'לא ניתן להוסיף קטגוריה');
    } finally {
      setSaving(false);
    }
  };

  const nextLabel = mode === 'new' ? (saving ? 'שומר...' : 'הבא') : 'הבא';

  const isNextDisabled =
    saving ||
    (mode === 'existing' && !selectedCategory) ||
    (mode === 'new' && !newName.trim());

  const categoryTone = (c: GuestCategory) => {
    if (c.side === 'bride')
      return {
        accent: ACCENT_PINK,
        icon: ICON_PINK,
        soft: '#FDF2F8',
        blob: '#FCE7F3',
      };
    if (c.side === 'groom')
      return {
        accent: ACCENT_BLUE,
        icon: ICON_BLUE,
        soft: '#EFF6FF',
        blob: '#DBEAFE',
      };
    // deterministic fallback from name
    const palette = [
      { accent: '#A78BFA', icon: '#8B5CF6', soft: '#F5F3FF', blob: '#EDE9FE' }, // purple
      { accent: '#2DD4BF', icon: '#14B8A6', soft: '#F0FDFA', blob: '#CCFBF1' }, // teal
      { accent: '#FB7185', icon: '#F43F5E', soft: '#FFF1F2', blob: '#FFE4E6' }, // rose
      { accent: '#818CF8', icon: '#6366F1', soft: '#EEF2FF', blob: '#E0E7FF' }, // indigo
    ];
    const name = String(c?.name || '');
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  };

  const segIndicatorWidth = segWidth > 0 ? (segWidth - 12) / 2 : 0;
  const segIndicatorLeft = segWidth > 0 ? (mode === 'existing' ? segWidth / 2 : 6) : 0;

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Background gradient (like the HTML design) */}
      <LinearGradient
        // Keep this screen in premium LIGHT style (like the provided HTML mock).
        colors={['#F0F9FF', '#EEF2FF', '#FFF1F2']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ─── header ───────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: Math.max(14, insets.top + 10) }]}>
        <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>בחירת קטגוריה</Text>

        {/* כפתור הבא - View עוטף עם העיצוב (NativeWind דורס style על Pressable) */}
        <Pressable
          onPress={handleNext}
          disabled={isNextDisabled}
          accessibilityRole="button"
          accessibilityLabel="הבא"
          style={({ pressed }) => ({ opacity: !isNextDisabled && pressed ? 0.78 : 1 })}
        >
          <View style={[styles.headerNextBtn, isNextDisabled && styles.headerNextBtnDisabled]}>
            <Text style={styles.headerNextBtnText}>{saving ? 'שומר...' : 'הבא'}</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </View>
        </Pressable>

        {/* כפתור חזרה - View עוטף עם העיצוב (NativeWind דורס style על Pressable) */}
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
          style={({ pressed }) => ({ opacity: pressed ? 0.70 : 1 })}
        >
          <View style={styles.headerBackBtn}>
            <Ionicons name="chevron-back" size={16} color={NAVY} />
            <Text style={styles.headerBackBtnText}>חזרה</Text>
          </View>
        </Pressable>
      </View>

      {/* ─── segment ──────────────────────────────────── */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentWrap} onLayout={(e) => setSegWidth(e.nativeEvent.layout.width)}>
          <View
            style={[
              styles.segmentIndicator,
              segWidth > 0 && { width: segIndicatorWidth, left: segIndicatorLeft, opacity: 1 },
              segWidth <= 0 && { opacity: 0 },
            ]}
          />
          <Pressable style={styles.segmentBtn} onPress={() => setMode('existing')}>
            <Text
              style={[
                styles.segmentText,
                isDark && styles.segmentTextDark,
                mode === 'existing' && styles.segmentTextActive,
                mode === 'existing' && isDark && styles.segmentTextActiveDark,
              ]}
            >
              קטגוריה קיימת
            </Text>
          </Pressable>
          <Pressable style={styles.segmentBtn} onPress={() => setMode('new')}>
            <Text
              style={[
                styles.segmentText,
                isDark && styles.segmentTextDark,
                mode === 'new' && styles.segmentTextActive,
                mode === 'new' && isDark && styles.segmentTextActiveDark,
              ]}
            >
              קטגוריה חדשה
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ─── divider ──────────────────────────────────── */}
      <View style={styles.divider} />

      {/* ─── content ──────────────────────────────────── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.contentWrap}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={NAVY} />
            <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>טוען קטגוריות...</Text>
          </View>
        ) : mode === 'new' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.createScroll, { paddingBottom: bottomPadding + 24 }]}
          >
            {/* name field */}
            <Text style={[styles.fieldLabel, isDark && styles.fieldLabelDark]}>שם הקטגוריה</Text>
            <View style={[styles.inputWrap, isDark && styles.inputWrapDark]}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="למשל: חברים חתן"
                placeholderTextColor={isDark ? 'rgba(241,245,249,0.35)' : 'rgba(15,23,42,0.35)'}
                style={[styles.input, isDark && styles.inputDark]}
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => {}}
                autoFocus
              />
            </View>

            {enableSides ? (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 22 }, isDark && styles.fieldLabelDark]}>שייך לצד</Text>
                <View style={styles.sideRow}>
                  {([
                    { side: 'groom' as Side, label: 'חתן', icon: 'male' as const },
                    { side: 'bride' as Side, label: 'כלה', icon: 'female' as const },
                  ] as const).map((opt) => {
                    const active = newSide === opt.side;
                    const accent = opt.side === 'bride' ? ACCENT_PINK : ACCENT_BLUE;
                    const soft = opt.side === 'bride' ? 'rgba(236,72,153,0.10)' : 'rgba(59,130,246,0.10)';
                    return (
                      <Pressable
                        key={opt.side}
                        onPress={() => setNewSide(opt.side)}
                        style={({ pressed }) => [
                          styles.sidePill,
                          isDark && styles.sidePillDark,
                          active
                            ? [styles.sidePillActive, { backgroundColor: accent, borderColor: accent }]
                            : [styles.sidePillInactive, { backgroundColor: '#FFFFFF', borderColor: 'rgba(15,23,42,0.12)' }],
                          pressed && { opacity: 0.88 },
                        ]}
                      >
                        <View
                          style={[
                            styles.sidePillIconCircle,
                            active ? { backgroundColor: 'rgba(255,255,255,0.22)' } : { backgroundColor: soft },
                          ]}
                        >
                          <Ionicons name={opt.icon} size={18} color={active ? '#fff' : accent} style={undefined} />
                        </View>
                        <Text style={[styles.sidePillText, { color: accent }, active && { color: '#fff' }]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : (
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            style={styles.gridList}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={[
              styles.gridContent,
              { paddingBottom: bottomPadding + 24, paddingHorizontal: gridSidePad },
            ]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isSelected = selectedId === item.id;
              const iconName: keyof typeof Ionicons.glyphMap =
                !enableSides
                  ? 'people'
                  : item.side === 'groom'
                    ? 'male'
                    : item.side === 'bride'
                      ? 'female'
                      : 'ellipsis-horizontal';
              const tone = categoryTone(item);
              const count = guestCountByCategoryId[item.id] || 0;
              return (
                <View style={[styles.gridItem, { margin: gridGap / 2 }]}>
                  <Pressable
                    onPress={() => setSelectedId(item.id)}
                    style={({ pressed }) => [
                      styles.cardOuter,
                      isSelected ? styles.cardOuterSelected : styles.cardOuterUnselected,
                      pressed && { transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <View
                      style={[
                        styles.cardInner,
                        isSelected ? { borderColor: tone.accent } : { borderColor: 'transparent' },
                      ]}
                    >
                      {/* corner blob */}
                      <View style={[styles.cornerBlob, { backgroundColor: tone.blob }]} />

                      {/* Icon circle */}
                      <View style={[styles.cardIconCircle, { backgroundColor: tone.soft }]}>
                        <Ionicons name={iconName} size={36} color={tone.icon} />
                      </View>

                      <Text
                        style={[styles.cardText, isDark && styles.cardTextDark]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {item.name}
                      </Text>

                      <Text style={[styles.cardSubText, isDark && styles.cardSubTextDark]}>
                        {count} אורחים
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={[styles.emptyIconCircle, isDark && styles.emptyIconCircleDark]}>
                  <Ionicons
                    name="folder-open-outline"
                    size={36}
                    color={isDark ? 'rgba(241,245,249,0.35)' : 'rgba(15,23,42,0.28)'}
                  />
                </View>
                <Text style={[styles.emptyTitle, isDark && styles.emptyTitleDark]}>אין קטגוריות עדיין</Text>
                <Text style={[styles.emptySubtitle, isDark && styles.emptySubtitleDark]}>
                  עבור לכרטיסייה "קטגוריה חדשה" כדי ליצור אחת
                </Text>
              </View>
            }
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F9FF',
  },
  rootDark: {
    backgroundColor: '#0B1220',
  },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '900',
    color: BG_TEXT,
    letterSpacing: -0.2,
  },
  headerTitleDark: {
    color: TEXT_DARK,
  },
  /* כפתורי header - העיצוב על View (NativeWind דורס style על Pressable) */
  headerBackBtn: {
    flexDirection: ROW_REVERSE_DIR,
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    zIndex: 2,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(29,78,216,0.40)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 10px rgba(0,0,0,0.10)' } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.10,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 3,
        }),
  },
  headerBackBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: NAVY,
  },
  headerNextBtn: {
    flexDirection: ROW_REVERSE_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    zIndex: 2,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 3px 12px rgba(6,23,62,0.45)' } as any)
      : {
          shadowColor: colors.primary,
          shadowOpacity: 0.38,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 5 },
          elevation: 6,
        }),
  },
  headerNextBtnDisabled: {
    backgroundColor: '#94A3B8',
    borderColor: '#94A3B8',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: 'none' } as any)
      : { shadowOpacity: 0, elevation: 0 }),
  },
  headerNextBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  /* segment */
  segmentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
  segmentWrap: {
    height: 52,
    borderRadius: 16,
    padding: 6,
    flexDirection: ROW_DIR,
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.60)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.50)',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  segmentBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  segmentText: { fontSize: 14, fontWeight: '500', color: SUBTEXT },
  segmentTextActive: { fontWeight: '700', color: NAVY },
  segmentTextDark: { color: SUBTEXT_DARK },
  segmentTextActiveDark: { color: TEXT_DARK },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginHorizontal: 0,
  },

  /* content */
  contentWrap: { flex: 1, backgroundColor: 'transparent' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 30,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(15,23,42,0.55)',
  },
  loadingTextDark: {
    color: 'rgba(241,245,249,0.70)',
  },

  /* grid */
  gridList: { flex: 1 },
  gridContent: { paddingTop: 12 },
  gridRow: { flexDirection: ROW_DIR },
  gridItem: {
    flex: 1,
    minWidth: 0, // critical for web: allow shrink instead of sizing to content
  },
  cardOuter: {
    borderRadius: 24,
    width: '100%',
    aspectRatio: 1 / 1.15, // keep constant size; 2 cards always fit the row
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    backgroundColor: 'transparent',
  },
  cardOuterSelected: {
    shadowOpacity: 0.10,
    elevation: 6,
  },
  cardOuterUnselected: {},
  cardInner: {
    flex: 1,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  cornerBlob: {
    position: 'absolute',
    top: -32,
    right: -32,
    width: 96,
    height: 96,
    borderRadius: 48,
    opacity: 0.50,
  },
  cardIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    maxWidth: '100%',
    flexShrink: 1,
    lineHeight: 22,
  },
  cardTextDark: { color: TEXT_DARK },
  cardSubText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: '100%',
    flexShrink: 1,
    marginTop: 2,
  },
  cardSubTextDark: {
    color: 'rgba(148,163,184,0.90)',
  },

  /* empty */
  emptyWrap: {
    paddingTop: 50,
    paddingHorizontal: 30,
    alignItems: 'center',
    gap: 10,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(15,23,42,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyIconCircleDark: {
    backgroundColor: 'rgba(241,245,249,0.06)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptyTitleDark: {
    color: TEXT_DARK,
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.50)',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptySubtitleDark: {
    color: 'rgba(148,163,184,0.85)',
  },

  /* new-category form */
  createScroll: { paddingHorizontal: 20, paddingTop: 22 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: 'rgba(15,23,42,0.55)',
    textAlign: 'right',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  fieldLabelDark: {
    color: 'rgba(241,245,249,0.70)',
  },
  inputWrap: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: PRIMARY_BORDER,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 15 : 11,
    shadowColor: PRIMARY,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  inputWrapDark: {
    backgroundColor: 'rgba(30,41,59,0.72)',
    borderColor: 'rgba(255,255,255,0.10)',
    shadowOpacity: 0.06,
  },
  input: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  inputDark: {
    color: TEXT_DARK,
  },
  sideRow: { flexDirection: ROW_DIR, gap: 12 },
  sidePill: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 24px rgba(15,23,42,0.10)' } as any)
      : {
          shadowColor: '#0F172A',
          shadowOpacity: 0.10,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 3,
        }),
  },
  sidePillActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 28px rgba(29,78,216,0.30)' } as any)
      : { shadowOpacity: 0.18, elevation: 5 }),
  },
  sidePillInactive: {
    backgroundColor: '#fff',
    borderColor: BORDER_LIGHT,
  },
  sidePillDark: {
    backgroundColor: 'rgba(30,41,59,0.60)',
  },
  sidePillInactiveDark: {
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sidePillIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidePillText: {
    fontSize: 16,
    fontWeight: '900',
    color: PRIMARY,
  },

  // bottom bar removed (button moved to header)
});
