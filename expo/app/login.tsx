import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { LottieAnimation } from '@/components/LottieAnimation';
import { LavaLampBackground } from '@/components/LavaLampBackground';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { authService } from '@/lib/services/authService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';

const { height } = Dimensions.get('window');

const NAVY_DEEP = '#010c21';
const HERO_HEIGHT = Math.max(280, height * 0.47);

function RingsHeroIcon() {
  return (
    <View style={styles.heroIconWrap} pointerEvents="none">
      {/* Bride/Groom animation centered inside the rings */}
      <LottieAnimation
        source={require('../assets/animations/83J2Ko52jU.json')}
        style={styles.heroLottie}
        autoPlay
        loop
        speed={0.85}
      />
    </View>
  );
}

function StarField() {
  const stars = useMemo(
    () => [
      { x: 18, y: 30, s: 1.2, o: 0.55 },
      { x: 44, y: 70, s: 1.1, o: 0.45 },
      { x: 55, y: 160, s: 1.7, o: 0.35 },
      { x: 92, y: 45, s: 2.2, o: 0.3 },
      { x: 135, y: 84, s: 1.1, o: 0.4 },
      { x: 160, y: 122, s: 1.6, o: 0.3 },
      { x: 210, y: 60, s: 1.2, o: 0.35 },
      { x: 250, y: 140, s: 1.4, o: 0.28 },
      { x: 310, y: 95, s: 2.0, o: 0.22 },
      { x: 340, y: 25, s: 1.0, o: 0.35 },
      { x: 30, y: 190, s: 1.2, o: 0.25 },
      { x: 120, y: 210, s: 1.1, o: 0.2 },
      { x: 280, y: 210, s: 1.2, o: 0.18 },
    ],
    []
  );

  return (
    <View style={styles.starsLayer} pointerEvents="none">
      {stars.map((star, idx) => (
        <View
          // eslint-disable-next-line react/no-array-index-key
          key={idx}
          style={[
            styles.starDot,
            {
              width: star.s * 2,
              height: star.s * 2,
              opacity: star.o,
              transform: [{ translateX: star.x }, { translateY: star.y }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useUserStore();
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    try {
      setErrorMessage(null);
      setLoading(true);
      // התחברות ל-Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username.trim(),
        password: password.trim(),
      });

      if (error || !data.user) {
        const msg = error?.message ?? '';
        if (
          typeof msg === 'string' &&
          (msg.includes('Network request failed') || msg.includes('Failed to fetch'))
        ) {
          setErrorMessage(
            'אין גישה לשרת Supabase (רשת או כתובת פרויקט). בדוק ב-Supabase → Settings → API שה־Project URL ב־.env תואם (EXPO_PUBLIC_SUPABASE_URL), ואז הרץ מחדש עם ניקוי מטמון: npx expo start --clear.'
          );
        } else if (typeof msg === 'string' && msg.includes('Email not confirmed')) {
          setErrorMessage('יש לאמת את כתובת המייל לפני ההתחברות.');
        } else if (typeof msg === 'string' && msg.includes('Too many requests')) {
          setErrorMessage('יותר מדי ניסיונות התחברות. נסה שוב מאוחר יותר.');
        } else {
          setErrorMessage('מייל או סיסמה שגויים. נסה שוב.');
        }
        return;
      }

      const authedUser = data.user;
      const authedUserId = authedUser.id;

      // משוך את פרטי המשתמש מטבלת users לפי ה-id (מתאים ל-RLS)
      let { data: userRow, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authedUserId)
        .maybeSingle();

      // אם אין פרופיל, ננסה ליצור אחד מה-metadata (אם קיים)
      if (userError || !userRow) {
        const meta = (authedUser.user_metadata ?? {}) as Record<string, any>;
        const metaUserType = meta.user_type;
        const normalizedMetaUserType = metaUserType === 'couple' ? 'event_owner' : metaUserType;
        const inferredUserType =
          normalizedMetaUserType === 'admin' ||
          normalizedMetaUserType === 'employee' ||
          normalizedMetaUserType === 'event_owner'
            ? normalizedMetaUserType
            : 'event_owner';

        const inferredName =
          typeof meta.name === 'string' && meta.name.trim()
            ? meta.name.trim()
            : authedUser.email?.split('@')[0] || 'User';

        // Attempt to create the profile row (requires RLS insert policy).
        const { error: upsertError } = await supabase.from('users').upsert({
          id: authedUserId,
          email: authedUser.email,
          name: inferredName,
          user_type: inferredUserType,
        }, { onConflict: 'id' });

        if (!upsertError) {
          const retry = await supabase
            .from('users')
            .select('*')
            .eq('id', authedUserId)
            .maybeSingle();
          userRow = retry.data as any;
          userError = retry.error as any;
        }

        if (userError || !userRow) {
          console.error('User profile fetch/create error:', { userError, upsertError });
          Alert.alert(
            'שגיאה',
            'לא נמצא פרופיל משתמש בדאטאבייס (users). ודא שהרצת את ה-SQL ב-supabase/schema.sql וש-RLS מוגדר נכון.',
            [{ text: 'אישור', style: 'default' }]
          );
          setLoading(false);
          return;
        }
      }

      if (!userRow.event_id && userRow.user_type === 'event_owner') {
        const resolvedEventId = await authService.getPrimaryEventId(userRow.id);
        if (resolvedEventId) {
          userRow.event_id = resolvedEventId;
        }
      }

      // התחברות עם פונקציית login שלך
      login(userRow.user_type, {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        phone: userRow.phone || undefined,
        avatar_url: userRow.avatar_url || undefined,
        event_id: userRow.event_id,
        userType: userRow.user_type,
      });

      // ניתוב לקבוצת טאבים לפי סוג משתמש
      if (userRow.user_type === 'admin' || userRow.user_type === 'employee') {
        eventService.prefetchEventsList();
        router.replace('/(admin)/admin-events');
      } else {
        router.replace('/(couple)');
      }
    } catch (error) {
      console.error('Login error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('Network request failed') ||
        msg.includes('Failed to fetch')
      ) {
        setErrorMessage(
          'אין גישה לשרת Supabase (רשת או כתובת פרויקט). עדכן את EXPO_PUBLIC_SUPABASE_URL מלוח הבקרה של Supabase והרץ npx expo start --clear.'
        );
      } else {
        setErrorMessage('אירעה שגיאה במהלך ההתחברות. נסה שוב.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isLoginDisabled = !username.trim() || !password.trim() || loading;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY_DEEP} />

      <AppKeyboardAwareScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 18) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          enableResetScrollToCoords={false}
          extraHeight={120}
          extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
          keyboardOpeningTime={Platform.OS === 'ios' ? 0 : 100}
        >
        {/* Top hero (55%) */}
        <View style={styles.hero}>
          <LavaLampBackground height={HERO_HEIGHT} />
          <StarField />
          <View style={styles.glow} pointerEvents="none" />

          <View style={styles.heroCenter}>
            <RingsHeroIcon />
          </View>
        </View>

        {/* Bottom floating card */}
        <View style={styles.cardArea}>
          <View style={styles.card}>
            <View style={styles.brandWrap}>
              <Image
                source={require('../assets/images/logo-moon.png')}
                style={styles.brandLogo}
                resizeMode="contain"
                accessibilityLabel="לוגו"
              />
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandTitle}>ברוכים הבאים</Text>
                <Text style={styles.brandSubtitle}>
                  התחברו והשלימו את הפרטים שלכם כדי להמשיך לחוויה האישית שלכם.
                </Text>
              </View>
            </View>

            {/* Form */}
            <View style={styles.form}>
              {/* Email */}
              <View style={styles.field}>
                <View style={styles.fieldIconLeading} pointerEvents="none">
                  <Ionicons name="mail-outline" size={20} color={colors.gray[500]} />
                </View>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="אימייל"
                  placeholderTextColor={colors.gray[500]}
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textAlign="right"
                />
              </View>

              {/* Password */}
              <View style={styles.field}>
                <View style={styles.fieldIconLeading} pointerEvents="none">
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={colors.gray[500]}
                  />
                </View>

                <TextInput
                  style={[styles.fieldInput, { paddingLeft: 46 }]}
                  placeholder="סיסמה"
                  placeholderTextColor={colors.gray[500]}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="right"
                />

                <TouchableOpacity
                  style={styles.fieldIconTrailingButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityLabel={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.gray[500]}
                  />
                </TouchableOpacity>
              </View>

              {errorMessage ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, isLoginDisabled && styles.primaryButtonDisabled]}
                onPress={handleLogin}
                disabled={isLoginDisabled}
                activeOpacity={0.92}
              >
                <Text style={[styles.primaryButtonText, isLoginDisabled && styles.primaryButtonTextDisabled]}>
                  {loading ? 'מתחבר...' : 'התחבר'}
                </Text>
                <Ionicons
                  name="arrow-back"
                  size={18}
                  color={isLoginDisabled ? 'rgba(255,255,255,0.8)' : colors.white}
                  style={{ marginLeft: 8 }}
                />
              </TouchableOpacity>

              <View style={styles.signupWrap}>
                <Text style={styles.signupText}>עדיין אין לך חשבון? </Text>
                <TouchableOpacity
                  onPress={() => router.push('/signup')}
                  accessibilityRole="link"
                  accessibilityLabel="מעבר למסך הרשמה"
                  activeOpacity={0.7}
                >
                  <Text style={styles.signupLink}>הירשם</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
        </AppKeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
    backgroundColor: colors.white,
  },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: NAVY_DEEP,
    overflow: 'hidden',
  },
  starsLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
  },
  starDot: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
  },
  glow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 280,
    height: 280,
    marginLeft: -140,
    marginTop: -140,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  heroIconWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  heroLottie: {
    width: 196,
    height: 196,
  },

  cardArea: {
    backgroundColor: colors.white,
  },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -34,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
    minHeight: Math.max(360, height * 0.48),
  },

  brandWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  brandLogo: {
    width: 292,
    height: 90,
  },
  brandTextWrap: {
    marginTop: 2,
    alignItems: 'center',
    maxWidth: 320,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: NAVY_DEEP,
    textAlign: 'center',
    marginBottom: 8,
  },
  brandSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.gray[600],
    textAlign: 'center',
  },

  form: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  field: {
    position: 'relative',
    backgroundColor: colors.gray[50],
    borderRadius: 18,
    marginBottom: 14,
    paddingRight: 46,
    paddingLeft: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  fieldIconLeading: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldIconTrailingButton: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  fieldInput: {
    height: 56,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 14,
  },

  errorBox: {
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.20)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 18,
  },

  primaryButton: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 9999,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(6,23,62,0.55)',
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
  primaryButtonTextDisabled: {
    color: 'rgba(255,255,255,0.92)',
  },

  signupWrap: {
    marginTop: 22,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  signupText: {
    fontSize: 13,
    color: colors.gray[600],
  },
  signupLink: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textDecorationLine: 'underline',
  },
}); 