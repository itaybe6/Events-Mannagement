import React, { useState } from 'react';
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
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { LottieAnimation } from '@/components/LottieAnimation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/services/authService';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login, isLoggedIn, userType, userData } = useUserStore();

  const handleLogin = async () => {
    try {
      setLoading(true);
      // התחברות ל-Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username.trim(),
        password: password.trim(),
      });

      if (error || !data.user) {
        Alert.alert(
          'שגיאה בהתחברות',
          'מייל או סיסמה שגויים. נסה שוב.',
          [{ text: 'אישור', style: 'default' }]
        );
        setLoading(false);
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
        event_id: userRow.event_id,
        userType: userRow.user_type,
      });

      // ניתוב לקבוצת טאבים לפי סוג משתמש
      if (userRow.user_type === 'admin') {
        router.replace('/(admin)/admin-events');
      } else if (userRow.user_type === 'employee') {
        router.replace('/(employee)/employee-events');
      } else {
        router.replace('/(couple)');
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert(
        'שגיאה בהתחברות',
        'אירעה שגיאה במהלך ההתחברות. נסה שוב.',
        [{ text: 'אישור', style: 'default' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const isLoginDisabled = !username.trim() || !password.trim() || loading;

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* רקע כתום עם צורות */}
        <View style={styles.orangeBackground}>
        {/* צורות עננים */}
        <View style={[styles.cloud, styles.cloud1]} />
        <View style={[styles.cloud, styles.cloud2]} />
        <View style={[styles.cloud, styles.cloud3]} />
        
        {/* כוכבים */}
        <View style={[styles.star, styles.star1]}>
          <Ionicons name="star" size={12} color={colors.white} />
        </View>
        <View style={[styles.star, styles.star2]}>
          <Ionicons name="star" size={8} color={colors.white} />
        </View>
        <View style={[styles.star, styles.star3]}>
          <Ionicons name="star" size={10} color={colors.white} />
        </View>
        <View style={[styles.star, styles.star4]}>
          <Ionicons name="star" size={6} color={colors.white} />
        </View>
        
                        {/* אנימציית חתן וכלה */}
        <View style={styles.charactersContainer}>
          <LottieAnimation
            source={require('../assets/animations/83J2Ko52jU.json')}
            style={styles.brideGroomAnimation}
            autoPlay={true}
            loop={true}
            speed={0.8}
          />
        </View>
      </View>
      
      {/* תוכן לבן */}
      <View style={styles.whiteContent}>
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/images/logo-moon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.title}>התחבר למערכת ניהול האירוע</Text>
        <Text style={styles.subtitle}>הזן את פרטי ההתחברות שלך</Text>
        
        {/* שדות התחברות */}
        <View style={styles.loginForm}>
          {/* שדה מייל */}
          <View style={styles.inputContainer}>
            <Ionicons name="mail" size={20} color={colors.gray[500]} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="אימייל"
              placeholderTextColor={colors.gray[500]}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>
          
          {/* שדה סיסמה */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed" size={20} color={colors.gray[500]} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="סיסמה"
              placeholderTextColor={colors.gray[500]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons 
                name={showPassword ? "eye-off" : "eye"} 
                size={20} 
                color={colors.gray[500]} 
              />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* כפתור התחברות */}
        <TouchableOpacity
          style={[
            styles.loginButton,
            isLoginDisabled && styles.loginButtonDisabled
          ]}
          onPress={handleLogin}
          disabled={isLoginDisabled}
        >
          <Text style={styles.loginButtonText}>{loading ? 'מתחבר...' : 'התחבר'}</Text>
        </TouchableOpacity>
        
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  orangeBackground: {
    flex: 1,
    backgroundColor: colors.primary,
    position: 'relative',
    overflow: 'hidden',
  },
  cloud: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 50,
  },
  cloud1: {
    width: 80,
    height: 40,
    top: 60,
    left: 20,
  },
  cloud2: {
    width: 60,
    height: 30,
    top: 100,
    right: 30,
  },
  cloud3: {
    width: 100,
    height: 50,
    top: 40,
    right: 10,
  },
  star: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  star1: {
    top: 80,
    left: width * 0.2,
  },
  star2: {
    top: 120,
    right: width * 0.3,
  },
  star3: {
    top: 60,
    right: width * 0.1,
  },
  star4: {
    top: 140,
    left: width * 0.1,
  },
  charactersContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 20,
  },
  brideGroomAnimation: {
    marginTop: 150,
    width: 350,
    height: 350,
  },
  whiteContent: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    minHeight: height * 0.5,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 330,
    height: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 32,
  },
  loginForm: {
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 16,
    textAlign: 'right',
  },
  passwordToggle: {
    padding: 4,
  },
  loginButton: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginButtonDisabled: {
    backgroundColor: colors.gray[300],
  },
  loginButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
}); 