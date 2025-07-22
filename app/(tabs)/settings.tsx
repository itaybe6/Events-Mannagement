import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Ionicons } from '@expo/vector-icons';
import { userService } from '@/lib/services/userService';

export default function SettingsScreen() {
  const { userType, userData, logout, isLoggedIn } = useUserStore();
  const router = useRouter();
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: ''
  });

  console.log('🔍 Settings Screen - Debug Info:', {
    isLoggedIn,
    userType,
    userData,
  });

  useEffect(() => {
    if (!isLoggedIn) {
      console.log('❌ Not logged in - redirecting to login');
      router.replace('/login');
    }
  }, [isLoggedIn, router]);

  const handleLogout = async () => {
    console.log('🚪 Logout button pressed');
    Alert.alert(
      'התנתקות',
      'האם אתה בטוח שברצונך להתנתק?',
      [
        {
          text: 'ביטול',
          style: 'cancel',
          onPress: () => console.log('❌ Logout cancelled'),
        },
        {
          text: 'התנתק',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('✅ Logging out...');
              await logout();
              console.log('✅ Logout successful - redirecting to login');
              router.replace('/login');
            } catch (error) {
              console.error('❌ Logout error:', error);
              // גם אם יש שגיאה, נעביר להתחברות
              router.replace('/login');
            }
          },
        },
      ]
    );
  };

  const handleAccountPress = () => {
    setEditForm({
      name: userData?.name || '',
      email: userData?.email || '',
      phone: userData?.phone || ''
    });
    setAccountModalVisible(true);
  };

  const handleSaveAccount = async () => {
    try {
      if (!userData?.id) return;
      
      await userService.updateUser(userData.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone
      });
      
      Alert.alert('הצלחה', 'פרטי החשבון עודכנו בהצלחה');
      setIsEditing(false);
      setAccountModalVisible(false);
    } catch (error) {
      console.error('Error updating account:', error);
      Alert.alert('שגיאה', 'לא ניתן היה לעדכן את פרטי החשבון');
    }
  };

  const handleCancelEdit = () => {
    setEditForm({
      name: userData?.name || '',
      email: userData?.email || '',
      phone: userData?.phone || ''
    });
    setIsEditing(false);
  };

  // אל תחזיר מוקדם - תן למשתמש לראות את ההגדרות גם בלי אירוע

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <>
      <Modal
        visible={accountModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setAccountModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>פרטי חשבון</Text>
              <TouchableOpacity 
                onPress={() => setAccountModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={colors.gray[600]} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>שם מלא</Text>
                <TextInput
                  style={[styles.formInput, !isEditing && styles.disabledInput]}
                  value={editForm.name}
                  onChangeText={(text) => setEditForm({...editForm, name: text})}
                  editable={isEditing}
                  placeholder="הכנס את שמך המלא"
                  textAlign="right"
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>אימייל</Text>
                <TextInput
                  style={[styles.formInput, !isEditing && styles.disabledInput]}
                  value={editForm.email}
                  onChangeText={(text) => setEditForm({...editForm, email: text})}
                  editable={isEditing}
                  placeholder="הכנס את האימייל שלך"
                  keyboardType="email-address"
                  textAlign="right"
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>טלפון</Text>
                <TextInput
                  style={[styles.formInput, !isEditing && styles.disabledInput]}
                  value={editForm.phone}
                  onChangeText={(text) => setEditForm({...editForm, phone: text})}
                  editable={isEditing}
                  placeholder="הכנס את מספר הטלפון שלך"
                  keyboardType="phone-pad"
                  textAlign="right"
                />
              </View>
            </ScrollView>
            
            <View style={styles.modalFooter}>
              {!isEditing ? (
                <TouchableOpacity 
                  style={styles.editButton}
                  onPress={() => setIsEditing(true)}
                >
                  <Ionicons name="create" size={20} color={colors.white} />
                  <Text style={styles.editButtonText}>ערוך פרטים</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.editActions}>
                  <TouchableOpacity 
                    style={styles.cancelButton}
                    onPress={handleCancelEdit}
                  >
                    <Text style={styles.cancelButtonText}>ביטול</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.saveButton}
                    onPress={handleSaveAccount}
                  >
                    <Text style={styles.saveButtonText}>שמור</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* הצג את התפריט רק אם המשתמש אינו מנהל */}
      {userType !== 'admin' && (
        <Card style={styles.menuCard}>
          <TouchableOpacity style={styles.menuItem} onPress={handleAccountPress}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>פרטי חשבון</Text>
              <View style={[styles.menuItemIcon, { backgroundColor: `${colors.gray[500]}20` }]}>
                  <Ionicons name="person" size={20} color={colors.gray[500]} />
                </View>
              </View>
              <Ionicons name="chevron-back" size={20} color={colors.gray[400]} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>ניהול שליחת הודעות</Text>
              <View style={[styles.menuItemIcon, { backgroundColor: `${colors.primary}20` }]}>
                  <Ionicons name="chatbubbles" size={20} color={colors.primary} />
                </View>
              </View>
              <Ionicons name="chevron-back" size={20} color={colors.gray[400]} />
          </TouchableOpacity>
        </Card>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>גרסה 1.0.0</Text>
        <Text style={styles.footerText}>© 2025 MOON</Text>
        <Text style={styles.footerText}>מחובר כ: {userType === 'couple' ? 'חתן/כלה' : 'מנהל מערכת'}</Text>
      </View>
      
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out" size={20} color={colors.error} />
        <Text style={styles.logoutText}>התנתק</Text>
      </TouchableOpacity>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  contentContainer: {
    padding: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginTop: 20,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  profileDetails: {
    alignItems: 'center',
    marginBottom: 16,
  },
  profileDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  profileDetailText: {
    fontSize: 14,
    color: colors.textLight,
    marginRight: 6,
  },
  editProfileButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  editProfileText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  noEventIcon: {
    marginBottom: 16,
    alignItems: 'center',
  },
  noEventText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
    textAlign: 'right',
  },
  menuCard: {
    padding: 0,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.text,
    marginRight: 8,
  },
  comingSoonBadge: {
    position: 'absolute',
    right: 40,
    backgroundColor: colors.info,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  comingSoonText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  footerText: {
    fontSize: 12,
    color: colors.gray[500],
    marginVertical: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 16,
    borderWidth: 2,
    borderColor: colors.error,
  },
  logoutText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 10,
    width: '90%',
    maxWidth: 400,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 5,
  },
  modalBody: {
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 15,
  },
  formLabel: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 5,
    textAlign: 'right',
  },
  formInput: {
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.gray[50],
  },
  disabledInput: {
    backgroundColor: colors.gray[100],
    color: colors.gray[400],
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '45%',
  },
  editButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  cancelButton: {
    backgroundColor: colors.gray[200],
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '45%',
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '45%',
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
});