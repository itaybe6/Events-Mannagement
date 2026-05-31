import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Pressable,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { ensureContactsPermission } from '@/lib/permissions';
import {
  getPhoneDuplicateKeys,
  guestService,
  normalizeGuestNameForDuplicate,
  UNAPPROVED_EVENT_GUEST_LIMIT,
  UNAPPROVED_EVENT_GUEST_LIMIT_ERROR,
} from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppKeyboardAwareFlatList } from '@/components/AppKeyboardAware';
import BackSwipe from '@/components/BackSwipe';
import { IS_RTL, ROW_DIR, rtlText } from '@/lib/rtl';

export default function ContactsListScreen() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [existingGuests, setExistingGuests] = useState<any[]>([]);
  const [isEventApproved, setIsEventApproved] = useState<boolean>(true);
  const [searchFocused, setSearchFocused] = useState(false);
  const [enableSides, setEnableSides] = useState(true);
  const [successModal, setSuccessModal] = useState<{ visible: boolean; count: number }>({ visible: false, count: 0 });
  const [addingGuests, setAddingGuests] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // קבל eventId מהניווט
  const params = useLocalSearchParams();
  const eventId = params.eventId as string | undefined;
  const categoryIdParam = params.categoryId as string | undefined;

  // Local palette - clean white design
  const ui = useMemo(
    () => ({
      primary: '#1d4ed8', // App primary (blue)
      bg: '#F3F4F6', // Gray background behind cards
      surface: '#FFFFFF',
      surfaceSoft: 'rgba(255,255,255,0.98)',
      text: '#1F2937',
      textStrong: '#111827',
      muted: '#6B7280',
      border: '#E5E7EB',
      inputBg: '#F5F5F5',
      inputBorder: '#E5E7EB',
      pressedBg: '#F9FAFB',
      selectedBg: '#EEF2FF', // indigo-50 - subtle
      selectedBorder: '#C7D2FE', // indigo-200
    }),
    []
  );

  const avatarPalette = useMemo(
    () => [
      { from: '#E0E7FF', to: '#F3E8FF', fg: '#4F46E5' }, // indigo/purple
      { from: '#FCE7F3', to: '#FFE4E6', fg: '#DB2777' }, // pink/rose
      { from: '#DBEAFE', to: '#CFFAFE', fg: '#2563EB' }, // blue/cyan
      { from: '#FEF3C7', to: '#FFEDD5', fg: '#D97706' }, // amber/orange
      { from: '#DCFCE7', to: '#D1FAE5', fg: '#16A34A' }, // green/emerald
      { from: '#CCFBF1', to: '#CFFAFE', fg: '#0F766E' }, // teal/cyan
      { from: '#F3F4F6', to: '#E5E7EB', fg: '#64748B' }, // gray
    ],
    []
  );

  const avatarGradientFor = (name?: string) => {
    const key = (name || '').trim();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return avatarPalette[hash % avatarPalette.length];
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // טען קטגוריות ואורחים קיימים
      if (eventId) {
        const cats = await guestService.getGuestCategories(eventId);
        setCategories(cats);

        const cid = String(categoryIdParam || '').trim();
        if (cid) {
          const picked = (cats || []).find((c: any) => String(c?.id) === cid) || null;
          setSelectedCategory(picked);
        } else {
          setSelectedCategory(null);
        }
        
        // טען את כל האורחים הקיימים לבדיקת כפילויות
        const guests = await guestService.getGuests(eventId);
        setExistingGuests(guests);

        // Enable "groom/bride" side UI only for wedding-like events.
        // We infer event type from title (common convention in admin UI),
        // and also enable if groom/bride names exist.
        try {
          const evt = await eventService.getEvent(eventId);
          const title = String(evt?.title ?? '').trim();
          const groom = String(evt?.groomName ?? '').trim();
          const bride = String(evt?.brideName ?? '').trim();
          const inferredType =
            ['חתונה', 'בר מצווה', 'בת מצווה', 'ברית', 'אירוע חברה'].find(et => title.startsWith(et) || title.includes(et)) ||
            null;

          const shouldEnable = !!groom || !!bride ? true : inferredType && inferredType !== 'חתונה' ? false : true;
          setEnableSides(shouldEnable);
          setIsEventApproved(evt?.isApproved !== false);
        } catch (e) {
          console.warn('ContactsList: failed to load event for side UI', e);
          setEnableSides(true);
        }
      }
      // טען אנשי קשר עם הסבר ברור למטרת השימוש (לפי דרישות App Store)
      const permission = await ensureContactsPermission();
      if (permission.granted) {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });
        const contactsWithPhones = data.filter(contact =>
          Array.isArray(contact.phoneNumbers) && contact.phoneNumbers.length > 0 && contact.phoneNumbers[0].number
        );
        setContacts(contactsWithPhones);
      }
      setLoading(false);
    };
    fetchData();
  }, [categoryIdParam, eventId]);

  // If opened without a selected category, redirect to the new category screen.
  useEffect(() => {
    if (!eventId) return;
    const cid = String(categoryIdParam || '').trim();
    if (cid) return;
    // Replace so Back doesn't bounce between screens.
    router.replace({ pathname: '/(couple)/select-category', params: { eventId } });
  }, [categoryIdParam, eventId, router]);

  const existingGuestPhones = useMemo(() => {
    const set = new Set<string>();
    for (const g of existingGuests) {
      for (const key of getPhoneDuplicateKeys(String((g as any)?.phone ?? ''))) {
        if (key) set.add(key);
      }
    }
    return set;
  }, [existingGuests]);

  const existingGuestNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of existingGuests) {
      const name = normalizeGuestNameForDuplicate(String((g as any)?.name ?? ''));
      if (name) set.add(name);
    }
    return set;
  }, [existingGuests]);

  const getInitials = (name?: string) => {
    const n = (name || '').trim();
    if (!n) return 'א';
    const parts = n.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? n[0];
    const second = parts.length > 1 ? parts[1]?.[0] : n[1];
    return `${first ?? ''}${second ?? ''}`.slice(0, 2);
  };

  const checkForDuplicates = (contactsToAdd: any[]) => {
    const duplicates: any[] = [];
    const newGuests: any[] = [];
    const pendingPhoneKeys = new Set<string>();
    const pendingNames = new Set<string>();
    
    contactsToAdd.forEach(contact => {
      const phoneKeys = getPhoneDuplicateKeys(contact.phoneNumbers[0]?.number || '');
      const contactName = normalizeGuestNameForDuplicate(contact.name || '');
      const isDuplicate =
        phoneKeys.some((key) => existingGuestPhones.has(key) || pendingPhoneKeys.has(key)) ||
        Boolean(contactName && (existingGuestNames.has(contactName) || pendingNames.has(contactName)));
      
      if (isDuplicate) {
        duplicates.push(contact);
      } else {
        phoneKeys.forEach((key) => pendingPhoneKeys.add(key));
        if (contactName) pendingNames.add(contactName);
        newGuests.push(contact);
      }
    });
    
    return { duplicates, newGuests };
  };

  const handleAddGuests = async () => {
    if (addingGuests) return;
    if (!eventId || !selectedCategory) {
      Alert.alert('שגיאה', 'יש לבחור קטגוריה לפני הוספת אורחים');
      return;
    }

    // בדיקת הגבלת מוזמנים לאירוע שטרם אושר
    if (!isEventApproved) {
      const currentCount = existingGuests.length;
      const remaining = Math.max(0, UNAPPROVED_EVENT_GUEST_LIMIT - currentCount);
      if (remaining === 0) {
        Alert.alert(
          'הגבלת מוזמנים',
          UNAPPROVED_EVENT_GUEST_LIMIT_ERROR
        );
        return;
      }
      if (selectedContacts.size > remaining) {
        Alert.alert(
          'הגבלת מוזמנים',
          `האירוע עדיין ממתין לאישור. ניתן להוסיף עוד ${remaining} מוזמנים בלבד עד לאישור האירוע על ידי צוות MOON.`
        );
        return;
      }
    }
    
    const contactsToAdd = Array.from(selectedContacts).map(id => 
      contacts.find(c => c.id === id)
    ).filter(Boolean);
    
    const { duplicates, newGuests } = checkForDuplicates(contactsToAdd);
    
    if (duplicates.length > 0) {
      const duplicateNames = duplicates.map(d => d.name || 'ללא שם').join(', ');
      
      if (newGuests.length === 0) {
        Alert.alert(
          'אורחים כפולים',
          `כל האורחים שנבחרו כבר קיימים באירוע:\n${duplicateNames}`,
          [{ text: 'אוקיי', style: 'default' }]
        );
        return;
      } else {
        Alert.alert(
          'האם להמשיך?',
          `האורחים הבאים כבר קיימים ולא יתווספו:\n${duplicateNames}\n\nהאם להוסיף את שאר האורחים (${newGuests.length})?`,
          [
            { text: 'ביטול', style: 'cancel' },
            { 
              text: 'הוסף את החדשים', 
              style: 'default',
              onPress: () => { void addGuestsToDatabase(newGuests); }
            }
          ]
        );
        return;
      }
    }
    
    void addGuestsToDatabase(newGuests);
  };

  const safeBack = () => {
    const canGoBackFn = (router as any)?.canGoBack;
    if (typeof canGoBackFn === 'function' && canGoBackFn()) {
      router.back();
    } else {
      router.replace('/(couple)/guests');
    }
  };

  const addGuestsToDatabase = async (guestsToAdd: any[]) => {
    if (!eventId || !selectedCategory || guestsToAdd.length === 0 || addingGuests) return;

    setAddingGuests(true);
    try {
      const payload = guestsToAdd.map((contact) => ({
        name: contact.name || '',
        phone: contact.phoneNumbers[0]?.number || '',
        status: 'ממתין' as const,
        tableId: null,
        gift: 0,
        message: '',
        category_id: selectedCategory.id,
        numberOfPeople: 1,
      }));

      const { added, duplicateSkipped } = await guestService.addGuestsBatch(eventId, payload, {
        existingRows: existingGuests.map((guest) => ({
          id: guest.id,
          name: guest.name,
          phone: guest.phone,
        })),
      });

      if (added.length > 0) {
        setExistingGuests((prev) => [...prev, ...added]);
        setSelectedContacts(new Set());
        setSuccessModal({ visible: true, count: added.length });
      } else if (duplicateSkipped > 0) {
        Alert.alert('אורחים כפולים', 'כל האורחים שנבחרו כבר קיימים באירוע לפי שם או מספר טלפון.');
      }
    } catch (e: any) {
      if (e?.message === UNAPPROVED_EVENT_GUEST_LIMIT_ERROR) {
        Alert.alert('הגבלת מוזמנים', UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
        return;
      }
      console.error('Error adding guests:', e);
      Alert.alert('שגיאה', 'לא ניתן להוסיף את האורחים. נסה שוב.');
    } finally {
      setAddingGuests(false);
    }
  };

  const toggleContact = (id: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContacts(newSelected);
  };

  // סינון אנשי קשר לפי חיפוש + מיון לפי א-ב
  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = contacts.filter(c => {
      const name = String(c?.name || '');
      const phone = String(c?.phoneNumbers?.[0]?.number || '');
      const normalizedName = normalizeGuestNameForDuplicate(name);
      const phoneExists = getPhoneDuplicateKeys(phone).some((key) => existingGuestPhones.has(key));
      // הצג רק אנשי קשר שלא קיימים כבר כאורחים באירוע, לפי מספר או שם.
      if (phoneExists || (normalizedName && existingGuestNames.has(normalizedName))) return false;
      if (!q) return !!name;
      return name.toLowerCase().includes(q) || phone.includes(search.trim());
    });

    return filtered.sort((a, b) => {
      const an = String(a?.name || '').trim();
      const bn = String(b?.name || '').trim();
      return an.localeCompare(bn, 'he', { sensitivity: 'base' });
    });
  }, [contacts, existingGuestNames, existingGuestPhones, search]);

  const canAdd = !!selectedCategory && selectedContacts.size > 0 && !addingGuests;
  const bottomSafe = Math.max(16, insets.bottom + 12);

  return (
    <BackSwipe>
      <View style={[styles.container, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient
          pointerEvents="none"
          colors={['#F0F9FF', '#EEF2FF', '#FFF1F2']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.78)', 'rgba(255,255,255,0)']}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.72, y: 0.48 }}
          style={styles.bgHighlight}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(29,78,216,0.10)', 'rgba(244,114,182,0.08)', 'rgba(255,255,255,0)']}
          start={{ x: 1, y: 0.08 }}
          end={{ x: 0.2, y: 0.82 }}
          style={styles.bgGlow}
        />

      <View
        style={[
          styles.stickyTitleBar,
          {
            paddingTop: insets.top + 10,
            backgroundColor: ui.surfaceSoft,
            borderBottomColor: ui.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.backBtn, styles.backBtnAbs]}
          onPress={() => {
            const canGoBackFn = (router as any)?.canGoBack;
            if (typeof canGoBackFn === 'function') {
              if (canGoBackFn()) router.back();
              else router.replace('/(couple)/guests');
              return;
            }
            router.replace('/(couple)/guests');
          }}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
        >
          <Ionicons name="chevron-back" size={22} color={ui.primary} />
        </TouchableOpacity>

        <View style={styles.navRow}>
          <Text style={[styles.navTitle, { color: ui.textStrong }]}>רשימת אנשי קשר</Text>
        </View>
      </View>

      <AppKeyboardAwareFlatList
        data={filteredContacts}
        extraData={selectedContacts}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, width: '100%' }}
        // NOTE: Keep the header full-width; apply horizontal padding per-item instead.
        contentContainerStyle={{ width: '100%', paddingBottom: 140 }}
        ListHeaderComponent={
          <View
            style={[
              styles.header,
              {
                paddingTop: 14,
              },
            ]}
          >
            <View style={styles.headerHero}>
              <View style={styles.headerHeroTopRow}>
                {selectedCategory ? (
                  <View style={styles.headerHeroCategoryPill}>
                    <MaterialIcons name="label" size={15} color={ui.primary} />
                    <Text style={styles.headerHeroCategoryText} numberOfLines={1}>
                      {selectedCategory.name}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.headerHeroCountPill}>
                  <Text style={styles.headerHeroCountText}>{filteredContacts.length} אנשי קשר</Text>
                </View>
              </View>
              <View style={styles.headerHeroTextCol}>
                <Text style={styles.headerHeroTitle}>
                  {rtlText(
                    selectedCategory
                      ? `מוסיפים אורחים לקטגוריה ${selectedCategory.name}`
                      : 'בחר קטגוריה כדי להתחיל'
                  )}
                </Text>
                <Text style={styles.headerHeroSubtitle}>
                  {rtlText('סמן כמה אנשי קשר שתרצה, ונוסיף אותם ישירות לרשימת המוזמנים באפליקציה.')}
                </Text>
              </View>
            </View>

            <View style={{ gap: 16, paddingBottom: 18 }}>
              <View style={styles.topButtonsGrid}>
                <View style={styles.topButtonCol}>
                  <Pressable
                    onPress={() => {
                      if (!eventId) return;
                      router.push({ pathname: '/(couple)/select-category', params: { eventId, categoryId: selectedCategory?.id } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="בחר קטגוריה"
                    style={({ pressed }) => [
                      styles.topButtonBase,
                      styles.topButtonOuterPrimary,
                      pressed && styles.topButtonOuterPressed,
                    ]}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.topButtonInner,
                          selectedCategory ? styles.topButtonPrimarySelected : styles.topButtonPrimary,
                          pressed && styles.topButtonPrimaryPressed,
                        ]}
                      >
                        {selectedCategory ? (
                          <LinearGradient
                  colors={['rgba(29,78,216,0.20)', 'rgba(29,78,216,0.12)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                          />
                        ) : null}
                        <View style={styles.buttonContent}>
                          <View style={styles.buttonIconWrap}>
                            <MaterialIcons
                              name={selectedCategory ? 'check-circle' : 'label'}
                              size={20}
                              color={ui.primary}
                            />
                          </View>
                          <Text style={[styles.topButtonText, { color: ui.primary }]} numberOfLines={1}>
                            {selectedCategory ? selectedCategory.name : 'בחר קטגוריה'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                </View>

                <View style={styles.topButtonsSpacer} />

                <View style={styles.topButtonCol}>
                  <Pressable
                    onPress={() => {
                      if (!eventId) return;
                      router.push({ pathname: '/(couple)/select-category', params: { eventId, categoryId: selectedCategory?.id } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="החלף קטגוריה"
                    style={({ pressed }) => [
                      styles.topButtonBase,
                      !selectedCategory && styles.topButtonDisabled,
                      styles.topButtonOuterSecondary,
                      pressed && styles.topButtonOuterPressed,
                    ]}
                    disabled={!selectedCategory}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.topButtonInner,
                          styles.topButtonSecondary,
                          pressed && styles.topButtonSecondaryPressed,
                        ]}
                      >
                        <View style={styles.buttonContent}>
                          <View style={styles.buttonIconWrap}>
                            <MaterialIcons
                              name="swap-horiz"
                              size={20}
                              color={selectedCategory ? '#374151' : '#9CA3AF'}
                            />
                          </View>
                          <Text
                            style={[styles.topButtonText, { color: selectedCategory ? '#374151' : '#9CA3AF' }]}
                            numberOfLines={1}
                          >
                            החלף קטגוריה
                          </Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>

              <View style={styles.searchWrap}>
                <MaterialIcons
                  name="search"
                  size={20}
                  color={searchFocused ? ui.primary : '#9CA3AF'}
                  style={styles.searchIcon}
                />
                <TextInput
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: ui.inputBg,
                      borderColor: searchFocused ? ui.primary : ui.inputBorder,
                      color: ui.textStrong,
                    },
                  ]}
                  textAlign="right"
                  placeholder="חפש איש קשר..."
                  value={search}
                  onChangeText={setSearch}
                  placeholderTextColor={'#9CA3AF'}
                  editable={!!selectedCategory}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
              </View>

              <View style={styles.selectionSummaryRow}>
                <View style={styles.selectionSummaryCard}>
                  <Text style={styles.selectionSummaryValue}>{selectedContacts.size}</Text>
                  <Text style={styles.selectionSummaryLabel}>נבחרו להוספה</Text>
                </View>
                <View style={styles.selectionSummaryCard}>
                  <Text style={styles.selectionSummaryValue}>{filteredContacts.length}</Text>
                  <Text style={styles.selectionSummaryLabel}>אנשי קשר זמינים</Text>
                </View>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
              <Text style={{ color: ui.muted, fontWeight: '700', textAlign: 'center' }}>טוען אנשי קשר...</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
              <Text style={{ color: ui.muted, fontWeight: '700', textAlign: 'center' }}>
                לא נמצאו אנשי קשר עם מספר טלפון
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const selected = selectedContacts.has(item.id);
          const disabled = !selectedCategory;
          const contentOpacity = disabled ? 0.6 : 1;
          const initials = getInitials(item?.name);
          const phone = String(item?.phoneNumbers?.[0]?.number || 'ללא מספר');
          const avatar = avatarGradientFor(item?.name);
          return (
            <Pressable
              onPress={() => (selectedCategory && !addingGuests ? toggleContact(item.id) : undefined)}
              disabled={disabled || addingGuests}
              style={styles.itemRow}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.rowCard,
                    selected && styles.rowCardSelected,
                    disabled && styles.rowCardDisabled,
                    {
                      backgroundColor: selected ? ui.selectedBg : pressed ? ui.pressedBg : ui.surface,
                      borderColor: selected ? ui.selectedBorder : ui.border,
                      opacity: pressed ? 0.98 : 1,
                      transform: [{ scale: pressed ? 0.995 : 1 }],
                    },
                  ]}
                >
                  {/* Contact content (right side) */}
                  <View style={[styles.contactLeft, { opacity: contentOpacity }]}>
                    <LinearGradient
                      colors={[avatar.from, avatar.to]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatarCircle}
                    >
                      <Text style={[styles.avatarText, { color: avatar.fg }]}>{initials}</Text>
                    </LinearGradient>

                    <View style={{ flexShrink: 1 }}>
                      <Text style={[styles.contactName, { color: ui.textStrong }]} numberOfLines={1}>
                        {item?.name || 'ללא שם'}
                      </Text>
                      <Text style={[styles.contactPhone, { color: ui.muted }]}>{phone}</Text>
                    </View>
                  </View>

                  {/* Selection circle (left side, now INSIDE the white card) */}
                  <View style={styles.selectWrap} pointerEvents="none">
                    <View
                      style={[
                        styles.selectCircle,
                        selected && styles.selectCircleSelected,
                        {
                          borderColor: selected ? ui.primary : '#D1D5DB',
                          opacity: contentOpacity,
                        },
                      ]}
                    >
                      {selected && <View style={[styles.selectDot, { backgroundColor: ui.primary }]} />}
                    </View>
                  </View>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      {/* Bottom fixed action */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: bottomSafe,
            borderTopColor: ui.border,
            backgroundColor: ui.bg,
          },
        ]}
      >
        <Pressable
          onPress={handleAddGuests}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityLabel="הוסף אורחים"
          style={({ pressed }) => [
            styles.bottomButtonOuter,
            canAdd && styles.bottomButtonOuterActive,
            !canAdd && styles.bottomButtonOuterDisabled,
            pressed && canAdd && styles.bottomButtonOuterPressed,
          ]}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.bottomButtonInner,
                !canAdd && styles.bottomButtonInnerDisabled,
                pressed && canAdd && styles.bottomButtonInnerPressed,
              ]}
            >
              {canAdd || addingGuests ? (
                <LinearGradient
                  colors={['#1d4ed8', '#1e40af']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : null}

              <View style={styles.bottomButtonContent}>
                <View
                  style={[
                    styles.bottomIconPill,
                    {
                      backgroundColor: canAdd || addingGuests ? 'rgba(255,255,255,0.18)' : '#F3F4F6',
                      borderColor: canAdd || addingGuests ? 'rgba(255,255,255,0.28)' : '#E5E7EB',
                    },
                  ]}
                >
                  {addingGuests ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <MaterialIcons name="group-add" size={22} color={canAdd ? '#FFFFFF' : '#9CA3AF'} />
                  )}
                </View>

                <Text style={[styles.bottomButtonText, { color: canAdd || addingGuests ? '#FFFFFF' : '#9CA3AF' }]}>
                  {addingGuests
                    ? `מוסיף ${selectedContacts.size} אורחים...`
                    : `הוסף ${selectedContacts.size} אורחים`}
                </Text>
              </View>
            </View>
          )}
        </Pressable>
      </View>
      </View>

      {/* ─── Success Modal ─────────────────────────────── */}
      <Modal
        visible={successModal.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { setSuccessModal({ visible: false, count: 0 }); router.replace('/(couple)/guests'); }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* top row: X on the left */}
            <View style={styles.modalTopRow}>
              <Pressable
                onPress={() => { setSuccessModal({ visible: false, count: 0 }); router.replace('/(couple)/guests'); }}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.65 }]}
                accessibilityRole="button"
                accessibilityLabel="סגור"
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            {/* Green circle icon */}
            <View style={styles.modalIconWrap}>
              <LinearGradient
                colors={['#34D399', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalIconCircle}
              >
                <Ionicons name="checkmark" size={38} color="#fff" />
              </LinearGradient>
            </View>

            <Text style={styles.modalTitle}>נוספו בהצלחה! 🎉</Text>
            <Text style={styles.modalBody}>
              <Text style={styles.modalCount}>{successModal.count}</Text>
              {' '}אורחים חדשים נוספו לקטגוריה
            </Text>
            {selectedCategory?.name ? (
              <View style={styles.modalCategoryPill}>
                <Ionicons name="people" size={15} color="#1d4ed8" />
                <Text style={styles.modalCategoryText}>{selectedCategory.name}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
  },
  bgGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  stickyTitleBar: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    zIndex: 20,
  },
  header: {
    paddingHorizontal: 16,
    width: '100%',
    alignSelf: 'stretch',
  },
  navRow: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.10)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  backBtnAbs: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    zIndex: 10,
  },
  navTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    flex: 1,
    paddingHorizontal: 56,
  },
  headerHero: {
    marginBottom: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'stretch',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  headerHeroTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
    alignSelf: 'stretch',
    width: '100%',
  },
  headerHeroTextCol: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'stretch',
  },
  headerHeroCategoryPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    maxWidth: '68%',
    borderRadius: 999,
    backgroundColor: 'rgba(29,78,216,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerHeroCategoryText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1d4ed8',
    // forceRTL: logical "left" is the visual right edge (same pattern as TablesList / BrideGroomSeating).
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    flexShrink: 1,
  },
  headerHeroCountPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerHeroCountText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
    textAlign: 'center',
  },
  headerHeroTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
  headerHeroSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: 'rgba(51,65,85,0.74)',
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
  topButtonsGrid: {
    flexDirection: ROW_DIR,
    alignItems: 'stretch',
  },
  topButtonCol: {
    flex: 1,
    minWidth: 0,
  },
  topButtonsSpacer: {
    width: 12,
  },
  topButtonBase: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
    shadowOpacity: 0.10,
  },
  topButtonOuterPrimary: {
    shadowColor: '#1d4ed8',
  },
  topButtonOuterSecondary: {
    shadowColor: '#000',
  },
  topButtonOuterPressed: {
    transform: [{ scale: 0.985 }],
    shadowOpacity: 0.16,
  },
  topButtonInner: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  buttonContent: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  topButtonText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    flexShrink: 1,
  },
  topButtonPrimary: {
    backgroundColor: 'rgba(29,78,216,0.14)',
    borderColor: 'rgba(29,78,216,0.32)',
  },
  topButtonPrimarySelected: {
    borderColor: 'rgba(29,78,216,0.42)',
  },
  topButtonPrimaryPressed: {
    backgroundColor: 'rgba(29,78,216,0.22)',
    borderColor: 'rgba(29,78,216,0.52)',
  },
  topButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  topButtonDisabled: {
    opacity: 0.55,
  },
  topButtonSecondaryPressed: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
  },
  buttonIconWrap: {
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    right: 14,
    zIndex: 2,
  },
  searchInput: {
    borderRadius: 16,
    borderWidth: 1,
    height: 52,
    paddingRight: 42,
    paddingLeft: 14,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  selectionSummaryRow: {
    flexDirection: ROW_DIR,
    gap: 10,
  },
  selectionSummaryCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  selectionSummaryValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
  selectionSummaryLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  itemRow: {
    width: '100%',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  rowCard: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderWidth: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)' as any,
      },
    }),
  },
  rowCardSelected: {
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  rowCardDisabled: {
    opacity: 0.78,
  },
  contactCard: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)' as any,
      },
    }),
  },
  contactLeft: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
  },
  contactName: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },
  contactPhone: {
    fontSize: 12,
    fontWeight: '600',
    writingDirection: 'ltr',
    textAlign: 'left',
    marginTop: 2,
  },
  selectWrap: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  selectCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 0,
    backgroundColor: '#FFFFFF',
  },
  selectCircleSelected: {
    backgroundColor: 'rgba(29,78,216,0.08)',
  },
  selectDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(248,250,252,0.92)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  bottomButtonOuter: {
    height: 60,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  bottomButtonOuterActive: {
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.22,
  },
  bottomButtonOuterDisabled: {
    shadowOpacity: 0.06,
  },
  bottomButtonOuterPressed: {
    transform: [{ scale: 0.99 }],
    shadowOpacity: 0.28,
  },
  bottomButtonInner: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  bottomButtonInnerDisabled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    opacity: 0.78,
  },
  bottomButtonInnerPressed: {
    opacity: 0.96,
  },
  bottomButtonContent: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  bottomIconPill: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
  },

  /* ─── Success Modal ─────────────────────────────── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 12,
    ...Platform.select({
      web: ({ boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any),
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.20,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 16 },
        elevation: 20,
      },
    }),
  },
  modalIconWrap: {
    marginBottom: 6,
  },
  modalIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  modalBody: {
    fontSize: 15,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalCount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  modalCategoryPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  modalCategoryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  modalTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
}); 