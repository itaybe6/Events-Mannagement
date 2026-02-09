import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions } from 'react-native';
import { Link, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { colors } from '@/constants/colors';
import { GuestItem } from '@/components/GuestItem';
import { Button } from '@/components/Button';
import { EventSwitcher } from '@/components/EventSwitcher';
import { Ionicons as IoniconsIcon } from '@expo/vector-icons';
import { guestService } from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { supabase } from '@/lib/supabase';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

// On web, icons are ultimately rendered as text glyphs. Wrapping them in <Text>
// prevents "Text strings must be rendered within a <Text> component" errors.
const Ionicons = (props: React.ComponentProps<typeof IoniconsIcon>) => (
  <Text>
    <IoniconsIcon {...props} />
  </Text>
);

export default function GuestsScreen() {
  const { isLoggedIn, userData } = useUserStore();
  const router = useRouter();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWide = windowWidth >= 640;

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const handleSelectEventId = (nextEventId: string) => {
    if (userData?.id) setActiveEvent(userData.id, nextEventId);
    router.replace({ pathname: './', params: { eventId: nextEventId } });
  };

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }

    if (!resolvedEventId) {
      setGuests([]);
      setCategories([]);
      return;
    }

    if (userData?.id) setActiveEvent(userData.id, resolvedEventId);

    // טען אורחים וקטגוריות לאירוע הנבחר
    const fetchGuestsAndCategories = async () => {
      if (resolvedEventId) {
        const data = await guestService.getGuests(resolvedEventId);
        setGuests(data);
        await loadCategories(resolvedEventId);
      }
    };
    fetchGuestsAndCategories();
  }, [isLoggedIn, router, resolvedEventId, userData?.id]);

  // טען מחדש אורחים וקטגוריות כשהמסך חוזר למוקד
  useFocusEffect(
    React.useCallback(() => {
      if (resolvedEventId) {
        const reloadGuests = async () => {
          const data = await guestService.getGuests(resolvedEventId);
          setGuests(data);
          await loadCategories(resolvedEventId);
        };
        reloadGuests();
      }
    }, [resolvedEventId])
  );

  const loadCategories = async (eid?: string) => {
    const id = eid || resolvedEventId;
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
    if (!newCategoryName.trim() || !resolvedEventId) return;
    try {
      const cat = await guestService.addGuestCategory(resolvedEventId, newCategoryName.trim(), newCategorySide);
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
  // Category editing moved to a dedicated screen: `/(couple)/edit-category`.

  useEffect(() => {
    if (resolvedEventId) {
      loadCategories();
    }
  }, [resolvedEventId]);

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

  const hasFilters = Boolean(statusFilter || sideFilter);
  const importContacts = async () => {
    try {
      if (!resolvedEventId) return;
      // Navigate immediately and auto-open the category selector there.
      // Contacts permissions + loading are handled in `/contacts-list`.
      router.push({ pathname: '/contacts-list', params: { eventId: resolvedEventId, autoOpenCategory: '1' } });
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
        guestService.addGuest(resolvedEventId || '', {
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
          <Text>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          </Text>
        );
      case 'לא מגיע':
        return (
          <Text>
            <Ionicons name="close-circle" size={22} color={colors.error} />
          </Text>
        );
      case 'ממתין':
        return (
          <Text>
            <Ionicons name="time-outline" size={22} color={colors.warning} />
          </Text>
        );
      default:
        return (
          <Text>
            <Ionicons name="help-circle-outline" size={22} color={colors.gray[400]} />
          </Text>
        );
    }
  };

  const handleEditCategory = (category: any) => {
    if (!category?.id) return;
    router.push({ pathname: '/(couple)/edit-category', params: { categoryId: String(category.id) } });
  };

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <EventSwitcher
          userId={userData?.id}
          selectedEventId={resolvedEventId}
          onSelectEventId={handleSelectEventId}
        />
        <View style={{ height: 10 }} />

        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Text>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
            </Text>
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
            <Text>
              <Ionicons name="options-outline" size={20} color={colors.text} />
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addIconButton}
            onPress={importContacts}
            accessibilityRole="button"
            accessibilityLabel="הוספת אורח"
          >
            <Text>
              <Ionicons name="add" size={22} color={colors.text} />
            </Text>
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
        <Pressable
          style={[styles.filterModalOverlay, isWide ? styles.filterModalOverlayWide : styles.filterModalOverlayNarrow]}
          onPress={() => setFilterModalVisible(false)}
        >
          <BlurView intensity={18} tint="dark" style={styles.filterBackdropBlur} />

          <Pressable onPress={() => { /* swallow */ }} style={[styles.filterSheet, isWide ? styles.filterSheetWide : styles.filterSheetNarrow]}>
            <View
              style={[
                styles.filterGlassPanel,
                isWide ? styles.filterGlassPanelWide : styles.filterGlassPanelNarrow,
                { maxHeight: Math.min(0.9 * windowHeight, 760) },
              ]}
            >
              <View style={styles.filterHeader}>
                <TouchableOpacity
                  onPress={() => setFilterModalVisible(false)}
                  style={styles.filterCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel="סגירת חלון סינון"
                >
                  <Text>
                    <Ionicons name="close" size={22} color={stylesApple.textMuted} />
                  </Text>
                </TouchableOpacity>

                <View style={styles.filterHeaderCenter}>
                  <Text style={styles.filterTitle}>סינון</Text>
                </View>

                <View style={styles.filterHeaderSpacer} />
              </View>

              <Text style={styles.filterHintText}>
                בחר פילטרים כדי לדייק את הרשימה
              </Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.filterBody}
              >
                <View>
                  <Text style={styles.filterSectionTitleApple}>סטטוס</Text>
                  <View style={styles.filterStatusGrid}>
                    {[
                      { key: null, label: 'הכל', count: guestCounts.total, icon: 'apps' as const },
                      { key: 'מגיע', label: 'מגיעים', count: guestCounts.coming, icon: 'checkmark-circle' as const },
                      { key: 'ממתין', label: 'ממתינים', count: guestCounts.pending, icon: 'time' as const },
                      { key: 'לא מגיע', label: 'לא מגיעים', count: guestCounts.notComing, icon: 'close-circle' as const },
                    ].map(opt => {
                      const active = statusFilter === opt.key;
                      return (
                        <TouchableOpacity
                          key={`status-${String(opt.key)}`}
                          style={[styles.filterAppleButton, active ? styles.filterAppleButtonActive : styles.filterAppleButtonInactive]}
                          onPress={() => setStatusFilter(opt.key as any)}
                          accessibilityRole="button"
                          accessibilityLabel={`סינון לפי סטטוס ${opt.label}`}
                        >
                          <View style={styles.filterAppleButtonLeft}>
                            <Text>
                              <Ionicons
                                name={opt.icon}
                                size={22}
                                color={active ? stylesApple.primary : stylesApple.iconMuted}
                              />
                            </Text>
                            <Text style={[styles.filterAppleButtonText, active ? styles.filterAppleButtonTextActive : styles.filterAppleButtonTextInactive]}>
                              {opt.label}
                            </Text>
                          </View>

                          <View style={[styles.filterAppleCountPill, active ? styles.filterAppleCountPillActive : styles.filterAppleCountPillInactive]}>
                            <Text style={[styles.filterAppleCountText, active ? styles.filterAppleCountTextActive : styles.filterAppleCountTextInactive]}>
                              {opt.count}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={{ marginTop: 18 }}>
                  <Text style={styles.filterSectionTitleApple}>צד</Text>
                  <View style={styles.filterSideStack}>
                    {[
                      { key: null, label: 'הכל', count: sideCounts.groom + sideCounts.bride, icon: 'people' as const },
                      { key: 'groom', label: 'חתן', count: sideCounts.groom, icon: 'male' as const },
                      { key: 'bride', label: 'כלה', count: sideCounts.bride, icon: 'female' as const },
                    ].map(opt => {
                      const active = sideFilter === opt.key;
                      return (
                        <TouchableOpacity
                          key={`side-${String(opt.key)}`}
                          style={[styles.filterAppleButtonFull, active ? styles.filterAppleButtonActive : styles.filterAppleButtonInactive]}
                          onPress={() => setSideFilter(opt.key as any)}
                          accessibilityRole="button"
                          accessibilityLabel={`סינון לפי צד ${opt.label}`}
                        >
                          <View style={styles.filterAppleButtonLeft}>
                            <Text>
                              <Ionicons
                                name={opt.icon}
                                size={22}
                                color={active ? stylesApple.primary : stylesApple.iconMuted}
                              />
                            </Text>
                            <Text style={[styles.filterAppleButtonText, active ? styles.filterAppleButtonTextActive : styles.filterAppleButtonTextInactive]}>
                              {opt.label}
                            </Text>
                          </View>

                          <View style={[styles.filterAppleCountPill, active ? styles.filterAppleCountPillActive : styles.filterAppleCountPillInactive]}>
                            <Text style={[styles.filterAppleCountText, active ? styles.filterAppleCountTextActive : styles.filterAppleCountTextInactive]}>
                              {opt.count}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* bottom padding so content doesn't hide behind action bar */}
                <View style={{ height: 120 }} />
              </ScrollView>

              <View style={styles.filterActionBar}>
                <BlurView intensity={22} tint="light" style={styles.filterActionBarBlur} />
                <TouchableOpacity
                  style={[styles.filterClearInline, !hasFilters && styles.filterClearInlineDisabled]}
                  disabled={!hasFilters}
                  onPress={() => {
                    setStatusFilter(null);
                    setSideFilter(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="נקה את כל הסינונים"
                >
                  <Text>
                    <Ionicons name="refresh" size={20} color={!hasFilters ? stylesApple.textMuted : stylesApple.text} />
                  </Text>
                  <Text style={[styles.filterClearInlineText, !hasFilters && styles.filterClearInlineTextDisabled]}>נקה</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.filterDonePrimary}
                  onPress={() => setFilterModalVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="סיום"
                >
                  <LinearGradient
                    colors={[stylesApple.primary, stylesApple.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.filterDonePrimaryBg}
                  />
                  <Text style={styles.filterDonePrimaryText}>סיום</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
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
              <Text>
                <Ionicons name="close" size={24} color={colors.text} />
              </Text>
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
                    <Text>
                      <Ionicons name="checkmark" size={18} color={colors.white} />
                    </Text>
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
                  <Text>
                    <Ionicons
                      name="male"
                      size={20}
                      color={newCategorySide === 'groom' ? colors.white : colors.primary}
                    />
                  </Text>
                  <Text style={[styles.sideButtonText, newCategorySide === 'groom' && styles.sideButtonTextActive]}>
                    חתן
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sideButton, newCategorySide === 'bride' && styles.sideButtonActive]}
                  onPress={() => setNewCategorySide('bride')}
                >
                  <Text>
                    <Ionicons
                      name="female"
                      size={20}
                      color={newCategorySide === 'bride' ? colors.white : colors.primary}
                    />
                  </Text>
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
                <Text>
                  <Ionicons name="add" size={22} color={colors.white} />
                </Text>
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
                  <TouchableOpacity
                    onPress={() => handleEditCategory(cat)}
                    style={styles.categoryMenuButton}
                    accessibilityRole="button"
                    accessibilityLabel={`עריכת קטגוריה ${String(cat?.name ?? '').trim() || ''}`.trim()}
                  >
                    <Text>
                      <Ionicons name="create-outline" size={20} color={colors.gray[600]} />
                    </Text>
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
                            <Text>
                              <Ionicons name="person" size={20} color={colors.gray[500]} />
                            </Text>
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
                            <Text>
                              <Ionicons name="person" size={12} color={colors.gray[700]} />
                            </Text>
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
              <Text>
                <Ionicons name="close" size={24} color={colors.text} />
              </Text>
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
                    <Text>
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    </Text>
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
              <Text>
                <Ionicons name="close" size={24} color={colors.text} />
              </Text>
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
                  <Text>
                    <Ionicons
                      name="time"
                      size={16}
                      color={editGuestStatus === 'ממתין' ? colors.white : colors.warning}
                    />
                  </Text>
                  <Text style={[styles.statusOptionText, editGuestStatus === 'ממתין' && styles.statusOptionTextActive]}>ממתין</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusOption, editGuestStatus === 'מגיע' && styles.statusOptionActive]}
                  onPress={() => setEditGuestStatus('מגיע')}
                >
                  <Text>
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={editGuestStatus === 'מגיע' ? colors.white : colors.success}
                    />
                  </Text>
                  <Text style={[styles.statusOptionText, editGuestStatus === 'מגיע' && styles.statusOptionTextActive]}>מגיע</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusOption, editGuestStatus === 'לא מגיע' && styles.statusOptionActive]}
                  onPress={() => setEditGuestStatus('לא מגיע')}
                >
                  <Text>
                    <Ionicons
                      name="close"
                      size={16}
                      color={editGuestStatus === 'לא מגיע' ? colors.white : colors.error}
                    />
                  </Text>
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
              <Text>
                <Ionicons name="trash" size={20} color={colors.white} />
              </Text>
              <Text style={styles.deleteButtonText}>מחק</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.saveButton]} 
              onPress={handleEditGuest}
            >
              <Text>
                <Ionicons name="checkmark" size={20} color={colors.white} />
              </Text>
              <Text style={styles.saveButtonText}>שמור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    </View>
  );
}

const stylesApple = {
  primary: '#007AFF',
  primaryDark: '#0062CC',
  primarySoft: 'rgba(0, 122, 255, 0.13)',
  backgroundLight: 'rgba(242, 242, 247, 0.80)',
  surfaceLight: 'rgba(255, 255, 255, 0.65)',
  borderLight: 'rgba(0, 0, 0, 0.05)',
  text: '#111827',
  textMuted: 'rgba(17, 24, 39, 0.55)',
  iconMuted: 'rgba(17, 24, 39, 0.35)',
} as const;

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
    backgroundColor: 'rgba(0,0,0,0.30)',
    padding: 0,
  },
  filterModalOverlayNarrow: {
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  filterModalOverlayWide: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  filterBackdropBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  filterSheet: {
    width: '100%',
  },
  filterSheetNarrow: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  filterSheetWide: {
    maxWidth: 440,
  },
  filterGlassPanel: {
    position: 'relative',
    width: '100%',
    backgroundColor: stylesApple.backgroundLight,
    borderColor: stylesApple.borderLight,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  filterGlassPanelNarrow: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  filterGlassPanelWide: {
    borderRadius: 24,
  },
  filterHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  filterCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  filterHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  filterHeaderSpacer: {
    width: 36,
    height: 36,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: stylesApple.text,
    letterSpacing: -0.2,
  },
  filterHintText: {
    textAlign: 'center',
    color: stylesApple.textMuted,
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 18,
  },
  filterBody: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 0,
  },
  filterSectionTitleApple: {
    fontSize: 15,
    fontWeight: '800',
    color: stylesApple.textMuted,
    textAlign: 'right',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  filterStatusGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterSideStack: {
    gap: 12,
  },
  filterAppleButton: {
    width: '48%',
    minWidth: 160,
    flexGrow: 1,
    flexBasis: '48%',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    transform: [{ scale: 1 }],
  },
  filterAppleButtonFull: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  filterAppleButtonActive: {
    backgroundColor: stylesApple.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.55)',
  },
  filterAppleButtonInactive: {
    backgroundColor: stylesApple.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  filterAppleButtonLeft: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  filterAppleButtonText: {
    fontSize: 15,
    textAlign: 'right',
  },
  filterAppleButtonTextActive: {
    fontWeight: '800',
    color: stylesApple.primary,
  },
  filterAppleButtonTextInactive: {
    fontWeight: '700',
    color: stylesApple.textMuted,
  },
  filterAppleCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  filterAppleCountPillActive: {
    backgroundColor: 'rgba(255,255,255,0.60)',
  },
  filterAppleCountPillInactive: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  filterAppleCountText: {
    fontSize: 12,
    fontWeight: '900',
  },
  filterAppleCountTextActive: {
    color: stylesApple.primary,
  },
  filterAppleCountTextInactive: {
    color: stylesApple.iconMuted,
  },
  filterActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 16 : 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.60)',
  },
  filterActionBarBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  filterClearInline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 12,
  },
  filterClearInlineDisabled: {
    opacity: 0.55,
  },
  filterClearInlineText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: stylesApple.textMuted,
  },
  filterClearInlineTextDisabled: {
    color: stylesApple.textMuted,
  },
  filterDonePrimary: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: stylesApple.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  filterDonePrimaryBg: {
    ...StyleSheet.absoluteFillObject,
  },
  filterDonePrimaryText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '900',
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