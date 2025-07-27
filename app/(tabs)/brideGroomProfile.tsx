import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

interface NotificationSetting {
  id?: string;
  notification_type: string;
  title: string;
  days_from_wedding: number;
  enabled: boolean;
  message_content?: string;
}

const DEFAULT_NOTIFICATION_TEMPLATES: Omit<NotificationSetting, 'id' | 'enabled'>[] = [
  { notification_type: 'reminder_1', title: 'הזכרה ראשונה', days_from_wedding: -30, message_content: 'שלום! זה תזכורת ראשונה לחתונה שלנו בעוד חודש!' },
  { notification_type: 'reminder_2', title: 'הזכרה שנייה', days_from_wedding: -14, message_content: 'היי! החתונה שלנו בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'whatsapp_1', title: 'וואצאפ ראשון', days_from_wedding: -7, message_content: 'החתונה בעוד שבוע! אל תשכחו לאשר הגעה 💒' },
  { notification_type: 'whatsapp_2', title: 'וואצאפ שני', days_from_wedding: -3, message_content: 'בעוד 3 ימים נתחתן! מתרגשים לראות אתכם 🎉' },
  { notification_type: 'whatsapp_3', title: 'וואצאפ שלישי', days_from_wedding: -1, message_content: 'מחר החתונה! נתראה שם ❤️' },
  { notification_type: 'call_1', title: 'שיחה ראשונה נוכלי יפתח', days_from_wedding: 0, message_content: 'יום החתונה הגיע! תודה שבאתם לחגוג איתנו!' }
];

export default function BrideGroomSettings() {
  const { userData, logout } = useUserStore();
  const router = useRouter();
  const [weddingDate, setWeddingDate] = useState<Date | null>(null);
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);

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
      .order('days_from_wedding');

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
          enabled: false
        };
      }
    });

    setNotifications(mergedNotifications);
  };

  const formatDate = (daysFromWedding: number) => {
    if (!weddingDate) return '';
    
    const targetDate = new Date(weddingDate);
    targetDate.setDate(targetDate.getDate() + daysFromWedding);
    
    return targetDate.toLocaleDateString('he-IL', {
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
          enabled: true
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

  const handleEditMessages = () => {
    // Only include enabled notifications for editing
    const enabledNotifications = notifications.filter(notification => notification.enabled);
    
    if (enabledNotifications.length === 0) {
      Alert.alert('אין הודעות זמינות', 'אנא הפעל לפחות הודעה אחת כדי לערוך את התוכן');
      return;
    }

    router.push({
      pathname: '/message-editor',
      params: { 
        eventId: userData?.event_id,
        notifications: JSON.stringify(enabledNotifications)
      }
    });
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>טוען הגדרות...</Text>
      </View>
    );
  }

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

        {/* Messages Editor Button */}
        <TouchableOpacity style={styles.editMessagesButton} onPress={handleEditMessages}>
          <Ionicons name="create-outline" size={24} color={colors.white} />
          <Text style={styles.editMessagesText}>עריכת תוכן הודעות</Text>
        </TouchableOpacity>

        {/* Notifications Section */}
        <View style={styles.notificationsSection}>
          <Text style={styles.sectionTitle}>הודעות אוטומטיות</Text>
          <Text style={styles.sectionSubtitle}>
            נציין כי לפעמים תהיה חריגה של יום/יומיים בביצוע השיחות
          </Text>
          
          <View style={styles.notificationsList}>
            {notifications.map((notification, index) => (
              <View key={notification.notification_type}>
                <View style={styles.notificationItem}>
                  <Switch
                    value={notification.enabled}
                    onValueChange={() => toggleNotification(
                      notification.id, 
                      notification.notification_type, 
                      notification.enabled
                    )}
                    trackColor={{ false: '#E5E7EB', true: '#3B82F680' }}
                    thumbColor={notification.enabled ? '#3B82F6' : '#F3F4F6'}
                    ios_backgroundColor="#E5E7EB"
                    style={styles.switchStyle}
                  />
                  <View style={styles.notificationContent}>
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    <Text style={styles.notificationDate}>
                      {formatDate(notification.days_from_wedding)}
                    </Text>
                  </View>
                </View>
                {index < notifications.length - 1 && <View style={styles.separator} />}
              </View>
            ))}
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 120,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000',
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
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'center',
  },
  profileEmail: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  editProfileIconButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
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
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'right',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'right',
    marginBottom: 20,
    lineHeight: 20,
  },
  notificationsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
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
    color: '#1F2937',
    textAlign: 'right',
    marginBottom: 2,
  },
  notificationDate: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'right',
  },
  switchStyle: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  separator: {
    height: 0.5,
    backgroundColor: '#E5E7EB',
    marginLeft: 60,
  },
  logoutButton: {
    backgroundColor: '#EF4444',
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
}); 