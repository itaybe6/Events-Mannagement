import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';

import { guestService } from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { useLayoutStore } from '@/store/layoutStore';
import { colors } from '@/constants/colors';
import { IS_RTL, ROW_DIR, ROW_REVERSE_DIR } from '@/lib/rtl';

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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [segWidth, setSegWidth] = useState(0);
  const scrollY = useMemo(() => new Animated.Value(0), []);

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
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 36],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const topSection = (
    <>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>
          {mode === 'new' ? 'יוצרים קטגוריה חדשה' : 'בוחרים קטגוריה וממשיכים לאנשי קשר'}
        </Text>
        <Text style={styles.heroSubtitle}>
          {mode === 'new'
            ? 'תן שם ברור לקטגוריה ובחר צד, ואז נעבור ישירות לייבוא אנשי הקשר.'
            : 'בחר קטגוריה קיימת מהרשימה כדי לשייך אליה במהירות את אנשי הקשר החדשים.'}
        </Text>
      </View>

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

      <View style={styles.divider} />
    </>
  );

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
      <LinearGradient
        colors={['rgba(255,255,255,0.78)', 'rgba(255,255,255,0)']}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.78, y: 0.48 }}
        style={styles.bgHighlight}
      />
      <LinearGradient
        colors={['rgba(244,114,182,0.12)', 'rgba(96,165,250,0.10)', 'rgba(255,255,255,0)']}
        start={{ x: 1, y: 0.1 }}
        end={{ x: 0.2, y: 0.8 }}
        style={styles.bgGlow}
      />

      {/* ─── header ───────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: Math.max(10, insets.top + 6) }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.stickyHeaderBg,
            {
              opacity: headerBgOpacity,
            },
          ]}
        />
        <View style={styles.headerSide}>
          <Pressable
            onPress={handleNext}
            disabled={isNextDisabled}
            accessibilityRole="button"
            accessibilityLabel="הבא"
            style={({ pressed }) => ({ opacity: !isNextDisabled && pressed ? 0.78 : 1 })}
          >
            <View style={[styles.headerNextBtnShell, isNextDisabled && styles.headerNextBtnShellDisabled]}>
              <LinearGradient
                colors={isNextDisabled ? ['#94A3B8', '#94A3B8'] : ['#0B1E4F', '#123A8C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerNextBtnBg}
              />
              <View style={styles.headerNextBtn}>
                <Ionicons name="chevron-forward" size={17} color="#fff" />
                <Text style={styles.headerNextBtnText}>{saving ? 'שומר...' : 'הבא'}</Text>
              </View>
            </View>
          </Pressable>
        </View>

        <View pointerEvents="none" style={styles.headerCenter}>
          <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>בחירת קטגוריה</Text>
        </View>

        <View style={[styles.headerSide, styles.headerSideEnd]}>
          {/* כפתור חזרה - View עוטף עם העיצוב (NativeWind דורס style על Pressable) */}
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            style={({ pressed }) => ({ opacity: pressed ? 0.70 : 1 })}
          >
            <View style={styles.headerBackBtn}>
              <Ionicons name="chevron-back" size={16} color={NAVY} />
            </View>
          </Pressable>
        </View>
      </View>

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
          <AppKeyboardAwareScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.createScroll, { paddingBottom: bottomPadding + 24 }]}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            enableResetScrollToCoords={false}
            scrollEnabled={keyboardVisible}
            onScroll={(event: any) => {
              scrollY.setValue(event?.nativeEvent?.contentOffset?.y ?? 0);
            }}
            scrollEventThrottle={16}
          >
            {topSection}
            <View style={styles.createCard}>
              {/* name field */}
              <Text style={[styles.fieldLabel, isDark && styles.fieldLabelDark]}>שם הקטגוריה</Text>
              <View style={[styles.inputWrap, isDark && styles.inputWrapDark]}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="למשל: חברים חתן"
                  placeholderTextColor={isDark ? 'rgba(241,245,249,0.35)' : 'rgba(15,23,42,0.35)'}
                  style={[styles.input, isDark && styles.inputDark]}
                  textAlign="right"
                  returnKeyType="done"
                  blurOnSubmit={false}
                  onSubmitEditing={() => {}}
                  autoFocus
                />
                <View style={styles.inputIcon}>
                  <Ionicons name="create-outline" size={18} color="#9CA3AF" />
                </View>
              </View>

              {enableSides ? (
                <View style={styles.sideSelector}>
                  <Text style={[styles.sideSelectorLabel, isDark && styles.fieldLabelDark]}>שייך לצד:</Text>
                  <View style={styles.sideButtons}>
                    <TouchableOpacity
                      onPress={() => setNewSide('groom')}
                      activeOpacity={0.92}
                      style={[
                        styles.sideButton,
                        newSide === 'groom' && styles.sideButtonActive,
                      ]}
                    >
                      <Ionicons
                        name="male"
                        size={20}
                        color={newSide === 'groom' ? colors.white : colors.primary}
                      />
                      <Text style={[styles.sideButtonText, newSide === 'groom' && styles.sideButtonTextActive]}>
                        חתן
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setNewSide('bride')}
                      activeOpacity={0.92}
                      style={[
                        styles.sideButton,
                        newSide === 'bride' && styles.sideButtonActive,
                      ]}
                    >
                      <Ionicons
                        name="female"
                        size={20}
                        color={newSide === 'bride' ? colors.white : colors.primary}
                      />
                      <Text style={[styles.sideButtonText, newSide === 'bride' && styles.sideButtonTextActive]}>
                        כלה
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <Pressable
                onPress={handleNext}
                disabled={isNextDisabled}
                accessibilityRole="button"
                accessibilityLabel="הוסף קטגוריה"
                style={({ pressed }) => [
                  styles.createSubmitOuter,
                  isNextDisabled && styles.createSubmitOuterDisabled,
                  pressed && !isNextDisabled && styles.createSubmitOuterPressed,
                ]}
              >
                <LinearGradient
                  colors={isNextDisabled ? ['#E2E8F0', '#CBD5E1'] : ['#0B1E4F', '#123A8C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.createSubmitBg}
                />
                <View style={[styles.createSubmitInner, isNextDisabled && styles.createSubmitInnerDisabled]}>
                  <Ionicons
                    name={isNextDisabled ? 'add-circle' : 'add-circle-outline'}
                    size={20}
                    color={isNextDisabled ? '#64748B' : '#fff'}
                  />
                  <Text style={[styles.createSubmitText, isNextDisabled && styles.createSubmitTextDisabled]}>
                    {saving ? 'מוסיף...' : 'הוסף קטגוריה'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </AppKeyboardAwareScrollView>
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
            ListHeaderComponent={topSection}
            onScroll={(event) => {
              scrollY.setValue(event.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={16}
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
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
  },
  bgGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  rootDark: {
    backgroundColor: '#0B1220',
  },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 4,
    backgroundColor: 'transparent',
    minHeight: 46,
    position: 'relative',
    zIndex: 20,
  },
  stickyHeaderBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(11,28,65,0.06)',
  },
  headerSide: {
    flex: 1,
    zIndex: 2,
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1.35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '900',
    color: BG_TEXT,
    letterSpacing: -0.2,
  },
  headerTitleDark: {
    color: TEXT_DARK,
  },
  /* כפתורי header - העיצוב על View (NativeWind דורס style על Pressable) */
  headerBackBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    zIndex: 2,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
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
  headerNextBtnShell: {
    zIndex: 2,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 6px 18px rgba(6,23,62,0.35)' } as any)
      : {
          shadowColor: '#0B1E4F',
          shadowOpacity: 0.24,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }),
  },
  headerNextBtnShellDisabled: {
    ...(Platform.OS === 'web'
      ? ({ boxShadow: 'none' } as any)
      : { shadowOpacity: 0.12, elevation: 2 }),
  },
  headerNextBtnBg: {
    ...StyleSheet.absoluteFillObject,
  },
  headerNextBtn: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 88,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  headerNextBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  /* segment */
  segmentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
  },
  segmentWrap: {
    height: 52,
    borderRadius: 18,
    padding: 6,
    flexDirection: ROW_DIR,
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
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
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: SUBTEXT,
    textAlign: 'center',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  segmentTextActive: { fontWeight: '700', color: NAVY },
  segmentTextDark: { color: SUBTEXT_DARK },
  segmentTextActiveDark: { color: TEXT_DARK },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginHorizontal: 0,
  },
  heroCard: {
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'stretch',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: BG_TEXT,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    alignSelf: 'stretch',
    width: '100%',
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: 'rgba(30,41,59,0.68)',
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    alignSelf: 'stretch',
    width: '100%',
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
  gridContent: { paddingTop: 6 },
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
  createScroll: { paddingHorizontal: 18, paddingTop: 18 },
  createCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(248,250,252,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.85)',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(100,116,139,0.95)',
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    marginBottom: 8,
  },
  fieldLabelDark: {
    color: 'rgba(241,245,249,0.70)',
  },
  fieldHint: {
    marginTop: -2,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: 'rgba(100,116,139,0.78)',
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  inputWrap: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    position: 'relative',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inputWrapDark: {
    backgroundColor: 'rgba(30,41,59,0.72)',
    borderColor: 'rgba(255,255,255,0.10)',
    shadowOpacity: 0.06,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingEnd: 34,
    paddingStart: 10,
    paddingVertical: 0,
  },
  inputDark: {
    color: TEXT_DARK,
  },
  inputIcon: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideSelector: {
    width: '100%',
    marginTop: 20,
    marginBottom: 4,
  },
  sideSelectorLabel: {
    fontSize: 15,
    color: colors.text,
    marginBottom: 8,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    fontWeight: '700',
  },
  sideButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 4,
    gap: 8,
  },
  sideButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.18)',
  },
  sideButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sideButtonPressed: {
    opacity: 0.92,
  },
  sideButtonText: {
    marginStart: 8,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  sideButtonTextActive: {
    color: colors.white,
  },
  createSubmitOuter: {
    marginTop: 24,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.14)',
    backgroundColor: '#0B1E4F',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 28px rgba(11,30,79,0.22)' } as any)
      : {
          shadowColor: '#0B1E4F',
          shadowOpacity: 0.20,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 5,
        }),
  },
  createSubmitOuterDisabled: {
    borderColor: 'rgba(148,163,184,0.28)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: 'none' } as any)
      : { shadowOpacity: 0.08, elevation: 2 }),
  },
  createSubmitOuterPressed: {
    transform: [{ scale: 0.99 }],
  },
  createSubmitBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
  },
  createSubmitInner: {
    minHeight: 56,
    paddingHorizontal: 18,
    flexDirection: ROW_REVERSE_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createSubmitInnerDisabled: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  createSubmitText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  createSubmitTextDisabled: {
    color: '#64748B',
  },

  // bottom bar removed (button moved to header)
});
