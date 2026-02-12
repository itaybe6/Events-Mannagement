import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, I18nManager, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/colors';

if (Platform.OS === 'web') {
  // Load Tailwind styles on web only to avoid platform resolution cycles.
  require('../global.css');
}

// Force RTL layout for Hebrew
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

const rtlTextStyle = { textAlign: 'right' as const, writingDirection: 'rtl' as const };
const webRubikStyle = Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as const) : null;
const RTL_MARK = '\u200F';

const toRtlAlertText = (value?: string) => {
  if (typeof value !== 'string' || value.length === 0) return value;
  return value.startsWith(RTL_MARK) ? value : `${RTL_MARK}${value}`;
};

const toRtlButtons = (buttons?: Parameters<typeof Alert.alert>[2]) =>
  buttons?.map((button) => {
    if (!button?.text) return button;
    return { ...button, text: toRtlAlertText(button.text) ?? button.text };
  });

const patchAlertsForRTL = () => {
  const alertWithFlag = Alert as typeof Alert & { __rtlPatched?: boolean };
  if (alertWithFlag.__rtlPatched) return;

  const originalAlert = Alert.alert.bind(Alert);
  Alert.alert = ((...args: Parameters<typeof Alert.alert>) => {
    const [title, message, buttons, options] = args;
    return originalAlert(
      toRtlAlertText(title) ?? title,
      toRtlAlertText(message),
      toRtlButtons(buttons),
      options
    );
  }) as typeof Alert.alert;

  alertWithFlag.__rtlPatched = true;
};

const patchGlobalAlertForRTL = () => {
  const globalWithAlert = globalThis as typeof globalThis & {
    alert?: (message?: unknown) => void;
    __rtlGlobalAlertPatched?: boolean;
  };

  if (globalWithAlert.__rtlGlobalAlertPatched) return;
  if (typeof globalWithAlert.alert !== 'function') {
    globalWithAlert.__rtlGlobalAlertPatched = true;
    return;
  }

  const originalGlobalAlert = globalWithAlert.alert.bind(globalWithAlert);
  globalWithAlert.alert = (message?: unknown) => {
    if (typeof message === 'string') {
      originalGlobalAlert(toRtlAlertText(message) ?? message);
      return;
    }
    originalGlobalAlert(message);
  };

  globalWithAlert.__rtlGlobalAlertPatched = true;
};

patchAlertsForRTL();
patchGlobalAlertForRTL();

Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.style = [webRubikStyle, rtlTextStyle, Text.defaultProps.style].filter(Boolean);

TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [webRubikStyle, rtlTextStyle, TextInput.defaultProps.style].filter(Boolean);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
    ...Ionicons.font,
  });

  // Silence console logs only in production to keep console clean.
  // In development (especially web), we want errors/warnings to stay visible.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    const noop = () => {};
    // Replace noisy console methods (keep console.error for critical issues)
    console.log = noop;
    console.info = noop;
    console.debug = noop;
    console.warn = noop;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    // Load Google Font (Rubik) once for Hebrew-friendly UI on web.
    // We inject <link> tags to keep it simple and avoid extra deps.
    try {
      const head = document.head;
      const ensureLink = (id: string, rel: string, href: string, extra?: Record<string, string>) => {
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = rel;
        link.href = href;
        if (extra) {
          for (const [k, v] of Object.entries(extra)) link.setAttribute(k, v);
        }
        head.appendChild(link);
      };

      ensureLink('gf-preconnect-1', 'preconnect', 'https://fonts.googleapis.com');
      ensureLink('gf-preconnect-2', 'preconnect', 'https://fonts.gstatic.com', { crossorigin: '' });
      ensureLink(
        'gf-rubik',
        'stylesheet',
        'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap&subset=hebrew'
      );
    } catch {
      // ignore
    }

    // Ensure real RTL at the DOM level (some web libs read `body.dir`)
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'he');
    document.body?.setAttribute('dir', 'rtl');
    if (document.body) {
      document.body.style.direction = 'rtl';
      document.body.style.textAlign = 'right';
      // Prefer Rubik on web (falls back safely if font not loaded yet)
      document.body.style.fontFamily =
        'Rubik, system-ui, -apple-system, "Segoe UI", Arial, "Noto Sans Hebrew", "Noto Sans", sans-serif';
    }
  }, []);

  useEffect(() => {
    if (error) {
      // Keep throwing to surface font loading errors without logging
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    // Keep a visible loading UI (avoid "black screen" during font load)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, fontSize: 16 }}>טוען...</Text>
      </View>
    );
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const { isLoggedIn, loading, initializeAuth, resetAuth } = useUserStore();
  const segments = useSegments();
  const router = useRouter();
  const [initializing, setInitializing] = useState(true);
  const [initTimedOut, setInitTimedOut] = useState(false);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const AUTH_INIT_UI_TIMEOUT_MS = 15_000;

  const startAuthInit = useCallback(async () => {
    if (!isMountedRef.current) return;

    setInitTimedOut(false);
    setInitializing(true);

    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }

    initTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setInitTimedOut(true);
      setInitializing(false);
    }, AUTH_INIT_UI_TIMEOUT_MS);

    try {
      // Initialize auth state
      await initializeAuth();
    } catch (error) {
      console.error('Auth initialization error:', error);
      // Reset auth state on any error during initialization
      resetAuth();
    } finally {
      if (!isMountedRef.current) return;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      setInitTimedOut(false);
      setInitializing(false);
    }
  }, [initializeAuth, resetAuth]);

  useEffect(() => {
    isMountedRef.current = true;

    // Set up auth state listener for token changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          // User signed out or token is invalid
          resetAuth();
          if (isMountedRef.current) {
            router.replace('/login');
          }
        } else if (event === 'TOKEN_REFRESHED') {
          // Token was refreshed successfully, reinitialize (with timeout guard)
          try {
            await startAuthInit();
          } catch (error) {
            console.error('Error during token refresh:', error);
            resetAuth();
            if (isMountedRef.current) {
              router.replace('/login');
            }
          }
        }
      }
    });

    startAuthInit();

    return () => {
      isMountedRef.current = false;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Don't navigate until we've finished initializing
    if (initializing || loading) return;

    // אם המשתמש מחובר והוא בעמוד ההתחברות - העבר לקבוצת הטאבים לפי תפקיד
    if (isLoggedIn && segments[0] === 'login') {
      const { userType } = useUserStore.getState();
      if (userType === 'admin') {
        router.replace('/(admin)/admin-events');
      } else if (userType === 'employee') {
        router.replace('/(employee)/employee-events');
      } else {
        router.replace('/(couple)');
      }
    }
    // אם המשתמש לא מחובר ולא בעמוד ההתחברות - העבר להתחברות
    else if (!isLoggedIn && segments[0] !== 'login') {
      router.replace('/login');
    }
  }, [isLoggedIn, segments, initializing, loading]);

  if (initTimedOut) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>לא ניתן להתחבר כרגע</Text>
        <Text style={{ fontSize: 14, color: colors.gray[600], textAlign: 'center', marginBottom: 20 }}>
          בדוק חיבור לאינטרנט או נסה שוב בעוד רגע.
        </Text>
        <TouchableOpacity
          onPress={startAuthInit}
          style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, marginBottom: 10 }}
        >
          <Text style={{ color: colors.white, fontSize: 16 }}>נסה שוב</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            resetAuth();
            router.replace('/login');
          }}
          style={{ paddingVertical: 8, paddingHorizontal: 24 }}
        >
          <Text style={{ color: colors.yaleBlue, fontSize: 16 }}>חזרה להתחברות</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show loading screen while initializing (avoid blocking if already logged in)
  if (initializing || (loading && !isLoggedIn)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, fontSize: 16 }}>מתחבר...</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerBackTitle: "חזרה",
      }}
      initialRouteName="login"
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      {/* Legacy mixed tabs kept for backward compatibility */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* New role-based groups */}
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen name="(couple)" options={{ headerShown: false }} />
      <Stack.Screen name="(employee)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      
      <Stack.Screen name="rsvp/invite" options={{ title: "הזמנת אורחים" }} />
      <Stack.Screen name="seating/templates" options={{ headerShown: false }} />
      <Stack.Screen name="seating/templatesWeb" options={{ headerShown: false }} />
       
    </Stack>
  );
}