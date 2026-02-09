import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, SafeAreaView, Alert, Modal, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { LinearGradient } from 'expo-linear-gradient';
import BackSwipe from '@/components/BackSwipe';

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
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const [coupleOptions, setCoupleOptions] = useState<{id: string, name: string, email: string}[]>([]);
  const [addForm, setAddForm] = useState({ user_id: '', title: '', date: '', location: '', city: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
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
    if (typeof userId === 'string' && userId) {
      setAddForm(f => (f.user_id ? f : { ...f, user_id: userId }));
    }
  }, [userId]);

  const loadAvailableCouples = async () => {
    const allCouples = await userService.getClients();
    setCoupleOptions(allCouples.filter(u => (u.events_count || 0) === 0).map(u => ({ id: u.id, name: u.name, email: u.email })));
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

  return (
    <BackSwipe>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'height' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.container}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: keyboardVisible ? 140 : 40 },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.replace('/(admin)/admin-events')}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={20} color={colors.primary} />
              </TouchableOpacity>
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

              <TouchableOpacity style={styles.infoCard} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
                <View style={styles.infoRow}>
                  <View style={styles.selectorIconWrap}>
                    <Ionicons name="calendar" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.infoTextWrap}>
                    <Text style={styles.infoLabel}>מתי?</Text>
                    <Text style={styles.infoValue}>{addForm.date ? formatDate(addForm.date) : 'בחר תאריך לאירוע'}</Text>
                  </View>
                </View>
                <Ionicons name="pencil" size={16} color={colors.gray[500]} />
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
                      onChangeText={v => setAddForm(f => ({ ...f, location: v }))}
                      onFocus={scrollToInputs}
                      textAlign="right"
                      placeholder="הזן מיקום"
                      placeholderTextColor={colors.gray[400]}
                    />
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

                <Text style={styles.selectedUserHint}>
                  {addForm.user_id
                    ? `משתמש שנבחר: ${coupleOptions.find(opt => opt.id === addForm.user_id)?.name || '—'}`
                    : 'לא נבחר משתמש עדיין'}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>

        <Modal
          visible={showUserModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowUserModal(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowUserModal(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>בחר משתמש</Text>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={colors.gray[400]} />
                <TextInput
                  style={styles.searchInput}
                  value={userSearch}
                  onChangeText={setUserSearch}
                  placeholder="חפש משתמש לפי שם או אימייל"
                  placeholderTextColor={colors.gray[400]}
                  textAlign="right"
                />
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {filteredCouples.length === 0 ? (
                  <Text style={styles.value}>אין משתמשים זמינים</Text>
                ) : (
                  filteredCouples.map(opt => (
                    <TouchableOpacity
                      key={opt.id}
                      style={styles.modalItem}
                      onPress={() => {
                        setAddForm(f => ({ ...f, user_id: opt.id }));
                        setShowUserModal(false);
                        setUserSearch('');
                      }}
                    >
                      <View style={styles.modalItemRow}>
                        <View>
                          <Text style={styles.modalItemText}>{opt.name}</Text>
                          <Text style={styles.modalItemSub}>{opt.email}</Text>
                        </View>
                        <Ionicons name="chevron-back" size={18} color={colors.gray[400]} />
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 10 : 6,
    marginBottom: 10,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    width: 40,
    height: 40,
    borderRadius: 20,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroCard: {
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 24,
    backgroundColor: colors.white,
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
    padding: 20,
  },
  heroBadge: {
    alignSelf: 'flex-end',
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
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.gray[500],
  },
  selectorCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  selectorRow: {
    flexDirection: 'row-reverse',
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
    marginLeft: 12,
  },
  selectorTextWrap: {
    flex: 1,
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
    flexDirection: 'row-reverse',
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoTextWrap: {
    flex: 1,
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
    flexDirection: 'row-reverse',
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
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    minWidth: 220,
    maxWidth: 320,
    alignItems: 'flex-end',
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    alignSelf: 'flex-end',
  },
  searchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    alignItems: 'flex-end',
  },
  modalItemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalItemText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  modalItemSub: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
    textAlign: 'right',
  },
}); 