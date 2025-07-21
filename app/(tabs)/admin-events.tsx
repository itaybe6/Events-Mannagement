import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Modal, TouchableOpacity, TextInput, Platform, Alert, KeyboardAvoidingView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '@/store/userStore';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';
import DateTimePicker from '@react-native-community/datetimepicker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

interface EventWithUser {
  id: string;
  title: string;
  date: string;
  location: string;
  guests_count: number;
  user_id: string;
  user_name: string;
  user_email: string;
}

const EVENT_TYPES = [
  { label: 'חתונה', value: 'חתונה' },
  { label: 'בר מצווה', value: 'בר מצווה' },
  { label: 'בת מצווה', value: 'בת מצווה' },
  { label: 'ברית', value: 'ברית' },
  { label: 'אירוע חברה', value: 'אירוע חברה' },
];

export default function AdminEventsScreen() {
  const { isLoggedIn, userType } = useUserStore();
  const router = useRouter();
  const [events, setEvents] = useState<EventWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [coupleOptions, setCoupleOptions] = useState<{id: string, name: string, email: string}[]>([]);
  const [addForm, setAddForm] = useState({ user_id: '', title: '', date: '', location: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || userType !== 'admin') {
      router.replace('/login');
      return;
    }
    loadEvents();
    // טען את כל הזוגות שאין להם אירוע עתידי
    loadAvailableCouples();
  }, [isLoggedIn, userType]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString();
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date, location, guests_count, user_id, users(name, email)')
        .gt('date', today)
        .order('date', { ascending: true });
      if (error) throw error;
      const mapped: EventWithUser[] = (data || []).map((e: any) => ({
        id: e.id,
        title: e.title,
        date: e.date,
        location: e.location,
        guests_count: e.guests_count,
        user_id: e.user_id,
        user_name: e.users?.name || '',
        user_email: e.users?.email || '',
      }));
      setEvents(mapped);
    } catch (err) {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableCouples = async () => {
    // משוך את כל הזוגות שאין להם אירוע עתידי
    const allCouples = await userService.getClients();
    // סנן כאלה שאין להם אירוע עתידי (events_count === 0)
    setCoupleOptions(allCouples.filter(u => (u.events_count || 0) === 0).map(u => ({ id: u.id, name: u.name, email: u.email })));
  };

  const handleAddEvent = async () => {
    if (!addForm.user_id || !addForm.title || !addForm.date || !addForm.location) return;
    setAddLoading(true);
    try {
      await eventService.createEvent({
        user_id: addForm.user_id,
        title: addForm.title,
        date: new Date(addForm.date),
        location: addForm.location,
        guests: Number(addForm.guests_count) || 0,
        image: '',
        story: '',
        budget: 0,
      });
      setShowAddModal(false);
      setAddForm({ user_id: '', title: '', date: '', location: '' });
      await loadEvents();
      await loadAvailableCouples();
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להוסיף את האירוע');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDateChange = (selectedDate: Date | undefined) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setAddForm(f => ({ ...f, date: selectedDate.toISOString().split('T')[0] }));
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });

  return (
    <View style={{ flex: 1, backgroundColor: '#e8a7a8' }}>
      <View style={styles.cardContainer}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadEvents} />}
        >
          <View style={styles.header}>
            <Text style={styles.title}>אירועים עתידיים</Text>
            <Text style={styles.subtitle}>סה"כ {events.length} אירועים</Text>
            <TouchableOpacity style={styles.addEventButton} onPress={() => router.push('/(tabs)/admin-events-create')}>
              <Ionicons name="add-circle" size={22} color={colors.success} />
              <Text style={styles.addEventButtonText}>הוסף אירוע</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.eventsList}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : events.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={60} color={colors.gray[400]} />
                <Text style={styles.emptyStateTitle}>אין אירועים עתידיים</Text>
              </View>
            ) : (
              events.map(event => (
                <View key={event.id} style={styles.eventCard}>
                  <View style={styles.eventHeaderRow}>
                    <Ionicons name="calendar" size={22} color={colors.primary} style={styles.eventIcon} />
                    <Text style={styles.eventTitle}>{event.title}</Text>
                  </View>
                  <Text style={styles.eventInfo}><Ionicons name="location" size={16} color={colors.orange} /> {event.location}</Text>
                  <Text style={styles.eventInfo}><Ionicons name="person" size={16} color={colors.info} /> {event.user_name} ({event.user_email})</Text>
                  <Text style={styles.eventInfo}><Ionicons name="people" size={16} color={colors.success} /> {event.guests_count} מוזמנים</Text>
                  <Text style={styles.eventInfo}><Ionicons name="time" size={16} color={colors.gray[500]} /> {formatDate(event.date)}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    marginTop: 20,
    marginBottom: 40,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    marginBottom: 20,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right',
  },
  eventsList: {
    gap: 12,
    alignItems: 'flex-end',
  },
  eventCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'flex-end',
  },
  eventHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventIcon: {
    marginLeft: 8,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'right',
  },
  eventInfo: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
    marginBottom: 2,
    flexDirection: 'row-reverse',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  addEventButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 15,
    alignSelf: 'flex-end',
  },
  addEventButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 25,
    width: '90%',
    alignItems: 'flex-end',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 15,
    textAlign: 'right',
  },
  modalLabel: {
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  modalSelectRow: {
    flexDirection: 'row-reverse',
    marginBottom: 15,
  },
  modalValue: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right',
  },
  modalUserOption: {
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  modalUserOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalUserOptionText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  modalUserOptionTextActive: {
    color: colors.white,
  },
  modalInput: {
    fontSize: 18,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[300],
    marginBottom: 15,
    paddingVertical: 8,
    textAlign: 'right',
  },
  saveModalButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 25,
    alignItems: 'center',
    marginTop: 10,
  },
  saveModalButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeModalButton: {
    backgroundColor: colors.gray[200],
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 25,
    alignItems: 'center',
    marginTop: 10,
  },
  closeModalButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalContentApple: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 25,
    width: '90%',
    alignItems: 'flex-end',
  },
  modalTitleApple: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 15,
    textAlign: 'right',
  },
  modalLabelApple: {
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  modalSelectRowApple: {
    flexDirection: 'row-reverse',
    marginBottom: 15,
  },
  modalValueApple: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right',
  },
  modalUserOptionApple: {
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  modalUserOptionActiveApple: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalUserOptionTextApple: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  modalUserOptionTextActiveApple: {
    color: colors.white,
  },
  datePickerButtonApple: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  datePickerButtonTextApple: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 8,
    textAlign: 'right',
  },
  modalInputApple: {
    fontSize: 18,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[300],
    marginBottom: 15,
    paddingVertical: 8,
    textAlign: 'right',
    width: '100%',
  },
  saveModalButtonApple: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 25,
    alignItems: 'center',
    marginTop: 10,
  },
  saveModalButtonTextApple: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeModalButtonApple: {
    backgroundColor: colors.gray[200],
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 25,
    alignItems: 'center',
    marginTop: 10,
  },
  closeModalButtonTextApple: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
}); 