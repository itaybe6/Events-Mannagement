import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { GuestItem } from '@/components/GuestItem';
import { Button } from '@/components/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';

export default function GuestsScreen() {
  const { guests, updateGuestStatus, deleteGuest, addGuest, currentEvent } = useEventStore();
  const { isLoggedIn } = useUserStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn, router]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

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
        
        // Filter contacts that have phone numbers
        const contactsWithPhones = data.filter(contact => 
          contact.phoneNumbers && contact.phoneNumbers.length > 0
        );
        
        setDeviceContacts(contactsWithPhones);
        setContactsModalVisible(true);
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
      if (contact) {
        const phoneNumber = contact.phoneNumbers[0]?.number || '';
        const name = contact.name || '';
        addGuest(currentEvent?.id || '', {
          name,
          phone: phoneNumber,
          status: 'ממתין',
          tableId: null,
          gift: 0,
          message: '',
        });
      }
    });
    
    setSelectedContacts(new Set());
    setContactsModalVisible(false);
  };

  return (
    <>
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

      <ScrollView style={styles.guestList}>
        {filteredGuests.length > 0 ? (
          filteredGuests.map(guest => (
            <GuestItem
              key={guest.id}
              guest={guest}
              onStatusChange={(status) => updateGuestStatus(guest.id, status)}
              onDelete={() => deleteGuest(guest.id)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchQuery || statusFilter 
                ? 'לא נמצאו אורחים התואמים את החיפוש'
                : 'אין אורחים עדיין. הוסף אורחים חדשים!'}
            </Text>
            {!searchQuery && !statusFilter && (
              <Link href="/rsvp/invite" asChild>
                <Button 
                  title="הוספת אורחים" 
                  onPress={() => {}} 
                  style={styles.addGuestsButton}
                />
              </Link>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.actionsContainer}>
        <Link href="/seating/edit" asChild>
          <Button
            title="סידור ישיבה"
            onPress={() => {}}
            variant="outline"
            style={styles.actionButton}
          />
        </Link>
        <Link href="/rsvp/invite" asChild>
          <Button
            title="הזמנת אורחים"
            onPress={() => {}}
            style={styles.actionButton}
          />
        </Link>
      </View>
    </View>
    
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
                    {item.phoneNumbers[0]?.number || 'ללא מספר'}
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
    </>
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
});