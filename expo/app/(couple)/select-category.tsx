import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLoader, AppLoaderScreen } from '@/components/AppLoader';
import { guestService } from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { useLayoutStore } from '@/store/layoutStore';
import { IS_RTL, ROW_DIR, rtlText } from '@/lib/rtl';

type Side = 'groom' | 'bride';

type GuestCategory = {
  id: string;
  name: string;
  side: Side;
};

type CategoryStats = {
  invites: number;
  people: number;
  names: string[];
};

const ACCENT = '#1E3A6E';
const ACCENT_BG = 'rgba(30,58,110,0.10)';
const ACCENT_LINE = 'rgba(30,58,110,0.22)';
const BRIDE_PINK = '#F47C8C';
const BRIDE_PINK_DEEP = '#C94F61';
const BRIDE_PINK_LIGHT = '#FEECEF';
const BRIDE_PINK_LINE = 'rgba(244, 124, 140, 0.28)';
const L_BG = '#FBFAF7';
const L_SURFACE = '#FFFFFF';
const L_TEXT = '#161D38';
const L_DIM = '#6C7187';
const L_FAINT = '#A6A8B4';
const L_LINE = 'rgba(22,29,56,0.09)';

function getInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'א';
  return parts
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

type SideTheme = {
  label: string;
  badgeBg: string;
  badgeText: string;
  accent: string;
  accentBg: string;
  accentLine: string;
};

function sideMeta(side: Side | string, enableSides: boolean): SideTheme {
  if (!enableSides) {
    return {
      label: 'כללי',
      badgeBg: 'rgba(22,29,56,0.06)',
      badgeText: L_DIM,
      accent: ACCENT,
      accentBg: ACCENT_BG,
      accentLine: ACCENT_LINE,
    };
  }
  if (side === 'bride') {
    return {
      label: 'צד כלה',
      badgeBg: BRIDE_PINK_LIGHT,
      badgeText: BRIDE_PINK_DEEP,
      accent: BRIDE_PINK,
      accentBg: BRIDE_PINK_LIGHT,
      accentLine: BRIDE_PINK_LINE,
    };
  }
  if (side === 'groom') {
    return {
      label: 'צד חתן',
      badgeBg: ACCENT_BG,
      badgeText: ACCENT,
      accent: ACCENT,
      accentBg: ACCENT_BG,
      accentLine: ACCENT_LINE,
    };
  }
  return {
    label: 'כללי',
    badgeBg: 'rgba(22,29,56,0.06)',
    badgeText: L_DIM,
    accent: ACCENT,
    accentBg: ACCENT_BG,
    accentLine: ACCENT_LINE,
  };
}

function buildCategoryStats(guests: any[]): Record<string, CategoryStats> {
  const stats: Record<string, CategoryStats> = {};
  for (const g of guests || []) {
    const cid = String((g as any)?.category_id ?? '').trim();
    if (!cid) continue;
    if (!stats[cid]) stats[cid] = { invites: 0, people: 0, names: [] };
    const row = stats[cid];
    row.invites += 1;
    const status = String((g as any)?.status ?? '');
    if (status !== 'לא מגיע') {
      row.people += Number((g as any)?.numberOfPeople ?? 1) || 1;
    }
    if (row.names.length < 3) {
      const name = String((g as any)?.name ?? '').trim();
      if (name) row.names.push(name);
    }
  }
  return stats;
}

