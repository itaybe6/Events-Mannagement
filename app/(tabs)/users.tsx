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
  Platform
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

export default function UsersScreen() {
  const { isLoggedIn, userType } = useUserStore();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // Form state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    user_type: 'couple' as 'couple' | 'admin'
  });

  useEffect(() => {
    console.log('👤 Users screen loading...');
    console.log('👤 User logged in:', isLoggedIn);
    console.log('👤 User type:', userType);
    
    if (!isLoggedIn || userType !== 'admin') {
      console.log('👤 Redirecting to login - not admin or not logged in');
      router.replace('/login');
      return;
    }
    console.log('👤 Admin user confirmed, loading data...');
    // Run direct fetch test
    basicPingTest();
    // Test connection first, then load users
    testConnection();
    loadUsers();
  }, [isLoggedIn, userType]);

  const testConnection = async () => {
    try {
      console.log('🧪 Testing Supabase connection from Users screen...');
      const connectionResult = await authService.testConnection();
      console.log('🧪 Connection test result:', connectionResult);
      
      if (!connectionResult.success) {
        const isNetworkError = connectionResult.message.includes('Network') || connectionResult.message.includes('network');
        const isTableError = connectionResult.message.includes('does not exist') || connectionResult.message.includes('PGRST116');
        
        let helpMessage = '';
        if (isNetworkError) {
          helpMessage = '\n\n🔧 פתרונות אפשריים:\n• בדוק חיבור לאינטרנט\n• ודא ש-URL של Supabase נכון\n• בדוק שהמפתחות נכונים\n• נסה להפעיל מחדש את האפליקציה';
        } else if (isTableError) {
          helpMessage = '\n\n🔧 פתרון:\n• היכנס ל-Supabase Dashboard\n• לך ל-SQL Editor\n• הרץ את הקוד מהקובץ supabase/schema.sql';
        } else {
          helpMessage = '\n\n🔧 פתרונות אפשריים:\n• בדוק הגדרות RLS ב-Supabase\n• ודא שה-Service Role Key נכון\n• בדוק הרשאות הטבלה';
        }
        
        Alert.alert(
          'אבחון בעיות דאטאבייס',
          `${connectionResult.message}${helpMessage}`,
          [
            { text: 'אישור', style: 'default' },
            { 
              text: 'בדוק הגדרות DB', 
              style: 'default',
              onPress: () => checkDatabaseSetup()
            }
          ]
        );
        return;
      }
      
      // If connection is good, check database setup
      await checkDatabaseSetup();
      
    } catch (error) {
      console.error('❌ Connection test error:', error);
      Alert.alert(
        'שגיאה',
        `שגיאה בבדיקת החיבור: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [{ text: 'אישור', style: 'default' }]
      );
    }
  };

  const checkDatabaseSetup = async () => {
    try {
      console.log('🔧 Checking database setup...');
      const setupResult = await authService.setupDatabase();
      console.log('🔧 Database setup result:', setupResult);
      
      Alert.alert(
        setupResult.success ? 'הדאטאבייס תקין ✅' : 'בעיה בהגדרת הדאטאבייס ⚠️',
        setupResult.message,
        [{ text: 'אישור', style: 'default' }]
      );
      
    } catch (error) {
      console.error('❌ Database setup check error:', error);
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
      console.log('👥 Loading users from Supabase via userService...');
      const usersData = await userService.getAllUsers();
      console.log('👥 Loaded users successfully:', usersData);
      setUsers(usersData);
    } catch (error) {
      console.error('❌ Error loading users from Supabase:', error);
      
      // Check if it's a network error
      const isNetworkError = error instanceof Error && 
        (error.message.includes('Network') || error.message.includes('fetch'));
      
      if (isNetworkError) {
        console.log('🔄 Network error detected, switching to demo mode...');
        // Load demo data
        const demoUsers: UserWithMetadata[] = [
          {
            id: 'demo-admin',
            name: 'מנהל מערכת (דמו)',
            email: 'admin@demo.com',
            userType: 'admin',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-15T00:00:00Z',
            events_count: 0,
            last_login: '2025-01-15T00:00:00Z'
          },
          {
            id: 'demo-couple-1',
            name: 'דני ורותי (דמו)',
            email: 'couple1@demo.com',
            userType: 'couple',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-15T00:00:00Z',
            events_count: 1,
            last_login: '2025-01-15T00:00:00Z'
          },
          {
            id: 'demo-couple-2',
            name: 'משה ושרה (דמו)',
            email: 'couple2@demo.com',
            userType: 'couple',
            created_at: '2025-01-05T00:00:00Z',
            updated_at: '2025-01-10T00:00:00Z',
            events_count: 0,
            last_login: '2025-01-10T00:00:00Z'
          }
        ];
        setUsers(demoUsers);
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
        console.log('🎭 Demo mode - simulating user creation...');
        
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

      console.log('➕ Creating user in Supabase:', {
        name: newUser.name,
        email: newUser.email,
        user_type: newUser.user_type
      });

      const newUserData = await userService.createUser(
        newUser.email,
        newUser.password,
        newUser.name,
        newUser.user_type
      );

      console.log('✅ User created successfully:', newUserData);

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
      console.error('❌ Error creating user:', error);
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
              console.log('🗑️ Deleting user from Supabase:', userId);
              
              await userService.deleteUser(userId);
              console.log('✅ User deleted successfully');
              
              // Remove from local state
              setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
              
              Alert.alert(
                'הצלחה!', 
                `המשתמש "${userName}" נמחק בהצלחה מהדאטאבייס`,
                [{ text: 'אישור', style: 'default' }]
              );
            } catch (error) {
              console.error('❌ Error deleting user from Supabase:', error);
              
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

  const renderUserCard = (user: UserWithMetadata) => (
    <Card key={user.id} style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <View style={styles.userTitle}>
            <Text style={styles.userName}>{user.name}</Text>
            <View style={[
              styles.userTypeBadge,
              { backgroundColor: user.userType === 'admin' ? colors.warning : colors.primary }
            ]}>
              <Ionicons 
                name={getUserTypeIcon(user.userType)} 
                size={12} 
                color={colors.white} 
              />
              <Text style={styles.userTypeText}>
                {getUserTypeText(user.userType)}
              </Text>
            </View>
          </View>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => handleDeleteUser(user.id, user.name)}
        >
          <Ionicons name="trash" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.userFooter}>
        <Text style={styles.dateText}>
          נוצר: {formatDate(user.created_at)}
        </Text>
        <Text style={styles.dateText}>
          עודכן: {formatDate(user.updated_at)}
        </Text>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.header}>
          <Text style={styles.title}>ניהול משתמשים</Text>
          <Text style={styles.subtitle}>
            סה"כ {users.length} משתמשים במערכת
          </Text>
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

        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="person-add" size={20} color={colors.white} />
            <Text style={styles.addButtonText}>הוסף משתמש חדש</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.testButton} onPress={testConnection}>
            <Ionicons name="medical" size={18} color={colors.primary} />
            <Text style={styles.testButtonText}>אבחן בעיות</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.usersList}>
          {users.length > 0 ? (
            users.map(renderUserCard)
          ) : (
            <Card style={styles.emptyState}>
              <Ionicons name="people-outline" size={60} color={colors.gray[400]} />
              <Text style={styles.emptyStateTitle}>אין משתמשים במערכת</Text>
              <Text style={styles.emptyStateText}>
                התחל בהוספת משתמש ראשון למערכת
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
  },
  databaseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  databaseText: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
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
  usersList: {
    gap: 12,
  },
  userCard: {
    padding: 16,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  userTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  userTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  userTypeText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 14,
    color: colors.textLight,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
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
}); 