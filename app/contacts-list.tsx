import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import * as Contacts from 'expo-contacts';
import { guestService } from '@/lib/services/guestService';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function ContactsListScreen() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'groom' | 'bride'>('groom');
  const [categorySideFilter, setCategorySideFilter] = useState<'groom' | 'bride' | 'all'>('all');
  const router = useRouter();

  // קבל eventId מהניווט
  const params = useLocalSearchParams();
  const eventId = params.eventId as string | undefined;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // טען קטגוריות
      if (eventId) {
        const cats = await guestService.getGuestCategories(eventId);
        setCategories(cats);
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

  const toggleContact = (id: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContacts(newSelected);
  };

  const handleAddGuests = async () => {
    if (!eventId || !selectedCategory) {
      Alert.alert('שגיאה', 'יש לבחור קטגוריה לפני הוספת אורחים');
      return;
    }
    let added = 0;
    for (const id of selectedContacts) {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        const phoneNumber = contact.phoneNumbers[0]?.number || '';
        const name = contact.name || '';
        try {
          await guestService.addGuest(eventId, {
            name,
            phone: phoneNumber,
            status: 'ממתין',
            tableId: null,
            gift: 0,
            message: '',
            category_id: selectedCategory.id,
          });
          added++;
        } catch (e) {}
      }
    }
    Alert.alert('הוספה הושלמה', `נוספו ${added} אורחים לקטגוריה!`);
    router.back();
  };

  // סינון אנשי קשר לפי חיפוש
  const filteredContacts = contacts.filter(c => c.name && c.name.includes(search));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>בחר אנשי קשר להוספה</Text>
      {/* בחירת קטגוריה */}
      <TouchableOpacity style={styles.categorySelector} onPress={() => setCategoryModalVisible(true)}>
        <Text style={styles.categorySelectorText}>
          {selectedCategory ? `קטגוריה: ${selectedCategory.name}` : 'בחר קטגוריה'}
        </Text>
      </TouchableOpacity>
      <Modal
        visible={categoryModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
          <View style={styles.categoryModal}>
            <Text style={styles.categoryModalTitle}>בחר קטגוריה</Text>
            {/* הוספת קטגוריה חדשה */}
            <View style={{ width: '100%', marginBottom: 16 }}>
              <TextInput
                style={[styles.searchInput, { marginBottom: 8 }]}
                placeholder="הוסף קטגוריה חדשה..."
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                textAlign="right"
              />
              {/* בחירת צד */}
              <View style={styles.sideSelector}>
                <Text style={styles.sideSelectorLabel}>בחר צד:</Text>
                <View style={styles.sideButtons}>
                  <TouchableOpacity
                    style={[styles.sideButton, selectedSide === 'groom' && styles.sideButtonActive]}
                    onPress={() => setSelectedSide('groom')}
                  >
                    <Ionicons 
                      name="male" 
                      size={20} 
                      color={selectedSide === 'groom' ? colors.white : colors.primary} 
                    />
                    <Text style={[styles.sideButtonText, selectedSide === 'groom' && styles.sideButtonTextActive]}>
                      חתן
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sideButton, selectedSide === 'bride' && styles.sideButtonActive]}
                    onPress={() => setSelectedSide('bride')}
                  >
                    <Ionicons 
                      name="female" 
                      size={20} 
                      color={selectedSide === 'bride' ? colors.white : colors.primary} 
                    />
                    <Text style={[styles.sideButtonText, selectedSide === 'bride' && styles.sideButtonTextActive]}>
                      כלה
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.addButton, { padding: 10, marginTop: 8 }]}
                onPress={async () => {
                  if (!newCategoryName.trim() || !eventId) return;
                  setAddingCategory(true);
                  try {
                    const newCat = await guestService.addGuestCategory(eventId, newCategoryName.trim(), selectedSide);
                    setCategories(prev => [...prev, newCat]);
                    setSelectedCategory(newCat);
                    setNewCategoryName('');
                    setCategoryModalVisible(false);
                  } catch (e) {
                    Alert.alert('שגיאה', 'לא ניתן להוסיף קטגוריה');
                  }
                  setAddingCategory(false);
                }}
                disabled={addingCategory || !newCategoryName.trim()}
              >
                <Text style={styles.addButtonText}>{addingCategory ? 'מוסיף...' : 'הוסף קטגוריה'}</Text>
              </TouchableOpacity>
            </View>

            {/* סינון קטגוריות לפי צד */}
            <View style={styles.categoryFilterContainer}>
              <Text style={styles.categoryFilterLabel}>סינון קטגוריות:</Text>
              <View style={styles.categoryFilterButtons}>
                <TouchableOpacity
                  style={[styles.categoryFilterButton, categorySideFilter === 'all' && styles.categoryFilterButtonActive]}
                  onPress={() => setCategorySideFilter('all')}
                >
                  <Ionicons 
                    name="people" 
                    size={16} 
                    color={categorySideFilter === 'all' ? colors.white : colors.primary} 
                  />
                  <Text style={[styles.categoryFilterButtonText, categorySideFilter === 'all' && styles.categoryFilterButtonTextActive]}>
                    הכל
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.categoryFilterButton, categorySideFilter === 'groom' && styles.categoryFilterButtonActive]}
                  onPress={() => setCategorySideFilter('groom')}
                >
                  <Ionicons 
                    name="male" 
                    size={16} 
                    color={categorySideFilter === 'groom' ? colors.white : colors.primary} 
                  />
                  <Text style={[styles.categoryFilterButtonText, categorySideFilter === 'groom' && styles.categoryFilterButtonTextActive]}>
                    חתן
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.categoryFilterButton, categorySideFilter === 'bride' && styles.categoryFilterButtonActive]}
                  onPress={() => setCategorySideFilter('bride')}
                >
                  <Ionicons 
                    name="female" 
                    size={16} 
                    color={categorySideFilter === 'bride' ? colors.white : colors.primary} 
                  />
                  <Text style={[styles.categoryFilterButtonText, categorySideFilter === 'bride' && styles.categoryFilterButtonTextActive]}>
                    כלה
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={categories.filter(cat => 
                categorySideFilter === 'all' || cat.side === categorySideFilter
              )}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.categoryModalItem, selectedCategory?.id === item.id && styles.categoryModalItemActive]}
                  onPress={() => { setSelectedCategory(item); setCategoryModalVisible(false); }}
                >
                  <View style={styles.categoryModalItemContent}>
                    <Ionicons 
                      name={item.side === 'groom' ? 'male' : 'female'} 
                      size={18} 
                      color={selectedCategory?.id === item.id ? colors.white : colors.primary} 
                      style={styles.categoryIcon}
                    />
                    <Text style={[styles.categoryModalName, selectedCategory?.id === item.id && styles.categoryModalNameActive]}>{item.name}</Text>
                  </View>
                  {selectedCategory?.id === item.id && (
                    <Ionicons name="checkmark" size={18} color={colors.white} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyStateText}>אין קטגוריות עדיין</Text>}
            />
          </View>
        </View>
      </Modal>
      <TextInput
        style={styles.searchInput}
        placeholder="חפש איש קשר..."
        value={search}
        onChangeText={setSearch}
        textAlign="right"
        placeholderTextColor={colors.gray[500]}
        editable={!!selectedCategory}
      />
      {loading ? (
        <Text>טוען אנשי קשר...</Text>
      ) : filteredContacts.length === 0 ? (
        <Text>לא נמצאו אנשי קשר עם מספר טלפון</Text>
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.contactItem, selectedContacts.has(item.id) && styles.selectedContact, !selectedCategory && { opacity: 0.5 }]}
              onPress={() => selectedCategory && toggleContact(item.id)}
              disabled={!selectedCategory}
            >
              <Text style={styles.contactName}>{item.name || 'ללא שם'}</Text>
              <Text style={styles.contactPhone}>{item.phoneNumbers[0]?.number || 'ללא מספר'}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      <TouchableOpacity
        style={[styles.addButton, (selectedContacts.size === 0 || !selectedCategory) && { backgroundColor: colors.gray[300] }]}
        onPress={handleAddGuests}
        disabled={selectedContacts.size === 0 || !selectedCategory}
      >
        <Text style={styles.addButtonText}>הוסף {selectedContacts.size} אורחים</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: 'flex-end',
  },
  categorySelectorText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 8,
  },
  categoryModal: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    margin: 24,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  categoryModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 18,
    textAlign: 'center',
  },
  categoryModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 10,
    justifyContent: 'space-between',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    width: '100%',
  },
  categoryModalItemActive: {
    backgroundColor: colors.primary,
  },
  categoryModalName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  categoryModalNameActive: {
    color: colors.white,
  },
  contactItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
    borderRadius: 10,
    marginBottom: 8,
  },
  selectedContact: {
    backgroundColor: colors.primary + '20',
  },
  contactName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
  },
  contactPhone: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
  },
  addButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.gray[300],
    textAlign: 'right',
  },
  categoryLabel: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 16,
  },
  sideSelector: {
    width: '100%',
    marginBottom: 16,
  },
  sideSelectorLabel: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  sideButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 4,
  },
  sideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  sideButtonActive: {
    backgroundColor: colors.primary,
  },
  sideButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  sideButtonTextActive: {
    color: colors.white,
  },
  categoryFilterContainer: {
    width: '100%',
    marginBottom: 16,
  },
  categoryFilterLabel: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  categoryFilterButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 4,
  },
  categoryFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  categoryFilterButtonActive: {
    backgroundColor: colors.primary,
  },
  categoryFilterButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  categoryFilterButtonTextActive: {
    color: colors.white,
  },
  categoryModalItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    marginRight: 10,
  },
}); 