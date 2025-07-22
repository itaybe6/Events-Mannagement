import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { GuestItem } from '@/components/GuestItem';
import { Button } from '@/components/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { guestService } from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';

export default function GuestsScreen() {
  const { isLoggedIn, userData } = useUserStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    // טען את האירוע הראשון של המשתמש (אם קיים) ואז את האורחים
    const fetchEventIdAndGuests = async () => {
      if (!userData) return;
      const events = await eventService.getEvents();
      if (events.length > 0) {
        setEventId(events[0].id);
        const data = await guestService.getGuests(events[0].id);
        setGuests(data);
      } else {
        setGuests([]);
      }
    };
    fetchEventIdAndGuests();
  }, [isLoggedIn, router, userData]);

  const loadCategories = async () => {
    if (!eventId) return;
    try {
      const cats = await guestService.getGuestCategories(eventId);
      setCategories(cats);
    } catch (e) {
      setCategories([]);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !eventId) return;
    try {
      const cat = await guestService.addGuestCategory(eventId, newCategoryName.trim());
      setCategories([...categories, cat]);
      setNewCategoryName('');
    } catch (e: any) {
      console.error('Add category error:', e);
      Alert.alert('שגיאה', e?.message || JSON.stringify(e) || 'לא ניתן להוסיף קטגוריה');
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  // הוסף guests ל-state
  const [guests, setGuests] = useState([]);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (eventId) {
      loadCategories();
    }
  }, [eventId]);

  const filteredGuests = guests.filter(guest => {
    const matchesSearch = guest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guest.phone.includes(searchQuery);
    const matchesStatus = statusFilter ? guest.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const guestCounts = {
    total: guests.length,
    coming: guests.filter(g => g.status === 'מגיע').length,
    notComing: guests.filter(g => g.status === 'לא מגיע').length,
    pending: guests.filter(g => g.status === 'ממתין').length,
  };

  const importContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });
        console.log('Contacts data:', data); // לוג
        // Filter contacts that have phone numbers
        const contactsWithPhones = data.filter(contact => 
          Array.isArray(contact.phoneNumbers) && contact.phoneNumbers.length > 0 && contact.phoneNumbers[0].number
        );
        if (contactsWithPhones.length === 0) {
          Alert.alert('לא נמצאו אנשי קשר', 'לא נמצאו אנשי קשר עם מספר טלפון במכשיר שלך.');
        }
        setDeviceContacts(contactsWithPhones);
        if (eventId) {
          router.push({ pathname: '/contacts-list', params: { eventId } });
        }
      } else {
        Alert.alert('נדרשת הרשאה', 'כדי לייבא אנשי קשר, יש צורך בהרשאה לגישה לאנשי הקשר');
      }
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לגשת לאנשי הקשר');
    }
  };

  const toggleContactSelection = (contactId: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const addSelectedContacts = () => {
    selectedContacts.forEach(contactId => {
      const contact = deviceContacts.find(c => c.id === contactId);
      if (contact && selectedCategory) {
        const phoneNumber = contact.phoneNumbers[0]?.number || '';
        const name = contact.name || '';
        addGuest(eventId || '', {
          name,
          phone: phoneNumber,
          status: 'ממתין',
          tableId: null,
          gift: 0,
          message: '',
          category_id: selectedCategory.id,
        });
      }
    });
    setSelectedContacts(new Set());
    setContactsModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="חיפוש אורחים..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.gray[500]}
          />
          <Ionicons name="search" size={20} color={colors.gray[500]} style={styles.searchIcon} />
        </View>
        
        <TouchableOpacity style={styles.addButton} onPress={importContacts}>
          <Ionicons name="person-add" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={[styles.filterButton, statusFilter === null && styles.activeFilter]} 
          onPress={() => setStatusFilter(null)}
        >
          <Text style={[styles.filterText, statusFilter === null && styles.activeFilterText]}>
            הכל ({guestCounts.total})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, statusFilter === 'מגיע' && styles.activeFilter]} 
          onPress={() => setStatusFilter('מגיע')}
        >
          <Text style={[styles.filterText, statusFilter === 'מגיע' && styles.activeFilterText]}>
            מגיעים ({guestCounts.coming})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, statusFilter === 'לא מגיע' && styles.activeFilter]} 
          onPress={() => setStatusFilter('לא מגיע')}
        >
          <Text style={[styles.filterText, statusFilter === 'לא מגיע' && styles.activeFilterText]}>
            לא מגיעים ({guestCounts.notComing})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, statusFilter === 'ממתין' && styles.activeFilter]} 
          onPress={() => setStatusFilter('ממתין')}
        >
          <Text style={[styles.filterText, statusFilter === 'ממתין' && styles.activeFilterText]}>
            ממתינים ({guestCounts.pending})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal בחירת קטגוריה - Apple style */}
      <Modal
        visible={categoryModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
          <View style={styles.appleCategoryModal}>
            <TouchableOpacity style={styles.appleCloseButton} onPress={() => setCategoryModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.appleCategoryTitle}>בחר קטגוריה</Text>
            <FlatList
              data={categories}
              keyExtractor={item => item.id}
              style={styles.appleCategoryList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.appleCategoryItem, selectedCategory?.id === item.id && styles.appleCategoryItemActive]}
                  onPress={() => { setSelectedCategory(item); setCategoryModalVisible(false); }}
                >
                  <Text style={[styles.appleCategoryName, selectedCategory?.id === item.id && styles.appleCategoryNameActive]}>{item.name}</Text>
                  {selectedCategory?.id === item.id && (
                    <Ionicons name="checkmark" size={18} color={colors.white} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyStateText}>אין קטגוריות עדיין</Text>}
            />
            <View style={styles.appleAddCategoryRow}>
              <TextInput
                style={styles.appleAddCategoryInput}
                placeholder="הוסף קטגוריה חדשה"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
              />
              <TouchableOpacity style={styles.appleAddCategoryButton} onPress={handleAddCategory}>
                <Ionicons name="add" size={22} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Guests by category Apple style */}
      <ScrollView style={styles.guestList}>
        {categories.length > 0 ? (
          categories.map(cat => {
            const guestsInCat = guests.filter(g => g.category_id === cat.id);
            console.log('guestsInCat', cat.name, guestsInCat);
            return (
              <View key={cat.id} style={styles.categoryCardModern}>
                <Text style={styles.categoryTitleModern}>{cat.name}</Text>
                <View style={styles.guestsListModern}>
                  {guestsInCat.length > 0 ? (
                    guestsInCat.map(guest => (
                      <View key={guest.id} style={styles.guestCardModern}>
                        <Text style={styles.guestNameModern}>{guest.name}</Text>
                        <Text style={styles.guestPhoneModern}>{guest.phone}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyStateText}>אין אורחים בקטגוריה זו</Text>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>אין קטגוריות עדיין. הוסף קטגוריה חדשה!</Text>
          </View>
        )}
      </ScrollView>

    {/* Contacts Modal */}
    <Modal
      visible={contactsModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setContactsModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>בחר אנשי קשר</Text>
            <TouchableOpacity 
              onPress={() => setContactsModalVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={deviceContacts}
            keyExtractor={(item) => item.id}
            style={styles.contactsList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.contactItem,
                  selectedContacts.has(item.id) && styles.selectedContactItem
                ]}
                onPress={() => toggleContactSelection(item.id)}
              >
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{item.name || 'ללא שם'}</Text>
                  <Text style={styles.contactPhone}>
                    {item.phoneNumbers && item.phoneNumbers[0] && item.phoneNumbers[0].number ? item.phoneNumbers[0].number : 'ללא מספר'}
                  </Text>
                </View>
                <View style={styles.checkboxContainer}>
                  {selectedContacts.has(item.id) && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
          
          <View style={styles.modalActions}>
            <Button
              title={`הוסף ${selectedContacts.size} אנשי קשר`}
              onPress={addSelectedContacts}
              disabled={selectedContacts.size === 0}
              style={styles.addContactsButton}
            />
          </View>
        </View>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
  },
  searchIcon: {
    marginLeft: 8,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.gray[200],
  },
  activeFilter: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 12,
    color: colors.gray[700],
  },
  activeFilterText: {
    color: colors.white,
  },
  guestList: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 16,
  },
  addGuestsButton: {
    marginTop: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  contactsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  selectedContactItem: {
    backgroundColor: colors.primary + '10',
  },
  contactInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  contactPhone: {
    fontSize: 14,
    color: colors.gray[600],
  },
  checkboxContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  modalActions: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  addContactsButton: {
    marginTop: 0,
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
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    justifyContent: 'space-between',
  },
  selectedCategoryItem: {
    backgroundColor: colors.primary + '10',
  },
  categoryName: {
    fontSize: 16,
    color: colors.text,
  },
  addCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  addCategoryInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    backgroundColor: colors.gray[100],
    marginRight: 8,
  },
  addCategoryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // --- Apple style for category modal ---
  appleCategoryModal: {
    backgroundColor: colors.white,
    borderRadius: 28,
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
  appleCategoryTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 18,
    textAlign: 'center',
  },
  appleCategoryList: {
    width: '100%',
    marginBottom: 16,
  },
  appleCategoryItem: {
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
  },
  appleCategoryItemActive: {
    backgroundColor: colors.primary,
  },
  appleCategoryName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  appleCategoryNameActive: {
    color: colors.white,
  },
  appleAddCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
    width: '100%',
  },
  appleAddCategoryInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 14,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.gray[100],
    marginRight: 8,
  },
  appleAddCategoryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleCloseButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  // --- Apple style for guests by category ---
  categoryCardApple: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 18,
    marginBottom: 22,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    width: '100%',
    alignSelf: 'center',
  },
  categoryTitleApple: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 10,
    textAlign: 'right',
  },
  guestCardApple: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    width: '100%',
  },
  guestNameApple: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  guestPhoneApple: {
    fontSize: 14,
    color: colors.textLight,
    marginRight: 8,
    textAlign: 'right',
  },
  // עיצוב מודרני לכרטיסי קטגוריה ואורח
  categoryCardModern: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    width: '100%',
    alignSelf: 'center',
  },
  categoryTitleModern: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 14,
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  guestsListModern: {
    gap: 0,
  },
  guestCardModern: {
    backgroundColor: colors.gray[100],
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  guestNameModern: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
  },
  guestPhoneModern: {
    fontSize: 15,
    color: colors.textLight,
    textAlign: 'left',
    minWidth: 100,
  },
});