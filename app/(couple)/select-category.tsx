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

type Side = 'groom' | 'bride';
type SideFilter = 'all' | Side | 'other';
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
  const [filter, setFilter] = useState<SideFilter>('all');
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
    if (!enableSides) { setFilter('all'); setNewSide('groom'); }
  }, [enableSides]);

  const chips: Array<{ key: SideFilter; label: string; icon: keyof typeof Ionicons.glyphMap }> = useMemo(() => {
    if (!enableSides) return [{ key: 'all', label: 'הכל', icon: 'people' }];
    return [
      { key: 'all', label: 'הכל', icon: 'people' },
      { key: 'groom', label: 'חתן', icon: 'male' },
      { key: 'bride', label: 'כלה', icon: 'female' },
      { key: 'other', label: 'אחרים', icon: 'ellipsis-horizontal' },
    ];
  }, [enableSides]);

  const filteredCategories = useMemo(() => {
    if (!enableSides || filter === 'all') return categories;
    if (filter === 'other') return [];
    return categories.filter((c) => c.side === filter);
  }, [categories, enableSides, filter]);

  const selectedCategory = useMemo(() => {
    if (!selectedId) return null;
    return categories.find((c) => c.id === selectedId) ?? null;
  }, [categories, selectedId]);

  const bottomPadding = Math.max(20, insets.bottom + 16);

  const gridGap = 14;
  const colPad = 16;
  const gridWidth = windowWidth - colPad * 2;
  const cardWidth = Math.floor((gridWidth - gridGap) / 2);
  const cardHeight = Math.round(cardWidth * 1.15); // slightly taller than square

  const goBack = () => {
    const canGoBackFn = (router as any)?.canGoBack;
    if (typeof canGoBackFn === 'function' && canGoBackFn()) router.back();
    else router.replace('/(couple)/guests');
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
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.70 }]}
        >
          <Ionicons name="chevron-back" size={16} color={NAVY} />
          <Text style={[styles.backBtnText, isDark && styles.backBtnTextDark]}>חזרה</Text>
        </Pressable>

        <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>בחירת קטגוריה</Text>

        <Pressable
          onPress={handleNext}
          disabled={isNextDisabled}
          accessibilityRole="button"
          accessibilityLabel="הבא"
          style={({ pressed }) => [
            styles.nextTopBtn,
            isNextDisabled && styles.nextTopBtnDisabled,
            !isNextDisabled && pressed && { opacity: 0.78 },
          ]}
        >
          <View style={styles.nextTopBtnContent}>
            <Text style={[styles.nextTopBtnText, isNextDisabled && styles.nextTopBtnTextDisabled]}>
              {saving ? 'שומר...' : 'הבא'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
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

      {/* ─── chips ────────────────────────────────────── */}
      {mode === 'existing' && enableSides ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
          contentInsetAdjustmentBehavior="never"
        >
          {chips.map((chip) => {
            const active = filter === chip.key;
            const chipIconColor = (() => {
              if (chip.key === 'groom') return active ? '#FFFFFF' : ACCENT_BLUE;
              if (chip.key === 'bride') return active ? '#FFFFFF' : ACCENT_PINK;
              if (chip.key === 'all') return active ? '#FFFFFF' : SUBTEXT;
              return active ? '#FFFFFF' : SUBTEXT;
            })();
            const isOther = chip.key === 'other';
            return (
              <Pressable
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                style={({ pressed }) => [
                  styles.chip,
                  isOther && styles.chipOther,
                  active ? styles.chipActive : isDark ? styles.chipInactiveDark : styles.chipInactive,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons
                  name={chip.icon}
                  size={isOther ? 22 : 18}
                  color={chipIconColor}
                  style={isOther ? undefined : { marginLeft: 8 }}
                />
                {isOther ? null : (
                  <Text style={[styles.chipText, isDark && styles.chipTextDark, active && styles.chipTextActive]}>
                    {chip.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

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
                    return (
                      <Pressable
                        key={opt.side}
                        onPress={() => setNewSide(opt.side)}
                        style={({ pressed }) => [
                          styles.sidePill,
                          isDark && styles.sidePillDark,
                          active
                            ? [styles.sidePillActive, { backgroundColor: accent, borderColor: accent }]
                            : [styles.sidePillInactive, isDark && styles.sidePillInactiveDark],
                          pressed && { opacity: 0.88 },
                        ]}
                      >
                        <Ionicons
                          name={opt.icon}
                          size={18}
                          color={active ? '#fff' : accent}
                          style={{ marginLeft: 8 }}
                        />
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
            data={filteredCategories}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            style={styles.gridList}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={[
              styles.gridContent,
              { paddingBottom: bottomPadding + 24, paddingHorizontal: colPad },
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
                <Pressable
                  onPress={() => setSelectedId(item.id)}
                  style={({ pressed }) => [
                    styles.cardOuter,
                    { width: cardWidth, height: cardHeight },
                    isSelected ? styles.cardOuterSelected : styles.cardOuterUnselected,
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <View
                    style={[
                      styles.cardInner,
                      isSelected
                        ? { borderColor: tone.accent }
                        : { borderColor: 'transparent' },
                    ]}
                  >
                    {/* corner blob */}
                    <View style={[styles.cornerBlob, { backgroundColor: tone.blob }]} />

                    {/* Icon circle */}
                    <View style={[styles.cardIconCircle, { backgroundColor: tone.soft }]}>
                      <Ionicons name={iconName} size={36} color={tone.icon} />
                    </View>

                    <Text style={[styles.cardText, isDark && styles.cardTextDark]} numberOfLines={2}>
                      {item.name}
                    </Text>

                    <Text style={[styles.cardSubText, isDark && styles.cardSubTextDark]}>
                      {count} אורחים
                    </Text>
                  </View>
                </Pressable>
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    zIndex: 2,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
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
  backBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: NAVY,
  },
  backBtnTextDark: {
    color: TEXT_DARK,
  },
  nextTopBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    borderWidth: 1.5,
    borderColor: '#1E40AF',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 3px 12px rgba(29,78,216,0.40)' } as any)
      : {
          shadowColor: PRIMARY,
          shadowOpacity: 0.38,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 5 },
          elevation: 6,
        }),
  },
  nextTopBtnDisabled: {
    backgroundColor: '#94A3B8',
    borderColor: '#94A3B8',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: 'none' } as any)
      : { shadowOpacity: 0, elevation: 0 }),
  },
  nextTopBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextTopBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  nextTopBtnTextDisabled: {
    color: 'rgba(255,255,255,0.80)',
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
    flexDirection: 'row-reverse',
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

  /* chips */
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 70,
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 20,
    paddingBottom: 16,
    marginBottom: 8,
    gap: 12,
    paddingTop: 10,
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: BORDER_LIGHT,
  },
  chipOther: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: NAVY,
    borderColor: 'rgba(15,23,42,0.12)',
    shadowColor: 'rgba(15,23,42,1)',
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  chipInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: BORDER_LIGHT,
  },
  chipInactiveDark: {
    backgroundColor: 'rgba(30,41,59,0.70)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: SUBTEXT,
  },
  chipTextDark: {
    color: SUBTEXT_DARK,
  },
  chipTextActive: { color: '#fff' },

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
  gridRow: { marginBottom: 14, gap: 14 },
  cardOuter: {
    borderRadius: 24,
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
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 52,
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
    lineHeight: 22,
  },
  cardTextDark: { color: TEXT_DARK },
  cardSubText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: 'center',
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
  sideRow: { flexDirection: 'row-reverse', gap: 12 },
  sidePill: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sidePillActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
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
  sidePillText: {
    fontSize: 15,
    fontWeight: '900',
    color: PRIMARY,
  },

  // bottom bar removed (button moved to header)
});
