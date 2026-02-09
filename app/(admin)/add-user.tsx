import React, { useEffect, useMemo, useState } from 'react';
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
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { userService, UserWithMetadata } from '@/lib/services/userService';
import { authService } from '@/lib/services/authService';
import * as ImagePicker from 'expo-image-picker';
import { avatarService } from '@/lib/services/avatarService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayoutStore } from '@/store/layoutStore';

const ui = {
  primary: '#067ff9',
  bgLight: '#f5f7f8',
  bgDark: '#0f1923',
};

const rtlTextAlign = Platform.select({ ios: 'right', default: 'right' }) as 'right';
const baseShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
};

export default function AddUserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // This screen is intentionally "light" (per design request), regardless of device theme.
  const isDark = false;
  const { isLoggedIn, userType } = useUserStore();
  const addDemoUser = useDemoUsersStore((state) => state.addUser);
  const setTabBarVisible = useLayoutStore((s) => s.setTabBarVisible);

  const [loading, setLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<
    null | 'name' | 'email' | 'phone' | 'password' | 'confirmPassword'
  >(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    user_type: 'event_owner' as 'event_owner' | 'admin' | 'employee',
  });

  const theme = useMemo(() => {
    const text = '#0f172a';
    const muted = '#64748b';
    const faint = '#94a3b8';
    const bg = ui.bgLight;
    const surface = ui.bgLight;
    const headerBg = 'rgba(245, 247, 248, 0.85)';
    const footerBg = 'rgba(245, 247, 248, 0.95)';
    const inputBg = '#ffffff';
    const border = '#e2e8f0';
    const divider = '#e2e8f0';
    const segmentBg = '#e2e8f0';
    const segmentActiveBg = '#ffffff';
    const primary = ui.primary;
    const danger = '#F44336';
    const white = '#ffffff';

    return {
      bg,
      surface,
      text,
      muted,
      faint,
      inputBg,
      border,
      divider,
      headerBg,
      footerBg,
      segmentBg,
      segmentActiveBg,
      primary,
      danger,
      white,
    };
  }, [isDark]);

  useEffect(() => {
    if (!isLoggedIn || userType !== 'admin') {
      router.replace('/login');
      return;
    }
    checkConnection();
  }, [isLoggedIn, userType]);

  useEffect(() => {
    // This screen is a focused flow; hide the bottom tabs while adding a user.
    setTabBarVisible(false);
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]);

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

  const HeaderSurface = ({ children }: { children: React.ReactNode }) => {
    return (
      <View style={[styles.headerSurface, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        {children}
      </View>
    );
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
            fileName: avatar.fileName ?? undefined,
            mimeType: avatar.mimeType ?? undefined,
            file: (avatar as any)?.file,
            base64: avatar.base64 ?? undefined,
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
    <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <HeaderSurface>
        <View style={[styles.header, { paddingTop: 10 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <MaterialIcons name="arrow-forward-ios" size={20} color={ui.primary} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            הוספת משתמש חדש
          </Text>

          <View style={styles.headerPlaceholder} />
        </View>
      </HeaderSurface>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {isDemoMode && (
            <View style={[styles.demoNote, { borderColor: 'rgba(6, 127, 249, 0.18)', backgroundColor: 'rgba(6, 127, 249, 0.08)' }]}>
              <Ionicons name="information-circle" size={18} color={ui.primary} style={{ marginLeft: 8 }} />
              <Text style={[styles.demoNoteText, { color: theme.text }]}>
                מצב דמו: הנתונים נשמרים מקומית ולא בדאטאבייס.
              </Text>
            </View>
          )}

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={avatar ? 'החלף תמונה' : 'הוסף תמונה'}
              onPress={handlePickAvatar}
              style={({ pressed }) => [styles.avatarPressable, pressed && styles.pressed]}
            >
              <View style={[styles.avatarCircle, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                {avatar?.uri ? (
                  <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
                ) : (
                  <MaterialIcons name="add-a-photo" size={30} color={isDark ? '#64748b' : '#94a3b8'} />
                )}
              </View>
              <Text style={[styles.avatarCta, { marginTop: 10 }]}>הוסף תמונה</Text>
            </Pressable>

            {!!avatar && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="הסר תמונה"
                onPress={() => setAvatar(null)}
                style={({ pressed }) => [styles.removeAvatarBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="trash-outline" size={16} color="#F44336" style={{ marginLeft: 6 }} />
                <Text style={styles.removeAvatarText}>הסר</Text>
              </Pressable>
            )}
          </View>

          {/* Fields */}
          <View style={styles.fields}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.muted }]}>שם מלא</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputRtl,
                  { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                  focusedField === 'name' && styles.inputFocused,
                ]}
                value={newUser.name}
                onChangeText={(text) => setNewUser((prev) => ({ ...prev, name: text }))}
                placeholder="ישראל ישראלי"
                placeholderTextColor={theme.faint}
                autoCapitalize="words"
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField((f) => (f === 'name' ? null : f))}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.muted }]}>אימייל</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputLtr,
                  { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                  focusedField === 'email' && styles.inputFocused,
                ]}
                value={newUser.email}
                onChangeText={(text) => setNewUser((prev) => ({ ...prev, email: text }))}
                placeholder="email@example.com"
                placeholderTextColor={theme.faint}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField((f) => (f === 'email' ? null : f))}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.muted }]}>טלפון</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputLtr,
                  { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                  focusedField === 'phone' && styles.inputFocused,
                ]}
                value={newUser.phone}
                onChangeText={(text) => setNewUser((prev) => ({ ...prev, phone: text }))}
                placeholder="050-0000000"
                placeholderTextColor={theme.faint}
                keyboardType="phone-pad"
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField((f) => (f === 'phone' ? null : f))}
              />
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.divider }]} />

          <View style={styles.fields}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.muted }]}>סיסמה</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputInRow,
                    styles.inputRtl,
                    { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                    focusedField === 'password' && styles.inputFocused,
                  ]}
                  value={newUser.password}
                  onChangeText={(text) => setNewUser((prev) => ({ ...prev, password: text }))}
                  placeholder="********"
                  placeholderTextColor={theme.faint}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField((f) => (f === 'password' ? null : f))}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  onPress={() => setShowPassword((v) => !v)}
                  style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.75 }]}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={isDark ? '#94a3b8' : '#64748b'}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.muted }]}>אימות סיסמה</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputInRow,
                    styles.inputRtl,
                    { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                    focusedField === 'confirmPassword' && styles.inputFocused,
                  ]}
                  value={newUser.confirmPassword}
                  onChangeText={(text) => setNewUser((prev) => ({ ...prev, confirmPassword: text }))}
                  placeholder="********"
                  placeholderTextColor={theme.faint}
                  secureTextEntry={!showConfirmPassword}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField((f) => (f === 'confirmPassword' ? null : f))}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'הסתר אימות סיסמה' : 'הצג אימות סיסמה'}
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.75 }]}
                >
                  <MaterialIcons
                    name={showConfirmPassword ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={isDark ? '#94a3b8' : '#64748b'}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Role segmented control */}
          <View style={styles.roleSection}>
            <Text style={[styles.roleLabel, { color: theme.muted }]}>תפקיד</Text>
            <View
              style={[
                styles.segmentWrap,
                {
                  backgroundColor: theme.segmentBg,
                  borderColor: '#d8dee9',
                },
              ]}
            >
              <Pressable
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'employee' }))}
                style={({ pressed }) => [
                  styles.segmentItem,
                  newUser.user_type === 'employee' ? styles.segmentItemActive : styles.segmentItemInactive,
                  pressed && styles.segmentPressed,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: theme.muted },
                    newUser.user_type === 'employee' && { color: theme.primary },
                  ]}
                >
                  עובד
                </Text>
              </Pressable>

              <Pressable
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'admin' }))}
                style={({ pressed }) => [
                  styles.segmentItem,
                  newUser.user_type === 'admin' ? styles.segmentItemActive : styles.segmentItemInactive,
                  pressed && styles.segmentPressed,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: theme.muted },
                    newUser.user_type === 'admin' && { color: theme.primary },
                  ]}
                >
                  מנהל
                </Text>
              </Pressable>

              <Pressable
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'event_owner' }))}
                style={({ pressed }) => [
                  styles.segmentItem,
                  newUser.user_type === 'event_owner' ? styles.segmentItemActive : styles.segmentItemInactive,
                  pressed && styles.segmentPressed,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: theme.muted },
                    newUser.user_type === 'event_owner' && { color: theme.primary },
                  ]}
                >
                  בעל אירוע
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ height: 50 }} />
        </ScrollView>
        {/* Sticky bottom action */}
        <View style={[styles.footerWrap, { paddingBottom: insets.bottom, backgroundColor: theme.bg }]}>
          <View style={[styles.footerPanel, { backgroundColor: theme.footerBg, borderColor: theme.border }]}>
            <Pressable
              onPress={handleAddUser}
              disabled={loading}
              style={({ pressed }) => [
                styles.saveBtn,
                (pressed || loading) && styles.saveBtnPressed,
                loading && { opacity: 0.9 },
              ]}
            >
              {loading ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>שמור משתמש</Text>}
            </Pressable>
          </View>
        </View>
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
              <Ionicons name="checkmark" size={28} color="#FFFFFF" />
            </View>
            <Text style={[styles.successTitle, { color: theme.text }]}>המשתמש נוסף בהצלחה</Text>
            <Text style={[styles.successMessage, { color: theme.muted }]}>{successMessage}</Text>
            <View style={styles.successActions}>
              <TouchableOpacity
                style={[styles.successPrimaryButton, { marginBottom: 10 }]}
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
                <Text style={[styles.successPrimaryButtonText, { color: theme.white }]}>המשך להוספת אירוע</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successSecondaryButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.back();
                }}
              >
                <Text style={[styles.successSecondaryButtonText, { color: theme.text }]}>חזרה לרשימת משתמשים</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
  },

  headerSurface: {
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  headerSurfaceInner: {
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(6, 127, 249, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerPlaceholder: { width: 40 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  body: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
  },

  demoNote: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
  },
  demoNoteText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    textAlign: rtlTextAlign,
  },

  avatarSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  avatarPressable: { alignItems: 'center' },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...baseShadow,
  },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarCta: { fontSize: 14, fontWeight: '900', color: '#067ff9', textAlign: 'center' },
  removeAvatarBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.18)',
    marginTop: 10,
  },
  removeAvatarText: { fontSize: 12, fontWeight: '900', color: '#F44336', textAlign: rtlTextAlign },

  fields: {
    marginTop: 6,
  },
  fieldGroup: { marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: rtlTextAlign,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  inputRtl: {
    textAlign: rtlTextAlign,
  },
  inputLtr: { textAlign: 'left' },
  inputFocused: {
    borderColor: ui.primary,
  },

  divider: {
    height: 1,
    marginVertical: 14,
    marginHorizontal: 6,
  },

  inputRow: { position: 'relative', justifyContent: 'center' },
  inputInRow: { paddingLeft: 46 },
  eyeBtn: {
    position: 'absolute',
    left: 10,
    height: 48,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  segmentWrap: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    borderRadius: 16,
    padding: 2,
    borderWidth: 1,
    backgroundColor: '#e9edf3',
    borderColor: '#d8dee9',
    overflow: 'visible',
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  segmentItemInactive: {
    backgroundColor: 'transparent',
  },
  segmentItemActive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...baseShadow,
  },
  segmentPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  segmentText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },

  roleSection: {
    marginTop: 14,
    paddingTop: 6,
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: rtlTextAlign,
    marginBottom: 8,
  },

  footerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  footerPanel: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    ...baseShadow,
  },
  saveBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#067ff9',
    alignItems: 'center',
    justifyContent: 'center',
    ...baseShadow,
  },
  saveBtnPressed: { transform: [{ scale: 0.99 }], opacity: 0.96 },
  saveBtnText: { color: 'white', fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },

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
    ...baseShadow,
  },
  successIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    ...baseShadow,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: rtlTextAlign,
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 15,
    textAlign: rtlTextAlign,
    alignSelf: 'stretch',
    marginBottom: 20,
    lineHeight: 22,
  },
  successActions: {
    alignSelf: 'stretch',
  },
  successPrimaryButton: {
    alignSelf: 'stretch',
    backgroundColor: '#06173e',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  successPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  successSecondaryButton: {
    alignSelf: 'stretch',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  successSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
