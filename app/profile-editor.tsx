import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { avatarService } from '@/lib/services/avatarService';
import BackSwipe from '@/components/BackSwipe';

export default function ProfileEditor() {
  const router = useRouter();
  const { userData, updateUserData } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
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

  const guessImageExt = (asset: any): string => {
    const fileName = String(asset?.fileName ?? '');
    const uri = String(asset?.uri ?? '');
    const mimeType = String(asset?.mimeType ?? '');

    const fromMime = mimeType.split('/')[1]?.toLowerCase();
    if (fromMime && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fromMime)) {
      return fromMime === 'jpeg' ? 'jpg' : fromMime;
    }

    const candidate = (fileName || uri).split('?')[0];
    const dot = candidate.lastIndexOf('.');
    if (dot !== -1 && dot < candidate.length - 1) {
      const ext = candidate.slice(dot + 1).toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }

    return 'jpg';
  };

  const base64ToUint8Array = (base64: string) => {
    const cleaned = String(base64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
    const byteLength = (cleaned.length * 3) / 4 - padding;
    const bytes = new Uint8Array(byteLength);

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let byteIndex = 0;

    for (let i = 0; i < cleaned.length; i += 4) {
      const c1 = chars.indexOf(cleaned[i]);
      const c2 = chars.indexOf(cleaned[i + 1]);
      const c3 = chars.indexOf(cleaned[i + 2]);
      const c4 = chars.indexOf(cleaned[i + 3]);

      const triple = (c1 << 18) | (c2 << 12) | ((c3 & 63) << 6) | (c4 & 63);
      if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 16) & 0xff;
      if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 8) & 0xff;
      if (byteIndex < byteLength) bytes[byteIndex++] = triple & 0xff;
    }

    return bytes;
  };

  const guessContentType = (ext: string, fallback?: string | null) => {
    if (fallback) return fallback;
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'heic':
      case 'heif':
        return 'image/heic';
      case 'jpg':
      default:
        return 'image/jpeg';
    }
  };

  const pickAndUploadAvatar = async () => {
    if (!userData?.id) return;

    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('הרשאה נדרשת', 'כדי לבחור תמונה יש לאשר גישה לגלריה');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0] as any;

      setAvatarUploading(true);
      const url = await avatarService.uploadUserAvatar(userData.id, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
        base64: asset.base64,
      });

      // Update local store immediately without triggering extra profile-table updates.
      useUserStore.setState((state) => ({
        userData: state.userData ? { ...state.userData, avatar_url: url } : state.userData,
      }));

      Alert.alert('נשמר', 'תמונת הפרופיל עודכנה');
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לעדכן תמונת פרופיל.\n\n${message}`);
    } finally {
      setAvatarUploading(false);
    }
  };

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
        const nextName = formData.name.trim();
        const nextEmail = formData.email.trim();
        const nameChanged = nextName !== (userData.name || '');
        const emailChanged = nextEmail !== (userData.email || '');

        // Only sync local store (and profile table) when name/email changed.
        // Password change should NOT trigger a profile-table update.
        if (nameChanged || emailChanged) {
          await updateUserData({
            name: nextName,
            email: nextEmail,
          });
        }
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
    <>
      {/* Hide Expo Router's default Stack header (prevents duplicate header on web) */}
      <Stack.Screen options={{ headerShown: false }} />

      <BackSwipe>
        <KeyboardAvoidingView 
          style={styles.container} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={colors.primary} />
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
        {/* Avatar Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>תמונת פרופיל</Text>

          <View style={styles.avatarRow}>
            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={pickAndUploadAvatar}
              disabled={avatarUploading}
              accessibilityRole="button"
              accessibilityLabel="בחירת תמונת פרופיל"
            >
              {userData?.avatar_url ? (
                <Image
                  source={{ uri: userData.avatar_url }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  cachePolicy="none"
                  recyclingKey={userData.avatar_url}
                  transition={120}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={34} color={colors.primary} />
                </View>
              )}
              <View style={styles.avatarBadge}>
                {avatarUploading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="camera" size={16} color={colors.white} />
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.avatarMeta}>
              <Text style={styles.avatarHint} numberOfLines={2}>
                לחץ על התמונה כדי לבחור תמונה מהגלריה
              </Text>
              <TouchableOpacity
                style={[styles.avatarActionBtn, avatarUploading && styles.avatarActionBtnDisabled]}
                onPress={pickAndUploadAvatar}
                disabled={avatarUploading}
              >
                <Text style={styles.avatarActionText}>{avatarUploading ? 'מעלה...' : 'בחר תמונה'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

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
              placeholderTextColor={colors.gray[500]}
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
              placeholderTextColor={colors.gray[500]}
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
              placeholderTextColor={colors.gray[500]}
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
              placeholderTextColor={colors.gray[500]}
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
              placeholderTextColor={colors.gray[500]}
              secureTextEntry
              textAlign="right"
            />
          </View>
        </View>


      </ScrollView>
        </KeyboardAvoidingView>
      </BackSwipe>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: colors.white,
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 60,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    position: 'absolute',
    right: 20,
    top: 64,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: colors.gray[400],
  },
  saveButtonText: {
    color: colors.white,
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
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 20,
    textAlign: 'right',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.gray[50],
    writingDirection: 'rtl',
  },
  avatarRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    paddingTop: 6,
  },
  avatarBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: 'hidden',
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    position: 'relative',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  avatarMeta: {
    flex: 1,
    alignItems: 'flex-end',
  },
  avatarHint: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
    marginBottom: 10,
    lineHeight: 18,
  },
  avatarActionBtn: {
    backgroundColor: colors.gray[100],
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  avatarActionBtnDisabled: {
    opacity: 0.65,
  },
  avatarActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
}); 