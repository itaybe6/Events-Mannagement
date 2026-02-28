import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { authService } from '@/lib/services/authService';
import { userService, type UserWithMetadata } from '@/lib/services/userService';
import { avatarService, type UploadableImage } from '@/lib/services/avatarService';

type UserType = 'event_owner' | 'admin' | 'employee';

const BRAND_RGB = {
  primary: '6,23,62', // colors.primary = #06173e
  secondary: '204,160,0', // colors.secondary = #CCA000
  accent: '240,203,70', // colors.accent = #F0CB46
} as const;

const ROLE_OPTIONS: Array<{
  value: UserType;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}> = [
  { value: 'admin', title: 'מנהל', subtitle: 'ניהול משתמשים, אירועים והגדרות', icon: 'admin-panel-settings' },
  { value: 'employee', title: 'עובד', subtitle: 'גישה לתפעול בלבד (לפי הרשאות)', icon: 'badge' },
  { value: 'event_owner', title: 'בעל אירוע', subtitle: 'ניהול אירועים ותוכן לפי הרשאה', icon: 'emoji-events' },
];

export default function AddUserV2WebScreen() {
  const router = useRouter();
  const { isLoggedIn, userType } = useUserStore();
  const addDemoUser = useDemoUsersStore((s) => s.addUser);
  const { width } = useWindowDimensions();

  const isTwoCol = Platform.OS === 'web' && width >= 860;

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [avatarImage, setAvatarImage] = useState<UploadableImage | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    user_type: 'event_owner' as UserType,
  });

  const canSubmit = useMemo(() => {
    return Boolean(form.name.trim() && form.email.trim() && form.password.trim() && form.confirmPassword.trim());
  }, [form]);

  useEffect(() => {
    if (!isLoggedIn || userType !== 'admin') {
      router.replace('/login');
    }
  }, [isLoggedIn, userType, router]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setChecking(true);
        const r = await authService.testConnection();
        if (!alive) return;
        setIsDemoMode(!r.success);
      } catch {
        if (!alive) return;
        setIsDemoMode(true);
      } finally {
        if (!alive) return;
        setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setField = useCallback((key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const pickAvatarImage = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setErrorText('כדי לבחור תמונה יש לאשר גישה לגלריה.');
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
      const asset = result.assets[0];
      setAvatarImage({
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        file: (asset as any)?.file,
        base64: asset.base64,
      });
      setErrorText(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      setErrorText(`לא ניתן לבחור תמונה.\n${msg}`);
    }
  }, []);

  const removeAvatarImage = useCallback(() => {
    setAvatarImage(null);
  }, []);

  const onSubmit = useCallback(async () => {
    if (submitting) return;
    setErrorText(null);
    setSuccessText(null);

    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const password = form.password;
    const confirmPassword = form.confirmPassword;

    if (!name || !email || !password) {
      setErrorText('יש למלא שם, אימייל וסיסמה.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorText('הסיסמאות אינן תואמות.');
      return;
    }
    if (password.length < 6) {
      setErrorText('הסיסמה חייבת להכיל לפחות 6 תווים.');
      return;
    }

    setSubmitting(true);
    try {
      if (isDemoMode) {
        const demoUser: UserWithMetadata = {
          id: `demo-${Date.now()}`,
          name: `${name} (דמו)`,
          email,
          phone: phone || undefined,
          avatar_url: avatarImage?.uri,
          userType: form.user_type,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          events_count: 0,
          last_login: undefined,
        };
        addDemoUser(demoUser);
        setSuccessText('מצב דמו: המשתמש נוסף מקומית (לא נשמר בדאטאבייס).');
        setTimeout(() => router.replace('/users'), 800);
        return;
      }

      const createdUser = await userService.createUser(email, password, name, form.user_type, phone || undefined);
      if (avatarImage) {
        await avatarService.uploadUserAvatar(createdUser.id, avatarImage);
      }
      setSuccessText('המשתמש נוסף בהצלחה.');
      setTimeout(() => router.replace('/users'), 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      setErrorText(`לא ניתן להוסיף משתמש.\n${msg}`);
    } finally {
      setSubmitting(false);
    }
  }, [addDemoUser, form, isDemoMode, submitting, avatarImage]);

  const RoleCard = ({
    value,
    title,
    subtitle,
    icon,
  }: {
    value: UserType;
    title: string;
    subtitle: string;
    icon: keyof typeof MaterialIcons.glyphMap;
  }) => {
    const active = form.user_type === value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`בחירת תפקיד ${title}`}
        onPress={() => setForm((p) => ({ ...p, user_type: value }))}
        style={({ hovered, pressed }: any) => [
          styles.roleCard,
          active ? styles.roleCardActive : null,
          Platform.OS === 'web' && hovered ? styles.roleCardHover : null,
          pressed ? styles.roleCardPressed : null,
        ]}
      >
        <View style={[styles.roleIconWrap, active ? styles.roleIconWrapActive : null]}>
          <MaterialIcons name={icon} size={22} color={active ? colors.white : colors.primary} />
        </View>
        <Text style={[styles.roleTitle, active ? styles.roleTitleActive : null]}>{title}</Text>
        <Text style={styles.roleSubtitle}>{subtitle}</Text>
        {active ? (
          <View style={styles.roleCheck}>
            <MaterialIcons name="check-circle" size={18} color={colors.secondary} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חזרה לרשימה"
          onPress={() => router.back()}
          style={({ hovered, pressed }: any) => [
            styles.backBtn,
            Platform.OS === 'web' && hovered ? styles.backBtnHover : null,
            pressed ? styles.backBtnPressed : null,
          ]}
        >
          <MaterialIcons name="arrow-forward" size={18} color={colors.gray[700]} style={styles.backBtnIcon} />
          <Text style={styles.backBtnText}>חזרה לרשימה</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.main}
        contentContainerStyle={styles.mainContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerGlow} pointerEvents="none" />
            <View style={styles.headerGlow2} pointerEvents="none" />

            <View style={styles.headerText}>
              <Text style={styles.title}>יצירת משתמש חדש</Text>
              <Text style={styles.subtitle}>הוספת משתמש למערכת וניהול תפקידים והרשאות — הכל לפי צבעי המותג.</Text>
            </View>

            <View style={styles.headerIcon} pointerEvents="none">
              <View style={styles.headerIconInner}>
                <MaterialIcons name="person-add-alt-1" size={42} color={colors.primary} />
              </View>
            </View>
          </View>

          <View style={styles.cardBody}>
            {checking ? (
              <View style={styles.bannerInfo}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.bannerInfoText}>בודק חיבור לדאטאבייס...</Text>
              </View>
            ) : isDemoMode ? (
              <View style={styles.bannerWarn}>
                <MaterialIcons name="info" size={18} color={colors.primary} />
                <Text style={styles.bannerWarnText}>מצב דמו: לא ניתן להתחבר לדאטאבייס. המשתמש יתווסף מקומית בלבד.</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>בחר/י סוג משתמש</Text>
              <View style={[styles.roleGrid, isTwoCol ? styles.roleGrid3 : styles.roleGrid1]}>
                {ROLE_OPTIONS.map((opt) => (
                  <RoleCard key={opt.value} {...opt} />
                ))}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>תמונת פרופיל</Text>
              <View style={styles.avatarRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="בחר תמונת פרופיל"
                  onPress={pickAvatarImage}
                  style={({ hovered, pressed }: any) => [
                    styles.avatarPreviewWrap,
                    Platform.OS === 'web' && hovered ? styles.avatarPreviewWrapHover : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  {avatarImage ? (
                    <Image source={{ uri: avatarImage.uri }} style={styles.avatarPreviewImg} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <MaterialIcons name="add-a-photo" size={32} color={colors.gray[500]} />
                    </View>
                  )}
                </Pressable>
                <View style={styles.avatarActions}>
                  <Text style={styles.avatarHint}>תמונה אופציונלית. בחר/י מתמונות המכשיר.</Text>
                  <View style={styles.avatarBtnRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="בחר תמונה"
                      onPress={pickAvatarImage}
                      style={({ hovered, pressed }: any) => [
                        styles.avatarActionBtn,
                        Platform.OS === 'web' && hovered ? styles.avatarActionBtnHover : null,
                        pressed ? { opacity: 0.9 } : null,
                      ]}
                    >
                      <MaterialIcons name="photo-library" size={18} color={colors.primary} />
                      <Text style={styles.avatarActionText}>בחר תמונה</Text>
                    </Pressable>
                    {avatarImage ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="הסר תמונה"
                        onPress={removeAvatarImage}
                        style={({ hovered, pressed }: any) => [
                          styles.avatarRemoveBtn,
                          Platform.OS === 'web' && hovered ? styles.avatarRemoveBtnHover : null,
                          pressed ? { opacity: 0.9 } : null,
                        ]}
                      >
                        <MaterialIcons name="close" size={18} color={colors.gray[700]} />
                        <Text style={styles.avatarRemoveText}>הסר</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>פרטים אישיים</Text>
              <View style={[styles.formGrid, isTwoCol ? styles.formGrid2 : styles.formGrid1]}>
                <InputField
                  label="שם מלא"
                  icon="person"
                  value={form.name}
                  onChangeText={(t) => setField('name', t)}
                  placeholder="הכנס/י שם מלא"
                  textAlign="right"
                />
                <InputField
                  label="מספר טלפון"
                  icon="call"
                  value={form.phone}
                  onChangeText={(t) => setField('phone', t)}
                  placeholder="050-0000000"
                  keyboardType="phone-pad"
                  textAlign="right"
                  writingDirection="ltr"
                />
                <View style={styles.gridSpan2}>
                  <InputField
                    label="אימייל"
                    icon="mail"
                    value={form.email}
                    onChangeText={(t) => setField('email', t)}
                    placeholder="your@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    textAlign="right"
                    writingDirection="ltr"
                  />
                </View>
                <InputField
                  label="סיסמה"
                  icon="lock"
                  value={form.password}
                  onChangeText={(t) => setField('password', t)}
                  placeholder="******"
                  secureTextEntry={!showPassword}
                  textAlign="right"
                  rightAction={{
                    accessibilityLabel: showPassword ? 'הסתר סיסמה' : 'הצג סיסמה',
                    icon: showPassword ? 'visibility-off' : 'visibility',
                    onPress: () => setShowPassword((v) => !v),
                  }}
                />
                <InputField
                  label="אימות סיסמה"
                  icon="verified-user"
                  value={form.confirmPassword}
                  onChangeText={(t) => setField('confirmPassword', t)}
                  placeholder="******"
                  secureTextEntry={!showConfirmPassword}
                  textAlign="right"
                  rightAction={{
                    accessibilityLabel: showConfirmPassword ? 'הסתר אימות סיסמה' : 'הצג אימות סיסמה',
                    icon: showConfirmPassword ? 'visibility-off' : 'visibility',
                    onPress: () => setShowConfirmPassword((v) => !v),
                  }}
                />
              </View>
            </View>

            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
            {successText ? <Text style={styles.successText}>{successText}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={() => router.back()}
                style={({ hovered, pressed }: any) => [
                  styles.cancelBtn,
                  Platform.OS === 'web' && hovered ? styles.cancelBtnHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={styles.cancelText}>ביטול</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור משתמש"
                onPress={onSubmit}
                disabled={!canSubmit || submitting}
                style={({ hovered, pressed }: any) => [
                  styles.primaryBtn,
                  (!canSubmit || submitting) ? styles.primaryBtnDisabled : null,
                  Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
                  pressed ? styles.primaryBtnPressed : null,
                ]}
              >
                <View style={styles.primaryBtnShine} pointerEvents="none" />
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <MaterialIcons name="add" size={20} color={colors.white} />
                    <Text style={styles.primaryBtnText}>הוסף משתמש</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function InputField(props: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  textAlign: 'right' | 'left';
  writingDirection?: 'rtl' | 'ltr';
  keyboardType?: any;
  autoCapitalize?: any;
  rightAction?: { accessibilityLabel: string; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void };
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, focused ? styles.fieldLabelFocused : null]}>{props.label}</Text>
      <View style={[styles.inputWrap, focused ? styles.inputWrapFocused : null]}>
        <MaterialIcons name={props.icon} size={20} color={focused ? colors.primary : colors.gray[500]} style={styles.inputIcon} />
        <TextInput
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder={props.placeholder}
          placeholderTextColor={colors.gray[500]}
          secureTextEntry={props.secureTextEntry}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            { textAlign: props.textAlign, writingDirection: props.writingDirection as any },
            props.rightAction ? styles.inputWithRightAction : null,
          ]}
          keyboardType={props.keyboardType}
          autoCapitalize={props.autoCapitalize}
          autoCorrect={false}
        />
        {props.rightAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.rightAction.accessibilityLabel}
            onPress={props.rightAction.onPress}
            style={({ pressed }: any) => [styles.inputRightAction, pressed ? { opacity: 0.85 } : null]}
          >
            <MaterialIcons name={props.rightAction.icon} size={20} color={focused ? colors.primary : colors.gray[500]} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.gray[50],
    ...(Platform.OS === 'web'
      ? ({
          minHeight: '100vh',
          direction: 'rtl',
          backgroundImage: `radial-gradient(1000px 520px at 18% 12%, rgba(${BRAND_RGB.secondary}, 0.14) 0%, rgba(${BRAND_RGB.secondary}, 0.00) 62%),
            radial-gradient(1200px 640px at 90% 18%, rgba(${BRAND_RGB.primary}, 0.12) 0%, rgba(${BRAND_RGB.primary}, 0.00) 60%),
            linear-gradient(135deg, ${colors.gray[50]} 0%, ${colors.gray[100]} 100%)`,
        } as any)
      : null),
  },

  topBar: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },

  backBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.10)`,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', backdropFilter: 'blur(6px)' } as any) : null),
  } as any,
  backBtnHover: { backgroundColor: 'rgba(255,255,255,0.92)' },
  backBtnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  backBtnText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], writingDirection: 'rtl' },
  backBtnIcon: { transform: [{ rotate: '180deg' }] },

  main: { flex: 1 },
  mainContent: {
    paddingHorizontal: Platform.OS === 'web' ? 28 : 16,
    paddingTop: 10,
    paddingBottom: 34,
    flexGrow: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },

  card: {
    width: '100%',
    maxWidth: '100%' as any,
    backgroundColor: colors.white,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.10)`,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 10,
  },

  cardHeader: {
    position: 'relative',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: `rgba(${BRAND_RGB.primary}, 0.08)`,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: `linear-gradient(90deg, rgba(${BRAND_RGB.primary}, 0.06) 0%, rgba(${BRAND_RGB.secondary}, 0.10) 50%, rgba(255,255,255, 1) 100%)`,
        } as any)
      : ({ backgroundColor: 'rgba(6,23,62,0.04)' } as any)),
  } as any,
  headerGlow: {
    position: 'absolute',
    top: -30,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: `rgba(${BRAND_RGB.secondary}, 0.22)`,
    ...(Platform.OS === 'web' ? ({ filter: 'blur(34px)' } as any) : null),
  } as any,
  headerGlow2: {
    position: 'absolute',
    bottom: -40,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: `rgba(${BRAND_RGB.primary}, 0.14)`,
    ...(Platform.OS === 'web' ? ({ filter: 'blur(42px)' } as any) : null),
  } as any,
  headerText: { gap: 6, paddingLeft: 110 },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  subtitle: { fontSize: 14, fontWeight: '700', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl', maxWidth: 560 },
  headerIcon: { position: 'absolute', left: 18, top: 22 },
  headerIconInner: {
    width: 86,
    height: 86,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.10)`,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 18px 38px rgba(${BRAND_RGB.primary}, 0.10)`, transform: 'rotate(6deg)' } as any)
      : null),
  } as any,

  cardBody: { padding: 22, gap: 16 },

  bannerInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.14)`,
    backgroundColor: `rgba(${BRAND_RGB.primary}, 0.06)`,
  },
  bannerInfoText: { fontSize: 12, fontWeight: '900', color: colors.text, writingDirection: 'rtl' },
  bannerWarn: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.secondary}, 0.30)`,
    backgroundColor: `rgba(${BRAND_RGB.secondary}, 0.14)`,
  },
  bannerWarnText: { flex: 1, fontSize: 12, fontWeight: '900', color: colors.text, writingDirection: 'rtl' },

  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  divider: { height: 1, width: '100%', backgroundColor: `rgba(${BRAND_RGB.primary}, 0.08)` },

  avatarRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
  },
  avatarPreviewWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.14)`,
    backgroundColor: colors.gray[100],
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  } as any,
  avatarPreviewWrapHover: { borderColor: `rgba(${BRAND_RGB.primary}, 0.28)` },
  avatarPreviewImg: { width: '100%', height: '100%', borderRadius: 44 },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActions: { flex: 1, gap: 8 },
  avatarHint: { fontSize: 12, fontWeight: '700', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  avatarBtnRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  avatarActionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.18)`,
    backgroundColor: `rgba(${BRAND_RGB.primary}, 0.04)`,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  } as any,
  avatarActionBtnHover: { backgroundColor: `rgba(${BRAND_RGB.primary}, 0.08)` },
  avatarActionText: { fontSize: 13, fontWeight: '800', color: colors.primary, writingDirection: 'rtl' },
  avatarRemoveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  } as any,
  avatarRemoveBtnHover: { backgroundColor: `rgba(${BRAND_RGB.primary}, 0.06)` },
  avatarRemoveText: { fontSize: 12, fontWeight: '800', color: colors.gray[700], writingDirection: 'rtl' },

  roleGrid: {
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          alignItems: 'stretch',
        } as any)
      : null),
  } as any,
  roleGrid1: {
    ...(Platform.OS === 'web'
      ? ({
          gridTemplateColumns: '1fr',
        } as any)
      : null),
  } as any,
  roleGrid3: {
    ...(Platform.OS === 'web'
      ? ({
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        } as any)
      : null),
  } as any,

  roleCard: {
    position: 'relative',
    minHeight: 122,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.10)`,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as any,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transitionProperty: 'transform, box-shadow, border-color, background-color', transitionDuration: '180ms' } as any) : null),
  } as any,
  roleCardHover: {
    borderColor: `rgba(${BRAND_RGB.primary}, 0.16)`,
    backgroundColor: `rgba(${BRAND_RGB.primary}, 0.03)`,
    ...(Platform.OS === 'web' ? ({ boxShadow: `0 18px 46px rgba(${BRAND_RGB.primary}, 0.10)` } as any) : null),
  } as any,
  roleCardPressed: { transform: [{ scale: 0.995 }], opacity: 0.98 },
  roleCardActive: {
    borderWidth: 2,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.92)`,
    backgroundColor: `rgba(${BRAND_RGB.primary}, 0.05)`,
    ...(Platform.OS === 'web' ? ({ boxShadow: `0 22px 58px rgba(${BRAND_RGB.primary}, 0.14)` } as any) : null),
  } as any,
  roleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `rgba(${BRAND_RGB.secondary}, 0.12)`,
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.secondary}, 0.22)`,
    marginBottom: 10,
  },
  roleIconWrapActive: {
    backgroundColor: colors.primary,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.30)`,
  },
  roleTitle: { fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: 4, writingDirection: 'rtl' },
  roleTitleActive: { color: colors.text },
  roleSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 16,
  },
  roleCheck: { position: 'absolute', top: 10, right: 10 },

  formGrid: {
    gap: 12,
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          alignItems: 'start',
        } as any)
      : null),
  } as any,
  formGrid1: {
    ...(Platform.OS === 'web'
      ? ({
          gridTemplateColumns: '1fr',
        } as any)
      : null),
  } as any,
  formGrid2: {
    ...(Platform.OS === 'web'
      ? ({
          gridTemplateColumns: '1fr 1fr',
        } as any)
      : null),
  } as any,
  gridSpan2: {
    ...(Platform.OS === 'web'
      ? ({
          gridColumn: '1 / -1',
        } as any)
      : null),
  } as any,

  field: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  fieldLabelFocused: { color: colors.primary },
  inputWrap: {
    position: 'relative',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.primary}, 0.12)`,
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(8px)' } as any) : null),
  } as any,
  inputWrapFocused: {
    borderColor: `rgba(${BRAND_RGB.primary}, 0.40)`,
    ...(Platform.OS === 'web' ? ({ boxShadow: `0 0 0 4px rgba(${BRAND_RGB.primary}, 0.10)` } as any) : null),
  } as any,
  inputIcon: { position: 'absolute', right: 12, top: 16 },
  input: {
    height: 52,
    paddingRight: 42,
    paddingLeft: 14,
    borderRadius: 16,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
        } as any)
      : null),
  } as any,
  inputWithRightAction: { paddingLeft: 44 },
  inputRightAction: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 40,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  } as any,

  errorText: { color: colors.error, fontSize: 12, fontWeight: '900', writingDirection: 'rtl', textAlign: 'right' },
  successText: { color: colors.success, fontSize: 12, fontWeight: '900', writingDirection: 'rtl', textAlign: 'right' },

  actions: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: `rgba(${BRAND_RGB.primary}, 0.08)`,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  } as any,
  cancelBtnHover: { backgroundColor: `rgba(${BRAND_RGB.primary}, 0.04)` },
  cancelText: { fontSize: 13, fontWeight: '900', color: colors.gray[700], writingDirection: 'rtl' },

  primaryBtn: {
    position: 'relative',
    height: 54,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 10,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: `rgba(${BRAND_RGB.secondary}, 0.22)`,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: `0 20px 48px rgba(${BRAND_RGB.primary}, 0.22)`,
          backgroundImage: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.oxfordBlue} 55%, ${colors.primary} 100%)`,
        } as any)
      : null),
  } as any,
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnHover: { opacity: 0.98 },
  primaryBtnPressed: { transform: [{ translateY: -1 }], opacity: 0.98 },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: '900', writingDirection: 'rtl' },
  primaryBtnShine: {
    position: 'absolute',
    left: -40,
    top: -10,
    width: 60,
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ skewX: '-18deg' }],
    ...(Platform.OS === 'web'
      ? ({
          transitionProperty: 'transform',
          transitionDuration: '600ms',
        } as any)
      : null),
  } as any,
});
