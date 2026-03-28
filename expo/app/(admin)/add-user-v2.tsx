import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  I18nManager,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { userService, UserWithMetadata } from '@/lib/services/userService';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { authService } from '@/lib/services/authService';
import * as ImagePicker from 'expo-image-picker';
import { avatarService } from '@/lib/services/avatarService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayoutStore } from '@/store/layoutStore';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';

const ui = {
  // Use the app's brand dark-blue
  primary: colors.primary,
  bgLight: '#f5f7f8',
};

const rtlTextAlign = 'right' as const;
const isRTL = I18nManager.isRTL;

const baseShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.12,
  shadowRadius: 18,
  elevation: 6,
};

type UserType = 'event_owner' | 'admin' | 'employee';

type AddUserScreenV2Props = {
  /**
   * `default`: mobile-first full-screen flow (existing).
   * `webPremiumEmbedded`: intended to be rendered inside a centered web "card" wrapper.
   */
  variant?: 'default' | 'webPremiumEmbedded';
  /**
   * When true, show an automatic alert if DB connection test fails.
   * For web we usually keep this false to avoid blocking UI; the screen already shows a demo-mode banner.
   */
  autoShowDbConnectionAlert?: boolean;
};

export default function AddUserScreenV2({
  variant = 'default',
  autoShowDbConnectionAlert = true,
}: AddUserScreenV2Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // This screen is intentionally "light" (per design request), regardless of device theme.
  const isDark = false;
  const { width } = useWindowDimensions();
  const isSm = width >= 640;
  const isWebPremium = variant === 'webPremiumEmbedded';
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<
    null | 'name' | 'email' | 'phone' | 'password' | 'confirmPassword'
  >(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    user_type: 'event_owner' as UserType,
  });

  const goBackOrUsers = useCallback(() => {
    router.replace('/(admin)/users');
  }, [router]);

  const theme = useMemo(() => {
    const text = '#0f172a';
    const muted = '#64748b';
    const faint = '#94a3b8';
    const bg = ui.bgLight;
    const headerBg = 'rgba(245, 247, 248, 0.90)';
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
      text,
      muted,
      faint,
      inputBg,
      border,
      divider,
      headerBg,
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
    void checkConnection();
  }, [isLoggedIn, userType, router]);

  useFocusEffect(
    useCallback(() => {
      // This screen is a focused flow; hide the bottom tabs while adding a user.
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const checkConnection = async () => {
    try {
      const connectionResult = await authService.testConnection();
      setIsDemoMode(!connectionResult.success);
      if (!connectionResult.success && autoShowDbConnectionAlert) {
        Alert.alert('אבחון בעיות דאטאבייס', connectionResult.message, [{ text: 'הבנתי' }]);
      }
    } catch {
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
              onPress: goBackOrUsers,
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
            onPress: goBackOrUsers,
          },
        ]);
      }
    } catch {
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
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לבחור תמונה');
    }
  };

  const RoleOption = ({ label, value }: { label: string; value: UserType }) => {
    const active = newUser.user_type === value;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        activeOpacity={0.85}
        onPress={() => setNewUser((prev) => ({ ...prev, user_type: value }))}
        style={[styles.roleOption, active ? styles.roleOptionActive : styles.roleOptionInactive]}
      >
        <Text style={[styles.roleOptionText, active ? styles.roleOptionTextActive : styles.roleOptionTextInactive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const WebRoleCard = ({
    title,
    subtitle,
    value,
    icon,
  }: {
    title: string;
    subtitle: string;
    value: UserType;
    icon: keyof typeof MaterialIcons.glyphMap;
  }) => {
    const active = newUser.user_type === value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={() => setNewUser((prev) => ({ ...prev, user_type: value }))}
        style={({ hovered, pressed }: any) => [
          styles.webRoleCard,
          active ? styles.webRoleCardActive : styles.webRoleCardInactive,
          Platform.OS === 'web' && hovered ? styles.webRoleCardHover : null,
          pressed ? styles.webRoleCardPressed : null,
        ]}
      >
        <View style={[styles.webRoleIconWrap, active ? styles.webRoleIconWrapActive : null]}>
          <MaterialIcons name={icon} size={20} color={active ? '#ffffff' : '#475569'} />
        </View>
        <Text style={[styles.webRoleTitle, active ? styles.webRoleTitleActive : null]}>{title}</Text>
        <Text style={styles.webRoleSubtitle}>{subtitle}</Text>
      </Pressable>
    );
  };

  const WebFloatingField = ({
    id,
    label,
    value,
    onChangeText,
    icon,
    keyboardType,
    autoCapitalize,
    autoCorrect,
    secureTextEntry,
    showToggle,
    onPressToggle,
    focusedKey,
    textAlign,
  }: {
    id: string;
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    icon: keyof typeof MaterialIcons.glyphMap;
    keyboardType?: any;
    autoCapitalize?: any;
    autoCorrect?: boolean;
    secureTextEntry?: boolean;
    showToggle?: boolean;
    onPressToggle?: () => void;
    focusedKey: NonNullable<typeof focusedField>;
    textAlign?: 'right' | 'left';
  }) => {
    const isFocused = focusedField === focusedKey;
    const floated = isFocused || value.trim().length > 0;

    return (
      <View style={styles.webFloatingWrap}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocusedField(focusedKey)}
          onBlur={() => setFocusedField((f) => (f === focusedKey ? null : f))}
          placeholder=" "
          placeholderTextColor="transparent"
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          secureTextEntry={secureTextEntry}
          style={[
            styles.webFloatingInput,
            isFocused ? styles.webFloatingInputFocused : null,
            { textAlign: textAlign ?? rtlTextAlign },
          ]}
        />

        <Text style={[styles.webFloatingLabel, floated ? styles.webFloatingLabelFloated : null]} numberOfLines={1}>
          {label}
        </Text>

        <MaterialIcons
          name={icon}
          size={20}
          color={isFocused ? ui.primary : '#94a3b8'}
          style={styles.webFloatingLeftIcon}
        />

        {showToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הצג/הסתר"
            onPress={onPressToggle}
            style={({ pressed }: any) => [styles.webFloatingRightBtn, pressed ? { opacity: 0.85 } : null]}
          >
            <MaterialIcons
              name={secureTextEntry ? 'visibility' : 'visibility-off'}
              size={20}
              color={isFocused ? ui.primary : '#94a3b8'}
            />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.screen,
        isWebPremium
          ? ([
              styles.webPremiumScreen,
              Platform.OS === 'web'
                ? ({
                    // helps ensure inputs and layout behave properly in RTL on web
                    direction: 'rtl',
                  } as any)
                : null,
            ] as any)
          : { backgroundColor: theme.bg, paddingTop: 0 },
      ]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header (stable: no row-reverse tricks, use RTL-aware direction) */}
      {!isWebPremium ? (
        <>
          <LinearGradient
            colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mobileBg}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 0.75, y: 0.55 }}
            style={styles.mobileBgHighlight}
          />
          <LinearGradient
            colors={['rgba(232,196,122,0.56)', 'rgba(244,224,186,0.22)', 'rgba(244,224,186,0)']}
            start={{ x: 1, y: 0.95 }}
            end={{ x: 0.18, y: 0.22 }}
            style={styles.mobileBgWarmGlow}
          />

          <AppKeyboardAwareScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[0]}
            contentContainerStyle={[
              styles.mobileContent,
              {
                paddingTop: 0,
                paddingBottom: keyboardVisible ? 24 : Math.max(insets.bottom, 24) + 24,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            enableResetScrollToCoords={false}
          >
              <View style={[styles.mobileTopBarSticky, { paddingTop: insets.top + 10 }]}>
                <View style={styles.mobileTopBar}>
                  <View style={styles.mobileTopBarRightGroup}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="חזרה"
                      onPress={goBackOrUsers}
                      activeOpacity={0.88}
                      style={styles.mobileTopBarButton}
                    >
                      <MaterialIcons name="arrow-forward-ios" size={20} color={ui.primary} />
                    </TouchableOpacity>

                    <Text style={styles.mobileTopBarTitle}>הוספת משתמש חדש</Text>
                  </View>
                  <View style={styles.mobileTopBarPlaceholder} />
                </View>
              </View>

              {isDemoMode && (
                <View
                  style={[
                    styles.mobileDemoNote,
                    {
                      borderColor: 'rgba(6, 23, 62, 0.12)',
                      backgroundColor: 'rgba(255,255,255,0.72)',
                    },
                  ]}
                >
                  <View style={styles.mobileDemoNoteIconWrap}>
                    <Ionicons name="information-circle" size={18} color={ui.primary} />
                  </View>
                  <Text style={[styles.demoNoteText, { color: theme.text }]}>
                    מצב דמו: הנתונים נשמרים מקומית ולא בדאטאבייס.
                  </Text>
                </View>
              )}

              <View style={styles.mobileHeroCard}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.98)', 'rgba(249,247,242,0.96)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.mobileHeroCardGradient}
                />
                <View style={styles.mobileHeroTextWrap}>
                  <View style={styles.mobileSectionTitleRow}>
                    <View style={styles.mobileSectionTitleIconWrap}>
                      <MaterialIcons name="add-a-photo" size={18} color={ui.primary} />
                    </View>
                    <Text style={styles.mobileHeroTitle}>תמונת פרופיל</Text>
                  </View>
                  <Text style={styles.mobileHeroSubtitle}>הוסף תמונה שתוצג למשתמש במערכת</Text>
                </View>

                <View style={styles.avatarSection}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={avatar ? 'החלף תמונה' : 'הוסף תמונה'}
                    onPress={handlePickAvatar}
                    activeOpacity={0.88}
                    style={styles.avatarPressable}
                  >
                    <View style={[styles.avatarCircle, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                      {avatar?.uri ? (
                        <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
                      ) : (
                        <MaterialIcons name="add-a-photo" size={30} color={isDark ? '#64748b' : '#94a3b8'} />
                      )}
                    </View>
                    <Text style={[styles.avatarCta, { marginTop: 10 }]}>{avatar ? 'החלף תמונה' : 'הוסף תמונה'}</Text>
                  </TouchableOpacity>

                  {!!avatar && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="הסר תמונה"
                      onPress={() => setAvatar(null)}
                      activeOpacity={0.85}
                      style={styles.removeAvatarBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color="#F44336" style={{ marginStart: 6 }} />
                      <Text style={styles.removeAvatarText}>הסר</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.mobileSectionCard}>
                <View style={styles.mobileSectionHeader}>
                  <View style={styles.mobileSectionTitleRow}>
                    <View style={styles.mobileSectionTitleIconWrap}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={ui.primary} />
                    </View>
                    <Text style={styles.mobileSectionTitle}>הרשאות משתמש</Text>
                  </View>
                  <Text style={styles.mobileSectionSubtitle}>קבע איזה סוג גישה המשתמש יקבל באפליקציה</Text>
                </View>

                <View style={styles.roleSection}>
                  <Text style={[styles.roleLabel, { color: theme.muted }]}>תפקיד</Text>
                  <View
                    style={[
                      styles.roleSegmentV3,
                      {
                        backgroundColor: 'rgba(232,240,255,0.92)',
                        borderColor: 'rgba(6,23,62,0.08)',
                        flexDirection: isRTL ? 'row' : 'row-reverse',
                      },
                    ]}
                  >
                    <RoleOption label="עובד" value="employee" />
                    <RoleOption label="מנהל" value="admin" />
                    <RoleOption label="בעל אירוע" value="event_owner" />
                  </View>
                </View>
              </View>

              <View style={styles.mobileSectionCard}>
                <View style={styles.mobileSectionHeader}>
                  <View style={styles.mobileSectionTitleRow}>
                    <View style={styles.mobileSectionTitleIconWrap}>
                      <Ionicons name="person-outline" size={18} color={ui.primary} />
                    </View>
                    <Text style={styles.mobileSectionTitle}>פרטים אישיים</Text>
                  </View>
                  <Text style={styles.mobileSectionSubtitle}>המידע שיופיע בכרטיס המשתמש ובמערכת</Text>
                </View>

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
              </View>

              <View style={styles.mobileSectionCard}>
                <View style={styles.mobileSectionHeader}>
                  <View style={styles.mobileSectionTitleRow}>
                    <View style={styles.mobileSectionTitleIconWrap}>
                      <Ionicons name="lock-closed-outline" size={18} color={ui.primary} />
                    </View>
                    <Text style={styles.mobileSectionTitle}>אבטחה והתחברות</Text>
                  </View>
                  <Text style={styles.mobileSectionSubtitle}>בחר סיסמה למשתמש החדש ואמת אותה</Text>
                </View>

                <View style={styles.fields}>
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: theme.muted }]}>סיסמה</Text>
                    <View style={styles.passwordInputRow}>
                      <TextInput
                        style={[
                          styles.passwordInput,
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
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                        onPress={() => setShowPassword((v) => !v)}
                        activeOpacity={0.7}
                        style={styles.eyeBtn}
                      >
                        <MaterialIcons
                          name={showPassword ? 'visibility-off' : 'visibility'}
                          size={20}
                          color={isDark ? '#94a3b8' : '#64748b'}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: theme.muted }]}>אימות סיסמה</Text>
                    <View style={styles.passwordInputRow}>
                      <TextInput
                        style={[
                          styles.passwordInput,
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
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={showConfirmPassword ? 'הסתר אימות סיסמה' : 'הצג אימות סיסמה'}
                        onPress={() => setShowConfirmPassword((v) => !v)}
                        activeOpacity={0.7}
                        style={styles.eyeBtn}
                      >
                        <MaterialIcons
                          name={showConfirmPassword ? 'visibility-off' : 'visibility'}
                          size={20}
                          color={isDark ? '#94a3b8' : '#64748b'}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleAddUser}
                disabled={loading}
                activeOpacity={0.88}
                style={[styles.mobilePrimaryButton, styles.mobileBottomSubmitButton, loading && { opacity: 0.75 }]}
              >
                <LinearGradient
                  colors={['#06173E', '#003566']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.mobilePrimaryButtonGradient}
                >
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>שמור משתמש</Text>}
                </LinearGradient>
              </TouchableOpacity>
          </AppKeyboardAwareScrollView>
        </>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.webPremiumContent}
          keyboardShouldPersistTaps="handled"
        >
          {isDemoMode ? (
            <View style={styles.webDemoNote}>
              <Ionicons name="information-circle" size={18} color={ui.primary} style={{ marginStart: 8 }} />
              <Text style={styles.webDemoNoteText}>מצב דמו: הנתונים נשמרים מקומית ולא בדאטאבייס.</Text>
            </View>
          ) : null}

          <View style={styles.webHeader}>
            <View style={styles.webAvatarHeroWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={avatar ? 'החלף תמונה' : 'הוסף תמונה'}
                onPress={handlePickAvatar}
                style={({ hovered, pressed }: any) => [
                  styles.webAvatarHeroCircle,
                  Platform.OS === 'web' && hovered ? styles.webAvatarHeroCircleHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                {avatar?.uri ? (
                  <Image source={{ uri: avatar.uri }} style={styles.webAvatarHeroImage} />
                ) : (
                  <MaterialIcons name="add-a-photo" size={36} color="#94a3b8" />
                )}
                <View style={styles.webAvatarHeroEditBadge}>
                  <MaterialIcons name="edit" size={14} color={ui.primary} />
                </View>
              </Pressable>
            </View>
            <Text style={styles.webTitle}>הוספת משתמש חדש</Text>
            <Text style={styles.webSubtitle}>מלא את פרטי המשתמש וקבע הרשאות גישה למערכת</Text>
          </View>

          <View style={styles.webForm}>
            <View style={[styles.webGridRow, { flexDirection: isSm ? 'row' : 'column' }]}>
              <View style={styles.webGridCell}>
                <WebFloatingField
                  id="fullname"
                  label="שם מלא"
                  icon="person"
                  value={newUser.name}
                  onChangeText={(t) => setNewUser((p) => ({ ...p, name: t }))}
                  autoCapitalize="words"
                  autoCorrect={false}
                  focusedKey="name"
                  textAlign="right"
                />
              </View>
              <View style={styles.webGridCell}>
                <WebFloatingField
                  id="email"
                  label="כתובת אימייל"
                  icon="mail"
                  value={newUser.email}
                  onChangeText={(t) => setNewUser((p) => ({ ...p, email: t }))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  focusedKey="email"
                  textAlign="left"
                />
              </View>
            </View>

            <WebFloatingField
              id="phone"
              label="מספר טלפון"
              icon="call"
              value={newUser.phone}
              onChangeText={(t) => setNewUser((p) => ({ ...p, phone: t }))}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              focusedKey="phone"
              textAlign="left"
            />

            <View style={[styles.webGridRow, { flexDirection: isSm ? 'row' : 'column' }]}>
              <View style={styles.webGridCell}>
                <WebFloatingField
                  id="password"
                  label="סיסמה"
                  icon="lock"
                  value={newUser.password}
                  onChangeText={(t) => setNewUser((p) => ({ ...p, password: t }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showPassword}
                  showToggle
                  onPressToggle={() => setShowPassword((v) => !v)}
                  focusedKey="password"
                  textAlign="right"
                />
              </View>
              <View style={styles.webGridCell}>
                <WebFloatingField
                  id="confirmPassword"
                  label="אימות סיסמה"
                  icon="lock"
                  value={newUser.confirmPassword}
                  onChangeText={(t) => setNewUser((p) => ({ ...p, confirmPassword: t }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showConfirmPassword}
                  showToggle
                  onPressToggle={() => setShowConfirmPassword((v) => !v)}
                  focusedKey="confirmPassword"
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.webRoleDivider}>
              <View style={styles.webRoleDividerLine} />
              <Text style={styles.webRoleDividerLabel}>תפקיד במערכת</Text>
              <View style={styles.webRoleDividerLine} />
            </View>

            <View style={[styles.webRoleGrid, { flexDirection: isSm ? 'row' : 'column' }]}>
              <View style={[styles.webRoleGridCell, isSm ? { flex: 1 } : null]}>
                <WebRoleCard
                  value="employee"
                  title="עובד"
                  subtitle="גישה ליומן וניהול משימות בלבד"
                  icon="badge"
                />
              </View>
              <View style={[styles.webRoleGridCell, isSm ? { flex: 1 } : null]}>
                <WebRoleCard value="admin" title="מנהל" subtitle="ניהול עובדים, דוחות ואירועים" icon="manage-accounts" />
              </View>
              <View style={[styles.webRoleGridCell, isSm ? { flex: 1 } : null]}>
                <WebRoleCard
                  value="event_owner"
                  title="בעלים"
                  subtitle="גישה מלאה לכל הגדרות המערכת"
                  icon="verified-user"
                />
              </View>
            </View>

            <View style={{ paddingTop: 6 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור משתמש חדש"
                onPress={handleAddUser}
                disabled={loading}
                style={({ hovered, pressed }: any) => [
                  styles.webSubmitBtn,
                  loading ? { opacity: 0.75 } : null,
                  Platform.OS === 'web' && hovered ? styles.webSubmitBtnHover : null,
                  pressed ? styles.webSubmitBtnPressed : null,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.webSubmitText}>שמור משתמש חדש</Text>
                    <MaterialIcons name="arrow-forward" size={20} color="#ffffff" style={styles.webSubmitArrow} />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}

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
                    goBackOrUsers();
                  }
                }}
              >
                <Text style={[styles.successPrimaryButtonText, { color: theme.white }]}>המשך להוספת אירוע</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successSecondaryButton}
                onPress={() => {
                  setShowSuccessModal(false);
                  goBackOrUsers();
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

  webPremiumScreen: {
    backgroundColor: 'transparent',
  },
  webPremiumContent: {
    paddingTop: 14,
    paddingBottom: 24,
  },
  webDemoNote: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: isRTL ? 'row' : 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.18)',
    backgroundColor: 'rgba(6, 23, 62, 0.08)',
  },
  webDemoNoteText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: rtlTextAlign,
  },

  webHeader: {
    alignItems: 'center',
    textAlign: 'center' as any,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  webAvatarHeroWrap: {
    marginBottom: 10,
  },
  webAvatarHeroCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  } as any,
  webAvatarHeroCircleHover: {
    borderColor: 'rgba(6, 23, 62, 0.35)',
    backgroundColor: '#f1f5f9',
  },
  webAvatarHeroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  webAvatarHeroEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...baseShadow,
  },
  webTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#06173e',
    letterSpacing: -0.4,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  webSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    writingDirection: 'rtl',
    maxWidth: 360,
  },

  webForm: {
    paddingHorizontal: 16,
    gap: 14,
  } as any,
  webGridRow: {
    gap: 12,
  } as any,
  webGridCell: {
    flex: 1,
  },

  webFloatingWrap: {
    position: 'relative',
    width: '100%',
  },
  webFloatingInput: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6EAF0',
    backgroundColor: 'transparent',
    paddingRight: 16,
    paddingLeft: 44, // icon space (left)
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  webFloatingInputFocused: {
    borderColor: ui.primary,
  },
  webFloatingLabel: {
    position: 'absolute',
    right: 14,
    top: 18,
    fontSize: 13,
    fontWeight: '800',
    color: '#94a3b8',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    writingDirection: 'rtl',
  },
  webFloatingLabelFloated: {
    top: 6,
    transform: [{ translateY: -6 }, { scale: 0.9 }],
    color: ui.primary,
  },
  webFloatingLeftIcon: {
    position: 'absolute',
    left: 14,
    top: 17,
  },
  webFloatingRightBtn: {
    position: 'absolute',
    right: 10,
    top: 9,
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  webRoleDivider: {
    marginTop: 6,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  } as any,
  webRoleDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  webRoleDividerLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748b',
    writingDirection: 'rtl',
  },

  webRoleGrid: {
    gap: 10,
  } as any,
  webRoleGridCell: {
    width: '100%',
  },
  webRoleCard: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E6EAF0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    textAlign: 'center' as any,
  },
  webRoleCardHover: {
    borderColor: '#cbd5e1',
    backgroundColor: 'rgba(248, 250, 252, 0.6)',
  },
  webRoleCardPressed: {
    transform: [{ scale: 0.995 }],
    opacity: 0.98,
  },
  webRoleCardActive: {
    borderWidth: 2,
    borderColor: ui.primary,
    backgroundColor: 'rgba(6, 23, 62, 0.05)',
  },
  webRoleCardInactive: {},
  webRoleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  webRoleIconWrapActive: {
    backgroundColor: ui.primary,
    borderColor: 'rgba(6, 23, 62, 0.25)',
  },
  webRoleTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#06173e',
    marginBottom: 4,
    writingDirection: 'rtl',
  },
  webRoleTitleActive: {
    color: '#06173e',
  },
  webRoleSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 16,
  },

  webSubmitBtn: {
    height: 56,
    borderRadius: 22,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    ...baseShadow,
  } as any,
  webSubmitBtnHover: {
    backgroundColor: '#1a2c3d',
  },
  webSubmitBtnPressed: {
    transform: [{ translateY: -1 }],
  },
  webSubmitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    writingDirection: 'rtl',
  },
  webSubmitArrow: {
    transform: [{ rotate: isRTL ? '180deg' : '0deg' }],
  },

  mobileBg: {
    ...StyleSheet.absoluteFillObject,
  },
  mobileBgHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  mobileBgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
  },
  mobileContent: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  mobileTopBarSticky: {
    backgroundColor: 'rgba(247,250,255,0.96)',
    paddingBottom: 10,
    zIndex: 10,
  },
  mobileTopBar: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileTopBarRightGroup: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    flex: 1,
  },
  mobileTopBarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  mobileTopBarTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#06173e',
    textAlign: rtlTextAlign,
  },
  mobileTopBarPlaceholder: {
    width: 44,
    height: 44,
  },
  mobileDemoNote: {
    flexDirection: isRTL ? 'row' : 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  mobileDemoNoteIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
  },
  mobileHeroCard: {
    borderRadius: 30,
    padding: 18,
    marginBottom: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  mobileHeroCardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  mobileHeroTextWrap: {
    alignItems: ALIGN_RIGHT,
    marginBottom: 14,
    gap: 6,
  },
  mobileSectionTitleRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    alignSelf: ALIGN_RIGHT,
    gap: 8,
    width: '100%',
  },
  mobileSectionTitleIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileHeroTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#06173e',
    textAlign: rtlTextAlign,
    flexShrink: 1,
  },
  mobileHeroSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748b',
    textAlign: rtlTextAlign,
    width: '100%',
  },
  mobileSectionCard: {
    borderRadius: 28,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  mobileSectionHeader: {
    alignItems: ALIGN_RIGHT,
    marginBottom: 14,
    gap: 4,
  },
  mobileSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#06173e',
    textAlign: rtlTextAlign,
    flexShrink: 1,
  },
  mobileSectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748b',
    textAlign: rtlTextAlign,
  },
  mobilePrimaryButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  mobileBottomSubmitButton: {
    marginTop: 6,
    marginBottom: 8,
  },
  mobilePrimaryButtonGradient: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },

  headerSurface: {
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(6, 23, 62, 0.10)',
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

  content: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
  },

  demoNote: {
    flexDirection: isRTL ? 'row' : 'row-reverse',
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
    marginTop: 4,
    marginBottom: 2,
  },
  avatarPressable: { alignItems: 'center' },
  avatarCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarCta: { fontSize: 14, fontWeight: '900', color: ui.primary, textAlign: 'center' },
  removeAvatarBtn: {
    flexDirection: isRTL ? 'row' : 'row-reverse',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.18)',
    marginTop: 10,
  },
  removeAvatarText: { fontSize: 12, fontWeight: '900', color: '#F44336', textAlign: rtlTextAlign },

  fields: {
    marginTop: 6,
    alignItems: ALIGN_RIGHT,
  },
  fieldGroup: { marginBottom: 14, width: '100%', alignItems: ALIGN_RIGHT },
  label: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: rtlTextAlign,
  },
  input: {
    height: 54,
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '800',
    width: '100%',
  },
  inputRtl: {
    textAlign: rtlTextAlign,
  },
  inputLtr: { textAlign: 'left' },
  inputFocused: {
    borderColor: ui.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  divider: {
    height: 1,
    marginVertical: 14,
    marginHorizontal: 6,
  },

  inputRow: { position: 'relative', justifyContent: 'center' },
  passwordInputRow: {
    position: 'relative',
    justifyContent: 'center',
    width: '100%',
  },
  passwordInput: {
    width: '100%',
    minHeight: 58,
    borderRadius: 20,
  },
  inputInRow: {
    paddingRight: 16,
    paddingLeft: 52,
  },
  eyeBtn: {
    position: 'absolute',
    left: 10,
    height: 58,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  roleSection: {
    marginTop: 4,
    paddingTop: 2,
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: rtlTextAlign,
    marginBottom: 10,
  },
  roleSegment: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  // New: super-stable segmented container (no shadows, strong contrast)
  roleSegmentV3: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 5,
    alignSelf: 'stretch',
  },
  roleOption: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  roleOptionInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  roleOptionActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
  },
  roleOptionText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  roleOptionTextInactive: {
    color: '#475569', // slate-600
  },
  roleOptionTextActive: {
    color: ui.primary,
  },

  footerBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  // New: very simple primary button (no shadow, no transforms)
  primaryButtonV3: {
    height: 48,
    borderRadius: 14,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  primaryButtonText: { color: 'white', fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },

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

