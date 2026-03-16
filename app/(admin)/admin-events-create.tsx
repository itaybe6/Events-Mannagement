import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, ActivityIndicator, Alert, Modal, Keyboard, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';
import { googlePlacesService, type GooglePlacePrediction } from '@/lib/services/googlePlacesService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { LinearGradient } from 'expo-linear-gradient';
import BackSwipe from '@/components/BackSwipe';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EVENT_TYPES = [
  { label: 'חתונה', value: 'חתונה' },
  { label: 'בר מצווה', value: 'בר מצווה' },
  { label: 'בת מצווה', value: 'בת מצווה' },
  { label: 'ברית', value: 'ברית' },
  { label: 'אירוע חברה', value: 'אירוע חברה' },
];
const EVENT_TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; hint: string }> = {
  חתונה: { icon: 'heart', hint: 'יום מיוחד לזוג' },
  'בר מצווה': { icon: 'ribbon', hint: 'אירוע משפחתי' },
  'בת מצווה': { icon: 'sparkles', hint: 'חגיגה מרגשת' },
  ברית: { icon: 'star', hint: 'מסורת וחיבור' },
  'אירוע חברה': { icon: 'briefcase', hint: 'עסקים ונטוורקינג' },
};

export default function AdminEventsCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const [coupleOptions, setCoupleOptions] = useState<{id: string, name: string, email: string, avatar_url?: string}[]>([]);
  const [addForm, setAddForm] = useState({ user_id: '', title: '', date: '', location: '', city: '' });
  const [locationSuggestions, setLocationSuggestions] = useState<GooglePlacePrediction[]>([]);
  const [locationSuggestionsVisible, setLocationSuggestionsVisible] = useState(false);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const locationSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationRequestIdRef = useRef(0);
  const filteredCouples = coupleOptions.filter(opt => {
    const query = userSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return opt.name.toLowerCase().includes(query) || opt.email.toLowerCase().includes(query);
  });

  useEffect(() => {
    loadAvailableCouples();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (locationSearchTimeoutRef.current) {
        clearTimeout(locationSearchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof userId === 'string' && userId) {
      setAddForm(f => (f.user_id ? f : { ...f, user_id: userId }));
    }
  }, [userId]);

  const loadAvailableCouples = async () => {
    const allCouples = await userService.getClients();
    setCoupleOptions(
      allCouples
        .filter(u => (u.events_count || 0) === 0)
        .map(u => ({ id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url }))
    );
  };

  const getInitials = (name: string) => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + second).toUpperCase() || 'U';
  };

  const handleDateChange = (date: Date | undefined) => {
    setShowDatePicker(false);
    if (date) {
      setAddForm(f => ({ ...f, date: date.toISOString().split('T')[0] }));
    }
  };

  const handleAddEvent = async () => {
    console.log('handleAddEvent called', addForm);
    if (!addForm.user_id || !addForm.title || !addForm.date || !addForm.location || !addForm.city) {
      Alert.alert('שגיאה', 'יש למלא את כל השדות');
      return;
    }
    setLoading(true);
    try {
      await eventService.createEventForUser(
        addForm.user_id,
        {
          title: addForm.title,
          date: new Date(addForm.date),
          location: addForm.location,
          city: addForm.city,
          story: '',
          guests: 0,
          budget: 0,
        }
      );
      router.replace('/(admin)/admin-events');
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להוסיף את האירוע');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const isFormValid = Boolean(addForm.user_id && addForm.title && addForm.date && addForm.location && addForm.city);
  const scrollToInputs = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  };
  const goBackToEvents = () => {
    router.replace('/(admin)/admin-events');
  };

  const handleLocationChange = (value: string) => {
    setAddForm(f => ({ ...f, location: value }));
    setLocationSearchError('');

    const query = String(value || '').trim();
    if (locationSearchTimeoutRef.current) {
      clearTimeout(locationSearchTimeoutRef.current);
    }

    if (query.length < 2) {
      setLocationSearchLoading(false);
      setLocationSuggestions([]);
      setLocationSuggestionsVisible(false);
      return;
    }

    setLocationSuggestionsVisible(true);
    setLocationSearchLoading(true);
    const nextRequestId = locationRequestIdRef.current + 1;
    locationRequestIdRef.current = nextRequestId;

    locationSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const suggestions = await googlePlacesService.autocomplete(query);
        if (locationRequestIdRef.current !== nextRequestId) return;
        setLocationSuggestions(suggestions);
      } catch (error: any) {
        if (locationRequestIdRef.current !== nextRequestId) return;
        console.error('Location autocomplete error:', error);
        setLocationSuggestions([]);
        setLocationSearchError('לא ניתן לטעון הצעות מיקום כרגע');
      } finally {
        if (locationRequestIdRef.current === nextRequestId) {
          setLocationSearchLoading(false);
        }
      }
    }, 350);
  };

  const handleLocationSuggestionPress = async (suggestion: GooglePlacePrediction) => {
    if (locationSearchTimeoutRef.current) {
      clearTimeout(locationSearchTimeoutRef.current);
    }
    locationRequestIdRef.current += 1;
    setLocationSuggestionsVisible(false);
    setLocationSuggestions([]);
    setLocationSearchError('');
    setAddForm(f => ({
      ...f,
      location: suggestion.title || suggestion.description,
    }));
    Keyboard.dismiss();
    setLocationSearchLoading(true);
    try {
      const place = await googlePlacesService.getPlaceDetails(suggestion.placeId);
      const nextLocation = place.name || place.formattedAddress || suggestion.title || suggestion.description;
      setAddForm(f => ({
        ...f,
        location: nextLocation,
        city: place.city || f.city,
      }));
    } catch (error: any) {
      console.error('Location details error:', error);
      setLocationSearchError('לא ניתן לבחור את המיקום כרגע');
    } finally {
      setLocationSearchLoading(false);
    }
  };

  return (
    <BackSwipe>
      <View style={styles.screen}>
        <LinearGradient
          colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bg}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.75, y: 0.55 }}
          style={styles.bgHighlight}
        />
        <LinearGradient
          colors={['rgba(232,196,122,0.56)', 'rgba(244,224,186,0.22)', 'rgba(244,224,186,0)']}
          start={{ x: 1, y: 0.95 }}
          end={{ x: 0.18, y: 0.22 }}
          style={styles.bgWarmGlow}
        />

        <AppKeyboardAwareScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          stickyHeaderIndices={[0]}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: keyboardVisible ? 140 : Math.max(insets.bottom, 24) + 84 },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          enableResetScrollToCoords={false}
        >
            <View style={[styles.mobileTopBarSticky, { paddingTop: insets.top + 10 }]}>
              <View style={styles.mobileTopBar}>
                <View style={styles.mobileTopBarRightGroup}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="חזרה לאירועים"
                    onPress={goBackToEvents}
                    activeOpacity={0.88}
                    style={styles.mobileTopBarButton}
                  >
                    <Ionicons name="arrow-forward" size={20} color={colors.primary} />
                  </TouchableOpacity>

                  <Text style={styles.mobileTopBarTitle}>הוספת אירוע חדש</Text>
                </View>
                <View style={styles.mobileTopBarPlaceholder} />
              </View>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroSurface} />
              <View style={styles.heroBlobPrimary} />
              <View style={styles.heroBlobSecondary} />
              <View style={styles.heroContent}>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>אירוע חדש</Text>
                </View>
                <Text style={styles.heroTitle}>בואו נתכנן את{'\n'}החוויה הבאה</Text>
                <Text style={styles.heroSubtitle}>סוג האירוע, משתמש ותאריך במקום אחד.</Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>משתמש</Text>
                <Text style={styles.sectionHint}>בחר זוג/לקוח</Text>
              </View>
              <TouchableOpacity
                style={styles.selectorCard}
                onPress={() => setShowUserModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.selectorRow}>
                  <View style={styles.selectorIconWrap}>
                    <Ionicons name="person" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.selectorTextWrap}>
                    <Text style={styles.selectorTitle}>
                      {addForm.user_id ? (coupleOptions.find(opt => opt.id === addForm.user_id)?.name || 'בחר משתמש') : 'בחר משתמש'}
                    </Text>
                    <Text style={styles.selectorSubtitle}>
                      {addForm.user_id ? (coupleOptions.find(opt => opt.id === addForm.user_id)?.email || '') : 'הקצאת משתמש לאירוע'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-down" size={18} color={colors.gray[500]} />
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>סוג האירוע</Text>
                <Text style={styles.sectionHint}>בחר תבנית</Text>
              </View>
              <View style={styles.grid}>
                {EVENT_TYPES.map(opt => {
                  const isActive = addForm.title === opt.value;
                  const meta = EVENT_TYPE_META[opt.value];
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.eventCard, isActive && styles.eventCardActive]}
                      onPress={() => setAddForm(f => ({ ...f, title: opt.value }))}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.eventIconWrap, isActive && styles.eventIconWrapActive]}>
                        <Ionicons name={meta?.icon || 'sparkles'} size={18} color={isActive ? colors.white : colors.textLight} />
                      </View>
                      <Text style={[styles.eventTitle, isActive && styles.eventTitleActive]}>{opt.label}</Text>
                      <Text style={[styles.eventHint, isActive && styles.eventHintActive]}>{meta?.hint || 'אירוע מיוחד'}</Text>
                      {isActive ? <View style={styles.eventActiveDot} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>פרטי האירוע</Text>
                <Text style={styles.sectionHint}>תאריך ומיקום</Text>
              </View>

              <TouchableOpacity style={styles.datePickerCard} onPress={() => setShowDatePicker(true)} activeOpacity={0.88}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.98)', 'rgba(245,248,255,0.98)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.datePickerCardGradient}
                />
                <View style={styles.datePickerRow}>
                  <View style={styles.datePickerIconWrap}>
                    <Ionicons name="calendar" size={20} color={colors.primary} />
                  </View>

                  <View style={styles.datePickerTextWrap}>
                    <Text style={styles.datePickerLabel}>מתי?</Text>
                    <Text style={[styles.datePickerValue, !addForm.date && styles.datePickerPlaceholder]}>
                      {addForm.date ? formatDate(addForm.date) : 'בחר תאריך לאירוע'}
                    </Text>
                  </View>

                  <View style={styles.datePickerActionPill}>
                    <Text style={styles.datePickerActionText}>{addForm.date ? 'שנה תאריך' : 'בחר תאריך'}</Text>
                    <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                  </View>
                </View>
              </TouchableOpacity>

              <DateTimePickerModal
                isVisible={showDatePicker}
                mode="date"
                onConfirm={date => handleDateChange(date)}
                onCancel={() => setShowDatePicker(false)}
                minimumDate={new Date()}
                locale="he-IL"
                date={addForm.date ? new Date(addForm.date) : new Date()}
              />

              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.selectorIconWrap}>
                    <Ionicons name="location" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.infoTextWrap}>
                    <Text style={styles.infoLabel}>איפה?</Text>
                    <TextInput
                      style={styles.infoInput}
                      value={addForm.location}
                      onChangeText={handleLocationChange}
                      onFocus={() => {
                        if (locationSuggestions.length > 0) setLocationSuggestionsVisible(true);
                      }}
                      textAlign="right"
                      placeholder="חפש אולם או כתובת"
                      placeholderTextColor={colors.gray[400]}
                    />
                    {locationSearchLoading ? (
                      <View style={styles.locationSearchState}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.locationSearchStateText}>מחפש ב-Google...</Text>
                      </View>
                    ) : null}
                    {locationSearchError ? (
                      <Text style={styles.locationSearchErrorText}>{locationSearchError}</Text>
                    ) : null}
                    {locationSuggestionsVisible && locationSuggestions.length > 0 ? (
                      <View style={styles.locationSuggestionsWrap}>
                        {locationSuggestions.map((suggestion, index) => (
                          <TouchableOpacity
                            key={`${suggestion.placeId}-${index}`}
                            style={[
                              styles.locationSuggestionRow,
                              index === locationSuggestions.length - 1 ? styles.locationSuggestionRowLast : null,
                            ]}
                            onPress={() => void handleLocationSuggestionPress(suggestion)}
                            activeOpacity={0.86}
                          >
                            <View style={styles.locationSuggestionIconWrap}>
                              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                            </View>
                            <View style={styles.locationSuggestionTextWrap}>
                              <Text style={styles.locationSuggestionTitle} numberOfLines={1}>
                                {suggestion.title}
                              </Text>
                              <Text style={styles.locationSuggestionSubtitle} numberOfLines={2}>
                                {suggestion.subtitle || suggestion.description}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.selectorIconWrap}>
                    <Ionicons name="business" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.infoTextWrap}>
                    <Text style={styles.infoLabel}>עיר</Text>
                    <TextInput
                      style={styles.infoInput}
                      value={addForm.city}
                      onChangeText={v => setAddForm(f => ({ ...f, city: v }))}
                      onFocus={scrollToInputs}
                      textAlign="right"
                      placeholder="הזן עיר"
                      placeholderTextColor={colors.gray[400]}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.inlineActions}>
                <TouchableOpacity
                  onPress={handleAddEvent}
                  disabled={loading || !isFormValid}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={
                      loading || !isFormValid
                        ? [colors.gray[300], colors.gray[200]]
                        : [colors.primary, colors.yaleBlue]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.createBtn}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <View style={styles.createBtnRow}>
                        <Ionicons name="sparkles" size={18} color={colors.white} />
                        <Text style={styles.createBtnText}>צור אירוע</Text>
                        <Ionicons name="arrow-back" size={18} color={colors.white} />
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </AppKeyboardAwareScrollView>

        <Modal
          visible={showUserModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowUserModal(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowUserModal(false)}>
            <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={() => {}}>
              <LinearGradient
                colors={['rgba(255,255,255,0.98)', 'rgba(249,247,242,0.97)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalContentGradient}
              />

              <View style={styles.modalHeader}>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowUserModal(false)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalTitle}>בחירת משתמש</Text>
                  <Text style={styles.modalSubtitle}>בחר משתמש פנוי לשיוך האירוע החדש</Text>
                </View>
              </View>

              <View style={styles.searchRow}>
                <View style={styles.searchIconWrap}>
                  <Ionicons name="search" size={16} color={colors.primary} />
                </View>
                <TextInput
                  style={styles.searchInput}
                  value={userSearch}
                  onChangeText={setUserSearch}
                  placeholder="חפש משתמש לפי שם או אימייל"
                  placeholderTextColor={colors.gray[400]}
                  textAlign="right"
                />
              </View>

              <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                {filteredCouples.length === 0 ? (
                  <View style={styles.modalEmptyState}>
                    <Ionicons name="people-outline" size={30} color={colors.gray[400]} />
                    <Text style={styles.value}>אין משתמשים זמינים</Text>
                  </View>
                ) : (
                  filteredCouples.map(opt => {
                    const isSelected = addForm.user_id === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                        onPress={() => {
                          setAddForm(f => ({ ...f, user_id: opt.id }));
                          setShowUserModal(false);
                          setUserSearch('');
                        }}
                        activeOpacity={0.88}
                      >
                        <View style={styles.modalItemRow}>
                          <View style={styles.modalItemArrowWrap}>
                            {isSelected ? (
                              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                            ) : (
                              <Ionicons name="chevron-back" size={18} color={colors.gray[400]} />
                            )}
                          </View>

                          <View style={styles.modalItemTextWrap}>
                            <Text style={styles.modalItemText}>{opt.name}</Text>
                            <Text style={styles.modalItemSub}>{opt.email}</Text>
                          </View>

                          <View style={styles.modalItemAvatar}>
                            {opt.avatar_url ? (
                              <Image source={{ uri: opt.avatar_url }} style={styles.modalItemAvatarImage} />
                            ) : (
                              <Text style={styles.modalItemAvatarFallback}>{getInitials(opt.name)}</Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#E8F1FF',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 40,
  },
  mobileTopBarSticky: {
    backgroundColor: 'rgba(247,250,255,0.96)',
    paddingBottom: 10,
    marginHorizontal: -18,
    paddingHorizontal: 18,
    zIndex: 10,
  },
  mobileTopBar: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileTopBarRightGroup: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    flex: 1,
  },
  mobileTopBarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  mobileTopBarTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#06173e',
    textAlign: 'right',
    flexShrink: 1,
  },
  mobileTopBarPlaceholder: {
    width: 44,
    height: 44,
  },
  heroCard: {
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.white,
  },
  heroBlobPrimary: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.accent,
    opacity: 0.18,
    top: -90,
    right: -40,
  },
  heroBlobSecondary: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primary,
    opacity: 0.12,
    bottom: -60,
    left: -20,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: ALIGN_RIGHT,
    padding: 20,
  },
  heroBadge: {
    alignSelf: ALIGN_RIGHT,
    backgroundColor: 'rgba(6, 23, 62, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: ROW_DIR,
    alignItems: ALIGN_RIGHT,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  sectionHint: {
    fontSize: 12,
    color: colors.gray[500],
    textAlign: 'right',
  },
  selectorCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  selectorRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    flex: 1,
  },
  selectorIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 23, 62, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 12,
  },
  selectorTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  selectorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  selectorSubtitle: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 4,
    textAlign: 'right',
  },
  grid: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  eventCard: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: ALIGN_RIGHT,
  },
  eventCardActive: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  eventIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    alignSelf: ALIGN_RIGHT,
  },
  eventIconWrapActive: {
    backgroundColor: colors.primary,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  eventTitleActive: {
    color: colors.primary,
  },
  eventHint: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 4,
    textAlign: 'right',
  },
  eventHintActive: {
    color: colors.textLight,
  },
  eventActiveDot: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  infoRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.gray[500],
    textAlign: 'right',
  },
  infoValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  infoInput: {
    marginTop: 6,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  locationSearchState: {
    marginTop: 10,
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  locationSearchStateText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
  },
  locationSearchErrorText: {
    marginTop: 8,
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
    textAlign: 'right',
  },
  locationSuggestionsWrap: {
    marginTop: 12,
    width: '100%',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(248,250,252,0.96)',
  },
  locationSuggestionRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  locationSuggestionRowLast: {
    borderBottomWidth: 0,
  },
  locationSuggestionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(6, 23, 62, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 10,
  },
  locationSuggestionTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  locationSuggestionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  locationSuggestionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
    lineHeight: 18,
  },
  datePickerCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  datePickerCardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  datePickerRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  datePickerIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  datePickerLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
  },
  datePickerValue: {
    marginTop: 6,
    fontSize: 19,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  datePickerPlaceholder: {
    color: colors.gray[500],
    fontSize: 16,
  },
  datePickerActionPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(232,240,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
  },
  datePickerActionText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  inlineActions: {
    marginTop: 6,
  },
  createBtn: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  createBtnRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  createBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  selectedUserHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.gray[500],
    textAlign: 'right',
  },
  value: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7,14,34,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    padding: 18,
    alignItems: ALIGN_RIGHT,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  modalContentGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  modalHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  searchRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    marginBottom: 12,
  },
  searchIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
  },
  modalList: {
    maxHeight: 340,
    width: '100%',
  },
  modalListContent: {
    gap: 10,
    paddingTop: 2,
  },
  modalItem: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    alignItems: ALIGN_RIGHT,
  },
  modalItemSelected: {
    borderColor: 'rgba(6,23,62,0.18)',
    backgroundColor: 'rgba(232,240,255,0.86)',
  },
  modalItemRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  modalItemAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  modalItemAvatarImage: {
    width: '100%',
    height: '100%',
  },
  modalItemAvatarFallback: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  modalItemTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  modalItemArrowWrap: {
    width: 24,
    alignItems: 'center',
  },
  modalItemText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  modalItemSub: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
    textAlign: 'right',
  },
  modalEmptyState: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
}); 