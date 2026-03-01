import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useUserStore();
  const { width } = useWindowDimensions();

  // Match the provided desktop-first HTML design:
  // - lg: 2-column full-height layout (like Tailwind's `lg:grid-cols-2 lg:h-screen`)
  // - below lg: stacked layout (hero on top, form below)
  // Consider 900px+ as "desktop" for this screen (browser windows often aren't full-width).
  const isLg = width >= 900;
  const isWide = width >= 1280;
  const isCompact = width < 480;
  // Full-bleed on web so the hero can reach the viewport edge (no outer padding).
  const pagePadding = Platform.OS === 'web' ? 0 : isCompact ? 12 : isLg ? 0 : 16;
  const shellHeightWeb = isLg ? '100vh' : undefined;
  const formSidePadding = isCompact ? 20 : isLg ? (isWide ? 56 : 40) : 24;
  // Reduce hero padding on "regular" desktops so the form column doesn't get squeezed.
  const heroPadding = isCompact ? 24 : isLg ? (isWide ? 80 : 48) : 32;
  const heroHeadlineSize = isLg ? 52 : width >= 900 ? 44 : 36;
  const heroHeadlineLineHeight = isLg ? 58 : width >= 900 ? 52 : 44;
  const cardPadding = isCompact ? 24 : isLg ? (isWide ? 44 : 36) : 32;
  const cardMaxWidth = isLg ? (isWide ? 560 : 520) : 448; // wider on desktop
  const heroContentMaxWidth = 520; // ~ max-w-lg

  const theme = useMemo(
    () => ({
      primary: '#010c21',
      primaryLight: '#010c21',
      accent: '#C6A85B',
      bgLight: '#F0F4F8',
      bgDark: '#121620',
      cardShadow: 'rgba(11, 28, 65, 0.08)',
    }),
    []
  );

  const handleLogin = async () => {
    try {
      setErrorMessage(null);
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: username.trim(),
        password: password.trim(),
      });

      if (error || !data.user) {
        const msg = error?.message ?? '';
        if (typeof msg === 'string' && msg.includes('Email not confirmed')) {
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
        router.replace('/(admin)/admin-events');
      } else {
        router.replace('/(couple)');
      }
    } catch (e) {
      setErrorMessage('אירעה שגיאה במהלך ההתחברות. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = !username.trim() || !password.trim() || loading;

  const FormPanel = (
    <View
      style={[
        styles.formSide,
        {
          padding: formSidePadding,
          backgroundColor: theme.bgLight,
          alignSelf: 'stretch',
          // Keep the form usable on desktop; prevent the hero from squeezing it too much.
          minWidth: isLg ? (isWide ? 560 : 520) : undefined,
        },
      ]}
    >
      <View style={styles.formBgBlob} />

      <View
        style={[
          styles.card,
          {
            padding: cardPadding,
            maxWidth: cardMaxWidth,
            // @ts-ignore - react-native-web supports boxShadow
            boxShadow: `0 10px 40px -10px rgba(0,0,0,0.08)`,
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
              onChangeText={(text) => {
                setUsername(text);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="name@example.com"
              placeholderTextColor={colors.gray[500]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          <View style={styles.passwordRow}>
            <Text style={styles.label}>סיסמה</Text>
          </View>
          <View style={styles.inputWrap}>
            <View style={styles.inputIconRight}>
              <MaterialIcons name="lock" size={20} color={colors.gray[500]} />
            </View>
            <TextInput
              style={[styles.input, styles.inputWithLeftButton]}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="••••••"
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

          {errorMessage ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.rowBetween}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
              onPress={() => setRememberMe((v) => !v)}
              style={styles.rememberRow}
            >
              <View style={[styles.checkbox, rememberMe && { borderColor: theme.primary }]}>
                {rememberMe ? <MaterialIcons name="check" size={16} color={theme.primary} /> : null}
              </View>
              <Text style={styles.rememberText}>זכור אותי</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => Alert.alert('איפוס סיסמה', 'לאיפוס סיסמה יש לפנות למנהל המערכת.')}
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
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>התחבר</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );

  const HeroPanel = (
    <View
      style={[
        styles.hero,
        {
          padding: heroPadding,
          backgroundColor: theme.primary,
          alignSelf: 'stretch',
          minWidth: isLg ? (isWide ? 680 : 600) : undefined,
          ...(isLg
            ? {
                // Desktop: hero is on the RIGHT (RTL row-reverse).
                // Full-bleed on the OUTER-right edge: keep it square.
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                // Round the inner edge (between hero and form).
                borderTopLeftRadius: 40,
                borderBottomLeftRadius: 40,
              }
            : {
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderBottomLeftRadius: 40,
                borderBottomRightRadius: 40,
              }),
        } as any,
      ]}
    >
      {/* Background gradient */}
      <View
        style={[
          styles.heroGradient,
          {
            // @ts-ignore - react-native-web supports backgroundImage
            backgroundImage: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary} 55%, ${theme.primaryLight} 100%)`,
          },
        ]}
      />

      <View style={[styles.heroContent, { maxWidth: heroContentMaxWidth }]}>
        <View style={styles.heroTextBlock}>
          <Text style={[styles.heroHeadline, { fontSize: heroHeadlineSize, lineHeight: heroHeadlineLineHeight }]}>
            מערכת ניהול{'\n'}
            <Text style={[styles.heroHeadlineAccent, { color: theme.accent }]}>אירועים מתקדמת</Text>
          </Text>
          <Text style={styles.heroDescription}>
            הפלטפורמה המובילה לניהול אירועים יוקרתיים. כל הכלים שאתם צריכים במקום אחד, בעיצוב מוקפד וחוויית משתמש בלתי
            מתפשרת.
          </Text>
        </View>

        <View style={styles.features}>
          <FeatureRow
            icon="people"
            title="ניהול מוזמנים חכם"
            subtitle="ארגון רשימות, קבוצות ותיוגים בקלות"
            accent={theme.accent}
            variant="glass"
          />
          <FeatureRow
            icon="event-available"
            title="מעקב אישורי הגעה"
            subtitle="עדכונים בזמן אמת וסטטיסטיקות מדויקות"
            accent={theme.accent}
            variant="glass"
          />
          <FeatureRow
            icon="dashboard"
            title="שליטה מלאה באירוע"
            subtitle="דוחות מתקדמים וניהול ספקים"
            accent={theme.accent}
            variant="glass"
          />
        </View>
      </View>

      {isLg ? (
        <Text style={styles.heroFooter}>© MOON Event Systems 2026. כל הזכויות שמורות.</Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.page, { backgroundColor: theme.bgLight, padding: pagePadding }]}>
      <View
        style={[
          styles.shell,
          {
            // RTL desktop layout: hero on the right, form on the left.
            flexDirection: isLg ? 'row-reverse' : 'column',
            width: '100%',
            alignSelf: 'stretch',
            // @ts-ignore - react-native-web supports height: '100vh'
            height: Platform.OS === 'web' ? (shellHeightWeb as any) : undefined,
            overflow: 'hidden',
          },
        ]}
      >
        {/* Keep JSX order stable; desktop uses row-reverse for sides */}
        {isLg ? (
          <>
            {FormPanel}
            {HeroPanel}
          </>
        ) : (
          <>
            {HeroPanel}
            {FormPanel}
          </>
        )}
      </View>
    </View>
  );
}

function FeatureRow({
  icon,
  title,
  subtitle,
  accent,
  variant,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  subtitle: string;
  accent: string;
  variant?: 'default' | 'glass';
}) {
  return (
    <View style={[styles.featureRow, variant === 'glass' && styles.featureRowGlass]}>
      <View style={[styles.featureIconBox, variant === 'glass' && { backgroundColor: 'rgba(198, 168, 104, 0.20)' }]}>
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
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : null),
    ...(Platform.OS === 'web'
      ? ({
          alignItems: 'stretch',
          justifyContent: 'flex-start',
        } as any)
      : null),
  },
  shell: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },

  // Hero (left)
  hero: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    // Allow flex children to shrink properly on web (avoid min-content sizing squeezing the form)
    minWidth: 0,
    // keep RTL text layout
    // @ts-ignore - react-native-web supports direction
    direction: 'rtl',
    // @ts-ignore - react-native-web supports boxShadow
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  heroContent: {
    zIndex: 1,
    width: '100%',
    gap: 32,
    // Center the whole text block within the blue hero.
    alignSelf: 'center',
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ marginLeft: 'auto', marginRight: 'auto' } as any) : null),
  },
  heroTextBlock: {
    gap: 14,
  },
  heroHeadline: {
    color: colors.white,
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 58,
    textAlign: 'right',
  },
  heroHeadlineAccent: {
    fontWeight: '900',
  },
  heroDescription: {
    color: 'rgba(226, 232, 240, 0.85)',
    fontSize: 18,
    lineHeight: 30,
    fontWeight: '300',
    textAlign: 'right',
  },
  features: {
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  featureRowGlass: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    // @ts-ignore - react-native-web supports blur via filter
    backdropFilter: 'blur(8px)',
  },
  featureIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    gap: 2,
    // בשילוב direction: 'rtl' על השורה, flex-start הוא הצד הימני (צמוד לאייקון)
    alignItems: 'flex-start',
    flex: 1,
  },
  featureTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  featureSubtitle: {
    color: 'rgba(148, 163, 184, 0.85)',
    fontSize: 13,
    textAlign: 'right',
  },
  heroFooter: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    zIndex: 1,
    color: 'rgba(148, 163, 184, 0.85)',
    fontSize: 12,
    // @ts-ignore - react-native-web supports direction
    direction: 'ltr',
    textAlign: 'left',
  },

  // Form side (right)
  formSide: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  formBgBlob: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    // @ts-ignore - react-native-web supports blur via filter
    filter: 'blur(55px)',
    pointerEvents: 'none',
  },
  card: {
    width: '100%',
    maxWidth: 448,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    // @ts-ignore - react-native-web supports direction
    direction: 'rtl',
  },
  cardLogoWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
  cardLogo: {
    width: 360,
    height: 120,
    maxWidth: '100%',
  },
  form: {
    gap: 12,
  },
  errorBox: {
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.20)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
  },
  passwordRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    borderColor: 'transparent',
    backgroundColor: 'rgba(232, 239, 249, 1)',
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
    // @ts-ignore - react-native-web supports direction
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
    marginTop: 4,
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
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    // @ts-ignore - react-native-web supports transform
    transition: 'transform 200ms ease, opacity 200ms ease',
  },
  buttonHover: {
    // @ts-ignore - react-native-web supports transform
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

