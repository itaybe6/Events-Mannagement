import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { Button } from '@/components/Button';
import { useUserStore } from '@/store/userStore';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { userService, UserWithMetadata } from '@/lib/services/userService';
import { authService } from '@/lib/services/authService';
import * as ImagePicker from 'expo-image-picker';
import { avatarService } from '@/lib/services/avatarService';

export default function AddUserScreen() {
  const router = useRouter();
  const { isLoggedIn, userType } = useUserStore();
  const addDemoUser = useDemoUsersStore((state) => state.addUser);

  const [loading, setLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    user_type: 'event_owner' as 'event_owner' | 'admin' | 'employee',
  });

  useEffect(() => {
    if (!isLoggedIn || userType !== 'admin') {
      router.replace('/login');
      return;
    }
    checkConnection();
  }, [isLoggedIn, userType]);

  const checkConnection = async () => {
    try {
      const connectionResult = await authService.testConnection();
      setIsDemoMode(!connectionResult.success);
      if (!connectionResult.success) {
        Alert.alert('אבחון בעיות דאטאבייס', connectionResult.message, [{ text: 'הבנתי' }]);
      }
    } catch (error) {
      setIsDemoMode(true);
    }
  };

  const handleAddUser = async () => {
    try {
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
        const demoUserData: UserWithMetadata = {
          id: `demo-${Date.now()}`,
          name: `${newUser.name} (דמו)`,
          email: newUser.email,
          phone: newUser.phone || undefined,
          avatar_url: avatar?.uri,
          userType: newUser.user_type,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          events_count: 0,
          last_login: undefined,
        };

        addDemoUser(demoUserData);
        setCreatedUserId(demoUserData.id);

        const message = `המשתמש "${newUser.name}" נוסף לרשימה המקומית.\n\n⚠️ זה לא נשמר בדאטאבייס האמיתי.`;

        // מציגים חלון "המשך להוספת אירוע" רק לבעל אירוע
        if (newUser.user_type === 'event_owner') {
          setSuccessMessage(message);
          setShowSuccessModal(true);
        } else {
          Alert.alert('המשתמש נוסף בהצלחה', message, [
            {
              text: 'אישור',
              onPress: () => router.back(),
            },
          ]);
        }
        return;
      }

      const createdUser = await userService.createUser(
        newUser.email,
        newUser.password,
        newUser.name,
        newUser.user_type,
        newUser.phone || undefined
      );
      setCreatedUserId(createdUser.id);

      let message = `המשתמש "${newUser.name}" נוסף בהצלחה לדאטאבייס`;

      if (avatar) {
        try {
          await avatarService.uploadUserAvatar(createdUser.id, {
            uri: avatar.uri,
            fileName: avatar.fileName,
            mimeType: avatar.mimeType,
            file: (avatar as any)?.file,
            base64: avatar.base64,
          });
          message += `\n✅ התמונה הועלתה בהצלחה`;
        } catch (uploadError) {
          console.error('Avatar upload error:', uploadError);
          message += `\n⚠️ המשתמש נוסף, אך העלאת התמונה נכשלה`;
        }
      }

      setSuccessMessage(message);

      // מציגים חלון "המשך להוספת אירוע" רק לבעל אירוע
      if (newUser.user_type === 'event_owner') {
        setShowSuccessModal(true);
      } else {
        Alert.alert('המשתמש נוסף בהצלחה', message, [
          {
            text: 'אישור',
            onPress: () => router.back(),
          },
        ]);
      }
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להוסיף את המשתמש');
    } finally {
      setLoading(false);
    }
  };

  const handlePickAvatar = async () => {
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

      if (!result.canceled && result.assets?.[0]) {
        setAvatar(result.assets[0]);
      }
    } catch (e) {
      Alert.alert('שגיאה', 'לא ניתן לבחור תמונה');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הוספת משתמש חדש</Text>
      </View>

      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>תמונה</Text>
            <View style={styles.avatarRow}>
              <View style={styles.avatarPreview}>
                {avatar?.uri ? (
                  <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={26} color={colors.gray[500]} />
                )}
              </View>

              <View style={styles.avatarActions}>
                <TouchableOpacity style={styles.avatarButton} onPress={handlePickAvatar}>
                  <Ionicons name="image" size={18} color={colors.primary} />
                  <Text style={styles.avatarButtonText}>{avatar ? 'החלף תמונה' : 'בחר תמונה'}</Text>
                </TouchableOpacity>

                {!!avatar && (
                  <TouchableOpacity style={[styles.avatarButton, styles.avatarRemoveButton]} onPress={() => setAvatar(null)}>
                    <Ionicons name="trash" size={18} color={colors.error} />
                    <Text style={[styles.avatarButtonText, styles.avatarRemoveButtonText]}>הסר</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>שם מלא *</Text>
            <TextInput
              style={styles.input}
              value={newUser.name}
              onChangeText={(text) => setNewUser((prev) => ({ ...prev, name: text }))}
              placeholder="הכנס שם מלא"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>כתובת אימייל *</Text>
            <TextInput
              style={styles.input}
              value={newUser.email}
              onChangeText={(text) => setNewUser((prev) => ({ ...prev, email: text }))}
              placeholder="הכנס כתובת אימייל"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>מספר פלאפון</Text>
            <TextInput
              style={styles.input}
              value={newUser.phone}
              onChangeText={(text) => setNewUser((prev) => ({ ...prev, phone: text }))}
              placeholder="הכנס מספר פלאפון"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>סיסמה *</Text>
            <TextInput
              style={styles.input}
              value={newUser.password}
              onChangeText={(text) => setNewUser((prev) => ({ ...prev, password: text }))}
              placeholder="הכנס סיסמה (לפחות 6 תווים)"
              secureTextEntry
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>אישור סיסמה *</Text>
            <TextInput
              style={styles.input}
              value={newUser.confirmPassword}
              onChangeText={(text) => setNewUser((prev) => ({ ...prev, confirmPassword: text }))}
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
                  newUser.user_type === 'event_owner' && styles.userTypeOptionActive,
                ]}
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'event_owner' }))}
              >
                <Ionicons
                  name="heart"
                  size={20}
                  color={newUser.user_type === 'event_owner' ? colors.white : colors.primary}
                />
                <Text
                  style={[
                    styles.userTypeOptionText,
                    newUser.user_type === 'event_owner' && styles.userTypeOptionTextActive,
                  ]}
                >
                  בעל אירוע
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.userTypeOption,
                  newUser.user_type === 'admin' && styles.userTypeOptionActive,
                ]}
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'admin' }))}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={20}
                  color={newUser.user_type === 'admin' ? colors.white : colors.warning}
                />
                <Text
                  style={[
                    styles.userTypeOptionText,
                    newUser.user_type === 'admin' && styles.userTypeOptionTextActive,
                  ]}
                >
                  מנהל מערכת
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.userTypeOption,
                  newUser.user_type === 'employee' && styles.userTypeOptionActive,
                ]}
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'employee' }))}
              >
                <Ionicons
                  name="briefcase"
                  size={20}
                  color={newUser.user_type === 'employee' ? colors.white : colors.secondary}
                />
                <Text
                  style={[
                    styles.userTypeOptionText,
                    newUser.user_type === 'employee' && styles.userTypeOptionTextActive,
                  ]}
                >
                  עובד
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Button
            title={loading ? 'מוסיף...' : 'הוסף משתמש'}
            onPress={handleAddUser}
            disabled={loading}
            style={styles.submitButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={28} color={colors.white} />
            </View>
            <Text style={styles.successTitle}>המשתמש נוסף בהצלחה</Text>
            <Text style={styles.successMessage}>{successMessage}</Text>
            <View style={styles.successActions}>
              <TouchableOpacity
                style={styles.successPrimaryButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  if (createdUserId) {
                    router.replace({
                      pathname: '/(admin)/admin-events-create',
                      params: { userId: createdUserId },
                    });
                  } else {
                    router.back();
                  }
                }}
              >
                <Text style={styles.successPrimaryButtonText}>המשך להוספת אירוע</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successSecondaryButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.back();
                }}
              >
                <Text style={styles.successSecondaryButtonText}>חזרה לרשימת משתמשים</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    flex: 1,
    marginRight: 12,
  },
  body: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  avatarRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  avatarPreview: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 62,
    height: 62,
    resizeMode: 'cover',
  },
  avatarActions: {
    flex: 1,
    gap: 10,
    alignItems: 'flex-end',
  },
  avatarButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[300],
    backgroundColor: colors.white,
    alignSelf: 'stretch',
  },
  avatarButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  avatarRemoveButton: {
    borderColor: colors.error,
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  avatarRemoveButtonText: {
    color: colors.error,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: colors.white,
    textAlign: 'right',
  },
  userTypeSelector: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  userTypeOption: {
    flex: 1,
    flexDirection: 'row-reverse',
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
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  successIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 15,
    color: colors.textLight,
    textAlign: 'right',
    alignSelf: 'stretch',
    marginBottom: 20,
    lineHeight: 22,
  },
  successActions: {
    alignSelf: 'stretch',
    gap: 10,
  },
  successPrimaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  successPrimaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  successSecondaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  successSecondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
