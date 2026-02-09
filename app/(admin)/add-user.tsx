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
import { Ionicons } from '@expo/vector-icons';
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
  bg: '#f5f7f8',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  card: '#ffffff',
  border: 'rgba(226, 232, 240, 0.9)',
};

export default function AddUserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // Simplified header - no BlurView for better iOS compatibility
  const HeaderSurface = ({ children }: { children: React.ReactNode }) => {
    return (
      <View style={[styles.headerSurface, { backgroundColor: '#f5f7f8', borderBottomColor: '#e2e8f0' }]}>
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
    <View style={[styles.screen, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Soft background blobs (like the reference screens) */}
      <View pointerEvents="none" style={styles.bgWrap}>
        <View style={styles.bgBlobTopRight} />
        <View style={styles.bgBlobBottomLeft} />
      </View>

      <HeaderSurface>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 6 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-forward" size={22} color={ui.primary} />
          </Pressable>

          <Text style={styles.headerTitle} numberOfLines={1}>
            הוספת משתמש חדש
          </Text>

          <View style={styles.headerPlaceholder} />
        </View>
      </HeaderSurface>

      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 10) + 88,
              paddingBottom: 150 + insets.bottom,
            },
          ]}
        >
          {isDemoMode && (
            <View style={styles.demoNote}>
              <Ionicons name="information-circle" size={18} color={ui.primary} style={{ marginLeft: 8 }} />
              <Text style={styles.demoNoteText}>מצב דמו: הנתונים נשמרים מקומית ולא בדאטאבייס.</Text>
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
              <View style={styles.avatarCircle}>
                {avatar?.uri ? (
                  <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="camera" size={28} color={ui.faint} />
                )}
              </View>
              <Text style={[styles.avatarCta, { marginTop: 10 }]}>{avatar ? 'החלף תמונה' : 'הוסף תמונה'}</Text>
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
          <View style={styles.section}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>שם מלא *</Text>
              <TextInput
                style={styles.input}
                value={newUser.name}
                onChangeText={(text) => setNewUser((prev) => ({ ...prev, name: text }))}
                placeholder="ישראל ישראלי"
                placeholderTextColor={ui.faint}
                autoCapitalize="words"
                textAlign="right"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>אימייל *</Text>
              <TextInput
                style={[styles.input, styles.inputLtr]}
                value={newUser.email}
                onChangeText={(text) => setNewUser((prev) => ({ ...prev, email: text }))}
                placeholder="email@example.com"
                placeholderTextColor={ui.faint}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>טלפון</Text>
              <TextInput
                style={[styles.input, styles.inputLtr]}
                value={newUser.phone}
                onChangeText={(text) => setNewUser((prev) => ({ ...prev, phone: text }))}
                placeholder="050-0000000"
                placeholderTextColor={ui.faint}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>סיסמה *</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputInRow]}
                  value={newUser.password}
                  onChangeText={(text) => setNewUser((prev) => ({ ...prev, password: text }))}
                  placeholder="********"
                  placeholderTextColor={ui.faint}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  onPress={() => setShowPassword((v) => !v)}
                  style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.75 }]}
                >
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={ui.muted} />
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>אימות סיסמה *</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputInRow]}
                  value={newUser.confirmPassword}
                  onChangeText={(text) => setNewUser((prev) => ({ ...prev, confirmPassword: text }))}
                  placeholder="********"
                  placeholderTextColor={ui.faint}
                  secureTextEntry={!showConfirmPassword}
                  textAlign="right"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'הסתר אימות סיסמה' : 'הצג אימות סיסמה'}
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.75 }]}
                >
                  <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color={ui.muted} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Role segmented control */}
          <View style={styles.roleSection}>
            <Text style={styles.roleLabel}>תפקיד</Text>
            <View style={styles.segmentWrap}>
              <Pressable
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'employee' }))}
                style={({ pressed }) => [
                  styles.segmentItem,
                  newUser.user_type === 'employee' && styles.segmentItemActive,
                  pressed && styles.segmentPressed,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    newUser.user_type === 'employee' && styles.segmentTextActive,
                  ]}
                >
                  עובד
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'admin' }))}
                style={({ pressed }) => [
                  styles.segmentItem,
                  newUser.user_type === 'admin' && styles.segmentItemActive,
                  pressed && styles.segmentPressed,
                ]}
              >
                <Text style={[styles.segmentText, newUser.user_type === 'admin' && styles.segmentTextActive]}>
                  מנהל
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setNewUser((prev) => ({ ...prev, user_type: 'event_owner' }))}
                style={({ pressed }) => [
                  styles.segmentItem,
                  newUser.user_type === 'event_owner' && styles.segmentItemActive,
                  pressed && styles.segmentPressed,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    newUser.user_type === 'event_owner' && styles.segmentTextActive,
                  ]}
                >
                  בעל אירוע
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={{ height: 50 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky bottom action */}
      <View style={[styles.footerWrap, { paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.footerPanel}>
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
            <Text style={styles.successTitle}>המשתמש נוסף בהצלחה</Text>
            <Text style={styles.successMessage}>{successMessage}</Text>
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
  screen: {
    flex: 1,
  },
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bgBlobTopRight: {
    position: 'absolute',
    top: -80,
    right: -90,
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: 'rgba(6, 127, 249, 0.10)',
    transform: [{ scaleX: 1.05 }],
  },
  bgBlobBottomLeft: {
    position: 'absolute',
    bottom: -100,
    left: -110,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },

  headerSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
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
    color: '#0f172a',
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
  },

  demoNote: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 127, 249, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 127, 249, 0.18)',
    marginBottom: 14,
  },
  demoNoteText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },

  avatarSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  avatarPressable: { alignItems: 'center' },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
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
  removeAvatarText: { fontSize: 12, fontWeight: '900', color: '#F44336', textAlign: 'right' },

  section: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  fieldGroup: { marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: '900',
    color: 'rgba(15, 23, 42, 0.72)',
    marginBottom: 8,
    textAlign: 'right',
  },
  input: {
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  inputLtr: { writingDirection: 'ltr', textAlign: 'left' },

  divider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.35)',
    marginVertical: 14,
    marginHorizontal: 6,
  },

  inputRow: { position: 'relative', justifyContent: 'center' },
  inputInRow: { paddingLeft: 44 },
  eyeBtn: {
    position: 'absolute',
    left: 12,
    height: 48,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  segmentWrap: {
    flexDirection: 'row-reverse',
    alignSelf: 'stretch',
    backgroundColor: '#E9EDF3',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#D8DEE9',
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#067ff9',
    shadowColor: 'rgba(6, 127, 249, 0.35)',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  segmentPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  segmentText: { fontSize: 13, fontWeight: '800', color: '#6B7280', textAlign: 'center' },
  segmentTextActive: { color: '#067ff9' },

  roleSection: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(15, 23, 42, 0.72)',
    textAlign: 'right',
    marginBottom: 8,
  },

  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    zIndex: 50,
    elevation: 50,
    backgroundColor: 'transparent',
  },
  footerPanel: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(245, 247, 248, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  saveBtn: {
    width: '100%',
    height: 54,
    borderRadius: 12,
    backgroundColor: '#067ff9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#067ff9',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
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
  },
  successPrimaryButton: {
    alignSelf: 'stretch',
    backgroundColor: '#06173e',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  successPrimaryButtonText: {
    color: '#FFFFFF',
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
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
