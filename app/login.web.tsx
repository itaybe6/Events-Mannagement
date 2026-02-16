import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/services/authService';

export default function LoginWebScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useUserStore();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 900;

  const theme = useMemo(
    () => ({
      primary: '#0b1c41',
      primaryLight: '#1a2f5c',
      accent: '#C6A85B',
      bgLight: '#f6f6f8',
      bgDark: '#121620',
      cardShadow: 'rgba(11, 28, 65, 0.08)',
    }),
    []
  );

  const handleLogin = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: username.trim(),
        password: password.trim(),
      });

      if (error || !data.user) {
        Alert.alert('שגיאה בהתחברות', 'מייל או סיסמה שגויים. נסה שוב.');
        return;
      }

      const authedUser = data.user;
      const authedUserId = authedUser.id;

      let { data: userRow, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authedUserId)
        .maybeSingle();

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
            'לא נמצא פרופיל משתמש בדאטאבייס (users). ודא שהרצת את ה-SQL ב-supabase/schema.sql וש-RLS מוגדר נכון.'
          );
          return;
        }
      }

      if (!userRow.event_id && userRow.user_type === 'event_owner') {
        const resolvedEventId = await authService.getPrimaryEventId(userRow.id);
        if (resolvedEventId) {
          userRow.event_id = resolvedEventId;
        }
      }

      login(userRow.user_type, {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        phone: userRow.phone || undefined,
        avatar_url: userRow.avatar_url || undefined,
        event_id: userRow.event_id,
        userType: userRow.user_type,
      });

      if (userRow.user_type === 'admin') {
        router.replace('/(admin)/admin-events');
      } else if (userRow.user_type === 'employee') {
        router.replace('/(employee)/employee-events');
      } else {
        router.replace('/(couple)');
      }
    } catch (e) {
      Alert.alert('שגיאה בהתחברות', 'אירעה שגיאה במהלך ההתחברות. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = !username.trim() || !password.trim() || loading;

  return (
    <View style={[styles.page, { backgroundColor: theme.bgLight }]}>
      <View
        style={[
          styles.shell,
          {
            flexDirection: isDesktop ? 'row' : 'column',
          },
        ]}
      >
        {/* LEFT: Visual Branding */}
        <View
          style={[
            styles.hero,
            {
              width: isDesktop ? '50%' : '100%',
              minHeight: isDesktop ? '100%' : 360,
              backgroundColor: theme.primary,
            },
          ]}
        >
          {/* Abstract background (web-only style props are fine here) */}
          <View
            style={[
              styles.moonPattern,
              {
                // @ts-expect-error - react-native-web supports backgroundImage
                backgroundImage: `radial-gradient(circle at 10% 20%, rgba(255, 255, 255, 0.03) 0%, transparent 20%),
                  radial-gradient(circle at 90% 80%, rgba(255, 255, 255, 0.03) 0%, transparent 25%),
                  radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.02) 0%, transparent 40%)`,
              },
            ]}
          />
          <View
            style={[
              styles.heroGlowTop,
              {
                // @ts-expect-error - react-native-web supports backgroundColor alpha
                backgroundColor: 'rgba(26, 47, 92, 0.30)',
              },
            ]}
          />
          <View style={styles.heroBottomFade} />

          <View style={styles.heroContent}>
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroHeadline}>
                מערכת ניהול{'\n'}
                <Text style={[styles.heroHeadlineAccent, { color: theme.accent }]}>
                  אירועים מתקדמת
                </Text>
              </Text>
              <Text style={styles.heroDescription}>
                הפלטפורמה המובילה לניהול אירועים יוקרתיים. כל הכלים שאתם צריכים במקום אחד, בעיצוב
                מוקפד וחוויית משתמש בלתי מתפשרת.
              </Text>
            </View>

            <View style={styles.features}>
              <FeatureRow
                icon="people"
                title="ניהול מוזמנים חכם"
                subtitle="ארגון רשימות, קבוצות ותיוגים בקלות"
                accent={theme.accent}
              />
              <FeatureRow
                icon="event-available"
                title="מעקב אישורי הגעה"
                subtitle="עדכונים בזמן אמת וסטטיסטיקות מדויקות"
                accent={theme.accent}
              />
              <FeatureRow
                icon="dashboard"
                title="שליטה מלאה באירוע"
                subtitle="דוחות מתקדמים וניהול ספקים"
                accent={theme.accent}
              />
            </View>
          </View>

          <Text style={styles.heroFooter}>© 2026 MOON Event Systems. כל הזכויות שמורות.</Text>
        </View>

        {/* RIGHT: Login Form */}
        <View
          style={[
            styles.formSide,
            {
              width: isDesktop ? '50%' : '100%',
              backgroundColor: theme.bgLight,
            },
          ]}
        >
          <View style={styles.formBgBlob} />

          <View
            style={[
              styles.card,
              {
                // @ts-expect-error - react-native-web supports boxShadow
                boxShadow: `0 20px 40px -10px ${theme.cardShadow}`,
              },
            ]}
          >
          <View style={styles.cardLogoWrap}>
            <Image
              source={require('../assets/images/logo-moon.png')}
              style={styles.cardLogo}
              resizeMode="contain"
            />
          </View>

            <View style={styles.form}>
              <Text style={styles.label}>כתובת אימייל</Text>
              <View style={styles.inputWrap}>
                <View style={styles.inputIconRight}>
                  <MaterialIcons name="email" size={20} color={colors.gray[500]} />
                </View>
                <TextInput
                  style={[styles.input, styles.inputLtr]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.gray[500]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>

              <Text style={styles.label}>סיסמה</Text>
              <View style={styles.inputWrap}>
                <View style={styles.inputIconRight}>
                  <MaterialIcons name="lock" size={20} color={colors.gray[500]} />
                </View>
                <TextInput
                  style={[styles.input, styles.inputWithLeftButton]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.gray[500]}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPassword((v) => !v)}
                  style={({ hovered, pressed }) => [
                    styles.leftIconButton,
                    (hovered || pressed) && styles.leftIconButtonHover,
                  ]}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={colors.gray[600]}
                  />
                </Pressable>
              </View>

              <View style={styles.rowBetween}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberMe }}
                  onPress={() => setRememberMe((v) => !v)}
                  style={styles.rememberRow}
                >
                  <View style={[styles.checkbox, rememberMe && { borderColor: theme.primary }]}>
                    {rememberMe ? (
                      <MaterialIcons name="check" size={16} color={theme.primary} />
                    ) : null}
                  </View>
                  <Text style={styles.rememberText}>זכור אותי</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    Alert.alert('איפוס סיסמה', 'לאיפוס סיסמה יש לפנות למנהל המערכת.')
                  }
                >
                  <Text style={[styles.forgotLink, { color: theme.primary }]}>שכחת סיסמה?</Text>
                </Pressable>
              </View>

              <Pressable
                disabled={isDisabled}
                onPress={handleLogin}
                style={({ hovered, pressed }) => [
                  styles.button,
                  { backgroundColor: theme.primary },
                  isDisabled && styles.buttonDisabled,
                  (hovered || pressed) && !isDisabled && styles.buttonHover,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonText}>התחבר</Text>
                )}
              </Pressable>

              {/* אין כפתור הרשמה — רק מנהל מוסיף משתמשים */}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function FeatureRow({
  icon,
  title,
  subtitle,
  accent,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIconBox}>
        <MaterialIcons name={icon} size={22} color={accent} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 24,
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    gap: 20,
  },

  // Hero (left)
  hero: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    padding: 28,
    justifyContent: 'space-between',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  moonPattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
    pointerEvents: 'none',
  },
  heroGlowTop: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 380,
    height: 380,
    borderRadius: 999,
    // @ts-expect-error - react-native-web supports blur via filter
    filter: 'blur(50px)',
    pointerEvents: 'none',
  },
  heroBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    // @ts-expect-error - react-native-web supports backgroundImage
    backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.20), rgba(0,0,0,0))',
    pointerEvents: 'none',
  },
  heroContent: {
    gap: 28,
    zIndex: 1,
    alignItems: 'flex-end',
  },
  heroTextBlock: {
    maxWidth: 520,
    gap: 14,
    alignSelf: 'flex-end',
  },
  heroHeadline: {
    color: colors.white,
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 52,
    textAlign: 'right',
  },
  heroHeadlineAccent: {
    fontWeight: '900',
  },
  heroDescription: {
    color: 'rgba(226, 232, 240, 0.85)',
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '300',
    textAlign: 'right',
  },
  features: {
    gap: 14,
    paddingTop: 4,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'flex-end',
    alignItems: 'stretch',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  featureIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  featureText: {
    gap: 2,
    // בשילוב direction: 'rtl' על השורה, flex-start הוא הצד הימני (צמוד לאייקון)
    alignItems: 'flex-start',
    flex: 1,
  },
  featureTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  featureSubtitle: {
    color: 'rgba(148, 163, 184, 0.85)',
    fontSize: 12,
    textAlign: 'right',
  },
  heroFooter: {
    marginTop: 20,
    zIndex: 1,
    color: 'rgba(100, 116, 139, 0.9)',
    fontSize: 12,
    textAlign: 'right',
  },

  // Form side (right)
  formSide: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  formBgBlob: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: 'rgba(219, 234, 254, 0.55)',
    // @ts-expect-error - react-native-web supports blur via filter
    filter: 'blur(55px)',
    pointerEvents: 'none',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  cardLogoWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  cardLogo: {
    width: 440,
    height: 150,
    maxWidth: '100%',
  },
  form: {
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
  },
  inputWrap: {
    position: 'relative',
  },
  inputIconRight: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    paddingRight: 40,
    paddingLeft: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    textAlign: 'right',
  },
  inputWithLeftButton: {
    paddingLeft: 42,
  },
  inputLtr: {
    // @ts-expect-error - react-native-web supports direction
    direction: 'ltr',
    textAlign: 'left',
  },
  leftIconButton: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  leftIconButtonHover: {
    opacity: 0.85,
  },
  rowBetween: {
    marginTop: 2,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rememberRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.gray[400],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberText: {
    fontSize: 12,
    color: colors.gray[700],
    textAlign: 'right',
    userSelect: 'none' as any,
  },
  forgotLink: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  button: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    // @ts-expect-error - react-native-web supports transform
    transition: 'transform 200ms ease, opacity 200ms ease',
  },
  buttonHover: {
    // @ts-expect-error - react-native-web supports transform
    transform: 'translateY(-2px)',
  },
  buttonDisabled: {
    backgroundColor: colors.gray[400],
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
});

