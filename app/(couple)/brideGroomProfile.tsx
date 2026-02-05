import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, Modal, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useRouter, useFocusEffect } from 'expo-router';
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
  notification_date?: string; // ISO string date
}

const DEFAULT_NOTIFICATION_TEMPLATES: Omit<NotificationSetting, 'id' | 'enabled'>[] = [
  { notification_type: 'reminder_1', title: 'הזכרה ראשונה', notification_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString(), message_content: 'שלום! זה תזכורת ראשונה לחתונה שלנו בעוד חודש!' },
  { notification_type: 'reminder_2', title: 'הזכרה שנייה', notification_date: new Date(new Date().setDate(new Date().getDate() - 14)).toISOString(), message_content: 'היי! החתונה שלנו בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'whatsapp_1', title: 'וואצאפ ראשון', notification_date: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString(), message_content: 'החתונה בעוד שבוע! אל תשכחו לאשר הגעה 💒' },
  { notification_type: 'whatsapp_2', title: 'וואצאפ שני', notification_date: new Date(new Date().setDate(new Date().getDate() - 3)).toISOString(), message_content: 'בעוד 3 ימים נתחתן! מתרגשים לראות אתכם 🎉' },
  { notification_type: 'whatsapp_3', title: 'וואצאפ שלישי', notification_date: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), message_content: 'מחר החתונה! נתראה שם ❤️' }
];

