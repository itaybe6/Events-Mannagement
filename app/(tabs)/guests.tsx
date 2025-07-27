import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { GuestItem } from '@/components/GuestItem';
import { Button } from '@/components/Button';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { guestService } from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { supabase } from '@/lib/supabase';

export default function GuestsScreen() {
  const { isLoggedIn, userData } = useUserStore();
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (!userData?.event_id) {
      setEventId(null);
      setGuests([]);
      setCategories([]);
      return;
    }
    setEventId(userData.event_id);
    // טען אורחים וקטגוריות לאירוע של המשתמש
    const fetchGuestsAndCategories = async () => {
      if (userData.event_id) {
        const data = await guestService.getGuests(userData.event_id);
        setGuests(data);
        await loadCategories(userData.event_id);
      }
    };
    fetchGuestsAndCategories();
  }, [isLoggedIn, router, userData]);

  // טען מחדש אורחים וקטגוריות כשהמסך חוזר למוקד
  useFocusEffect(
    React.useCallback(() => {
      if (eventId) {
        const reloadGuests = async () => {
          const data = await guestService.getGuests(eventId);
          setGuests(data);
          await loadCategories(eventId);
        };
        reloadGuests();
      }
    }, [eventId])
  );

  const loadCategories = async (eid?: string) => {
    const id = eid || eventId;
    if (!id) return;
    try {
      const cats = await guestService.getGuestCategories(id);
      
      // בדוק אם יש קטגוריות ללא שדה side ועדכן אותן
      const categoriesToUpdate = cats.filter(cat => !cat.side);
      if (categoriesToUpdate.length > 0) {
        // עדכן את הקטגוריות ללא side ל-groom (ברירת מחדל)
        for (const cat of categoriesToUpdate) {
          try {
            await supabase
              .from('guest_categories')
              .update({ side: 'groom' })
              .eq('id', cat.id);
          } catch (e) {
            console.error(`Failed to update category ${cat.name}:`, e);
          }
        }
        // טען מחדש את הקטגוריות
        const updatedCats = await guestService.getGuestCategories(id);
        setCategories(updatedCats);
      } else {
        setCategories(cats);
      }
    } catch (e) {
      console.error('Load categories error:', e);
      setCategories([]);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !eventId) return;
    try {
      const cat = await guestService.addGuestCategory(eventId, newCategoryName.trim(), 'groom'); // ברירת מחדל לחתן
      setCategories([...categories, cat]);
      setNewCategoryName('');
    } catch (e: any) {
      console.error('Add category error:', e);
      Alert.alert('שגיאה', e?.message || JSON.stringify(e) || 'לא ניתן להוסיף קטגוריה');
    }
  };

  // קבל קטגוריות לפי צד
  const getCategoriesBySide = (side: 'groom' | 'bride') => {
    const filtered = categories.filter(cat => cat.side === side);
    return filtered;
  };

  // קבל אורחים לפי צד
  const getGuestsBySide = (side: 'groom' | 'bride') => {
    const sideCategories = getCategoriesBySide(side);
    const sideCategoryIds = sideCategories.map(cat => cat.id);
    const filteredGuests = guests.filter(guest => sideCategoryIds.includes(guest.category_id));
    return filteredGuests;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sideFilter, setSideFilter] = useState<'groom' | 'bride' | null>(null);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  // הוסף guests ל-state
  const [guests, setGuests] = useState<any[]>([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<any>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestPhone, setEditGuestPhone] = useState('');
  const [editCategoryModalVisible, setEditCategoryModalVisible] = useState(false);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [selectedCategoryGuests, setSelectedCategoryGuests] = useState<any[]>([]);
  const [selectedGuestsToDelete, setSelectedGuestsToDelete] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (eventId) {
      loadCategories();
    }
  }, [eventId]);

  // אורחים מסוננים לפי כל הפילטרים
  const filteredGuests = guests.filter(guest => {
    const matchesSearch = guest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guest.phone.includes(searchQuery);
    const matchesStatus = statusFilter ? guest.status === statusFilter : true;
    
    // סינון לפי צד
    let matchesSide = true;
    if (sideFilter) {
      const sideCategories = getCategoriesBySide(sideFilter);
      const sideCategoryIds = sideCategories.map(cat => cat.id);
      matchesSide = sideCategoryIds.includes(guest.category_id);
    }
    
    return matchesSearch && matchesStatus && matchesSide;
  });

  // ספירת אורחים לפי צד
  const sideCounts = {
    groom: getGuestsBySide('groom').length,
    bride: getGuestsBySide('bride').length,
  };

 

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
        guestService.addGuest(eventId || '', {
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

  // פונקציות לעריכת ומחיקת אורחים
  const handleLongPressGuest = (guest: any) => {
    setSelectedGuest(guest);
    setEditGuestName(guest.name);
    setEditGuestPhone(guest.phone);
    setEditModalVisible(true);
  };

  const handleEditGuest = async () => {
    if (!selectedGuest || !editGuestName.trim()) return;
    
    try {
      await guestService.updateGuest(selectedGuest.id, {
        name: editGuestName.trim(),
        phone: editGuestPhone.trim(),
      });
      
      // עדכן את הרשימה המקומית
      setGuests(prev => prev.map(g => 
        g.id === selectedGuest.id 
          ? { ...g, name: editGuestName.trim(), phone: editGuestPhone.trim() }
          : g
      ));
      
      setEditModalVisible(false);
      setSelectedGuest(null);
      setEditGuestName('');
      setEditGuestPhone('');
    } catch (e) {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את האורח');
    }
  };

  const handleDeleteGuest = async () => {
    if (!selectedGuest) return;
    
    Alert.alert(
      'מחיקת אורח',
      `האם אתה בטוח שברצונך למחוק את ${selectedGuest.name}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              await guestService.deleteGuest(selectedGuest.id);
              
              // הסר מהרשימה המקומית
              setGuests(prev => prev.filter(g => g.id !== selectedGuest.id));
              
              setEditModalVisible(false);
              setSelectedGuest(null);
              setEditGuestName('');
              setEditGuestPhone('');
            } catch (e) {
              Alert.alert('שגיאה', 'לא ניתן למחוק את האורח');
            }
          }
        }
      ]
    );
  };

  // פונקציה להחזרת אייקון סטטוס בסגנון Apple
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'מגיע':
        return (
          <View style={styles.statusIconContainer}>
            <View style={[styles.statusIcon, styles.statusComing]}>
              <Ionicons name="checkmark" size={16} color={colors.white} />
            </View>
          </View>
        );
      case 'לא מגיע':
        return (
          <View style={styles.statusIconContainer}>
            <View style={[styles.statusIcon, styles.statusNotComing]}>
              <Ionicons name="close" size={16} color={colors.white} />
            </View>
          </View>
        );
      case 'ממתין':
        return (
          <View style={styles.statusIconContainer}>
            <View style={[styles.statusIcon, styles.statusPending]}>
              <Ionicons name="time" size={16} color={colors.white} />
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const handleEditCategory = (category: any) => {
    setSelectedCategory(category);
    setEditCategoryName(category.name || '');
    const guestsInCat = guests.filter(g => g.category_id === category.id);
    setSelectedCategoryGuests(guestsInCat || []);
    setSelectedGuestsToDelete(new Set());
    setEditCategoryModalVisible(true);
  };

  const handleSaveCategoryName = async () => {
    if (!selectedCategory || !editCategoryName.trim()) return;
    try {
      await guestService.updateGuestCategory(selectedCategory.id, { name: editCategoryName.trim() });
      setCategories(prev => prev.map(cat => cat.id === selectedCategory.id ? { ...cat, name: editCategoryName.trim() } : cat));
      setEditCategoryModalVisible(false);
    } catch (e) {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את שם הקטגוריה');
    }
  };

  const handleToggleGuestToDelete = (guestId: string) => {
    setSelectedGuestsToDelete(prev => {
      const newSet = new Set(prev);
      if (newSet.has(guestId)) newSet.delete(guestId);
      else newSet.add(guestId);
      return newSet;
    });
  };

  const handleDeleteSelectedGuests = async () => {
    if (selectedGuestsToDelete.size === 0) return;
    Alert.alert('מחיקת אורחים', `האם למחוק ${selectedGuestsToDelete.size} אורחים?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive', onPress: async () => {
          try {
            for (const guestId of selectedGuestsToDelete) {
              await guestService.deleteGuest(guestId);
            }
            setGuests(prev => prev.filter(g => !selectedGuestsToDelete.has(g.id)));
            setEditCategoryModalVisible(false);
          } catch (e) {
            Alert.alert('שגיאה', 'לא ניתן למחוק אורחים');
          }
        }
      }
    ]);
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

      {/* פילטר לפי צד */}
      <View style={styles.sideFilterContainer}>
        <TouchableOpacity 
          style={[styles.sideFilterButton, sideFilter === null && styles.activeSideFilter]} 
          onPress={() => {
            setSideFilter(null);
          }}
        >
          <Ionicons name="people" size={20} color={sideFilter === null ? colors.white : colors.primary} />
          <Text style={[styles.sideFilterText, sideFilter === null && styles.activeSideFilterText]}>
            הכל
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.sideFilterButton, sideFilter === 'groom' && styles.activeSideFilter]} 
          onPress={() => {
            setSideFilter('groom');
          }}
        >
          <Ionicons name="male" size={20} color={sideFilter === 'groom' ? colors.white : colors.primary} />
          <Text style={[styles.sideFilterText, sideFilter === 'groom' && styles.activeSideFilterText]}>
            חתן ({sideCounts.groom})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.sideFilterButton, sideFilter === 'bride' && styles.activeSideFilter]} 
          onPress={() => {
            setSideFilter('bride');
          }}
        >
          <Ionicons name="female" size={20} color={sideFilter === 'bride' ? colors.white : colors.primary} />
          <Text style={[styles.sideFilterText, sideFilter === 'bride' && styles.activeSideFilterText]}>
            כלה ({sideCounts.bride})
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
          categories
            .filter(cat => !sideFilter || cat.side === sideFilter) // סינון קטגוריות לפי צד
            .map(cat => {
            const guestsInCat = filteredGuests.filter(g => g.category_id === cat.id);
            return (
              <View key={cat.id} style={styles.categoryCardModern}>
                <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.categoryTitleModern, { textAlign: 'right', flex: 1 }]}>{cat.name}</Text>
                  <TouchableOpacity onPress={() => handleEditCategory(cat)} style={styles.editCategoryButton}>
                    <Ionicons name="create-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.guestsListModern}>
                  {guestsInCat.length > 0 ? (
                    <View style={styles.guestsGrid}>
                      {guestsInCat.map(guest => (
                        <TouchableOpacity 
                          key={guest.id} 
                          style={styles.guestCardModern}
                          onLongPress={() => handleLongPressGuest(guest)}
                        >
                          <View style={styles.guestInfoContainer}>
                            <Text style={styles.guestNameModern} numberOfLines={1} ellipsizeMode="tail">{guest.name}</Text>
                            <Text style={styles.guestPhoneModern} numberOfLines={1} ellipsizeMode="tail">{guest.phone}</Text>
                          </View>
                          {getStatusIcon(guest.status)}
                        </TouchableOpacity>
                      ))}
                    </View>
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

    {/* מודל עריכת אורח */}
    <Modal
      visible={editModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setEditModalVisible(false)}
    >
      <KeyboardAvoidingView 
        style={styles.modalContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>עריכת אורח</Text>
            <TouchableOpacity 
              onPress={() => setEditModalVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.editForm} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>שם:</Text>
              <TextInput
                style={styles.editInput}
                value={editGuestName}
                onChangeText={setEditGuestName}
                placeholder="הזן שם"
                textAlign="right"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>טלפון:</Text>
              <TextInput
                style={styles.editInput}
                value={editGuestPhone}
                onChangeText={setEditGuestPhone}
                placeholder="הזן מספר טלפון"
                textAlign="right"
                keyboardType="phone-pad"
              />
            </View>
          </ScrollView>
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.deleteButton]} 
              onPress={handleDeleteGuest}
            >
              <Ionicons name="trash" size={20} color={colors.white} />
              <Text style={styles.deleteButtonText}>מחק</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.saveButton]} 
              onPress={handleEditGuest}
            >
              <Ionicons name="checkmark" size={20} color={colors.white} />
              <Text style={styles.saveButtonText}>שמור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* מודל עריכת קטגוריה */}
    <Modal
      visible={editCategoryModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setEditCategoryModalVisible(false)}
    >
      <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalContent, { maxHeight: 500, minHeight: 350, width: '96%', padding: 28 }]}> {/* הגדלה */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>עריכת קטגוריה</Text>
            <TouchableOpacity onPress={() => setEditCategoryModalVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>שם הקטגוריה:</Text>
            <TextInput
              style={styles.editInput}
              value={editCategoryName || ''}
              onChangeText={setEditCategoryName}
              placeholder="הזן שם"
              textAlign="right"
            />
          </View>
          <Text style={[styles.inputLabel, { marginBottom: 8 }]}>בחר אורחים למחיקה:</Text>
          <ScrollView style={{ maxHeight: 180 }}>
            {selectedCategoryGuests && Array.isArray(selectedCategoryGuests) && selectedCategoryGuests.length > 0 ? (
              <View>
                {selectedCategoryGuests.map(guest => {
                  if (!guest || !guest.id) return null;
                  return (
                    <TouchableOpacity
                      key={guest.id}
                      style={{ flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10, paddingVertical: 5 }}
                      onPress={() => handleToggleGuestToDelete(guest.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 17, color: colors.text, textAlign: 'right' }}>
                          {guest.name || 'שם לא זמין'}
                        </Text>
                      </View>
                      <Ionicons
                        name={selectedGuestsToDelete.has(guest.id) ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={selectedGuestsToDelete.has(guest.id) ? colors.primary : colors.gray[400]}
                        style={{ marginLeft: 12 }}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={{ paddingVertical: 20 }}>
                <Text style={styles.emptyStateText}>אין אורחים בקטגוריה זו</Text>
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton, { flex: 1, marginLeft: 8 }]}
              onPress={handleDeleteSelectedGuests}
              disabled={selectedGuestsToDelete.size === 0}
            >
              <Text style={styles.deleteButtonText}>מחק נבחרים</Text>
              <Ionicons name="trash" size={20} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.saveButton, { flex: 1, marginRight: 8 }]}
              onPress={handleSaveCategoryName}
            >
              <Text style={styles.saveButtonText}>שמור שם</Text>
              <Ionicons name="checkmark" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  deleteButton: {
    backgroundColor: colors.error,
    width: '48%', // Adjust as needed for equal width
  },
  saveButton: {
    backgroundColor: colors.primary,
    width: '48%', // Adjust as needed for equal width
  },
  deleteButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 20,
    margin: 20,
    maxHeight: '60%',
    minHeight: 300,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  guestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  guestCardModern: {
    width: '47%',
    minWidth: 160,
    backgroundColor: colors.gray[100],
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  guestInfoContainer: {
    flex: 1,
    marginRight: 10,
  },
  guestNameModern: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 3,
  },
  guestPhoneModern: {
    fontSize: 13,
    color: colors.textLight,
    textAlign: 'right',
  },
  // פילטר לפי צד
  sideFilterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    backgroundColor: colors.gray[200],
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  sideFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  activeSideFilter: {
    backgroundColor: colors.primary,
  },
  sideFilterText: {
    fontSize: 12,
    color: colors.gray[700],
    marginLeft: 8,
  },
  activeSideFilterText: {
    color: colors.white,
  },
  editForm: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexGrow: 0,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.gray[100],
    textAlign: 'right',
  },
  // אייקוני סטטוס בסגנון Apple
  statusIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statusIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusComing: {
    backgroundColor: colors.success,
  },
  statusNotComing: {
    backgroundColor: colors.error,
  },
  statusPending: {
    backgroundColor: colors.warning,
  },
  editCategoryButton: {
    padding: 8,
  },
});