export default function SelectCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTabBarVisible = useLayoutStore((s) => s.setTabBarVisible);
  const params = useLocalSearchParams<{ eventId?: string; categoryId?: string }>();

  const eventId = useMemo(() => String(params.eventId || '').trim(), [params.eventId]);
  const initialCategoryId = useMemo(() => String(params.categoryId || '').trim(), [params.categoryId]);

  const [loading, setLoading] = useState(true);
  const [enableSides, setEnableSides] = useState(true);
  const [categories, setCategories] = useState<GuestCategory[]>([]);
  const [categoryStats, setCategoryStats] = useState<Record<string, CategoryStats>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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
    if (!enableSides) setNewSide('groom');
  }, [enableSides]);

  const bottomPadding = Math.max(20, insets.bottom + 16);

  const goBack = () => {
    router.replace({ pathname: '/(couple)/guests', params: eventId ? { eventId } : undefined });
  };

  const goToContacts = (catId: string) => {
    router.replace({ pathname: '/contacts-list', params: { eventId, categoryId: catId } });
  };

  const createCategory = async () => {
    const name = newName.trim();
    if (!eventId || !name || saving) return;
    setSaving(true);
    try {
      const created = (await guestService.addGuestCategory(eventId, name, newSide)) as any;
      const cat: GuestCategory = {
        id: String(created?.id),
        name: String(created?.name || name),
        side: (String(created?.side || newSide) as Side) || newSide,
      };
      setCategories((prev) => [...prev, cat]);
      setAdding(false);
      setNewName('');
      goToContacts(cat.id);
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || e?.details || 'לא ניתן להוסיף קטגוריה');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = () => {
    if (!eventId || saving || !selectedId) return;
    goToContacts(selectedId);
  };

  const renderCategoryCard = ({ item }: { item: GuestCategory }) => {
    const isSelected = selectedId === item.id;
    const meta = sideMeta(item.side, enableSides);
    const st = categoryStats[item.id] || { invites: 0, people: 0, names: [] };

    const isBrideSide = enableSides && item.side === 'bride';

    return (
      <Pressable
        onPress={() => setSelectedId(item.id)}
        style={({ pressed }) => [
          styles.categoryCard,
          isSelected && { borderColor: meta.accent },
          isSelected && isBrideSide && styles.categoryCardSelectedBride,
          isSelected && !isBrideSide && styles.categoryCardSelectedGroom,
          pressed && styles.categoryCardPressed,
        ]}
      >
        <View
          style={[
            styles.categoryAccentBar,
            { backgroundColor: meta.accent },
            !isSelected && styles.categoryAccentBarMuted,
          ]}
        />

        <View
          style={[
            styles.countMedallion,
            { backgroundColor: meta.accent, borderColor: meta.accent },
          ]}
        >
          <Text style={styles.countMedallionValue}>{st.invites}</Text>
          <Text style={styles.countMedallionLabel}>הזמנות</Text>
        </View>

        <View style={styles.categoryBody}>
          <View style={styles.categoryTitleRow}>
            <Text style={styles.categoryName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.sideBadge, { backgroundColor: meta.badgeBg }]}>
              <Text style={[styles.sideBadgeText, { color: meta.badgeText }]}>{meta.label}</Text>
            </View>
          </View>

          {st.invites > 0 ? (
            st.names.length > 0 ? (
              <View style={styles.categoryMetaRow}>
                <View style={styles.avatarStack}>
                  {st.names.map((name, i) => (
                    <View
                      key={`${item.id}-${name}-${i}`}
                      style={[
                        styles.avatarChip,
                        i > 0 && styles.avatarChipOverlap,
                        { borderColor: meta.accentLine },
                      ]}
                    >
                      <Text style={[styles.avatarChipText, { color: meta.accent }]}>
                        {getInitials(name)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null
          ) : (
            <Text style={styles.emptyGuestsText}>אין מוזמנים עדיין</Text>
          )}
        </View>

        <View
          style={[
            styles.selectCircle,
            isBrideSide && !isSelected && styles.selectCircleBrideIdle,
            isSelected && { backgroundColor: meta.accent, borderColor: meta.accent },
          ]}
        >
          {isSelected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
        </View>
      </Pressable>
    );
  };

  const listHeader = (
    <View style={styles.pageIntro}>
      <Text style={styles.pageTitle}>{rtlText('לאיזו קטגוריה?')}</Text>
      <Text style={styles.pageSubtitle}>
        {rtlText('בחרו שיוך למוזמנים שתייבאו, או צרו קטגוריה חדשה')}
      </Text>
    </View>
  );

  const createCanSubmit = newName.trim().length >= 2 && !saving;
  const createAccent = enableSides && newSide === 'bride' ? BRIDE_PINK : ACCENT;
  const createAccentBg = enableSides && newSide === 'bride' ? BRIDE_PINK_LIGHT : ACCENT_BG;

  if (loading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppLoaderScreen variant="categories" />
      </View>
    );
  }

  const listFooter = (
    <View style={styles.footerSection}>
      {adding ? (
        <View style={styles.createCard}>
          <View style={styles.createCardHeader}>
            <View style={[styles.createCardHeaderIcon, { backgroundColor: createAccentBg }]}>
              <Ionicons name="folder-open-outline" size={22} color={createAccent} />
            </View>
            <View style={styles.createCardHeaderText}>
              <Text style={styles.createCardTitle}>{rtlText('קטגוריה חדשה')}</Text>
              <Text style={styles.createCardSubtitle}>{rtlText('תנו שם ושייכו לצד המתאים')}</Text>
            </View>
            <Pressable
              onPress={() => {
                setAdding(false);
                setNewName('');
              }}
              accessibilityRole="button"
              accessibilityLabel="סגירה"
              style={({ pressed }) => [styles.createCloseBtn, pressed && styles.createCloseBtnPressed]}
            >
              <Ionicons name="close" size={18} color={L_DIM} />
            </Pressable>
          </View>

          <Text style={styles.createFieldLabel}>{rtlText('שם הקטגוריה')}</Text>
          <View style={styles.createInputWrap}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="למשל: משפחת כלה"
              placeholderTextColor={L_FAINT}
              style={styles.createInput}
              textAlign="right"
              autoFocus
              returnKeyType="done"
            />
            <View style={styles.createInputIcon}>
              <Ionicons name="create-outline" size={18} color={L_FAINT} />
            </View>
          </View>

          {enableSides ? (
            <>
              <Text style={styles.createFieldLabel}>{rtlText('שיוך לצד')}</Text>
              <View style={styles.sidePickerRow}>
                {(
                  [
                    ['groom', 'צד חתן', 'male' as const, ACCENT, ACCENT_BG],
                    ['bride', 'צד כלה', 'female' as const, BRIDE_PINK, BRIDE_PINK_LIGHT],
                  ] as const
                ).map(([value, label, icon, accent, accentBg]) => {
                  const on = newSide === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setNewSide(value)}
                      style={[
                        styles.sidePickerBtn,
                        on && { backgroundColor: accentBg, borderColor: accent },
                      ]}
                    >
                      <View style={[styles.sidePickerIconWrap, on && { backgroundColor: accent }]}>
                        <Ionicons name={icon} size={16} color={on ? '#fff' : L_DIM} />
                      </View>
                      <Text style={[styles.sidePickerBtnText, on && { color: accent, fontWeight: '700' }]}>
                        {label}
                      </Text>
                      {on ? (
                        <View style={[styles.sidePickerCheck, { backgroundColor: accent }]}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Pressable
            onPress={() => void createCategory()}
            disabled={!createCanSubmit}
            style={({ pressed }) => [
              styles.createSubmitBtn,
              { backgroundColor: createCanSubmit ? createAccent : '#c9c2b2' },
              pressed && createCanSubmit && styles.createSubmitBtnPressed,
            ]}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.createSubmitText}>{saving ? 'יוצר...' : 'יצירה והמשך'}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setAdding(false);
              setNewName('');
            }}
            style={({ pressed }) => [styles.createCancelLink, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.createCancelText}>ביטול</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          style={({ pressed }) => [styles.addCategoryBtn, pressed && styles.addCategoryBtnPressed]}
        >
          <View style={styles.addCategoryIconWrap}>
            <Ionicons name="add" size={22} color={ACCENT} />
          </View>
          <View style={styles.addCategoryTextWrap}>
            <Text style={styles.addCategoryText}>קטגוריה חדשה</Text>
            <Text style={styles.addCategoryHint}>הוסיפו קבוצה משלכם</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={L_FAINT} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppLoader
        visible={saving}
        variant="adding"
        title="יוצר קטגוריה"
        subtitle="שומר את הקטגוריה החדשה"
      />

      <View style={[styles.header, { paddingTop: Math.max(12, insets.top + 8) }]}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
          style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
        >
          <Ionicons name="chevron-forward" size={20} color={L_TEXT} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{rtlText('ייבוא מאנשי קשר')}</Text>
          <Text style={styles.headerStep}>{rtlText('שלב 1 מתוך 2')}</Text>
        </View>

        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="סגירה"
          style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
        >
          <Ionicons name="close" size={18} color={L_DIM} />
        </Pressable>
      </View>

      <View style={styles.progressRow}>
        <View style={[styles.progressSegment, styles.progressSegmentActive]} />
        <View style={styles.progressSegment} />
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={renderCategoryCard}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>אין קטגוריות עדיין</Text>
            <Text style={styles.emptySubtitle}>צרו קטגוריה חדשה כדי להתחיל בייבוא</Text>
          </View>
        }
      />

      <View style={[styles.bottomBar, { paddingBottom: bottomPadding }]}>
        <Pressable
          onPress={handleContinue}
          disabled={!selectedId || saving}
          style={({ pressed }) => [
            styles.continueBtn,
            (!selectedId || saving) && styles.continueBtnDisabled,
            pressed && selectedId && !saving && styles.continueBtnPressed,
          ]}
        >
          <Text style={styles.continueBtnText}>המשך לבחירת אנשי קשר</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: L_BG,
  },
  header: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: L_SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: L_LINE,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: L_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnPressed: {
    opacity: 0.75,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: L_TEXT,
    textAlign: 'center',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  headerStep: {
    marginTop: 2,
    fontSize: 12,
    color: L_DIM,
    textAlign: 'center',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  progressRow: {
    flexDirection: ROW_DIR,
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: L_SURFACE,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 99,
    backgroundColor: L_LINE,
  },
  progressSegmentActive: {
    backgroundColor: ACCENT,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: L_DIM,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: L_SURFACE,
    flexGrow: 1,
  },
  pageIntro: {
    paddingTop: 8,
    paddingBottom: 18,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: L_TEXT,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  pageSubtitle: {
    marginTop: 4,
    fontSize: 13.5,
    lineHeight: 20,
    color: L_DIM,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  categoryCard: {
    position: 'relative',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: L_SURFACE,
    borderWidth: 1.5,
    borderColor: L_LINE,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 12px -7px rgba(22,29,56,0.2)' } as object)
      : {
          shadowColor: '#161D38',
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }),
  },
  categoryCardSelectedGroom: {
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 10px 26px -14px ${ACCENT}` } as object)
      : {
          shadowColor: ACCENT,
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }),
  },
  categoryCardSelectedBride: {
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 10px 26px -14px ${BRIDE_PINK}` } as object)
      : {
          shadowColor: BRIDE_PINK,
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }),
  },
  categoryCardPressed: {
    opacity: 0.92,
  },
  categoryAccentBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 5,
  },
  categoryAccentBarMuted: {
    opacity: 0.45,
  },
  countMedallion: {
    width: 54,
    height: 54,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  countMedallionValue: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
  countMedallionLabel: {
    marginTop: 1,
    fontSize: 9,
    color: '#FFFFFF',
    opacity: 0.85,
  },
  categoryBody: {
    flex: 1,
    minWidth: 0,
  },
  categoryTitleRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  categoryName: {
    fontSize: 16.5,
    fontWeight: '700',
    color: L_TEXT,
    flexShrink: 1,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  sideBadge: {
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 99,
  },
  sideBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryMetaRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    marginTop: 7,
    minHeight: 22,
  },
  avatarStack: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  avatarChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: L_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChipOverlap: {
    marginRight: -7,
  },
  avatarChipText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  emptyGuestsText: {
    marginTop: 7,
    fontSize: 12.5,
    color: L_FAINT,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  selectCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: L_LINE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectCircleBrideIdle: {
    borderColor: 'rgba(244, 124, 140, 0.45)',
  },
  footerSection: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  addCategoryBtn: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: L_SURFACE,
    borderWidth: 1,
    borderColor: L_LINE,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 4px 18px -8px rgba(22,29,56,0.18)' } as object)
      : {
          shadowColor: '#161D38',
          shadowOpacity: 0.07,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }),
  },
  addCategoryBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  addCategoryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: ACCENT_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCategoryTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  addCategoryText: {
    fontSize: 16,
    fontWeight: '700',
    color: L_TEXT,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  addCategoryHint: {
    marginTop: 2,
    fontSize: 12.5,
    color: L_DIM,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  createCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: L_SURFACE,
    borderWidth: 1,
    borderColor: L_LINE,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 28px -12px rgba(22,29,56,0.22)' } as object)
      : {
          shadowColor: '#161D38',
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }),
  },
  createCardHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  createCardHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCardHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  createCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: L_TEXT,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  createCardSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    color: L_DIM,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  createCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: L_BG,
    borderWidth: 1,
    borderColor: L_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCloseBtnPressed: {
    opacity: 0.75,
  },
  createFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: L_DIM,
    marginBottom: 8,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  createInputWrap: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    backgroundColor: L_BG,
    borderWidth: 1,
    borderColor: L_LINE,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
    marginBottom: 16,
  },
  createInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: L_TEXT,
    paddingVertical: 12,
    writingDirection: 'rtl',
  },
  createInputIcon: {
    marginStart: 8,
  },
  sidePickerRow: {
    flexDirection: ROW_DIR,
    gap: 10,
    marginBottom: 18,
  },
  sidePickerBtn: {
    flex: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: L_BG,
    borderWidth: 1.5,
    borderColor: L_LINE,
  },
  sidePickerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(22,29,56,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidePickerBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: L_DIM,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  sidePickerCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSubmitBtn: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 15,
    marginBottom: 10,
  },
  createSubmitBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  createSubmitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  createCancelLink: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  createCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: L_DIM,
  },
  emptyWrap: {
    paddingTop: 40,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: L_TEXT,
  },
  emptySubtitle: {
    fontSize: 13,
    color: L_DIM,
    textAlign: 'center',
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: L_SURFACE,
    borderTopWidth: 1,
    borderTopColor: L_LINE,
  },
  continueBtn: {
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: '#c9c2b2',
  },
  continueBtnPressed: {
    opacity: 0.9,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
