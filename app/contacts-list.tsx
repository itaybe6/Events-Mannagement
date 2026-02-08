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
import { Ionicons } from '@expo/vector-icons';
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
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // קבל eventId מהניווט
  const params = useLocalSearchParams();
  const eventId = params.eventId as string | undefined;
  const autoOpenCategory =
    params.autoOpenCategory === '1' || params.autoOpenCategory === 'true' || params.autoOpenCategory === true;
  const didAutoOpenRef = useRef(false);

  // Local palette (matches the provided HTML design)
  const ui = useMemo(
    () => ({
      primary: '#6366f1', // Indigo-500
      bg: '#F3F4F6', // Gray-100
      surface: '#FFFFFF',
      text: '#1F2937',
      muted: '#6B7280',
      border: '#E5E7EB',
      inputBg: '#F9FAFB',
    }),
    []
  );

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

  const gradients = useMemo(
    () => [
      ['#E0E7FF', '#F3E8FF'], // indigo -> purple (like sample)
      ['#FCE7F3', '#FFE4E6'], // pink -> rose
      ['#DBEAFE', '#CFFAFE'], // blue -> cyan
      ['#FEF3C7', '#FFEDD5'], // amber -> orange
      ['#DCFCE7', '#D1FAE5'], // green -> emerald
      ['#CCFBF1', '#CFFAFE'], // teal -> cyan
    ],
    []
  );

  const avatarGradientFor = (name?: string) => {
    const key = (name || '').trim();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return gradients[hash % gradients.length];
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
    <View style={styles.container}>
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
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 140 }}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View
            style={[
              styles.header,
              {
                paddingTop: Math.max(12, insets.top) + 12,
                backgroundColor: 'rgba(255,255,255,0.95)',
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

              <Text style={[styles.navTitle, { color: ui.text }]}>רשימת אנשי קשר</Text>
              <View style={{ width: 48 }} />
            </View>

            <View style={{ gap: 12, paddingBottom: 12 }}>
              <View style={styles.topRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.categoryCard,
                    {
                      borderColor: ui.primary + '26',
                      backgroundColor: ui.primary + '12',
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                  onPress={() => setCategoryModalVisible(true)}
                >
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                    <Ionicons name="pricetag" size={18} color={ui.primary} style={{ marginLeft: 10 }} />
                    <Text
                      style={[styles.categoryCardText, { color: ui.text }]}
                      numberOfLines={1}
                    >
                      {selectedCategory ? selectedCategory.name : 'בחר קטגוריה'}
                    </Text>
                  </View>
                  <Ionicons name="pencil" size={14} color={ui.primary + 'AA'} />
                </Pressable>

                <TouchableOpacity
                  style={[styles.switchCategoryButton, { borderColor: ui.border }]}
                  onPress={() => setCategoryModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="החלף קטגוריה"
                >
                  <Ionicons name="swap-horizontal" size={18} color={ui.text} style={{ marginLeft: 8 }} />
                  <Text style={[styles.switchCategoryText, { color: ui.text }]}>
                    {selectedCategory ? 'החלף קטגוריה' : 'בחר קטגוריה'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.searchWrap}>
                <Ionicons
                  name="search"
                  size={18}
                  color={ui.muted}
                  style={styles.searchIcon}
                />
                <TextInput
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: ui.inputBg,
                      borderColor: ui.border,
                      color: ui.text,
                    },
                  ]}
                  placeholder="חפש איש קשר..."
                  value={search}
                  onChangeText={setSearch}
                  placeholderTextColor={ui.muted}
                  editable={!!selectedCategory}
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
          const initials = getInitials(item?.name);
          const gradient = avatarGradientFor(item?.name);
          const phone = String(item?.phoneNumbers?.[0]?.number || 'ללא מספר');
          return (
            <Pressable
              onPress={() => (selectedCategory ? toggleContact(item.id) : undefined)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.contactCard,
                {
                  backgroundColor: ui.surface,
                  borderColor: pressed ? ui.primary + '26' : 'transparent',
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
            >
              <View style={styles.contactLeft}>
                <LinearGradient colors={gradient} style={styles.avatarCircle}>
                  <Text style={[styles.avatarText, { color: ui.primary }]}>{initials}</Text>
                </LinearGradient>

                <View style={{ flexShrink: 1 }}>
                  <Text style={[styles.contactName, { color: ui.text }]} numberOfLines={1}>
                    {item?.name || 'ללא שם'}
                  </Text>
                  <Text style={[styles.contactPhone, { color: ui.muted }]} dir="ltr">
                    {phone}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.selectCircle,
                  {
                    borderColor: selected ? ui.primary : ui.border,
                  },
                ]}
              >
                {selected && <View style={[styles.selectDot, { backgroundColor: ui.primary }]} />}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Bottom fixed action */}
      <View pointerEvents="box-none" style={styles.bottomFixed}>
        <LinearGradient
          colors={[
            'rgba(243,244,246,0)',
            'rgba(243,244,246,0.95)',
            'rgba(243,244,246,1)',
          ]}
          style={[styles.bottomGradient, { paddingBottom: bottomSafe }]}
        >
          <Pressable
            onPress={handleAddGuests}
            disabled={!canAdd}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: ui.surface,
                borderColor: ui.border,
                opacity: canAdd ? (pressed ? 0.92 : 1) : 0.75,
              },
            ]}
          >
            <Ionicons name="people-outline" size={20} color={canAdd ? ui.primary : ui.muted} style={{ marginLeft: 10 }} />
            <Text style={[styles.addBtnText, { color: canAdd ? ui.primary : ui.muted }]}>
              הוסף {selectedContacts.size} אורחים
            </Text>
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },

  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
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
    fontWeight: '800',
    textAlign: 'center',
    flex: 1,
    paddingRight: 20,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  categoryCard: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  categoryCardText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: 220,
  },
  switchCategoryButton: {
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    backgroundColor: '#fff',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  switchCategoryText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
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
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    paddingRight: 42,
    paddingLeft: 14,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  contactCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
  },
  contactName: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  contactPhone: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },
  selectCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  selectDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  bottomFixed: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomGradient: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  addBtn: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
}); 