export default function BrideGroomSettings() {
  const { userData, logout } = useUserStore();
  const router = useRouter();
  const [weddingDate, setWeddingDate] = useState<Date | null>(null);
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNotification, setEditingNotification] = useState<NotificationSetting | null>(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [editedDate, setEditedDate] = useState<Date | null>(null);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);

  const getDefaultMessageContent = (userName?: string) => {
    const displayName = userName && userName.trim().length > 0 ? userName.trim() : 'בעל/ת האירוע';
    return `הנכם מוזמנים לטקס החינה של ${displayName}\nפרטי האירוע ואישור הגעתכם בקישור\nנשמח לראותכם בין אורחינו.`;
  };

  useEffect(() => {
    if (userData?.event_id) {
      initializeData();
    }
  }, [userData?.event_id]);

  // Refresh data when screen comes into focus (e.g., returning from message editor)
  useFocusEffect(
    React.useCallback(() => {
      if (userData?.event_id && !loading) {
        fetchOrCreateNotificationSettings();
      }
    }, [userData?.event_id, loading])
  );

  const initializeData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchWeddingDate(),
        fetchOrCreateNotificationSettings()
      ]);
    } catch (error) {
      console.error('Error initializing data:', error);
      Alert.alert('שגיאה', 'לא ניתן לטעון את ההגדרות');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeddingDate = async () => {
    if (!userData?.event_id) return;
    
    const { data, error } = await supabase
      .from('events')
      .select('date')
      .eq('id', userData.event_id)
      .single();
    
    if (!error && data) {
      setWeddingDate(new Date(data.date));
    }
  };

  const fetchOrCreateNotificationSettings = async () => {
    if (!userData?.event_id) return;

    // Fetch existing settings from database
    const { data: existingSettings, error: fetchError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', userData.event_id)
      .order('notification_date'); // השתמש בעמודה החדשה

    if (fetchError) {
      console.error('Error fetching notification settings:', fetchError);
      return;
    }

    // Create a map of existing settings by notification_type
    const existingSettingsMap = new Map(
      (existingSettings || []).map(setting => [setting.notification_type, setting])
    );

    // Merge templates with existing settings
    const mergedNotifications = DEFAULT_NOTIFICATION_TEMPLATES.map(template => {
      const existingSetting = existingSettingsMap.get(template.notification_type);
      if (existingSetting) {
        // Use existing setting from database
        return existingSetting;
      } else {
        // Use template with enabled = false (not saved to DB yet)
        return {
          ...template,
          enabled: false,
          message_content: template.notification_type === 'reminder_1'
            ? getDefaultMessageContent(userData?.name)
            : (template.message_content || undefined)
        };
      }
    });

    setNotifications(mergedNotifications);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const toggleNotification = async (id: string | undefined, notification_type: string, currentEnabled: boolean) => {
    try {
      const newEnabled = !currentEnabled;

      if (id) {
        // Update existing setting in database
        const { error } = await supabase
          .from('notification_settings')
          .update({ enabled: newEnabled })
          .eq('id', id);

        if (error) {
          console.error('Error updating notification setting:', error);
          Alert.alert('שגיאה', 'לא ניתן לעדכן את ההגדרה');
          return;
        }

        // Update local state
        setNotifications(prev => 
          prev.map(notification => 
            notification.notification_type === notification_type
              ? { ...notification, enabled: newEnabled }
              : notification
          )
        );
      } else {
        // No ID means this setting doesn't exist in DB yet - create it
        const template = DEFAULT_NOTIFICATION_TEMPLATES.find(t => t.notification_type === notification_type);
        if (!template || !userData?.event_id) return;

        const newSetting = {
          ...template,
          event_id: userData.event_id,
          enabled: true,
          notification_date: new Date().toISOString(), // הוסף את התאריך הנוכחי כערך ברירת מחדל
          message_content: template.notification_type === 'reminder_1'
            ? getDefaultMessageContent(userData?.name)
            : (template.message_content || undefined)
        };

        const { data, error } = await supabase
          .from('notification_settings')
          .insert(newSetting)
          .select()
          .single();

        if (error) {
          console.error('Error creating notification setting:', error);
          Alert.alert('שגיאה', 'לא ניתן ליצור את ההגדרה');
          return;
        }

        // Update local state with the new setting that has an ID
        setNotifications(prev => 
          prev.map(notification => 
            notification.notification_type === notification_type
              ? data
              : notification
          )
        );
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      Alert.alert('שגיאה', 'לא ניתן לעדכן את ההגדרה');
    }
  };

  // Removed navigation to separate message editor; editing happens in modal now

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const openEditModal = (notification: NotificationSetting) => {
    setEditingNotification(notification);
    setEditedMessage(notification.message_content || '');
    setEditedDate(notification.notification_date ? new Date(notification.notification_date) : new Date());
    setEditModalVisible(true);
  };

  const handleConfirmDate = (selectedDate: Date) => {
    setEditedDate(selectedDate);
    setDatePickerVisibility(false);
  };

  const handleSaveEdit = async () => {
    if (!editingNotification || !userData?.event_id || !editedDate) return;

    try {
      if (editingNotification.id) {
        const { error } = await supabase
          .from('notification_settings')
          .update({ 
            notification_date: editedDate.toISOString(),
            message_content: editedMessage,
          })
          .eq('id', editingNotification.id);

        if (error) {
          console.error('Error updating notification:', error);
          Alert.alert('שגיאה', 'לא ניתן לעדכן את ההודעה');
          return;
        }

        setNotifications(prev =>
          prev.map(n =>
            n.notification_type === editingNotification.notification_type
              ? { ...n, notification_date: editedDate.toISOString(), message_content: editedMessage }
              : n
          )
        );
      } else {
        const { data, error } = await supabase
          .from('notification_settings')
          .insert({
            event_id: userData.event_id,
            notification_type: editingNotification.notification_type,
            title: editingNotification.title,
            notification_date: editedDate.toISOString(),
            message_content: editedMessage,
            enabled: editingNotification.enabled ?? false,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating notification:', error);
          Alert.alert('שגיאה', 'לא ניתן ליצור את ההודעה');
          return;
        }

        setNotifications(prev =>
          prev.map(n =>
            n.notification_type === editingNotification.notification_type ? data as any : n
          )
        );
      }

      setEditModalVisible(false);
    } catch (e) {
      console.error('Error saving edit:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את ההודעה');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>טוען הגדרות...</Text>
      </View>
    );
  }

  // Group notifications by type
  const regularNotifications = notifications.filter(n => n.notification_type.includes('reminder') || n.notification_type.includes('call'));
  const whatsappNotifications = notifications.filter(n => n.notification_type.includes('whatsapp'));

  const renderNotificationGroup = (title: string, notificationsList: NotificationSetting[], iconName: string, iconColor: string) => (
    <View style={styles.notificationGroup}>
      <View style={styles.groupHeader}>
        <Ionicons name={iconName as any} size={24} color={iconColor} />
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      
      <View style={styles.notificationsList}>
        {notificationsList.map((notification, index) => (
          <View key={notification.notification_type}>
            <View style={styles.notificationItem}>
              <Switch
                value={notification.enabled}
                onValueChange={() => toggleNotification(
                  notification.id, 
                  notification.notification_type, 
                  notification.enabled
                )}
                trackColor={{ false: colors.gray[200], true: 'rgba(0, 53, 102, 0.35)' }}
                thumbColor={notification.enabled ? colors.primary : colors.gray[100]}
                ios_backgroundColor={colors.gray[200]}
                style={styles.switchStyle}
              />
              <TouchableOpacity style={styles.notificationContent} onPress={() => openEditModal(notification)}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <View style={styles.dateContainer}>
                  <Ionicons name="calendar" size={16} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.notificationDate}>
                    {formatDate(notification.notification_date || null)}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            {index < notificationsList.length - 1 && <View style={styles.separator} />}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.editProfileIconButton} onPress={() => router.push('/profile-editor')}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          
          <View style={styles.profileIconContainer}>
            <Ionicons name="person-circle" size={80} color={colors.primary} />
          </View>
          <Text style={styles.profileName}>{userData?.name}</Text>
          <Text style={styles.profileEmail}>{userData?.email}</Text>
        </View>

        {/* Removed separate message editor button; editing per reminder row */}

        {/* Notifications Section */}
        <View style={styles.notificationsSection}>
          <Text style={styles.sectionTitle}>הודעות אוטומטיות</Text>
          <Text style={styles.sectionSubtitle}>
            נציין כי לפעמים תהיה חריגה של יום/יומיים בביצוע השיחות
          </Text>
          
          {/* Regular Notifications */}
          {renderNotificationGroup('הודעות רגילות', regularNotifications, 'mail', colors.primary)}
          
          {/* WhatsApp Notifications */}
          {renderNotificationGroup('הודעות וואטסאפ', whatsappNotifications, 'logo-whatsapp', colors.secondary)}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Unified Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalOverlayTouchable} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={() => { Keyboard.dismiss(); setEditModalVisible(false); }}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>עריכת הודעה</Text>
            <Text style={styles.modalSubtitle}>{editingNotification?.title}</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>תוכן ההודעה</Text>
              <TextInput
                style={styles.messageInput}
                value={editedMessage}
                onChangeText={setEditedMessage}
                placeholder="כתוב כאן את תוכן ההודעה..."
                placeholderTextColor={colors.gray[500]}
                multiline
                numberOfLines={4}
                textAlign="right"
                textAlignVertical="top"
              />
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>תאריך שליחה</Text>
              <TouchableOpacity style={styles.dateRow} onPress={() => { Keyboard.dismiss(); setTimeout(() => setDatePickerVisibility(true), 75); }}>
                <Ionicons name="calendar" size={18} color={colors.primary} />
                <Text style={styles.dateDisplay}>{editedDate ? editedDate.toLocaleDateString('he-IL') : ''}</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.saveButton} 
                onPress={handleSaveEdit}
              >
                <Text style={styles.saveButtonText}>שמור</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        date={editedDate || new Date()}
        onConfirm={handleConfirmDate}
        onCancel={() => setDatePickerVisibility(false)}
        minimumDate={new Date()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.textLight,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 120,
  },
  profileCard: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 32,
    position: 'relative',
  },
  profileIconContainer: {
    marginBottom: 16,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  profileEmail: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'center',
  },
  editProfileIconButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 1,
  },
  editMessagesButton: {
    backgroundColor: colors.primary,
    marginHorizontal: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  editMessagesText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
    marginRight: 8,
  },
  notificationsSection: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
    marginBottom: 20,
    lineHeight: 20,
  },
  notificationsList: {
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  notificationContent: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 16,
  },
  notificationTitle: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 2,
  },
  notificationDate: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
  },
  switchStyle: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  separator: {
    height: 0.5,
    backgroundColor: colors.gray[200],
    marginLeft: 60,
  },
  logoutButton: {
    backgroundColor: colors.error,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
  },
  notificationGroup: {
    marginBottom: 32,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  editDateButton: {
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 30,
    width: '80%',
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  messageInput: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.gray[50],
    minHeight: 100,
    writingDirection: 'rtl',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  dateDisplay: {
    marginLeft: 8,
    fontSize: 16,
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 18,
    color: colors.textLight,
    marginBottom: 20,
    textAlign: 'center',
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    color: colors.textLight,
    marginBottom: 8,
    textAlign: 'right',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 18,
    color: colors.text,
    textAlign: 'right',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: colors.gray[200],
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 12,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
}); 