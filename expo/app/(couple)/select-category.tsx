import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLoader, AppLoaderScreen } from '@/components/AppLoader';
import { guestService } from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { useLayoutStore } from '@/store/layoutStore';
import { IS_RTL, ROW_DIR, TEXT_RIGHT, rtlText } from '@/lib/rtl';

type Side = 'groom' | 'bride';
type SideFilter = 'all' | Side;

type GuestCategory = {
  id: string;
  name: string;
  side: Side;
};

type CategoryStats = {
  invites: number;
  people: number;
};

const NAVY = '#1E3A6E';
const NAVY_DEEP = '#16294F';
const NAVY_TINT = '#F3F6FC';
const NAVY_SOFT = 'rgba(30,58,110,0.10)';

const PINK = '#F0708A';
const PINK_DEEP = '#C94F61';
const PINK_TINT = '#FFF5F7';
const PINK_SOFT = '#FDE9ED';

const BG = '#F6F7FB';
const SURFACE = '#FFFFFF';
const TEXT = '#141B33';
const DIM = '#6B7288';
const FAINT = '#A2A7B8';
const LINE = 'rgba(20,27,51,0.08)';
const OFF_BG = '#E4E7EF';
const OFF_TEXT = '#767D93';

type SideTheme = {
  label: string;
  accent: string;
  accentDeep: string;
  tint: string;
  soft: string;
  badgeBg: string;
  badgeText: string;
};

function sideMeta(side: Side | string, enableSides: boolean): SideTheme {
  if (enableSides && side === 'bride') {
    return {
      label: 'צד כלה',
      accent: PINK,
      accentDeep: PINK_DEEP,
      tint: PINK_TINT,
      soft: PINK_SOFT,
      badgeBg: PINK_SOFT,
      badgeText: PINK_DEEP,
    };
  }
  if (enableSides && side === 'groom') {
    return {
      label: 'צד חתן',
      accent: NAVY,
      accentDeep: NAVY_DEEP,
      tint: NAVY_TINT,
      soft: NAVY_SOFT,
      badgeBg: NAVY_SOFT,
      badgeText: NAVY,
    };
  }
  return {
    label: 'כללי',
    accent: NAVY,
    accentDeep: NAVY_DEEP,
    tint: NAVY_TINT,
    soft: NAVY_SOFT,
    badgeBg: 'rgba(20,27,51,0.06)',
    badgeText: DIM,
  };
}

function buildCategoryStats(guests: any[]): Record<string, CategoryStats> {
  const stats: Record<string, CategoryStats> = {};
  for (const g of guests || []) {
    const cid = String((g as any)?.category_id ?? '').trim();
    if (!cid) continue;
    if (!stats[cid]) stats[cid] = { invites: 0, people: 0 };
    stats[cid].invites += 1;
    if (String((g as any)?.status ?? '') !== 'לא מגיע') {
      stats[cid].people += Number((g as any)?.numberOfPeople ?? 1) || 1;
    }
  }
  return stats;
}

