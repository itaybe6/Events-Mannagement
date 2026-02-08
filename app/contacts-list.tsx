import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { guestService } from '@/lib/services/guestService';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { GuestCategorySelectionSheet } from '@/components/GuestCategorySelectionSheet';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ContactsListScreen() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [existingGuests, setExistingGuests] = useState<any[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // קבל eventId מהניווט
  const params = useLocalSearchParams();
  const eventId = params.eventId as string | undefined;
  const autoOpenCategory =
    params.autoOpenCategory === '1' || params.autoOpenCategory === 'true' || params.autoOpenCategory === true;
  const didAutoOpenRef = useRef(false);

  // Local palette - clean white design
  const ui = useMemo(
    () => ({
      primary: '#6366f1', // Indigo-500
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
        
        // טען את כל האורחים הקיימים לבדיקת כפילויות
        const guests = await guestService.getGuests(eventId);
        setExistingGuests(guests);
      }
      // טען אנשי קשר
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });
        const contactsWithPhones = data.filter(contact =>
          Array.isArray(contact.phoneNumbers) && contact.phoneNumbers.length > 0 && contact.phoneNumbers[0].number
        );
        setContacts(contactsWithPhones);
      } else {
        Alert.alert('נדרשת הרשאה', 'כדי לייבא אנשי קשר, יש צורך בהרשאה לגישה לאנשי הקשר');
      }
      setLoading(false);
    };
    fetchData();
  }, [eventId]);

  // If navigated from "+" on Guests screen, open category selector immediately.
  useEffect(() => {
    if (!autoOpenCategory) return;
    if (didAutoOpenRef.current) return;
    if (loading) return;
    if (categoryModalVisible) return;
    if (selectedCategory) return;
    // Open even if categories is empty, so user can create one.
    didAutoOpenRef.current = true;
    setCategoryModalVisible(true);
  }, [autoOpenCategory, categoryModalVisible, loading, selectedCategory]);

  const normalizePhoneNumber = (phone: string) => {
    // הסרת כל הרווחים, מקפים וסימנים מיוחדים ושמירה על מספרים בלבד
    return phone.replace(/\D/g, '');
  };

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
    
    contactsToAdd.forEach(contact => {
      const contactPhone = normalizePhoneNumber(contact.phoneNumbers[0]?.number || '');
      const isDuplicate = existingGuests.some(guest => 
        normalizePhoneNumber(guest.phone) === contactPhone
      );
      
      if (isDuplicate) {
        duplicates.push(contact);
      } else {
        newGuests.push(contact);
      }
    });
    
    return { duplicates, newGuests };
  };

  const handleAddGuests = async () => {
    if (!eventId || !selectedCategory) {
      Alert.alert('שגיאה', 'יש לבחור קטגוריה לפני הוספת אורחים');
      return;
    }
    
    const contactsToAdd = Array.from(selectedContacts).map(id => 
      contacts.find(c => c.id === id)
    ).filter(Boolean);
    
    const { duplicates, newGuests } = checkForDuplicates(contactsToAdd);
    
    if (duplicates.length > 0) {
      const duplicateNames = duplicates.map(d => d.name || 'ללא שם').join(', ');
      
      if (newGuests.length === 0) {
        // כל האורחים כפולים
        Alert.alert(
          'אורחים כפולים',
          `כל האורחים שנבחרו כבר קיימים באירוע:\n${duplicateNames}`,
          [{ text: 'אוקיי', style: 'default' }]
        );
        return;
      } else {
        // חלק כפולים וחלק חדשים
        Alert.alert(
          'האם להמשיך?',
          `האורחים הבאים כבר קיימים ולא יתווספו:\n${duplicateNames}\n\nהאם להוסיף את שאר האורחים (${newGuests.length})?`,
          [
            { text: 'ביטול', style: 'cancel' },
            { 
              text: 'הוסף את החדשים', 
              style: 'default',
              onPress: () => addGuestsToDatabase(newGuests)
            }
          ]
        );
        return;
      }
    }
    
    // אין כפילויות - הוסף את כל האורחים
    addGuestsToDatabase(newGuests);
  };

  const addGuestsToDatabase = async (guestsToAdd: any[]) => {
    let added = 0;
    for (const contact of guestsToAdd) {
      const phoneNumber = contact.phoneNumbers[0]?.number || '';
      const name = contact.name || '';
      try {
        await guestService.addGuest(eventId!, {
          name,
          phone: phoneNumber,
          status: 'ממתין',
          tableId: null,
          gift: 0,
          message: '',
          category_id: selectedCategory.id,
        });
        added++;
      } catch (e) {
        console.error('Error adding guest:', e);
      }
    }
    Alert.alert('הוספה הושלמה', `נוספו ${added} אורחים חדשים לקטגוריה!`);
    router.back();
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

  // סינון אנשי קשר לפי חיפוש
  const filteredContacts = contacts.filter(c => {
    const name = String(c?.name || '');
    const phone = String(c?.phoneNumbers?.[0]?.number || '');
    const q = search.trim();
    if (!q) return !!name;
    return name.toLowerCase().includes(q.toLowerCase()) || phone.includes(q);
  });

  const canAdd = !!selectedCategory && selectedContacts.size > 0;
  const bottomSafe = Math.max(16, insets.bottom + 12);

  return (
    <View style={[styles.container, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <GuestCategorySelectionSheet
        visible={categoryModalVisible}
        categories={categories}
        selectedCategoryId={selectedCategory?.id ?? null}
        onClose={() => setCategoryModalVisible(false)}
        onSelect={(cat) => setSelectedCategory(cat)}
        onCreateCategory={async (name, side) => {
          if (!eventId) throw new Error('Missing eventId');
          const created = await guestService.addGuestCategory(eventId, name, side);
          setCategories(prev => [...prev, created]);
          setSelectedCategory(created);
          return created;
        }}
      />

      <FlatList
        data={filteredContacts}
        extraData={selectedContacts}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, width: '100%' }}
        // NOTE: Keep the header full-width; apply horizontal padding per-item instead.
        contentContainerStyle={{ width: '100%', paddingBottom: 140 }}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View
            style={[
              styles.header,
              {
                paddingTop: Math.max(12, insets.top) + 12,
                backgroundColor: ui.surfaceSoft,
                borderBottomColor: ui.border,
              },
            ]}
          >
            <View style={styles.navRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="חזרה"
              >
                <Ionicons name="chevron-forward" size={24} color={ui.primary} />
                <Text style={[styles.backText, { color: ui.primary }]}>חזרה</Text>
              </TouchableOpacity>

              <Text style={[styles.navTitle, { color: ui.textStrong }]}>רשימת אנשי קשר</Text>
              <View style={{ width: 48 }} />
            </View>

            <View style={{ gap: 16, paddingBottom: 16 }}>
              <View style={styles.topButtonsGrid}>
                <Pressable
                  onPress={() => setCategoryModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="בחר קטגוריה"
                  style={({ pressed }) => [
                    styles.topButtonBase,
                    styles.topButtonPrimary,
                    pressed && styles.topButtonPrimaryPressed,
                  ]}
                >
                  <MaterialIcons name="label" size={18} color={ui.primary} style={{ marginLeft: 8 }} />
                  <Text style={[styles.topButtonText, { color: ui.primary }]} numberOfLines={1}>
                    {selectedCategory ? selectedCategory.name : 'בחר קטגוריה'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setCategoryModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="החלף קטגוריה"
                  style={({ pressed }) => [
                    styles.topButtonBase,
                    styles.topButtonSecondary,
                    pressed && styles.topButtonSecondaryPressed,
                  ]}
                >
                  <MaterialIcons name="swap-horiz" size={18} color="#374151" style={{ marginLeft: 8 }} />
                  <Text style={[styles.topButtonText, { color: '#374151' }]} numberOfLines={1}>
                    החלף קטגוריה
                  </Text>
                </Pressable>
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
                  placeholder="חפש איש קשר..."
                  value={search}
                  onChangeText={setSearch}
                  placeholderTextColor={'#9CA3AF'}
                  editable={!!selectedCategory}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
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
              onPress={() => (selectedCategory ? toggleContact(item.id) : undefined)}
              disabled={disabled}
              style={styles.itemRow}
            >
              {({ pressed }) => (
                <>
                  {/* Card (right side) */}
                  <View
                    style={[
                      styles.contactCard,
                      {
                        backgroundColor: selected ? ui.selectedBg : pressed ? ui.pressedBg : ui.surface,
                        borderColor: selected ? ui.selectedBorder : ui.border,
                        opacity: pressed ? 0.98 : 1,
                        transform: [{ scale: pressed ? 0.995 : 1 }],
                      },
                    ]}
                  >
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
                        <Text style={[styles.contactPhone, { color: ui.muted }]}>
                          {phone}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Selection circle (left side, OUTSIDE the card) */}
                  <View style={styles.selectWrap} pointerEvents="none">
                    <View
                      style={[
                        styles.selectCircle,
                        {
                          borderColor: selected ? ui.primary : '#D1D5DB',
                          opacity: contentOpacity,
                        },
                      ]}
                    >
                      {selected && <View style={[styles.selectDot, { backgroundColor: ui.primary }]} />}
                    </View>
                  </View>
                </>
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
          style={({ pressed }) => [
            styles.bottomButtonSurface,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              opacity: !canAdd ? 0.72 : pressed ? 0.92 : 1,
            },
          ]}
        >
          <MaterialIcons
            name="group-add"
            size={22}
            color={canAdd ? ui.primary : '#9CA3AF'}
            style={{ marginLeft: 8 }}
          />
          <Text style={[styles.bottomButtonText, { color: canAdd ? ui.primary : '#9CA3AF' }]}>
            הוסף {selectedContacts.size} אורחים
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },

  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    width: '100%',
    alignSelf: 'stretch',
    ...Platform.select({
      web: {
        // RN-web supports sticky in many setups; harmless elsewhere.
        position: 'sticky' as any,
        top: 0,
        zIndex: 30,
        backdropFilter: 'blur(10px)' as any,
      },
    }),
  },
  navRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
    paddingRight: 20,
  },
  topButtonsGrid: {
    flexDirection: 'row-reverse',
    // Don't rely on `gap` for iOS compatibility across RN versions.
    marginHorizontal: -6, // creates `gap-3` (12px) using child margins
  },
  topButtonBase: {
    flex: 1,
    height: 44,
    borderRadius: 8, // rounded-lg
    paddingVertical: 10, // py-2.5
    paddingHorizontal: 12, // px-3
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6, // half of gap-3
  },
  topButtonText: {
    fontSize: 14, // text-sm
    fontWeight: '500', // font-medium
    textAlign: 'right',
    flexShrink: 1,
  },
  topButtonPrimary: {
    backgroundColor: 'rgba(99,102,241,0.10)', // primary/10
    borderColor: 'rgba(99,102,241,0.20)', // primary/20
  },
  topButtonPrimaryPressed: {
    backgroundColor: 'rgba(99,102,241,0.20)', // primary/20
  },
  topButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB', // gray-300
  },
  topButtonSecondaryPressed: {
    backgroundColor: '#F9FAFB', // gray-50
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
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    paddingRight: 42,
    paddingLeft: 14,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  itemRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  contactCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)' as any,
      },
    }),
  },
  contactLeft: {
    flexDirection: 'row-reverse',
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
    textAlign: 'right',
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
  },
  bottomButtonSurface: {
    height: 60,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
}); 