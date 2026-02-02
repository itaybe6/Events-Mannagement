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
// import { basicPingTest } from '@/lib/basicPingTest'; // הוסר זמנית

const USER_FILTERS = [
  { label: 'הכל', value: 'all' },
  { label: 'מנהלים', value: 'admin' },
  { label: 'חתן/כלה', value: 'couple' },
  { label: 'עובד', value: 'employee' }, // Added employee type
];

export default function UsersScreen() {
  const { isLoggedIn, userType } = useUserStore();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [userFilter, setUserFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Form state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    user_type: 'couple' as 'couple' | 'admin' | 'employee' // Added employee type
  });

  const [selectedUser, setSelectedUser] = useState<UserWithMetadata | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

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

  const handleDeleteUser = (userId: string) => {
    Alert.alert(
      'מחיקת משתמש',
      `האם אתה בטוח שברצונך למחוק את המשתמש?`,
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
                `המשתמשנוסף נמחק בהצלחה מהדאטאבייס`,
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
  const filteredUsers = users
    .filter(user => {
      // סינון לפי חיפוש
      const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      // סינון לפי סוג משתמש
      const matchesFilter = userFilter === 'all' || user.userType === userFilter;
      
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.name.localeCompare(b.name);
      } else {
        return b.name.localeCompare(a.name);
      }
    });

  const resetFilters = () => {
    setSearchQuery('');
    setUserFilter('all');
    setSortOrder('asc');
  };

  const openEditModal = (user: UserWithMetadata) => {
    setSelectedUser(user);
    setNewUser({
      name: user.name,
      email: user.email,
      password: '', // Clear password for edit
      confirmPassword: '',
      user_type: user.userType
    });
    setShowAddModal(true);
  };

  return (
    <ScrollView style={styles.container}>
      {/* 1. Header */}
      <View style={styles.header}>
        <Ionicons name="people" size={28} color={colors.primary} style={{ marginLeft: 10 }} />
        <Text style={styles.headerTitle}>ניהול משתמשים</Text>
      </View>
      {/* 2. Filter/Search Panel */}
      <View style={styles.filterPanel}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textLight} style={{ marginLeft: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="חפש לפי שם או אימייל"
            value={searchQuery}
            onChangeText={setSearchQuery}
            textAlign="right"
            placeholderTextColor={colors.gray[400]}
          />
        </View>
        <View style={styles.filterRow}>
          <Text style={styles.typeDropdownLabel}>סוג:</Text>
          {['all', 'admin', 'couple', 'employee'].map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.typeOption, userFilter === type && styles.typeOptionActive]}
              onPress={() => setUserFilter(type)}
            >
              <Text style={[styles.typeOptionText, userFilter === type && styles.typeOptionTextActive]}>
                {type === 'all' ? 'הכל' : type === 'admin' ? 'מנהל' : type === 'couple' ? 'זוג' : 'עובד'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="person-add" size={20} color={colors.white} />
          <Text style={styles.addButtonText}>הוסף משתמש חדש</Text>
        </TouchableOpacity>
      </View>

      {/* 3. Users List */}
      <ScrollView contentContainerStyle={styles.usersList} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Ionicons name="people-outline" size={48} color={colors.gray[400]} />
            <Text style={styles.emptyStateText}>לא נמצאו משתמשים</Text>
          </View>
        ) : filteredUsers.map(user => {
          const createdAt = user.created_at ? new Date(user.created_at) : null;
          const day = createdAt ? createdAt.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '-';
          const weekday = createdAt ? createdAt.toLocaleDateString('he-IL', { weekday: 'long' }) : '';
          return (
            <TouchableOpacity
              key={user.id}
              style={styles.userCardApple}
              activeOpacity={0.85}
              onPress={() => { setSelectedUser(user); setShowUserModal(true); }}
            >
              <View style={styles.userDateBoxApple}>
                <Text style={styles.userDateDayApple}>{day}</Text>
                <Text style={styles.userDateWeekApple}>{weekday}</Text>
              </View>
              <View style={styles.userInfoApple}>
                <Text style={styles.userNameApple}>{user.name}</Text>
                <View style={styles.userInfoRowApple}>
                  <Ionicons name="mail" size={16} color={colors.primary} style={{ marginLeft: 4 }} />
                  <Text style={styles.userEmailApple}>{user.email}</Text>
                </View>
                <View style={styles.userInfoRowApple}>
                  <View style={styles.userTypeTagApple}>
                    <Ionicons 
                      name={user.userType === 'admin' ? 'shield-checkmark' : user.userType === 'employee' ? 'briefcase' : 'heart'} 
                      size={14} 
                      color={colors.white} 
                      style={{ marginLeft: 2 }} 
                    />
                    <Text style={styles.userTypeTextApple}>
                      {user.userType === 'admin' ? 'מנהל' : user.userType === 'employee' ? 'עובד' : 'זוג'}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-back" size={22} color={colors.gray[400]} style={styles.chevronApple} />
            </TouchableOpacity>
          );
        })}
        {/* User Details Modal */}
        <Modal visible={showUserModal} transparent animationType="fade" onRequestClose={() => setShowUserModal(false)}>
          <View style={styles.modalOverlayApple}>
            <View style={styles.modalApple}>
              {selectedUser && (
                <>
                  <TouchableOpacity style={styles.closeButtonApple} onPress={() => setShowUserModal(false)}>
                    <Ionicons name="close" size={24} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.modalTitleApple}>{selectedUser.name}</Text>
                  <View style={styles.modalDetailRowApple}>
                    <Ionicons name="mail" size={18} color={colors.primary} style={{ marginLeft: 6 }} />
                    <Text style={styles.modalValueApple}>{selectedUser.email}</Text>
                  </View>
                  <View style={styles.modalDetailRowApple}>
                    <Ionicons 
                      name={selectedUser.userType === 'admin' ? 'shield-checkmark' : selectedUser.userType === 'employee' ? 'briefcase' : 'heart'} 
                      size={18} 
                      color={colors.primary} 
                      style={{ marginLeft: 6 }} 
                    />
                    <Text style={styles.modalValueApple}>
                      {selectedUser.userType === 'admin' ? 'מנהל' : selectedUser.userType === 'employee' ? 'עובד' : 'זוג'}
                    </Text>
                  </View>
                  <View style={styles.modalDetailRowApple}>
                    <Ionicons name="calendar" size={18} color={colors.primary} style={{ marginLeft: 6 }} />
                    <Text style={styles.modalValueApple}>{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString('he-IL') : '-'}</Text>
                  </View>
                  {typeof selectedUser.events_count === 'number' && (
                    <View style={styles.modalDetailRowApple}>
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} style={{ marginLeft: 6 }} />
                      <Text style={styles.modalValueApple}>מס' אירועים: {selectedUser.events_count}</Text>
                    </View>
                  )}
                  {selectedUser.last_login && (
                    <View style={styles.modalDetailRowApple}>
                      <Ionicons name="log-in" size={18} color={colors.primary} style={{ marginLeft: 6 }} />
                      <Text style={styles.modalValueApple}>כניסה אחרונה: {new Date(selectedUser.last_login).toLocaleDateString('he-IL')}</Text>
                    </View>
                  )}
                  <View style={styles.modalActionsApple}>
                    <TouchableOpacity style={styles.editButtonApple} onPress={() => { setShowUserModal(false); openEditModal(selectedUser); }}>
                      <Ionicons name="create" size={22} color={colors.white} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteButtonApple} onPress={() => { setShowUserModal(false); handleDeleteUser(selectedUser.id); }}>
                      <Ionicons name="trash" size={22} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
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

                <TouchableOpacity
                  style={[
                    styles.userTypeOption,
                    newUser.user_type === 'employee' && styles.userTypeOptionActive
                  ]}
                  onPress={() => setNewUser(prev => ({ ...prev, user_type: 'employee' }))}
                >
                  <Ionicons name="briefcase" size={20} color={newUser.user_type === 'employee' ? colors.white : colors.secondary} />
                  <Text style={[
                    styles.userTypeOptionText,
                    newUser.user_type === 'employee' && styles.userTypeOptionTextActive
                  ]}>
                    עובד
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginLeft: 10,
  },
  filterPanel: {
    flexDirection: 'column', // Changed to column for better spacing
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10, // Added margin bottom for spacing
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
    paddingHorizontal: 8,
  },
  typeDropdown: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeDropdownLabel: {
    fontSize: 14,
    color: colors.textLight,
    marginRight: 8,
  },
  typeOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginHorizontal: 4,
  },
  typeOptionActive: {
    backgroundColor: colors.primary,
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  typeOptionTextActive: {
    color: colors.white,
  },
  sortDropdown: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortDropdownLabel: {
    fontSize: 14,
    color: colors.textLight,
    marginRight: 8,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginHorizontal: 4,
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 6,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginLeft: 8,
    backgroundColor: colors.gray[100],
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
    marginLeft: 6,
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
  userInfoBox: {
    marginBottom: 12,
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
  userType: {
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
  userCreatedAt: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'right',
    marginTop: 4,
  },
  userActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  actionButton: {
    padding: 8,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalApple: {
    width: '90%',
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
  },
  closeButtonApple: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  modalTitleApple: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 18,
    textAlign: 'center',
  },
  modalDetailRowApple: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalValueApple: {
    fontWeight: '600',
    color: colors.primary,
    fontSize: 16,
    marginLeft: 4,
  },
  modalActionsApple: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    marginTop: 24,
    gap: 24,
    width: '100%',
  },
  editButtonApple: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  deleteButtonApple: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  // --- Apple Modern Card ---
  userCardApple: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginBottom: 18,
    width: '100%',
    maxWidth: 500,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    position: 'relative',
  },
  userDateBoxApple: {
    backgroundColor: colors.gray[100],
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginLeft: 16,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minWidth: 70,
  },
  userDateDayApple: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 26,
  },
  userDateWeekApple: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: -2,
  },
  userInfoApple: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  userNameApple: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 2,
    textAlign: 'right',
  },
  userInfoRowApple: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 2,
  },
  userEmailApple: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'right',
  },
  userTypeTagApple: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  userTypeTextApple: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
    marginLeft: 4,
  },
  chevronApple: {
    marginLeft: 8,
  },
  modalOverlayApple: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
}); 