export default function SelectCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTabBarVisible = useLayoutStore((s) => s.setTabBarVisible);
  const params = useLocalSearchParams<{ eventId?: string; categoryId?: string }>();
  const nameInputRef = useRef<TextInput>(null);

  const eventId = useMemo(() => String(params.eventId || '').trim(), [params.eventId]);
  const initialCategoryId = useMemo(() => String(params.categoryId || '').trim(), [params.categoryId]);

  const [loading, setLoading] = useState(true);
  const [enableSides, setEnableSides] = useState(true);
  const [categories, setCategories] = useState<GuestCategory[]>([]);
  const [categoryStats, setCategoryStats] = useState<Record<string, CategoryStats>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
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
    setTabBarVisible(false);
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]);

  useEffect(() => {
    const load = async () => {
      if (!eventId) {
        setLoading(false);
        return;
      }
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
          ['חתונה', 'חינה', 'בר מצווה', 'בת מצווה', 'ברית', 'אירוע חברה'].find(
            (et) => title.startsWith(et) || title.includes(et)
          ) || null;

        const normalized: GuestCategory[] = (catsRaw || []).map((c: any) => ({
          id: String(c.id),
          name: String(c.name || ''),
          side: (String(c.side || 'groom') as Side) || 'groom',
        }));

        // The event already uses both sides in its data, so it clearly is a
        // groom/bride event even when the title doesn't say so.
        const dataUsesSides = normalized.some((c) => c.side === 'bride');
        const shouldEnable =
          !!groom || !!bride || dataUsesSides
            ? true
            : inferredType && inferredType !== 'חתונה'
              ? false
              : true;
        setEnableSides(shouldEnable);
        setCategories(normalized);
        setCategoryStats(buildCategoryStats(guestsRaw || []));
        setSelectedId(initialCategoryId || (normalized[0]?.id ?? null));
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
    if (!enableSides) setSideFilter('all');
  }, [enableSides]);

  const visibleCategories = useMemo(() => {
    if (!enableSides || sideFilter === 'all') return categories;
    return categories.filter((c) => c.side === sideFilter);
  }, [categories, enableSides, sideFilter]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedId) ?? null,
    [categories, selectedId]
  );

  const bottomPadding = Math.max(18, insets.bottom + 12);
  const canSubmitNew = newName.trim().length >= 2 && !saving;
  const canContinue = !!selectedId && !saving;
  const createTheme = sideMeta(newSide, true);

  const goBack = () => {
    router.replace({ pathname: '/(couple)/guests', params: eventId ? { eventId } : undefined });
  };

  const goToContacts = (catId: string) => {
    try {
      router.push({ pathname: '/contacts-list', params: { eventId, categoryId: catId } });
    } catch (e) {
      console.error('SelectCategory navigation error:', e);
      Alert.alert('שגיאה', 'לא ניתן לפתוח את רשימת אנשי הקשר');
    }
  };

  const openCreate = () => {
    setNewName('');
    setNewSide(sideFilter === 'bride' ? 'bride' : 'groom');
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (saving) return;
    setCreateOpen(false);
    setNewName('');
  };

  const createCategory = async () => {
    const name = newName.trim();
    if (saving) return;
    if (!eventId) {
      Alert.alert('שגיאה', 'לא נמצא מזהה אירוע');
      return;
    }
    if (name.length < 2) {
      Alert.alert('שם הקטגוריה', 'הזינו שם באורך 2 תווים לפחות');
      return;
    }
    setSaving(true);
    try {
      const created = (await guestService.addGuestCategory(eventId, name, newSide)) as any;
      const cat: GuestCategory = {
        id: String(created?.id),
        name: String(created?.name || name),
        side: (String(created?.side || newSide) as Side) || newSide,
      };
      setCategories((prev) => [...prev, cat]);
      setSelectedId(cat.id);
      setCreateOpen(false);
      setNewName('');
      // Let the modal finish unmounting before navigating (Android drops
      // navigation that happens while a modal is still on screen).
      setTimeout(() => goToContacts(cat.id), 120);
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || e?.details || 'לא ניתן להוסיף קטגוריה');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = () => {
    if (saving) return;
    if (!eventId) {
      Alert.alert('שגיאה', 'לא נמצא מזהה אירוע');
      return;
    }
    if (!selectedId) {
      Alert.alert('בחירת קטגוריה', 'בחרו קטגוריה כדי להמשיך');
      return;
    }
    goToContacts(selectedId);
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppLoaderScreen variant="categories" />
      </View>
    );
  }

  const renderCategory = (item: GuestCategory) => {
    const isSelected = selectedId === item.id;
    const meta = sideMeta(item.side, enableSides);
    const st = categoryStats[item.id] || { invites: 0, people: 0 };

    return (
      <View key={item.id} style={styles.cardOuter}>
        <Pressable
          onPress={() => setSelectedId(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`קטגוריה ${item.name}`}
          style={styles.cardPress}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.card,
                isSelected && {
                  borderColor: meta.accent,
                  backgroundColor: meta.tint,
                  shadowColor: meta.accent,
                  shadowOpacity: 0.16,
                },
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.cardMain}>
                {isSelected ? (
                  <LinearGradient
                    colors={[meta.accent, meta.accentDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.medallion}
                  >
                    <Text style={styles.medallionValueOn}>{st.invites}</Text>
                    <Text style={styles.medallionLabelOn}>הזמנות</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.medallion, { backgroundColor: meta.soft }]}>
                    <Text style={[styles.medallionValue, { color: meta.accent }]}>{st.invites}</Text>
                    <Text style={[styles.medallionLabel, { color: meta.accent }]}>הזמנות</Text>
                  </View>
                )}

                <View style={styles.cardText}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.sideBadge, { backgroundColor: meta.badgeBg }]}>
                      <Text style={[styles.sideBadgeText, { color: meta.badgeText }]}>{meta.label}</Text>
                    </View>
                  </View>

                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {st.invites > 0 ? `${st.people} אורחים` : 'אין מוזמנים עדיין'}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.checkCircle,
                  isSelected && { backgroundColor: meta.accent, borderColor: meta.accent },
                ]}
              >
                {isSelected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
              </View>
            </View>
          )}
        </Pressable>
      </View>
    );
  };

  const chips: Array<{ key: SideFilter; label: string }> = [
    { key: 'all', label: 'הכל' },
    { key: 'groom', label: 'צד חתן' },
    { key: 'bride', label: 'צד כלה' },
  ];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppLoader visible={saving} variant="adding" title="יוצר קטגוריה" subtitle="שומר את הקטגוריה החדשה" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(12, insets.top + 8) }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressedSoft]}
          >
            <Ionicons name="chevron-forward" size={20} color={TEXT} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {rtlText('ייבוא מאנשי קשר')}
            </Text>
            <Text style={styles.headerStep}>{rtlText('שלב 1 מתוך 2')}</Text>
          </View>

          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="סגירה"
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressedSoft]}
          >
            <Ionicons name="close" size={19} color={DIM} />
          </Pressable>
        </View>

        <View style={styles.progressRow}>
          <View style={[styles.progressSegment, styles.progressSegmentOn]} />
          <View style={styles.progressSegment} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.introTitle}>{rtlText('לאיזו קטגוריה?')}</Text>
          <Text style={styles.introText}>
            {rtlText('בחרו שיוך למוזמנים שתייבאו, או צרו קטגוריה חדשה')}
          </Text>
        </View>

        {enableSides && categories.length > 1 ? (
          <View style={styles.chipsRow}>
            {chips.map((chip) => {
              const on = sideFilter === chip.key;
              return (
                <Pressable
                  key={chip.key}
                  onPress={() => setSideFilter(chip.key)}
                  style={({ pressed }) => [
                    styles.chip,
                    on && styles.chipOn,
                    pressed && styles.pressedSoft,
                  ]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {visibleCategories.length > 0 ? (
          visibleCategories.map(renderCategory)
        ) : (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="folder-open-outline" size={30} color={NAVY} />
            </View>
            <Text style={styles.emptyTitle}>
              {categories.length > 0 ? 'אין קטגוריות בצד הזה' : 'אין קטגוריות עדיין'}
            </Text>
            <Text style={styles.emptyText}>
              {categories.length > 0
                ? 'בחרו צד אחר או צרו קטגוריה חדשה'
                : 'צרו קטגוריה ראשונה כדי לשייך אליה את אנשי הקשר'}
            </Text>
          </View>
        )}

        <View style={styles.cardOuter}>
          <Pressable
            onPress={openCreate}
            accessibilityRole="button"
            accessibilityLabel="קטגוריה חדשה"
            style={({ pressed }) => [styles.addCard, pressed && styles.cardPressed]}
          >
            <View style={styles.cardMain}>
              <View style={styles.addIcon}>
                <Ionicons name="add" size={24} color={NAVY} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.addTitle}>קטגוריה חדשה</Text>
                <Text style={styles.addHint}>הוסיפו קבוצה משלכם</Text>
              </View>
            </View>
            <Ionicons name={IS_RTL ? 'chevron-forward' : 'chevron-back'} size={18} color={FAINT} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Bottom action */}
      <View style={[styles.bottomBar, { paddingBottom: bottomPadding }]}>
        {selectedCategory ? (
          <Text style={styles.bottomHint} numberOfLines={1}>
            {rtlText(`הקטגוריה שנבחרה: ${selectedCategory.name}`)}
          </Text>
        ) : (
          <Text style={styles.bottomHint}>{rtlText('בחרו קטגוריה כדי להמשיך')}</Text>
        )}

        <Pressable
          onPress={handleContinue}
          disabled={saving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="המשך לבחירת אנשי קשר"
          style={styles.primaryBtnOuter}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.primaryBtnInner,
                !canContinue && styles.btnInnerOff,
                pressed && canContinue && styles.pressedScale,
              ]}
            >
              {canContinue ? (
                <LinearGradient
                  colors={[NAVY, NAVY_DEEP]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : null}
              <View style={styles.btnContent}>
                <Text style={[styles.btnText, !canContinue && styles.btnTextOff]}>
                  המשך לבחירת אנשי קשר
                </Text>
                <Ionicons
                  name={IS_RTL ? 'arrow-forward' : 'arrow-back'}
                  size={18}
                  color={canContinue ? '#fff' : OFF_TEXT}
                />
              </View>
            </View>
          )}
        </Pressable>
      </View>

      {/* Create category modal */}
      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeCreate}
        onShow={() => {
          setTimeout(() => nameInputRef.current?.focus(), 140);
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCreate} />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
            pointerEvents="box-none"
          >
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalIcon, { backgroundColor: createTheme.soft }]}>
                    <Ionicons name="folder-open-outline" size={22} color={createTheme.accent} />
                  </View>
                  <View style={styles.modalHeaderText}>
                    <Text style={styles.modalTitle}>{rtlText('קטגוריה חדשה')}</Text>
                    <Text style={styles.modalSubtitle}>
                      {rtlText('תנו שם ושייכו לצד המתאים')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={closeCreate}
                    accessibilityRole="button"
                    accessibilityLabel="סגירה"
                    style={({ pressed }) => [styles.modalClose, pressed && styles.pressedSoft]}
                  >
                    <Ionicons name="close" size={18} color={DIM} />
                  </Pressable>
                </View>

                <Text style={styles.fieldLabel}>{rtlText('שם הקטגוריה')}</Text>
                <View style={[styles.inputWrap, newName.trim().length >= 2 && { borderColor: createTheme.accent }]}>
                  <TextInput
                    ref={nameInputRef}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="למשל: משפחת כלה"
                    placeholderTextColor={FAINT}
                    style={styles.input}
                    textAlign={TEXT_RIGHT}
                    returnKeyType="done"
                    maxLength={40}
                    onSubmitEditing={() => {
                      if (canSubmitNew) void createCategory();
                    }}
                  />
                  <Ionicons name="create-outline" size={18} color={FAINT} />
                </View>

                <Text style={styles.fieldLabel}>{rtlText('שיוך לצד')}</Text>
                <View style={styles.sideRow}>
                  {(
                    [
                      ['groom', 'צד חתן', 'male'],
                      ['bride', 'צד כלה', 'female'],
                    ] as const
                  ).map(([value, label, icon]) => {
                    const on = newSide === value;
                    const theme = sideMeta(value, true);
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setNewSide(value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={label}
                        style={({ pressed }) => [
                          styles.sideCard,
                          on && {
                            backgroundColor: theme.tint,
                            borderColor: theme.accent,
                          },
                          pressed && styles.pressedSoft,
                        ]}
                      >
                        {on ? (
                          <View style={[styles.sideCardCheck, { backgroundColor: theme.accent }]}>
                            <Ionicons name="checkmark" size={11} color="#fff" />
                          </View>
                        ) : null}
                        <View
                          style={[
                            styles.sideCardIcon,
                            {
                              backgroundColor: on ? theme.accent : 'rgba(20,27,51,0.06)',
                            },
                          ]}
                        >
                          <Ionicons name={icon} size={22} color={on ? '#fff' : DIM} />
                        </View>
                        <Text
                          style={[
                            styles.sideCardText,
                            on && { color: theme.accentDeep },
                          ]}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                        <Text
                          style={[
                            styles.sideCardHint,
                            on && { color: theme.accent },
                          ]}
                          numberOfLines={1}
                        >
                          {on ? 'נבחר' : 'הקישו לבחירה'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  onPress={() => void createCategory()}
                  disabled={saving}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="יצירת קטגוריה והמשך"
                  style={styles.primaryBtnOuter}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.primaryBtnInner,
                        canSubmitNew ? { backgroundColor: createTheme.accent } : styles.btnInnerOff,
                        pressed && canSubmitNew && styles.pressedScale,
                      ]}
                    >
                      <View style={styles.btnContent}>
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={canSubmitNew ? '#fff' : OFF_TEXT}
                        />
                        <Text style={[styles.btnText, !canSubmitNew && styles.btnTextOff]}>
                          {saving ? 'יוצר...' : 'צרו והמשיכו'}
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const cardShadow = Platform.select({
  web: { boxShadow: '0 6px 20px -10px rgba(20,27,51,0.28)' } as object,
  default: {
    shadowColor: '#141B33',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: BG,
    overflow: 'hidden',
  },
  pressedSoft: {
    opacity: 0.7,
  },
  pressedScale: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },

  /* Header */
  header: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  headerRow: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  headerStep: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: DIM,
    textAlign: 'center',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  progressRow: {
    width: '100%',
    flexDirection: ROW_DIR,
    gap: 6,
    marginTop: 14,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(20,27,51,0.09)',
  },
  progressSegmentOn: {
    backgroundColor: NAVY,
  },

  /* Scroll body */
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    paddingTop: 18,
  },
  intro: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: TEXT,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  introText: {
    marginTop: 6,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '600',
    color: DIM,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  chipsRow: {
    width: '100%',
    flexDirection: ROW_DIR,
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 99,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: LINE,
  },
  chipOn: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: DIM,
  },
  chipTextOn: {
    color: '#fff',
  },

  /* Category card */
  cardOuter: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  cardPress: {
    width: '100%',
  },
  card: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: LINE,
    ...cardShadow,
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.995 }],
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
  },
  medallion: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionValue: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  medallionLabel: {
    fontSize: 9,
    fontWeight: '700',
    opacity: 0.8,
  },
  medallionValueOn: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 24,
  },
  medallionLabelOn: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    opacity: 0.9,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '800',
    color: TEXT,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  sideBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 99,
  },
  sideBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12.5,
    fontWeight: '600',
    color: DIM,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(20,27,51,0.14)',
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Add-category card */
  addCard: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: NAVY_SOFT,
  },
  addIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: NAVY_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: TEXT,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  addHint: {
    marginTop: 3,
    fontSize: 12.5,
    fontWeight: '600',
    color: DIM,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },

  /* Empty state */
  emptyWrap: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: NAVY_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: DIM,
    textAlign: 'center',
  },

  /* Bottom bar */
  bottomBar: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: SURFACE,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  bottomHint: {
    fontSize: 12,
    fontWeight: '700',
    color: DIM,
    marginBottom: 8,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  primaryBtnOuter: {
    width: '100%',
    alignSelf: 'stretch',
  },
  primaryBtnInner: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnInnerOff: {
    backgroundColor: OFF_BG,
  },
  btnContent: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  btnTextOff: {
    color: OFF_TEXT,
  },

  /* Create modal */
  modalRoot: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(12,17,33,0.45)',
  },
  modalCenter: {
    flex: 1,
    width: '100%',
  },
  modalScroll: {
    flex: 1,
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: SURFACE,
    padding: 20,
    ...Platform.select({
      web: { boxShadow: '0 24px 60px -24px rgba(12,17,33,0.5)' } as object,
      default: {
        shadowColor: '#0C1121',
        shadowOpacity: 0.24,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 16 },
        elevation: 12,
      },
    }),
  },
  modalHeader: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  modalIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: TEXT,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  modalSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    fontWeight: '600',
    color: DIM,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: DIM,
    marginBottom: 8,
    textAlign: TEXT_RIGHT,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  inputWrap: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: BG,
    borderWidth: 1.5,
    borderColor: LINE,
    marginBottom: 18,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
    paddingVertical: 12,
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  sideRow: {
    width: '100%',
    flexDirection: ROW_DIR,
    gap: 12,
    marginBottom: 22,
  },
  sideCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: BG,
    borderWidth: 1.5,
    borderColor: LINE,
    position: 'relative',
    minHeight: 132,
  },
  sideCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideCardText: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  sideCardHint: {
    fontSize: 11.5,
    fontWeight: '600',
    color: FAINT,
    textAlign: 'center',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  sideCardCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
