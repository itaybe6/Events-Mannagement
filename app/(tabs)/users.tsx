import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Ionicons } from '@expo/vector-icons';
import { userService, UserWithMetadata } from '@/lib/services/userService';
import { authService } from '@/lib/services/authService';
import { basicPingTest } from '@/lib/basicPingTest';

const USER_FILTERS = [
  { label: 'הכל', value: 'all' },
  { label: 'מנהלים', value: 'admin' },
  { label: 'חתן/כלה', value: 'couple' },
];

export default function UsersScreen() {
  const { isLoggedIn, userType } = useUserStore();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [userFilter, setUserFilter] = useState('all');
  
  // Form state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    user_type: 'couple' as 'couple' | 'admin'
  });

  useEffect(() => {
    if (!isLoggedIn || userType !== 'admin') {
      router.replace('/login');
      return;
    }
    testConnection();
    loadUsers();
  }, [isLoggedIn, userType]);

  const testConnection = async () => {
    try {
      const connectionResult = await authService.testConnection();
      if (!connectionResult.success) {
        setIsDemoMode(true);
        Alert.alert('אבחון בעיות דאטאבייס', connectionResult.message, [{ text: 'הבנתי' }]);
      } else {
        setIsDemoMode(false);
      }
    } catch (error) {
      setIsDemoMode(true);
    }
  };

  const checkDatabaseSetup = async () => {
    try {
      const setupResult = await authService.setupDatabase();
      // הצג רק אם יש בעיה
      if (!setupResult.success) {
        Alert.alert(
          'בעיה בהגדרת הדאטאבייס ⚠️',
          setupResult.message,
          [{ text: 'אישור', style: 'default' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'שגיאה בבדיקת הדאטאבייס',
        `שגיאה: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [{ text: 'אישור', style: 'default' }]
      );
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersData = await userService.getAllUsers();
      setUsers(usersData);
    } catch (error) {
      
      // Check if it's a network error
      const isNetworkError = error instanceof Error && 
        (error.message.includes('Network') || error.message.includes('fetch'));
      
      if (isNetworkError) {
        setIsDemoMode(true);
        
        Alert.alert(
          '🌐 מצב דמו',
          'לא ניתן להתחבר לדאטאבייס. האפליקציה פועלת במצב דמו עם נתונים לדוגמה.\n\nתוכל לנסות שוב מאוחר יותר כשהחיבור יחזור.',
          [{ text: 'הבנתי', style: 'default' }]
        );
      } else {
        setUsers([]); // Clear users list on other errors
        
        // Show detailed error message
        let errorMessage = 'לא ניתן לטעון את רשימת המשתמשים מהדאטאבייס';
        if (error instanceof Error) {
          errorMessage += `\n\nפרטי השגיאה: ${error.message}`;
        }
        
        Alert.alert(
          'שגיאה בחיבור לדאטאבייס', 
          errorMessage,
          [
            { text: 'אישור', style: 'default' },
            { 
              text: 'נסה שוב', 
              style: 'default',
              onPress: () => {
                setIsDemoMode(false);
                loadUsers();
              }
            }
          ]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    try {
      // Validation
      if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
        Alert.alert('שגיאה', 'יש למלא את כל השדות הנדרשים');
        return;
      }

      if (newUser.password !== newUser.confirmPassword) {
        Alert.alert('שגיאה', 'הסיסמאות אינן תואמות');
        return;
      }

      if (newUser.password.length < 6) {
        Alert.alert('שגיאה', 'הסיסמה חייבת להכיל לפחות 6 תווים');
        return;
      }

      setLoading(true);
      
      if (isDemoMode) {
        
        // Create demo user
        const demoUserData: UserWithMetadata = {
          id: `demo-${Date.now()}`,
          name: `${newUser.name} (דמו)`,
          email: newUser.email,
          userType: newUser.user_type,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          events_count: 0,
          last_login: undefined
        };

        // Add to local state
        setUsers(prevUsers => [...prevUsers, demoUserData]);
        
        // Reset form and close modal
        setShowAddModal(false);
        setNewUser({
          name: '',
          email: '',
          password: '',
          confirmPassword: '',
          user_type: 'couple'
        });

        Alert.alert(
          '🎭 נוסף במצב דמו!', 
          `המשתמש "${newUser.name}" נוסף לרשימה המקומית.\n\n⚠️ זה לא נשמר בדאטאבייס האמיתי.`,
          [{ text: 'הבנתי', style: 'default' }]
        );
        return;
      }

      const newUserData = await userService.createUser(
        newUser.email,
        newUser.password,
        newUser.name,
        newUser.user_type
      );

      // Add to local state
      setUsers(prevUsers => [...prevUsers, newUserData]);
      setIsDemoMode(false); // Reset demo mode on successful connection
      
      // Reset form and close modal
      setShowAddModal(false);
      setNewUser({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        user_type: 'couple'
      });

      Alert.alert(
        'הצלחה!', 
        `המשתמש "${newUser.name}" נוסף בהצלחה לדאטאבייס`,
        [{ text: 'מעולה', style: 'default' }]
      );
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להוסיף את המשתמש');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    Alert.alert(
      'מחיקת משתמש',
      `האם אתה בטוח שברצונך למחוק את המשתמש "${userName}"?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              
              await userService.deleteUser(userId);
              
              // Remove from local state
              setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
              
              Alert.alert(
                'הצלחה!', 
                `המשתמש "${userName}" נמחק בהצלחה מהדאטאבייס`,
                [{ text: 'אישור', style: 'default' }]
              );
            } catch (error) {
              
              let errorMessage = 'לא ניתן למחוק את המשתמש מהדאטאבייס';
              if (error instanceof Error) {
                errorMessage += `\n\nפרטי השגיאה: ${error.message}`;
              }
              
              Alert.alert(
                'שגיאה במחיקה', 
                errorMessage,
                [{ text: 'אישור', style: 'default' }]
              );
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('he-IL');
  };

  const getUserTypeText = (userType: string) => {
    return userType === 'admin' ? 'מנהל מערכת' : 'חתן/כלה';
  };

  const getUserTypeIcon = (userType: string) => {
    return userType === 'admin' ? 'shield-checkmark' : 'heart';
  };

  // סינון משתמשים
  const filteredUsers = userFilter === 'all'
    ? users
    : users.filter(u => u.userType === userFilter);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ניהול משתמשים</Text>
        <Text style={styles.subtitle}>סה"כ {filteredUsers.length} משתמשים</Text>
        <View style={styles.databaseInfo}>
          <Ionicons
            name={isDemoMode ? "cloud-offline" : "cloud"}
            size={16}
            color={isDemoMode ? colors.warning : colors.success}
          />
          <Text style={[
            styles.databaseText,
            { color: isDemoMode ? colors.warning : colors.success }
          ]}>
            {isDemoMode ? "מצב דמו - אין חיבור לדאטאבייס" : "מחובר לדאטאבייס Supabase"}
          </Text>
        </View>
      </View>

      {/* שורת סינון */}
      <View style={styles.filterRow}>
        {USER_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterButton, userFilter === f.value && styles.filterButtonActive]}
            onPress={() => setUserFilter(f.value)}
          >
            <Text style={[styles.filterButtonText, userFilter === f.value && styles.filterButtonTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="person-add" size={20} color={colors.white} />
          <Text style={styles.addButtonText}>הוסף משתמש חדש</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.usersList}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Ionicons name="people-outline" size={60} color={colors.gray[400]} />
            <Text style={styles.emptyStateTitle}>אין משתמשים להצגה</Text>
          </View>
        ) : (
          filteredUsers.map(user => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userHeaderRow}>
                <Ionicons
                  name={user.userType === 'admin' ? 'shield-checkmark' : 'heart'}
                  size={28}
                  color={user.userType === 'admin' ? colors.primary : colors.orange}
                  style={styles.userTypeIcon}
                />
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteUser(user.id, user.name)}>
                  <Ionicons name="trash" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              <Text style={styles.userTypeBadge}>{user.userType === 'admin' ? 'מנהל' : 'חתן/כלה'}</Text>
            </View>
          ))
        )}
      </View>

      {/* Add User Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <KeyboardAvoidingView 
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={styles.cancelButton}>ביטול</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>הוספת משתמש חדש</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>שם מלא *</Text>
              <TextInput
                style={styles.input}
                value={newUser.name}
                onChangeText={(text) => setNewUser(prev => ({ ...prev, name: text }))}
                placeholder="הכנס שם מלא"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>כתובת אימייל *</Text>
              <TextInput
                style={styles.input}
                value={newUser.email}
                onChangeText={(text) => setNewUser(prev => ({ ...prev, email: text }))}
                placeholder="הכנס כתובת אימייל"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>סיסמה *</Text>
              <TextInput
                style={styles.input}
                value={newUser.password}
                onChangeText={(text) => setNewUser(prev => ({ ...prev, password: text }))}
                placeholder="הכנס סיסמה (לפחות 6 תווים)"
                secureTextEntry
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>אישור סיסמה *</Text>
              <TextInput
                style={styles.input}
                value={newUser.confirmPassword}
                onChangeText={(text) => setNewUser(prev => ({ ...prev, confirmPassword: text }))}
                placeholder="הכנס סיסמה שוב"
                secureTextEntry
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>סוג משתמש</Text>
              <View style={styles.userTypeSelector}>
                <TouchableOpacity
                  style={[
                    styles.userTypeOption,
                    newUser.user_type === 'couple' && styles.userTypeOptionActive
                  ]}
                  onPress={() => setNewUser(prev => ({ ...prev, user_type: 'couple' }))}
                >
                  <Ionicons name="heart" size={20} color={newUser.user_type === 'couple' ? colors.white : colors.primary} />
                  <Text style={[
                    styles.userTypeOptionText,
                    newUser.user_type === 'couple' && styles.userTypeOptionTextActive
                  ]}>
                    חתן/כלה
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.userTypeOption,
                    newUser.user_type === 'admin' && styles.userTypeOptionActive
                  ]}
                  onPress={() => setNewUser(prev => ({ ...prev, user_type: 'admin' }))}
                >
                  <Ionicons name="shield-checkmark" size={20} color={newUser.user_type === 'admin' ? colors.white : colors.warning} />
                  <Text style={[
                    styles.userTypeOptionText,
                    newUser.user_type === 'admin' && styles.userTypeOptionTextActive
                  ]}>
                    מנהל מערכת
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Button
              title={loading ? "מוסיף..." : "הוסף משתמש"}
              onPress={handleAddUser}
              disabled={loading}
              style={styles.submitButton}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    padding: 24,
    alignItems: 'flex-end', // יישור לימין
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right', // יישור לימין
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right', // יישור לימין
    marginBottom: 8,
  },
  databaseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
    alignSelf: 'flex-end', // יישור לימין
  },
  databaseText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right', // יישור לימין
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    justifyContent: 'flex-end', // יישור לימין
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    flex: 1,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    textAlign: 'right', // יישור לימין
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  testButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  filterRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start', // יישור לימין
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.gray[200],
    marginRight: 6, // יישור לימין
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  usersList: {
    gap: 12,
    alignItems: 'flex-end', // יישור לימין
    paddingHorizontal: 16,
  },
  userCard: {
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
  userHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  userTypeIcon: {
    marginLeft: 8,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
    marginBottom: 2,
  },
  userTypeBadge: {
    fontSize: 13,
    color: colors.primary,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignSelf: 'flex-end',
    marginTop: 4,
    textAlign: 'right',
    fontWeight: '600',
  },
  deleteButton: {
    padding: 4,
    marginRight: 8,
  },
  userFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 12,
    color: colors.textLight,
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
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  cancelButton: {
    fontSize: 16,
    color: colors.primary,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.white,
    textAlign: 'right',
  },
  userTypeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  userTypeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gray[300],
    backgroundColor: colors.white,
    gap: 8,
  },
  userTypeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  userTypeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  userTypeOptionTextActive: {
    color: colors.white,
  },
  submitButton: {
    marginTop: 20,
    marginBottom: 40,
  },
  emptyStateCard: {
    width: '100%',
    backgroundColor: colors.gray[100],
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 32,
  },
}); 