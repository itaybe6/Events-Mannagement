import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, Animated } from 'react-native';
import { Link, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { colors } from '@/constants/colors';
import { GuestItem } from '@/components/GuestItem';
import { Button } from '@/components/Button';
import { EventSwitcher } from '@/components/EventSwitcher';
import { Ionicons as IoniconsIcon } from '@expo/vector-icons';
import {
  DUPLICATE_GUEST_ERROR,
  guestService,
  UNAPPROVED_EVENT_GUEST_LIMIT,
  UNAPPROVED_EVENT_GUEST_LIMIT_ERROR,
} from '@/lib/services/guestService';
import { eventService } from '@/lib/services/eventService';
import { supabase } from '@/lib/supabase';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { ALIGN_RIGHT, ROW_DIR, ROW_REVERSE_DIR, rtlText } from '@/lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const { eventId: queryEventId, status: queryStatus } = useLocalSearchParams<{ eventId?: string; status?: string }>();
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

  const [eventTitle, setEventTitle] = useState<string>('');
  const [isEventApproved, setIsEventApproved] = useState<boolean>(true);
  const isWeddingEvent = React.useMemo(() => {
    const t = String(eventTitle ?? '').trim();
    if (!t) return false;
    const parts = t.split(/(?:\s*[–—-]\s*)/g).map((p: string) => p.trim()).filter(Boolean);
    const label = parts[0] || t;
    return label === 'חתונה' || t.includes('חתונה');
  }, [eventTitle]);

  const handleSelectEventId = (nextEventId: string) => {
    if (userData?.id) setActiveEvent(userData.id, nextEventId);
    router.replace({ pathname: './', params: { eventId: nextEventId } });
  };

  async function loadSentGuestIds(eventId: string) {
    try {
      const { data, error } = await supabase
        .from('scheduled_notification_sms_run_recipients')
        .select('guest_id')
        .eq('event_id', eventId)
        .eq('status', 'sent');
      if (error) throw error;

      const next = new Set<string>();
      for (const row of (data as any[]) || []) {
        const guestId = String((row as any)?.guest_id || '').trim();
        if (guestId) next.add(guestId);
      }
      setSentGuestIds(next);
    } catch (e) {
      console.warn('Load sent guest ids error:', e);
      setSentGuestIds(new Set());
    }
  }

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }

    if (!resolvedEventId) {
      setGuests([]);
      setCategories([]);
      setEventTitle('');
      setIsEventApproved(true);
      setSentGuestIds(new Set());
      return;
    }

    if (userData?.id) setActiveEvent(userData.id, resolvedEventId);

    // טען אורחים, קטגוריות ופרטי אירוע (לבדיקת סוג אירוע)
    const fetchGuestsAndCategories = async () => {
      if (resolvedEventId) {
        const [guestsData, event] = await Promise.all([
          guestService.getGuests(resolvedEventId),
          eventService.getEvent(resolvedEventId),
        ]);
        setGuests(guestsData);
        setEventTitle(event?.title ?? '');
        setIsEventApproved(event?.isApproved !== false);
        await loadSentGuestIds(resolvedEventId);
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
          const [guestsData, event] = await Promise.all([
            guestService.getGuests(resolvedEventId),
            eventService.getEvent(resolvedEventId),
          ]);
          setGuests(guestsData);
          setEventTitle(event?.title ?? '');
          setIsEventApproved(event?.isApproved !== false);
          await loadSentGuestIds(resolvedEventId);
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
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [deleteCategoryModalVisible, setDeleteCategoryModalVisible] = useState(false);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<any>(null);
  const [categoryPendingDeleteCounts, setCategoryPendingDeleteCounts] = useState<{ guestsCount: number; peopleCount: number } | null>(null);
  // הוסף guests ל-state
  const [guests, setGuests] = useState<any[]>([]);
  const [sentGuestIds, setSentGuestIds] = useState<Set<string>>(new Set());
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<any>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestPhone, setEditGuestPhone] = useState('');
  const [editGuestStatus, setEditGuestStatus] = useState<'ממתין' | 'אולי מגיע' | 'מגיע' | 'לא מגיע'>('ממתין');
  const [editGuestPeopleCount, setEditGuestPeopleCount] = useState('1');
  // Category editing moved to a dedicated screen: `/(couple)/edit-category`.

  useEffect(() => {
    if (!queryStatus) return;
    const status = String(queryStatus).trim();
    if (!status) return;
    if (status === statusFilter) return;
    const allowed = new Set(['מגיע', 'אולי מגיע', 'ממתין', 'לא מגיע']);
    if (allowed.has(status)) setStatusFilter(status);
  }, [queryStatus, statusFilter]);

  const stickyTitleOpacity = scrollY.interpolate({
    inputRange: [16, 72],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (resolvedEventId) {
      loadCategories();
    }
  }, [resolvedEventId]);

  useEffect(() => {
    if (!isWeddingEvent) setSideFilter(null);
  }, [isWeddingEvent]);

  // אורחים מסוננים לפי כל הפילטרים (סינון לפי צד רק בחתונות)
  const effectiveSideFilter = isWeddingEvent ? sideFilter : null;
  const filteredGuests = guests.filter(guest => {
    const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
    const guestName = String(guest?.name || '').toLowerCase();
    const guestPhone = String(guest?.phone || '');
    const matchesSearch =
      normalizedQuery.length === 0 ||
      guestName.includes(normalizedQuery) ||
      guestPhone.includes(normalizedQuery);
    const matchesStatus = statusFilter ? guest.status === statusFilter : true;
    
    // סינון לפי צד – רק באירוע חתונה
    let matchesSide = true;
    if (effectiveSideFilter) {
      const sideCategories = getCategoriesBySide(effectiveSideFilter);
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
    maybe: guests.filter(g => g.status === 'אולי מגיע').reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
    notComing: guests.filter(g => g.status === 'לא מגיע').reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
    pending: guests.filter(g => g.status === 'ממתין').reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0),
  };

  const hasFilters = Boolean(statusFilter || effectiveSideFilter);
  const importContacts = async () => {
    try {
      if (!resolvedEventId) return;
      router.push({ pathname: '/(couple)/select-category', params: { eventId: resolvedEventId } });
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

  const addSelectedContacts = async () => {
    if (!isEventApproved) {
      const currentCount = guests.length;
      const remaining = Math.max(0, UNAPPROVED_EVENT_GUEST_LIMIT - currentCount);
      if (remaining === 0) {
        Alert.alert('הגבלת מוזמנים', UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
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

    const toAdd = Array.from(selectedContacts);
    let duplicateSkipped = 0;
    for (const contactId of toAdd) {
      const contact = deviceContacts.find(c => c.id === contactId);
      if (contact && selectedCategory) {
        const phoneNumber = contact.phoneNumbers[0]?.number || '';
        const name = contact.name || '';
        try {
          await guestService.addGuest(resolvedEventId || '', {
            name,
            phone: phoneNumber,
            status: 'ממתין',
            tableId: null,
            gift: 0,
            message: '',
            category_id: selectedCategory.id,
            numberOfPeople: 1,
          });
        } catch (err: any) {
          if (err?.message === UNAPPROVED_EVENT_GUEST_LIMIT_ERROR) {
            Alert.alert('הגבלת מוזמנים', UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
            break;
          }
          if (err?.message === DUPLICATE_GUEST_ERROR) {
            duplicateSkipped++;
            continue;
          }
          console.error('Add guest error:', err);
        }
      }
    }
    setSelectedContacts(new Set());
    setContactsModalVisible(false);
    if (duplicateSkipped > 0) {
      Alert.alert('אורחים כפולים', 'חלק מהאורחים לא נוספו כי הם כבר קיימים באירוע לפי שם או מספר טלפון.');
    }
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
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message === DUPLICATE_GUEST_ERROR ? DUPLICATE_GUEST_ERROR : 'לא ניתן לעדכן את האורח');
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
      case 'אולי מגיע':
        return (
          <Text>
            <Ionicons name="help-circle" size={22} color={colors.primary} />
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
    router.push({
      pathname: '/(couple)/edit-category',
      params: { categoryId: String(category.id), eventId: resolvedEventId || undefined },
    });
  };

  const handleRequestDeleteCategory = (category: any) => {
    if (!category?.id) return;
    if (deletingCategoryId) return;

    const categoryId = String(category.id);
    const guestsInCategory = guests.filter(g => String(g.category_id) === categoryId);
    const guestsCount = guestsInCategory.length;
    const peopleCount = guestsInCategory.reduce((total, g) => total + (g.numberOfPeople || 1), 0);

    setCategoryPendingDelete(category);
    setCategoryPendingDeleteCounts({ guestsCount, peopleCount });
    setDeleteCategoryModalVisible(true);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryPendingDelete?.id) return;
    const categoryId = String(categoryPendingDelete.id);

    try {
      setDeletingCategoryId(categoryId);
      await guestService.deleteGuestCategoryWithGuests(categoryId);

      setGuests(prev => prev.filter(g => String(g.category_id) !== categoryId));
      setCategories(prev => prev.filter(c => String(c.id) !== categoryId));
      if (selectedCategory?.id && String(selectedCategory.id) === categoryId) setSelectedCategory(null);

      setDeleteCategoryModalVisible(false);
      setCategoryPendingDelete(null);
      setCategoryPendingDeleteCounts(null);
    } catch (e) {
      Alert.alert('שגיאה', 'לא ניתן למחוק את הקטגוריה');
    } finally {
      setDeletingCategoryId(null);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        pointerEvents="none"
        colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.75, y: 0.55 }}
        style={styles.bgHighlight}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(232,196,122,0.58)', 'rgba(244,224,186,0.22)', 'rgba(244,224,186,0)']}
        start={{ x: 1, y: 0.95 }}
        end={{ x: 0.18, y: 0.22 }}
        style={styles.bgWarmGlow}
      />
      {Platform.OS !== 'web' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.stickyTitleBar,
            {
              paddingTop: insets.top + 10,
              opacity: stickyTitleOpacity,
            },
          ]}
        >
          <Text style={styles.stickyTitleText}>רשימת מוזמנים</Text>
        </Animated.View>
      ) : null}

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
                <View style={styles.filterSectionFlat}>
                  <Text style={styles.filterSectionTitleApple}>סטטוס</Text>
                  <View style={styles.filterStatusGrid}>
                    {[
                      { key: null, label: 'הכל', count: guestCounts.total, icon: 'apps' as const },
                      { key: 'מגיע', label: 'מגיעים', count: guestCounts.coming, icon: 'checkmark-circle' as const },
                      { key: 'אולי מגיע', label: 'אולי מגיעים', count: guestCounts.maybe, icon: 'help-circle' as const },
                      { key: 'ממתין', label: 'ממתינים', count: guestCounts.pending, icon: 'time' as const },
                      { key: 'לא מגיע', label: 'לא מגיעים', count: guestCounts.notComing, icon: 'close-circle' as const },
                    ].map(opt => {
                      const active = statusFilter === opt.key;
                      return (
                        <TouchableOpacity
                          key={`status-${String(opt.key)}`}
                          style={[
                            styles.filterStatusChip,
                            active ? styles.filterAppleButtonActive : styles.filterAppleButtonInactive,
                          ]}
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

                {isWeddingEvent && (
                <View style={[styles.filterSectionFlat, styles.filterSectionCardSpaced]}>
                  <Text style={styles.filterSectionTitleApple}>צד</Text>
                  <View style={styles.filterSideGrid}>
                    {[
                      { key: null, label: 'הכל', count: sideCounts.groom + sideCounts.bride, icon: 'people' as const },
                      { key: 'groom', label: 'חתן', count: sideCounts.groom, icon: 'male' as const },
                      { key: 'bride', label: 'כלה', count: sideCounts.bride, icon: 'female' as const },
                    ].map(opt => {
                      const active = sideFilter === opt.key;
                      return (
                        <TouchableOpacity
                          key={`side-${String(opt.key)}`}
                          style={[styles.filterAppleButtonThird, active ? styles.filterAppleButtonActive : styles.filterAppleButtonInactive]}
                          onPress={() => setSideFilter(opt.key as any)}
                          accessibilityRole="button"
                          accessibilityLabel={`סינון לפי צד ${opt.label}`}
                        >
                          <View style={styles.filterAppleButtonCenter}>
                            <Text>
                              <Ionicons
                                name={opt.icon}
                                size={18}
                                color={active ? stylesApple.primary : stylesApple.iconMuted}
                              />
                            </Text>
                            <Text style={[styles.filterAppleButtonText, active ? styles.filterAppleButtonTextActive : styles.filterAppleButtonTextInactive]}>
                              {opt.label}
                            </Text>
                          </View>

                          <View style={[styles.filterAppleCountPill, styles.filterAppleCountPillCompact, active ? styles.filterAppleCountPillActive : styles.filterAppleCountPillInactive]}>
                            <Text style={[styles.filterAppleCountText, active ? styles.filterAppleCountTextActive : styles.filterAppleCountTextInactive]}>
                              {opt.count}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                )}

                {/* bottom padding so content doesn't hide behind action bar */}
                <View style={{ height: 92 }} />
              </ScrollView>

              <View style={styles.filterActionBar}>
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
      <Animated.ScrollView
        style={styles.guestList}
        contentContainerStyle={styles.guestListContent}
        showsVerticalScrollIndicator={false}
        onScroll={
          Platform.OS !== 'web'
            ? Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                useNativeDriver: false,
              })
            : undefined
        }
        scrollEventThrottle={16}
      >
        <View style={styles.pageHeader}>
          {Platform.OS !== 'web' ? (
            <View style={[styles.mobileTitleWrap, { paddingTop: insets.top + 12 }]}>
            </View>
          ) : null}
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

        {categories.length > 0 ? (
          categories
            .filter(cat => !effectiveSideFilter || cat.side === effectiveSideFilter) // סינון קטגוריות לפי צד (רק בחתונה)
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
                  <View style={styles.categoryHeaderActions}>
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

                    <TouchableOpacity
                      onPress={() => handleRequestDeleteCategory(cat)}
                      style={styles.categoryMenuButton}
                      disabled={deletingCategoryId === String(cat.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`מחיקת קטגוריה ${String(cat?.name ?? '').trim() || ''}`.trim()}
                    >
                      <Text>
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color={deletingCategoryId === String(cat.id) ? colors.gray[400] : colors.error}
                        />
                      </Text>
                    </TouchableOpacity>
                  </View>
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
                        onPress={() => handleLongPressGuest(guest)}
                      >
                        <View style={styles.guestMain}>
                          <View style={styles.guestAvatar}>
                            <Text>
                              <Ionicons name="person" size={20} color={colors.gray[500]} />
                            </Text>
                          </View>
                          <View style={styles.guestInfo}>
                            <Text style={styles.guestName} numberOfLines={2}>
                              {guest.name}
                            </Text>
                            <Text style={styles.guestPhone} numberOfLines={1}>
                              {guest.phone}
                            </Text>
                            {sentGuestIds.has(String(guest.id)) ? (
                              <View style={styles.sentMessageBadge}>
                                <Text>
                                  <Ionicons name="checkmark-done-outline" size={12} color="#047857" />
                                </Text>
                                <Text style={styles.sentMessageBadgeText}>הודעה נשלחה</Text>
                              </View>
                            ) : null}
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
      </Animated.ScrollView>

      {/* מודל מחיקת קטגוריה */}
      <Modal
        visible={deleteCategoryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (deletingCategoryId) return;
          setDeleteCategoryModalVisible(false);
          setCategoryPendingDelete(null);
          setCategoryPendingDeleteCounts(null);
        }}
      >
        <KeyboardAvoidingView
          style={styles.editModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={styles.editModalBackdrop}
            onPress={() => {
              if (deletingCategoryId) return;
              setDeleteCategoryModalVisible(false);
              setCategoryPendingDelete(null);
              setCategoryPendingDeleteCounts(null);
            }}
          />
          <Pressable onPress={() => { /* swallow */ }} style={styles.editModalSheet}>
            <BlurView intensity={20} tint="light" style={styles.editModalBlur} />
            <View style={styles.editModalContent}>
              <View style={styles.editModalHandleWrap}>
                <View style={styles.editModalHandle} />
              </View>

              <View style={styles.editModalHeader}>
                <View style={styles.editModalHeaderCenter}>
                  <View style={styles.editModalTitleRow}>
                    <View style={[styles.editModalIconWrap, { backgroundColor: 'rgba(244,67,54,0.10)' }]}>
                      <Text>
                        <Ionicons name="trash" size={22} color={colors.error} />
                      </Text>
                    </View>
                    <Text style={styles.editModalTitle}>מחיקת קטגוריה</Text>
                  </View>
                  <Text style={styles.editModalSubtitle} numberOfLines={1}>
                    {rtlText(String(categoryPendingDelete?.name ?? '').trim() || 'ללא שם')}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    if (deletingCategoryId) return;
                    setDeleteCategoryModalVisible(false);
                    setCategoryPendingDelete(null);
                    setCategoryPendingDeleteCounts(null);
                  }}
                  style={styles.editModalCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="סגור"
                >
                  <Text>
                    <Ionicons name="close" size={22} color={stylesApple.textMuted} />
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.deleteCategoryBody}>
                <View style={styles.deleteCategoryBodyRow}>
                  <Text style={styles.deleteCategoryBodyText}>
                    פעולה זו תמחק את הקטגוריה וכל האורחים שבתוכה.
                  </Text>
                </View>
                {!!categoryPendingDeleteCounts && (
                  <View style={styles.deleteCategoryBodyRow}>
                    <Text style={styles.deleteCategoryBodyText}>
                      {`יימחקו ${categoryPendingDeleteCounts.guestsCount} אורחים (${categoryPendingDeleteCounts.peopleCount} אנשים).`}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.editModalActions}>
                <TouchableOpacity
                  style={[styles.editActionButton, styles.editDeleteButton]}
                  onPress={() => {
                    if (deletingCategoryId) return;
                    setDeleteCategoryModalVisible(false);
                    setCategoryPendingDelete(null);
                    setCategoryPendingDeleteCounts(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <Text style={[styles.editActionButtonText, styles.editDeleteButtonText]}>ביטול</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.editActionButton, styles.editSaveButton]}
                  onPress={handleConfirmDeleteCategory}
                  disabled={Boolean(deletingCategoryId)}
                  accessibilityRole="button"
                  accessibilityLabel="מחק קטגוריה"
                >
                  <LinearGradient
                    colors={[colors.error, '#7A0F16']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.editSaveButtonBg}
                  />
                  <Text>
                    <Ionicons name="trash-outline" size={20} color={colors.white} />
                  </Text>
                  <Text style={styles.editActionButtonText}>מחק</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

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
        style={styles.editModalOverlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.editModalBackdrop} onPress={() => setEditModalVisible(false)} />
        <Pressable onPress={() => {}} style={styles.editModalSheet}>
          <BlurView intensity={20} tint="light" style={styles.editModalBlur} />
          <View style={styles.editModalContent}>
            <View style={styles.editModalHandleWrap}>
              <View style={styles.editModalHandle} />
            </View>
            <View style={styles.editModalHeader}>
              <View style={styles.editModalHeaderCenter}>
                <View style={styles.editModalTitleRow}>
                  <View style={styles.editModalIconWrap}>
                    <Text>
                      <Ionicons name="person-circle" size={24} color={stylesApple.primary} />
                    </Text>
                  </View>
                  <Text style={styles.editModalTitle}>עריכת אורח</Text>
                </View>
                {selectedGuest && (
                  <Text style={styles.editModalSubtitle} numberOfLines={1}>
                    {selectedGuest.name}
                  </Text>
                )}
              </View>
              <TouchableOpacity 
                onPress={() => {
                  setEditModalVisible(false);
                  setSelectedGuest(null);
                  setEditGuestName('');
                  setEditGuestPhone('');
                  setEditGuestStatus('ממתין');
                  setEditGuestPeopleCount('1');
                }}
                style={styles.editModalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="סגור"
              >
                <Text>
                  <Ionicons name="close" size={22} color={stylesApple.textMuted} />
                </Text>
              </TouchableOpacity>
            </View>
          
          <AppKeyboardAwareScrollView
            style={styles.editForm}
            contentContainerStyle={styles.editFormContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.editInputGroup}>
              <Text style={styles.editInputLabel}>שם</Text>
              <TextInput
                style={styles.editInputField}
                value={editGuestName}
                onChangeText={setEditGuestName}
                placeholder="הזן שם"
                placeholderTextColor={stylesApple.textMuted}
                textAlign="right"
              />
            </View>
            
            <View style={styles.editInputGroup}>
              <Text style={styles.editInputLabel}>טלפון</Text>
              <TextInput
                style={styles.editInputField}
                value={editGuestPhone}
                onChangeText={setEditGuestPhone}
                placeholder="הזן מספר טלפון"
                placeholderTextColor={stylesApple.textMuted}
                textAlign="right"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.editInputGroup}>
              <Text style={styles.editInputLabel}>סטטוס</Text>
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
                  style={[styles.statusOption, editGuestStatus === 'אולי מגיע' && styles.statusOptionActive]}
                  onPress={() => setEditGuestStatus('אולי מגיע')}
                >
                  <Text>
                    <Ionicons
                      name="help"
                      size={16}
                      color={editGuestStatus === 'אולי מגיע' ? colors.white : colors.primary}
                    />
                  </Text>
                  <Text style={[styles.statusOptionText, editGuestStatus === 'אולי מגיע' && styles.statusOptionTextActive]}>אולי מגיע</Text>
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

            <View style={styles.editInputGroup}>
              <Text style={styles.editInputLabel}>מספר אנשים</Text>
              <TextInput
                style={styles.editInputField}
                value={editGuestPeopleCount}
                onChangeText={setEditGuestPeopleCount}
                placeholder="הזן מספר אנשים"
                placeholderTextColor={stylesApple.textMuted}
                textAlign="right"
                keyboardType="numeric"
              />
            </View>
          </AppKeyboardAwareScrollView>
          
          <View style={styles.editModalActions}>
            <TouchableOpacity 
              style={[styles.editActionButton, styles.editDeleteButton]} 
              onPress={handleDeleteGuest}
              accessibilityRole="button"
              accessibilityLabel="מחק אורח"
            >
              <Text>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Text>
              <Text style={[styles.editActionButtonText, styles.editDeleteButtonText]}>מחק</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.editActionButton, styles.editSaveButton]} 
              onPress={handleEditGuest}
              accessibilityRole="button"
              accessibilityLabel="שמור שינויים"
            >
              <LinearGradient
                colors={[colors.primary, colors.oxfordBlue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.editSaveButtonBg}
              />
              <Text>
                <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              </Text>
              <Text style={styles.editActionButtonText}>שמור</Text>
            </TouchableOpacity>
          </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>

    </View>
  );
}

const stylesApple = {
  primary: colors.yaleBlue,
  primaryDark: colors.oxfordBlue,
  primarySoft: 'rgba(0, 53, 102, 0.10)',
  backgroundLight: '#FFFFFF',
  surfaceLight: '#FFFFFF',
  borderLight: 'rgba(6, 23, 62, 0.08)',
  text: colors.text,
  textMuted: 'rgba(6, 23, 62, 0.60)',
  iconMuted: 'rgba(6, 23, 62, 0.40)',
} as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F1FF',
    paddingTop: Platform.OS === 'web' ? 12 : 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'web' ? 16 : 0,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  pageHeader: {
    paddingBottom: 12,
  },
  stickyTitleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(11, 28, 65, 0.06)',
  },
  stickyTitleText: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  mobileTitleWrap: {
    paddingBottom: 16,
  },
  mobilePageTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerRow: {
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 48,
    flex: 1,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  searchRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: colors.text,
    textAlign: 'right',
    paddingEnd: 8,
  },
  searchIcon: {
    // Spacing handled by `gap` on the row container.
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
    backgroundColor: 'rgba(6,23,62,0.24)',
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
    backgroundColor: '#FFFFFF',
    borderColor: stylesApple.borderLight,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  filterGlassPanelNarrow: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  filterGlassPanelWide: {
    borderRadius: 24,
  },
  filterHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6, 23, 62, 0.08)',
  },
  filterCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
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
    fontSize: 22,
    fontWeight: '900',
    color: stylesApple.text,
    letterSpacing: -0.2,
  },
  filterHintText: {
    textAlign: 'center',
    color: stylesApple.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  filterBody: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 0,
  },
  filterSectionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    borderRadius: 22,
    padding: 12,
  },
  filterSectionFlat: {
    paddingHorizontal: 2,
    paddingVertical: 0,
  },
  filterSectionCardSpaced: {
    marginTop: 12,
  },
  filterSectionTitleApple: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  filterStatusGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 8,
  },
  filterSideGrid: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 8,
  },
  filterAppleButton: {
    width: '48%',
    minWidth: 0,
    flexGrow: 0,
    flexBasis: '48%',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    transform: [{ scale: 1 }],
  },
  filterStatusChip: {
    width: '48%',
    minWidth: 0,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterAppleButtonThird: {
    width: '31%',
    minWidth: 0,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterAppleButtonActive: {
    backgroundColor: 'rgba(0, 53, 102, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 53, 102, 0.30)',
  },
  filterAppleButtonInactive: {
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
  },
  filterAppleButtonLeft: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  filterAppleButtonCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  filterAppleButtonText: {
    fontSize: 14,
    textAlign: 'right',
  },
  filterAppleButtonTextActive: {
    fontWeight: '800',
    color: colors.oxfordBlue,
  },
  filterAppleButtonTextInactive: {
    fontWeight: '700',
    color: colors.gray[700],
  },
  filterAppleCountPill: {
    minWidth: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
  },
  filterAppleCountPillCompact: {
    marginTop: 8,
  },
  filterAppleCountPillActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  filterAppleCountPillInactive: {
    backgroundColor: 'rgba(6,23,62,0.06)',
  },
  filterAppleCountText: {
    fontSize: 11,
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 14 : 12,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(6,23,62,0.08)',
    backgroundColor: '#FFFFFF',
  },
  filterClearInline: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    backgroundColor: '#F8FAFD',
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
    borderRadius: 16,
    overflow: 'hidden',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.oxfordBlue,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
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
  guestListContent: {
    paddingBottom: Platform.OS === 'web' ? 80 : 122,
    flexGrow: 1,
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
    marginStart: 8,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginStart: 8,
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
  editModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  editModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 23, 62, 0.28)',
  },
  editModalSheet: {
    position: 'relative',
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 30,
    overflow: 'hidden',
    maxHeight: '82%',
    minHeight: 420,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: colors.black,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 18,
  },
  editModalBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  editModalContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 30,
    overflow: 'hidden',
  },
  editModalHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  editModalHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(6, 23, 62, 0.14)',
  },
  editModalHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6, 23, 62, 0.06)',
  },
  editModalHeaderCenter: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    marginStart: 12,
    width: '100%',
  },
  editModalTitleRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
  },
  editModalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 53, 102, 0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: stylesApple.text,
    letterSpacing: -0.4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  editModalSubtitle: {
    fontSize: 13,
    color: stylesApple.textMuted,
    marginTop: 6,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  editModalCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(6, 23, 62, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalActions: {
    flexDirection: ROW_DIR,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 22,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(6, 23, 62, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  editActionButton: {
    flex: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    paddingVertical: 14,
    borderRadius: 16,
    overflow: 'hidden',
  },
  editDeleteButton: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: 'rgba(244,67,54,0.18)',
  },
  editSaveButton: {
    position: 'relative',
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  editSaveButtonBg: {
    ...StyleSheet.absoluteFillObject,
  },
  editActionButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
    marginStart: 8,
  },
  editDeleteButtonText: {
    color: colors.error,
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
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  selectedContactItem: {
    backgroundColor: colors.primary + '10',
  },
  contactInfo: {
    flex: 1,
    // Let children fill full width so `textAlign: 'right'` always works.
    alignItems: 'stretch',
    alignSelf: 'stretch',
  },
  contactName: {
    width: '100%',
    alignSelf: 'stretch',
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
    textAlign: 'right',
  },
  contactPhone: {
    width: '100%',
    alignSelf: 'stretch',
    fontSize: 14,
    color: colors.gray[600],
    textAlign: 'right',
  },
  checkboxContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
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
    alignSelf: ALIGN_RIGHT,
  },
  categorySelectorText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
    marginStart: 8,
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
    flexDirection: ROW_DIR,
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
    marginEnd: 8,
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
    end: 16,
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
    marginStart: 8,
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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  categoryTitleRow: {
    flexDirection: ROW_DIR,
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
    // Keep a stable visual layout:
    // left = status/people, right = avatar + name + phone.
    direction: 'ltr',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  guestRowLast: {
    borderBottomWidth: 0,
  },
  guestMain: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
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
    minWidth: 0,
    alignItems: 'stretch',
    alignSelf: 'stretch',
  },
  guestName: {
    width: '100%',
    alignSelf: 'stretch',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  guestPhone: {
    width: '100%',
    alignSelf: 'stretch',
    fontSize: 13,
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  sentMessageBadge: {
    alignSelf: 'flex-end',
    marginTop: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(236,253,245,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.24)',
  },
  sentMessageBadgeText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestMeta: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  peopleCountBadge: {
    flexDirection: ROW_DIR,
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
    marginEnd: 4,
  },
  editForm: {
    flexGrow: 0,
  },
  editFormContent: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 24,
  },
  editInputGroup: {
    marginBottom: 16,
  },
  editInputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(6, 23, 62, 0.66)',
    marginBottom: 9,
    textAlign: 'right',
    letterSpacing: -0.1,
    alignSelf: ALIGN_RIGHT,
  },
  editInputField: {
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.08)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: stylesApple.text,
    backgroundColor: '#F8FBFF',
    textAlign: 'right',
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
    flexDirection: ROW_DIR,
    justifyContent: 'space-between',
    marginTop: 8,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F3F7FC',
    gap: 8,
  },
  statusOption: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.white,
    flex: 1,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.06)',
  },
  statusOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusOptionText: {
    fontSize: 14,
    color: colors.text,
    marginStart: 5,
    fontWeight: '700',
  },
  statusOptionTextActive: {
    color: colors.white,
  },
  categoryHeaderActions: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 4,
  },
  deleteCategoryBody: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 18,
  },
  deleteCategoryBodyRow: {
    flexDirection: ROW_REVERSE_DIR,
    marginBottom: 10,
  },
  deleteCategoryBodyText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: stylesApple.textMuted,
    textAlign: 'left',
    lineHeight: 20,
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