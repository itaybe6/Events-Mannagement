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

      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', username.trim())
        .single();

      if (userError || !userRow) {
        Alert.alert('שגיאה', 'לא נמצאו פרטי משתמש במערכת. פנה למנהל.');
        return;
      }

      login(userRow.user_type, {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        userType: userRow.user_type,
      });

      if (userRow.user_type === 'admin' || userRow.user_type === 'employee') {
        router.replace('/(admin)/admin-events');
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
            <Text style={styles.heroSubtitle}>כניסה מאובטחת לזוג / מנהל</Text>
          </View>
        </View>

        <View style={styles.card}>
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

