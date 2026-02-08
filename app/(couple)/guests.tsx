import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList, KeyboardAvoidingView } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { GuestItem } from '@/components/GuestItem';
import { Button } from '@/components/Button';
import { Ionicons } from '@expo/vector-icons';
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
      const cat = await guestService.addGuestCategory(eventId, newCategoryName.trim(), newCategorySide);
      setCategories([...categories, cat]);
      setNewCategoryName('');
    } catch (e: any) {
      console.error('Add category error:', e);
      const errorMessage =
        e?.message ||
        e?.details ||
        e?.hint ||
        (typeof e === 'string' ? e : '') ||
        'לא ניתן להוסיף קטגוריה';
      Alert.alert('שגיאה', errorMessage);
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
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySide, setNewCategorySide] = useState<'groom' | 'bride'>('groom');
  // הוסף guests ל-state
  const [guests, setGuests] = useState<any[]>([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<any>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestPhone, setEditGuestPhone] = useState('');
  const [editGuestStatus, setEditGuestStatus] = useState<'ממתין' | 'מגיע' | 'לא מגיע'>('ממתין');
  const [editGuestPeopleCount, setEditGuestPeopleCount] = useState('1');
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
    groom: getGuestsBySide('groom').reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
    bride: getGuestsBySide('bride').reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
  };

 

  const guestCounts = {
    total: guests.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
    coming: guests.filter(g => g.status === 'מגיע').reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
    notComing: guests.filter(g => g.status === 'לא מגיע').reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
    pending: guests.filter(g => g.status === 'ממתין').reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
  };

  const importContacts = async () => {
    try {
      if (!eventId) return;
      // Navigate immediately and auto-open the category selector there.
      // Contacts permissions + loading are handled in `/contacts-list`.
      router.push({ pathname: '/contacts-list', params: { eventId, autoOpenCategory: '1' } });
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לפתוח את רשימת אנשי הקשר');
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
          numberOfPeople: 1,
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
    setEditGuestStatus(guest.status || 'ממתין');
    setEditGuestPeopleCount(String(guest.numberOfPeople || 1));
    setEditModalVisible(true);
  };

  const handleEditGuest = async () => {
    if (!selectedGuest || !editGuestName.trim()) return;
    
    try {
      const peopleCount = parseInt(editGuestPeopleCount) || 1;
      
      await guestService.updateGuest(selectedGuest.id, {
        name: editGuestName.trim(),
        phone: editGuestPhone.trim(),
        status: editGuestStatus,
        numberOfPeople: peopleCount,
      });
      
      // עדכן את הרשימה המקומית
      setGuests(prev => prev.map(g => 
        g.id === selectedGuest.id 
          ? { 
              ...g, 
              name: editGuestName.trim(), 
              phone: editGuestPhone.trim(),
              status: editGuestStatus,
              numberOfPeople: peopleCount
            }
          : g
      ));
      
      setEditModalVisible(false);
      setSelectedGuest(null);
      setEditGuestName('');
      setEditGuestPhone('');
      setEditGuestStatus('ממתין');
      setEditGuestPeopleCount('1');
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
              setEditGuestStatus('ממתין');
              setEditGuestPeopleCount('1');
            } catch (e) {
              Alert.alert('שגיאה', 'לא ניתן למחוק את האורח');
            }
          }
        }
      ]
    );
  };

  // פונקציה להחזרת אייקון סטטוס
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'מגיע':
        return (
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
        );
      case 'לא מגיע':
        return (
          <Ionicons name="close-circle" size={22} color={colors.error} />
        );
      case 'ממתין':
        return (
          <Ionicons name="time-outline" size={22} color={colors.warning} />
        );
      default:
        return <Ionicons name="help-circle-outline" size={22} color={colors.gray[400]} />;
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
      <View style={styles.pageHeader}>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="חיפוש שם או טלפון..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={colors.gray[500]}
            />
          </View>

          <TouchableOpacity
            style={styles.filterIconButton}
            onPress={() => setFilterModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="סינון"
          >
            <Ionicons name="options-outline" size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addIconButton}
            onPress={importContacts}
            accessibilityRole="button"
            accessibilityLabel="הוספת אורח"
          >
            <Ionicons name="add" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.filterModalOverlay}>
          <View style={styles.filterModalCard}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>סינון</Text>
              <TouchableOpacity
                onPress={() => setFilterModalVisible(false)}
                style={styles.filterModalClose}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.filterSectionTitle}>סטטוס</Text>
              {[
                { key: null, label: `הכל (${guestCounts.total})` },
                { key: 'מגיע', label: `מגיעים (${guestCounts.coming})` },
                { key: 'ממתין', label: `ממתינים (${guestCounts.pending})` },
                { key: 'לא מגיע', label: `לא מגיעים (${guestCounts.notComing})` },
              ].map(opt => {
                const active = statusFilter === opt.key;
                return (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[styles.filterOptionRow, active && styles.filterOptionRowActive]}
                    onPress={() => setStatusFilter(opt.key as any)}
                  >
                    <Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>
                      {opt.label}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.white} />}
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.filterSectionTitle, { marginTop: 16 }]}>צד</Text>
              {[
                { key: null, label: 'הכל' },
                { key: 'groom', label: `חתן (${sideCounts.groom})` },
                { key: 'bride', label: `כלה (${sideCounts.bride})` },
              ].map(opt => {
                const active = sideFilter === opt.key;
                return (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[styles.filterOptionRow, active && styles.filterOptionRowActive]}
                    onPress={() => setSideFilter(opt.key as any)}
                  >
                    <Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>
                      {opt.label}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.white} />}
                  </TouchableOpacity>
                );
              })}

              <View style={styles.filterActionsRow}>
                <TouchableOpacity
                  style={styles.filterClearButton}
                  onPress={() => {
                    setStatusFilter(null);
                    setSideFilter(null);
                  }}
                >
                  <Text style={styles.filterClearText}>נקה סינון</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.filterDoneButton}
                  onPress={() => setFilterModalVisible(false)}
                >
                  <Text style={styles.filterDoneText}>סיום</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
            <View style={styles.sideSelector}>
              <Text style={styles.sideSelectorLabel}>שייך לצד:</Text>
              <View style={styles.sideButtons}>
                <TouchableOpacity
                  style={[styles.sideButton, newCategorySide === 'groom' && styles.sideButtonActive]}
                  onPress={() => setNewCategorySide('groom')}
                >
                  <Ionicons
                    name="male"
                    size={20}
                    color={newCategorySide === 'groom' ? colors.white : colors.primary}
                  />
                  <Text style={[styles.sideButtonText, newCategorySide === 'groom' && styles.sideButtonTextActive]}>
                    חתן
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sideButton, newCategorySide === 'bride' && styles.sideButtonActive]}
                  onPress={() => setNewCategorySide('bride')}
                >
                  <Ionicons
                    name="female"
                    size={20}
                    color={newCategorySide === 'bride' ? colors.white : colors.primary}
                  />
                  <Text style={[styles.sideButtonText, newCategorySide === 'bride' && styles.sideButtonTextActive]}>
                    כלה
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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

      {/* Guests by category */}
      <ScrollView
        style={styles.guestList}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {categories.length > 0 ? (
          categories
            .filter(cat => !sideFilter || cat.side === sideFilter) // סינון קטגוריות לפי צד
            .map(cat => {
            const guestsInCat = filteredGuests.filter(g => g.category_id === cat.id);
            return (
              <View key={cat.id} style={styles.categoryCard}>
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryTitleRow}>
                    <Text style={styles.categoryTitle}>{cat.name}</Text>
                    <View style={styles.categoryCountBadge}>
                      <Text style={styles.categoryCountText}>
                        {guestsInCat.reduce((total, guest) => total + (guest.numberOfPeople || 1), 0)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleEditCategory(cat)} style={styles.categoryMenuButton}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.gray[600]} />
                  </TouchableOpacity>
                </View>
                <View style={styles.guestsList}>
                  {guestsInCat.length > 0 ? (
                    guestsInCat.map((guest, index) => (
                      <TouchableOpacity
                        key={guest.id}
                        style={[
                          styles.guestRow,
                          index === guestsInCat.length - 1 && styles.guestRowLast
                        ]}
                        onLongPress={() => handleLongPressGuest(guest)}
                      >
                        <View style={styles.guestMain}>
                          <View style={styles.guestAvatar}>
                            <Ionicons name="person" size={20} color={colors.gray[500]} />
                          </View>
                          <View style={styles.guestInfo}>
                            <Text style={styles.guestName} numberOfLines={1}>
                              {guest.name}
                            </Text>
                            <Text style={styles.guestPhone} numberOfLines={1}>
                              {guest.phone}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.guestMeta}>
                          <View style={styles.peopleCountBadge}>
                            <Ionicons name="person" size={12} color={colors.gray[700]} />
                            <Text style={styles.peopleCountText}>{guest.numberOfPeople || 1}</Text>
                          </View>
                          {getStatusIcon(guest.status)}
                        </View>
                      </TouchableOpacity>
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
              onPress={() => {
                setEditModalVisible(false);
                setSelectedGuest(null);
                setEditGuestName('');
                setEditGuestPhone('');
                setEditGuestStatus('ממתין');
                setEditGuestPeopleCount('1');
              }}
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

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>סטטוס:</Text>
              <View style={styles.statusSelector}>
                <TouchableOpacity
                  style={[styles.statusOption, editGuestStatus === 'ממתין' && styles.statusOptionActive]}
                  onPress={() => setEditGuestStatus('ממתין')}
                >
                  <Ionicons name="time" size={16} color={editGuestStatus === 'ממתין' ? colors.white : colors.warning} />
                  <Text style={[styles.statusOptionText, editGuestStatus === 'ממתין' && styles.statusOptionTextActive]}>ממתין</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusOption, editGuestStatus === 'מגיע' && styles.statusOptionActive]}
                  onPress={() => setEditGuestStatus('מגיע')}
                >
                  <Ionicons name="checkmark" size={16} color={editGuestStatus === 'מגיע' ? colors.white : colors.success} />
                  <Text style={[styles.statusOptionText, editGuestStatus === 'מגיע' && styles.statusOptionTextActive]}>מגיע</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusOption, editGuestStatus === 'לא מגיע' && styles.statusOptionActive]}
                  onPress={() => setEditGuestStatus('לא מגיע')}
                >
                  <Ionicons name="close" size={16} color={editGuestStatus === 'לא מגיע' ? colors.white : colors.error} />
                  <Text style={[styles.statusOptionText, editGuestStatus === 'לא מגיע' && styles.statusOptionTextActive]}>לא מגיע</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>מספר אנשים:</Text>
              <TextInput
                style={styles.editInput}
                value={editGuestPeopleCount}
                onChangeText={setEditGuestPeopleCount}
                placeholder="הזן מספר אנשים"
                textAlign="right"
                keyboardType="numeric"
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
              <Text>
                <Ionicons name="close" size={24} color={colors.text} />
              </Text>
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
                      <Text style={{ marginLeft: 12 }}>
                        <Ionicons
                          name={selectedGuestsToDelete.has(guest.id) ? 'checkbox' : 'square-outline'}
                          size={24}
                          color={selectedGuestsToDelete.has(guest.id) ? colors.primary : colors.gray[400]}
                        />
                      </Text>
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
              <Text>
                <Ionicons name="trash" size={20} color={colors.white} />
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.saveButton, { flex: 1, marginRight: 8 }]}
              onPress={handleSaveCategoryName}
            >
              <Text style={styles.saveButtonText}>שמור שם</Text>
              <Text>
                <Ionicons name="checkmark" size={20} color={colors.white} />
              </Text>
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
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  pageHeader: {
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  addTextButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addTextButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  searchContainer: {
    position: 'relative',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.gray[200],
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 48,
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: colors.text,
    textAlign: 'right',
    paddingRight: 8,
  },
  searchIcon: {
    marginLeft: 8,
  },
  filterIconButton: {
    width: 44,
    height: 48,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  addIconButton: {
    width: 44,
    height: 48,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  filterModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 18,
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  filterModalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  filterModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 8,
  },
  filterOptionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.gray[100],
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  filterOptionRowActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  filterOptionTextActive: {
    color: colors.white,
  },
  filterActionsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 14,
  },
  filterClearButton: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  filterClearText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.gray[700],
  },
  filterDoneButton: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDoneText: {
    fontSize: 14,
    fontWeight: '800',
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
  sideSelector: {
    width: '100%',
    marginBottom: 12,
  },
  sideSelectorLabel: {
    fontSize: 15,
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
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  sideButtonTextActive: {
    color: colors.white,
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
  categoryCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  categoryHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  categoryTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  categoryCountBadge: {
    backgroundColor: colors.primary + '1A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  categoryMenuButton: {
    padding: 6,
  },
  guestsList: {
    marginTop: 8,
  },
  guestRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  guestRowLast: {
    borderBottomWidth: 0,
  },
  guestMain: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  guestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestInfo: {
    flex: 1,
  },
  guestName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  guestPhone: {
    fontSize: 13,
    color: colors.gray[600],
    textAlign: 'right',
    marginTop: 2,
  },
  guestMeta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  peopleCountBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  peopleCountText: {
    fontSize: 11,
    color: colors.gray[800],
    fontWeight: '700',
    marginRight: 4,
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
  editCategoryButton: {
    padding: 8,
  },
  statusSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.gray[200],
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  statusOptionActive: {
    backgroundColor: colors.primary,
  },
  statusOptionText: {
    fontSize: 14,
    color: colors.text,
    marginLeft: 4,
  },
  statusOptionTextActive: {
    color: colors.white,
  },
  categoryHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryPeopleCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  categoryPeopleCountText: {
    fontSize: 14,
    color: colors.black,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  categoryGuestsScroll: {
    maxHeight: 200,
  },
});