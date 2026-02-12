import React, { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/services/authService';

export default function LoginWebScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useUserStore();

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
    <View style={styles.page}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Image
            source={require('../assets/images/bride and groom.jpg')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.heroOverlay} />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>מערכת ניהול אירועים</Text>
            <Text style={styles.heroSubtitle}>כניסה מאובטחת לבעל אירוע / מנהל</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/logoMoon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>התחברות</Text>
          <Text style={styles.subtitle}>הזן מייל וסיסמה כדי להמשיך</Text>

          <View style={styles.form}>
            <Text style={styles.label}>אימייל</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="name@example.com"
              placeholderTextColor={colors.gray[500]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textAlign="right"
            />

            <Text style={styles.label}>סיסמה</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.gray[500]}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
            />

            <Pressable
              disabled={isDisabled}
              onPress={handleLogin}
              style={({ hovered, pressed }) => [
                styles.button,
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

            {Platform.OS === 'web' && (
              <Text style={styles.hint}>
                טיפ: אם אתה רואה מסך ריק, פתח את ה־DevTools ובדוק שגיאות Console.
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.gray[50],
    padding: 24,
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    flexDirection: 'row-reverse',
    gap: 20,
  },
  hero: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 520,
    position: 'relative',
    backgroundColor: colors.gray[200],
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 29, 61, 0.45)',
  },
  heroText: {
    position: 'absolute',
    bottom: 18,
    right: 18,
    left: 18,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'right',
  },
  heroSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  card: {
    width: 420,
    maxWidth: '100%',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.gray[200],
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 420,
    height: 130,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.gray[600],
    textAlign: 'right',
  },
  form: {
    marginTop: 16,
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
  },
  button: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonHover: {
    opacity: 0.92,
  },
  buttonDisabled: {
    backgroundColor: colors.gray[400],
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  hint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.gray[600],
    textAlign: 'right',
  },
});

