import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';

export default function ProfileEditor() {
  const router = useRouter();
  const { userData, updateUserData } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (userData) {
      setFormData(prev => ({
        ...prev,
        name: userData.name || '',
        email: userData.email || '',
      }));
    }
  }, [userData]);

  const validateForm = () => {
    if (!formData.name.trim()) {
      Alert.alert('שגיאה', 'נא להזין שם');
      return false;
    }

    if (!formData.email.trim()) {
      Alert.alert('שגיאה', 'נא להזין כתובת אימייל');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      Alert.alert('שגיאה', 'כתובת אימייל לא תקינה');
      return false;
    }

    // If user wants to change password
    if (formData.newPassword || formData.confirmPassword) {
      if (!formData.currentPassword) {
        Alert.alert('שגיאה', 'נא להזין את הסיסמא הנוכחית');
        return false;
      }

      if (formData.newPassword.length < 6) {
        Alert.alert('שגיאה', 'הסיסמא החדשה חייבת להכיל לפחות 6 תווים');
        return false;
      }

      if (formData.newPassword !== formData.confirmPassword) {
        Alert.alert('שגיאה', 'הסיסמאות אינן תואמות');
        return false;
      }
    }

    return true;
  };

  const saveChanges = async () => {
    if (!validateForm()) return;

    setLoading(true);

    try {
      // Update user profile (name)
      if (formData.name !== userData?.name) {
        const { error: profileError } = await supabase
          .from('users')
          .update({ name: formData.name.trim() })
          .eq('id', userData?.id);

        if (profileError) {
          throw profileError;
        }
      }

      // Update email if changed
      if (formData.email !== userData?.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: formData.email.trim()
        });

        if (emailError) {
          throw emailError;
        }
      }

      // Update password if provided
      if (formData.newPassword) {
        // First verify current password by trying to sign in with it
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: userData?.email || '',
          password: formData.currentPassword
        });

        if (verifyError) {
          Alert.alert('שגיאה', 'הסיסמא הנוכחית שגויה');
          setLoading(false);
          return;
        }

        // Update password
        const { error: passwordError } = await supabase.auth.updateUser({
          password: formData.newPassword
        });

        if (passwordError) {
          throw passwordError;
        }
      }

      // Update local user data
      if (userData) {
        updateUserData({
          ...userData,
          name: formData.name.trim(),
          email: formData.email.trim(),
        });
      }

      Alert.alert('✅ עודכן בהצלחה', 'הפרטים האישיים עודכנו', [
        { text: 'חזור להגדרות', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      console.error('Error updating profile:', error);
      let errorMessage = 'לא ניתן לעדכן את הפרטים';
      
      if (error.message?.includes('email')) {
        errorMessage = 'שגיאה בעדכון כתובת האימייל';
      } else if (error.message?.includes('password')) {
        errorMessage = 'שגיאה בעדכון הסיסמא';
      }
      
      Alert.alert('שגיאה', errorMessage);
    } finally {
      setLoading(false);
    }
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
        <Text style={styles.title}>עריכת פרטים אישיים</Text>
        <TouchableOpacity 
          style={[styles.saveButton, loading && styles.saveButtonDisabled]} 
          onPress={saveChanges}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'שומר...' : 'שמור'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Basic Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרטים בסיסיים</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>שם מלא</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
              placeholder="הזן שם מלא"
              placeholderTextColor="#9CA3AF"
              textAlign="right"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>כתובת אימייל</Text>
            <TextInput
              style={styles.input}
              value={formData.email}
              onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
              placeholder="הזן כתובת אימייל"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              textAlign="right"
            />
          </View>
        </View>

        {/* Password Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>שינוי סיסמא</Text>
          <Text style={styles.sectionSubtitle}>השאר ריק אם אינך רוצה לשנות את הסיסמא</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>סיסמא נוכחית</Text>
            <TextInput
              style={styles.input}
              value={formData.currentPassword}
              onChangeText={(text) => setFormData(prev => ({ ...prev, currentPassword: text }))}
              placeholder="הזן סיסמא נוכחית"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              textAlign="right"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>סיסמא חדשה</Text>
            <TextInput
              style={styles.input}
              value={formData.newPassword}
              onChangeText={(text) => setFormData(prev => ({ ...prev, newPassword: text }))}
              placeholder="הזן סיסמא חדשה (לפחות 6 תווים)"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              textAlign="right"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>אישור סיסמא חדשה</Text>
            <TextInput
              style={styles.input}
              value={formData.confirmPassword}
              onChangeText={(text) => setFormData(prev => ({ ...prev, confirmPassword: text }))}
              placeholder="הזן שוב את הסיסמא החדשה"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              textAlign="right"
            />
          </View>
        </View>


      </ScrollView>
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
    paddingTop: 60,
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
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'right',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'right',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    writingDirection: 'rtl',
  },
}); 