import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, SafeAreaView, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
// אם לא מותקן: הרץ npm install @react-native-picker/picker
import { Picker } from '@react-native-picker/picker';

const EVENT_TYPES = [
  { label: 'חתונה', value: 'חתונה' },
  { label: 'בר מצווה', value: 'בר מצווה' },
  { label: 'בת מצווה', value: 'בת מצווה' },
  { label: 'ברית', value: 'ברית' },
  { label: 'אירוע חברה', value: 'אירוע חברה' },
];

export default function AdminEventsCreateScreen() {
  const router = useRouter();
  const [coupleOptions, setCoupleOptions] = useState<{id: string, name: string, email: string}[]>([]);
  const [addForm, setAddForm] = useState({ user_id: '', title: '', date: '', location: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    loadAvailableCouples();
  }, []);

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
    if (!addForm.user_id || !addForm.title || !addForm.date || !addForm.location) {
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
          image: '',
          story: '',
          guests: 0,
          budget: 0,
        }
      );
      router.replace('/(tabs)/admin-events');
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להוסיף את האירוע');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[100] }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <Text style={styles.title}>הוסף אירוע חדש</Text>
            <Text style={styles.label}>בחר משתמש:</Text>
            <View style={styles.selectRow}>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowUserModal(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownButtonText}>
                  {addForm.user_id ? (coupleOptions.find(opt => opt.id === addForm.user_id)?.name || 'בחר משתמש') : 'בחר משתמש'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.primary} style={{ marginRight: 6 }} />
              </TouchableOpacity>
              <Modal
                visible={showUserModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowUserModal(false)}
              >
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowUserModal(false)}>
                  <View style={styles.modalContent}>
                    <ScrollView style={{ maxHeight: 300 }}>
                      {coupleOptions.length === 0 ? (
                        <Text style={styles.value}>אין משתמשים זמינים</Text>
                      ) : (
                        coupleOptions.map(opt => (
                          <TouchableOpacity
                            key={opt.id}
                            style={styles.modalItem}
                            onPress={() => {
                              setAddForm(f => ({ ...f, user_id: opt.id }));
                              setShowUserModal(false);
                            }}
                          >
                            <Text style={styles.modalItemText}>{opt.name}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                  </View>
                </TouchableOpacity>
              </Modal>
            </View>
            <Text style={styles.label}>סוג האירוע:</Text>
            <View style={styles.selectRow}>
              {EVENT_TYPES.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.userOption, addForm.title === opt.value && styles.userOptionActive]}
                  onPress={() => setAddForm(f => ({ ...f, title: opt.value }))}
                >
                  <Text style={[styles.userOptionText, addForm.title === opt.value && styles.userOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>תאריך:</Text>
            <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
              <Text style={styles.datePickerButtonText}>{addForm.date ? formatDate(addForm.date) : 'בחר תאריך'}</Text>
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
            <Text style={styles.label}>מיקום:</Text>
            <TextInput
              style={styles.input}
              value={addForm.location}
              onChangeText={v => setAddForm(f => ({ ...f, location: v }))}
              textAlign="right"
              placeholder="הזן מיקום"
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleAddEvent} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>שמור</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => router.replace('/(tabs)/admin-events')}>
              <Text style={styles.cancelButtonText}>ביטול</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  formCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 28,
    alignItems: 'flex-end',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 18,
    textAlign: 'right',
  },
  label: {
    fontSize: 16,
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
    textAlign: 'right',
  },
  value: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right',
  },
  selectRow: {
    flexDirection: 'row-reverse',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  userOption: {
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: colors.gray[300],
    marginBottom: 6,
  },
  userOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  userOptionText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  userOptionTextActive: {
    color: colors.white,
  },
  datePickerButton: {
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
  datePickerButtonText: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 8,
    textAlign: 'right',
  },
  input: {
    fontSize: 18,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[300],
    marginBottom: 18,
    paddingVertical: 8,
    textAlign: 'right',
    width: '100%',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 30,
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: colors.gray[200],
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 30,
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  dropdownButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.gray[300],
    minWidth: 200, // was 120
    width: '100%', // fill available space
    marginBottom: 8,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
    flex: 1,
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
    padding: 12,
    minWidth: 220,
    maxWidth: 320,
    alignItems: 'flex-end',
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    alignItems: 'flex-end',
  },
  modalItemText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
}); 