import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput } from 'react-native';
import * as Contacts from 'expo-contacts';
import { guestService } from '@/lib/services/guestService';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { GuestCategorySelectionSheet } from '@/components/GuestCategorySelectionSheet';

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

  // קבל eventId מהניווט
  const params = useLocalSearchParams();
  const eventId = params.eventId as string | undefined;

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

  const normalizePhoneNumber = (phone: string) => {
    // הסרת כל הרווחים, מקפים וסימנים מיוחדים ושמירה על מספרים בלבד
    return phone.replace(/\D/g, '');
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
}); 