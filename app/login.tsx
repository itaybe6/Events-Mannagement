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
import { useEventStore } from '@/store/eventStore';
import { LottieAnimation } from '@/components/LottieAnimation';
import { mockEvents, mockGuests, mockTables, mockMessages, mockGifts } from '@/constants/mockData';

const { width, height } = Dimensions.get('window');

// משתמשי דמו
const DEMO_USERS = {
  couple: {
    username: 'couple',
    password: '123456',
    userType: 'couple' as const,
    name: 'חתן/כלה'
  },
  admin: {
    username: 'admin',
    password: 'admin123',
    userType: 'admin' as const,
    name: 'מנהל מערכת'
  }
};

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { login, isLoggedIn, userType, userData } = useUserStore();
  const { setCurrentEventWithData } = useEventStore();

  const handleLogin = async () => {
    try {
      // בדיקת התחברות מול משתמשי הדמו
      const user = Object.values(DEMO_USERS).find(
        u => u.username === username && u.password === password
      );

      if (user) {
        console.log('🔑 Login successful for user:', user.username);
        console.log('🔑 User type from DEMO_USERS:', user.userType);
        
        // התחברות עם פונקציית login
        login(user.userType, {
          id: '1',
          email: `${user.username}@example.com`,
          name: user.name,
          userType: user.userType,
        });
        
        console.log('🔑 After login - checking userStore...');
        
        // טעינת אירוע דמו עם כל הנתונים
        console.log('📅 Loading demo event with all data...');
        setCurrentEventWithData(
          mockEvents[0],
          mockGuests,
          mockTables,
          mockMessages,
          mockGifts
        );
        
        console.log('🎉 Login complete - redirecting to tabs');
        
        // Redirect based on user type
        if (user.userType === 'admin') {
          console.log('🔧 Admin user - redirecting to clients tab');
          router.replace('/(tabs)/clients');
        } else {
          console.log('💕 Couple user - redirecting to home tab');
          router.replace('/(tabs)');
        }
      } else {
        Alert.alert(
          'שגיאה בהתחברות',
          'שם משתמש או סיסמה שגויים. נסה שוב.',
          [{ text: 'אישור', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert(
        'שגיאה בהתחברות',
        'אירעה שגיאה במהלך ההתחברות. נסה שוב.',
        [{ text: 'אישור', style: 'default' }]
      );
    }
  };

  const isLoginDisabled = !username.trim() || !password.trim();

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.orange} />
      
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
          <Ionicons name="star" size={12} color="white" />
        </View>
        <View style={[styles.star, styles.star2]}>
          <Ionicons name="star" size={8} color="white" />
        </View>
        <View style={[styles.star, styles.star3]}>
          <Ionicons name="star" size={10} color="white" />
        </View>
        <View style={[styles.star, styles.star4]}>
          <Ionicons name="star" size={6} color="white" />
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
        <Text style={styles.title}>התחבר למערכת ניהול האירוע</Text>
        <Text style={styles.subtitle}>הזן את פרטי ההתחברות שלך</Text>
        
        {/* שדות התחברות */}
        <View style={styles.loginForm}>
          {/* שדה שם משתמש */}
          <View style={styles.inputContainer}>
            <Ionicons name="person" size={20} color={colors.gray[500]} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="שם משתמש"
              placeholderTextColor={colors.gray[500]}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
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
          <Text style={styles.loginButtonText}>התחבר</Text>
        </TouchableOpacity>
        
        {/* מידע על משתמשי הדמו */}
        <View style={styles.demoInfo}>
          <Text style={styles.demoTitle}>משתמשי דמו:</Text>
          <Text style={styles.demoText}>חתן/כלה: couple / 123456</Text>
          <Text style={styles.demoText}>מנהל: admin / admin123</Text>
        </View>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.orange,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  orangeBackground: {
    flex: 1,
    backgroundColor: colors.orange,
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
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    minHeight: height * 0.5,
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
    backgroundColor: '#e8a7a8',
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
  demoInfo: {
    marginTop: 24,
    padding: 16,
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  demoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  demoText: {
    fontSize: 12,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 4,
  },
}); 