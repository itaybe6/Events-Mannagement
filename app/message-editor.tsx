import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

interface NotificationSetting {
  id?: string;
  notification_type: string;
  title: string;
  enabled: boolean;
  message_content?: string;
  notification_date?: string; // ISO string from DB
  days_from_wedding?: number; // fallback for legacy param
}

export default function MessageEditor() {
  const router = useRouter();
  const { eventId, notifications: notificationsParam } = useLocalSearchParams();
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);

  useEffect(() => {
    if (notificationsParam && typeof notificationsParam === 'string') {
      try {
        const parsedNotifications = JSON.parse(notificationsParam);
        setNotifications(parsedNotifications);
      } catch (error) {
        console.error('Error parsing notifications:', error);
        Alert.alert('שגיאה', 'לא ניתן לטעון את ההודעות');
        router.back();
      }
    }
  }, [notificationsParam]);

  const updateMessageContent = (notification_type: string, content: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.notification_type === notification_type
          ? { ...notification, message_content: content }
          : notification
      )
    );
  };

  const saveMessages = async () => {
    if (!eventId) {
      Alert.alert('שגיאה', 'מזהה אירוע לא נמצא');
      return;
    }

    setLoading(true);

    try {
      // Update each notification's message content and date
      const updatePromises = notifications
        .filter(notification => notification.id) // Only update existing records
        .map(notification => 
          supabase
            .from('notification_settings')
            .update({ 
              message_content: notification.message_content,
              notification_date: notification.notification_date
            })
            .eq('id', notification.id)
        );

      const results = await Promise.all(updatePromises);
      
      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        console.error('Errors updating messages:', errors);
        Alert.alert('שגיאה', 'לא ניתן לשמור חלק מההודעות');
        return;
      }

      Alert.alert('✅ נשמר בהצלחה', 'תוכן ההודעות עודכן', [
        { text: 'חזור להגדרות', onPress: () => router.back() }
      ]);

    } catch (error) {
      console.error('Error saving messages:', error);
      Alert.alert('שגיאה', 'לא ניתן לשמור את ההודעות');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (notification: NotificationSetting) => {
    if (notification.notification_date) {
      return new Date(notification.notification_date).toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
    if (typeof notification.days_from_wedding === 'number') {
      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + notification.days_from_wedding);
      return targetDate.toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
    return '';
  };

  const openDatePicker = (notification_type: string) => {
    Keyboard.dismiss();
    setEditingType(notification_type);
    setTimeout(() => setDatePickerVisibility(true), 60);
  };

  const handleConfirmDate = (selectedDate: Date) => {
    if (!editingType) {
      setDatePickerVisibility(false);
      return;
    }
    setNotifications(prev => 
      prev.map(n => 
        n.notification_type === editingType
          ? { ...n, notification_date: selectedDate.toISOString() }
          : n
      )
    );
    setDatePickerVisibility(false);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-forward" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>עריכת הודעות</Text>
        <TouchableOpacity 
          style={[styles.saveButton, loading && styles.saveButtonDisabled]} 
          onPress={saveMessages}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'שומר...' : 'שמור'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {notifications.map((notification, index) => (
          <View key={notification.notification_type} style={styles.messageCard}>
            <View style={styles.messageHeader}>
              <Text style={styles.messageTitle}>{notification.title}</Text>
              <TouchableOpacity style={styles.dateRow} onPress={() => openDatePicker(notification.notification_type)}>
                <Ionicons name="calendar" size={16} color={colors.primary} />
                <Text style={styles.messageDate}>
                  {formatDate(notification)}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>תוכן ההודעה:</Text>
              <TextInput
                style={styles.messageInput}
                value={notification.message_content || ''}
                onChangeText={(text) => updateMessageContent(notification.notification_type, text)}
                placeholder="הזן את תוכן ההודעה..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                textAlign="right"
                textAlignVertical="top"
              />
              <Text style={styles.characterCount}>
                {(notification.message_content || '').length}/300
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={handleConfirmDate}
        onCancel={() => setDatePickerVisibility(false)}
        minimumDate={new Date()}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  messageHeader: {
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'right',
  },
  messageDate: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'right',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputContainer: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'right',
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    minHeight: 100,
    writingDirection: 'rtl',
  },
  characterCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'left',
    marginTop: 8,
  },
}); 