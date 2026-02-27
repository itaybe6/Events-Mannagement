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
import { BlurView } from 'expo-blur';

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

export default function SelectCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTabBarVisible = useLayoutStore((s) => s.setTabBarVisible);
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

  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

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

  const gridGap = 12;
  const colPad = 20;
  const gridWidth = windowWidth - colPad * 2;
  const cardWidth = Math.max(150, Math.floor((gridWidth - gridGap) / 2));
  const cardHeight = Math.round(cardWidth / 0.8); // aspect 4/5 => width/height = 0.8

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

  const isNextDisabled =
    saving ||
    (mode === 'existing' && !selectedCategory) ||
    (mode === 'new' && !newName.trim());

  const categoryTone = (c: GuestCategory) => {
    if (c.side === 'bride') return { main: ACCENT_PINK, soft: 'rgba(244,114,182,0.14)', blob: 'rgba(244,114,182,0.22)' };
    if (c.side === 'groom') return { main: ACCENT_BLUE, soft: 'rgba(96,165,250,0.14)', blob: 'rgba(96,165,250,0.22)' };
    // deterministic fallback from name
    const palette = [
      { main: '#A78BFA', soft: 'rgba(167,139,250,0.14)', blob: 'rgba(167,139,250,0.22)' }, // purple
      { main: '#22C55E', soft: 'rgba(34,197,94,0.14)', blob: 'rgba(34,197,94,0.22)' }, // green
      { main: '#FB7185', soft: 'rgba(251,113,133,0.14)', blob: 'rgba(251,113,133,0.22)' }, // rose
      { main: '#6366F1', soft: 'rgba(99,102,241,0.14)', blob: 'rgba(99,102,241,0.22)' }, // indigo
      { main: '#14B8A6', soft: 'rgba(20,184,166,0.14)', blob: 'rgba(20,184,166,0.22)' }, // teal
    ];
    const name = String(c?.name || '');
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Background gradient (like the HTML design) */}
      <LinearGradient
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
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="chevron-back" size={20} color={SUBTEXT} />
          <Text style={styles.backBtnText}>חזרה</Text>
        </Pressable>

        <Text style={styles.headerTitle}>בחירת קטגוריה</Text>

        {/* spacer to center title */}
        <View style={styles.headerSpacer} />
      </View>

      {/* ─── segment ──────────────────────────────────── */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentGlass}>
          <BlurView intensity={14} tint="light" style={StyleSheet.absoluteFillObject} />
        </View>
        <View style={styles.segmentWrap}>
          <View
            style={[
              styles.segmentIndicator,
              mode === 'existing' ? styles.segmentIndicatorRight : styles.segmentIndicatorLeft,
            ]}
          />
          <Pressable style={styles.segmentBtn} onPress={() => setMode('existing')}>
            <Text style={[styles.segmentText, mode === 'existing' && styles.segmentTextActive]}>
              קטגוריה קיימת
            </Text>
          </Pressable>
          <Pressable style={styles.segmentBtn} onPress={() => setMode('new')}>
            <Text style={[styles.segmentText, mode === 'new' && styles.segmentTextActive]}>
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
          contentContainerStyle={styles.chipsRow}
        >
          {chips.map((chip) => {
            const active = filter === chip.key;
            const chipIconColor =
              chip.key === 'bride' ? ACCENT_PINK : chip.key === 'groom' ? ACCENT_BLUE : active ? '#fff' : SUBTEXT;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                style={({ pressed }) => [
                  styles.chip,
                  active ? styles.chipActive : styles.chipInactive,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons
                  name={chip.icon}
                  size={15}
                  color={chipIconColor}
                  style={{ marginLeft: 6 }}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
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
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.loadingText}>טוען קטגוריות...</Text>
          </View>
        ) : mode === 'new' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.createScroll, { paddingBottom: bottomPadding + 90 }]}
          >
            {/* name field */}
            <Text style={styles.fieldLabel}>שם הקטגוריה</Text>
            <View style={styles.inputWrap}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="למשל: חברים חתן"
                placeholderTextColor="rgba(15,23,42,0.35)"
                style={styles.input}
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => {}}
                autoFocus
              />
            </View>

            {enableSides ? (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 22 }]}>שייך לצד</Text>
                <View style={styles.sideRow}>
                  {([
                    { side: 'groom' as Side, label: 'חתן', icon: 'male' as const },
                    { side: 'bride' as Side, label: 'כלה', icon: 'female' as const },
                  ] as const).map((opt) => {
                    const active = newSide === opt.side;
                    return (
                      <Pressable
                        key={opt.side}
                        onPress={() => setNewSide(opt.side)}
                        style={({ pressed }) => [
                          styles.sidePill,
                          active ? styles.sidePillActive : styles.sidePillInactive,
                          pressed && { opacity: 0.88 },
                        ]}
                      >
                        <Ionicons
                          name={opt.icon}
                          size={18}
                          color={active ? '#fff' : PRIMARY}
                          style={{ marginLeft: 8 }}
                        />
                        <Text style={[styles.sidePillText, active && { color: '#fff' }]}>
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
            columnWrapperStyle={[styles.gridRow, { gap: gridGap }]}
            contentContainerStyle={[
              styles.gridContent,
              { paddingBottom: bottomPadding + 90, paddingHorizontal: colPad },
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
                    styles.card,
                    { width: cardWidth, height: cardHeight },
                    isSelected ? styles.cardActive : styles.cardInactive,
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  {/* corner blob */}
                  <View style={[styles.cornerBlob, { backgroundColor: tone.blob }]} />

                  <View
                    style={[
                      styles.cardIconWrap,
                      isSelected ? styles.cardIconWrapActive : styles.cardIconWrapInactive,
                      { backgroundColor: isSelected ? 'rgba(255,255,255,0.22)' : tone.soft },
                    ]}
                  >
                    <Ionicons
                      name={iconName}
                      size={32}
                      color={isSelected ? '#fff' : tone.main}
                    />
                  </View>

                  <Text
                    style={[styles.cardText, isSelected && styles.cardTextActive]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>

                  <Text style={[styles.cardSubText, isSelected && { color: 'rgba(255,255,255,0.80)' }]}>
                    {count} אורחים
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="folder-open-outline" size={36} color="rgba(15,23,42,0.28)" />
                </View>
                <Text style={styles.emptyTitle}>אין קטגוריות עדיין</Text>
                <Text style={styles.emptySubtitle}>עבור לכרטיסייה "קטגוריה חדשה" כדי ליצור אחת</Text>
              </View>
            }
          />
        )}
      </KeyboardAvoidingView>

      {/* ─── bottom action bar ────────────────────────── */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(248,250,252,0)', 'rgba(248,250,252,0.85)', '#FFFFFF']}
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.bottomGradient, { paddingBottom: bottomPadding }]}
          pointerEvents="none"
        />
        <View style={[styles.bottomButtonWrap, { paddingBottom: bottomPadding }]} pointerEvents="box-none">
          <Pressable
            onPress={handleNext}
            disabled={isNextDisabled}
            style={({ pressed }) => [
              styles.nextBtnPremium,
              isNextDisabled && styles.nextBtnPremiumDisabled,
              !isNextDisabled && pressed && { transform: [{ scale: 0.985 }] },
            ]}
          >
            {!isNextDisabled ? (
              <LinearGradient
                colors={[NAVY, '#1E293B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
            ) : null}
            <Text style={[styles.nextBtnPremiumText, isNextDisabled && styles.nextBtnPremiumTextDisabled]}>
              {mode === 'new' ? (saving ? 'שומר...' : 'הבא') : 'הבא'}
            </Text>
            <Ionicons
              name="arrow-back"
              size={20}
              color={isNextDisabled ? 'rgba(255,255,255,0.80)' : '#fff'}
              style={{ marginLeft: 10 }}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    color: BG_TEXT,
    letterSpacing: -0.2,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 6,
    zIndex: 2,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: SUBTEXT,
  },
  headerSpacer: {
    width: 76,
    zIndex: 2,
  },

  /* segment */
  segmentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 6,
  },
  segmentGlass: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.60)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    position: 'absolute',
    left: 20,
    right: 20,
    top: 6,
    bottom: 10,
  },
  segmentWrap: {
    height: 52,
    borderRadius: 18,
    padding: 6,
    flexDirection: 'row-reverse',
    position: 'relative',
    overflow: 'hidden',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    width: '50%',
    borderRadius: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  segmentIndicatorRight: { right: 4 },
  segmentIndicatorLeft: { left: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  segmentText: { fontSize: 13, fontWeight: '800', color: SUBTEXT },
  segmentTextActive: { fontWeight: '900', color: NAVY },

  /* chips */
  chipsRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
    paddingTop: 6,
  },
  chip: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  chipActive: {
    backgroundColor: NAVY,
    borderColor: 'rgba(15,23,42,0.18)',
  },
  chipInactive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(148,163,184,0.25)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '900',
    color: SUBTEXT,
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

  /* grid */
  gridContent: { paddingTop: 12 },
  gridRow: { marginBottom: 16, justifyContent: 'space-between' },
  card: {
    borderRadius: 26,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: 'hidden',
  },
  cardActive: {
    backgroundColor: '#fff',
    borderColor: 'rgba(15,23,42,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardInactive: {
    backgroundColor: '#fff',
    borderColor: 'rgba(15,23,42,0.06)',
  },
  cornerBlob: {
    position: 'absolute',
    top: -32,
    right: -32,
    width: 110,
    height: 110,
    borderBottomLeftRadius: 999,
    opacity: 0.55,
  },
  cardIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapActive: { },
  cardIconWrapInactive: { },
  cardText: {
    fontSize: 16,
    fontWeight: '900',
    color: BG_TEXT,
    textAlign: 'center',
    lineHeight: 20,
  },
  cardTextActive: { color: BG_TEXT },
  cardSubText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(100,116,139,0.85)',
    textAlign: 'center',
    marginTop: 2,
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.50)',
    textAlign: 'center',
    lineHeight: 20,
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
  input: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
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
    borderColor: PRIMARY_BORDER,
  },
  sidePillText: {
    fontSize: 15,
    fontWeight: '900',
    color: PRIMARY,
  },

  /* bottom bar */
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 128,
    justifyContent: 'flex-end',
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  bottomButtonWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
  },
  nextBtnPremium: {
    width: '100%',
    maxWidth: 420,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 10,
    backgroundColor: NAVY,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
    overflow: 'hidden',
  },
  nextBtnPremiumDisabled: {
    backgroundColor: 'rgba(15,23,42,0.55)',
    shadowOpacity: 0.08,
  },
  nextBtnPremiumText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.2,
  },
  nextBtnPremiumTextDisabled: {
    color: 'rgba(255,255,255,0.80)',
  },
});
