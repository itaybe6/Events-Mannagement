import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, I18nManager, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { rubikBaseFontFamily, rubikFonts } from "@/lib/fonts";
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/colors';

if (Platform.OS === 'web') {
  // Load Tailwind styles on web only to avoid platform resolution cycles.
  require('../global.css');
}

// We load Rubik via `expo-font` on all platforms (see `lib/fonts.*.ts`).
// `global.css` still sets a sensible CSS fallback stack for the DOM.

// Force RTL layout for Hebrew.
// allowRTL + forceRTL require a full app restart to take effect at the native
// layout level. On a fresh install the flag is not yet set, so we set it and
// immediately reload the bundle so that the very first session is already RTL.
I18nManager.allowRTL(true);
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
  // Only reload on native — web handles RTL via CSS and doesn't need a restart.
  if (Platform.OS !== 'web') {
    Updates.reloadAsync().catch(() => {});
  }
}

const rtlTextStyle = { textAlign: 'right' as const, writingDirection: 'rtl' as const };
const webFontStack =
  `${rubikBaseFontFamily}, Rubik, system-ui, -apple-system, "Segoe UI", Arial, "Noto Sans Hebrew", "Noto Sans", sans-serif`;
const baseFontStyle = { fontFamily: (Platform.OS === 'web' ? webFontStack : rubikBaseFontFamily) as any };
const RTL_MARK = '\u200F';

// React 19 + RNW/RN can ignore `defaultProps`-based global styling in some cases.
// To ensure Rubik is applied consistently, we patch `React.createElement` and inject
// a default `fontFamily` for Text/TextInput unless a component already set one.
(() => {
  const reactAny = React as unknown as {
    createElement: typeof React.createElement;
    __rubikFontPatched?: boolean;
  };

  if (reactAny.__rubikFontPatched) return;

  const rubikKeys = new Set(Object.keys(rubikFonts ?? {}));

  const getFontWeight = (style: unknown): number | null => {
    if (!style) return null;
    if (Array.isArray(style)) {
      // last one wins in RN style arrays
      let weight: number | null = null;
      for (const s of style) {
        const w = getFontWeight(s);
        if (typeof w === 'number') weight = w;
      }
      return weight;
    }
    if (typeof style === 'object') {
      const fw = (style as any).fontWeight;
      if (typeof fw === 'number') return fw;
      if (typeof fw === 'string') {
        const parsed = Number.parseInt(fw, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
    return null;
  };

  const hasFontFamily = (style: unknown): boolean => {
    if (!style) return false;
    if (Array.isArray(style)) return style.some(hasFontFamily);
    if (typeof style === 'object') return 'fontFamily' in (style as any) && Boolean((style as any).fontFamily);
    return false;
  };

  const pickRubikFamily = (weight?: number | null) => {
    const w = typeof weight === 'number' ? weight : null;
    const pick =
      w != null && w >= 900 ? 'Rubik_900Black'
      : w != null && w >= 800 ? 'Rubik_800ExtraBold'
      : w != null && w >= 700 ? 'Rubik_700Bold'
      : w != null && w >= 600 ? 'Rubik_600SemiBold'
      : w != null && w >= 500 ? 'Rubik_500Medium'
      : w != null && w <= 300 ? 'Rubik_300Light'
      : 'Rubik_400Regular';

    if (rubikKeys.size === 0) return Platform.OS === 'web' ? 'Rubik' : rubikBaseFontFamily;
    return rubikKeys.has(pick) ? pick : rubikBaseFontFamily;
  };

  const originalCreateElement = reactAny.createElement.bind(React);
  reactAny.createElement = ((type: any, props: any, ...children: any[]) => {
    if (type === Text || type === TextInput) {
      const p = props ?? {};
      if (!hasFontFamily(p.style)) {
        const injected = { fontFamily: pickRubikFamily(getFontWeight(p.style)) as any };
        const nextStyle = p.style ? [injected, p.style] : injected;
        return originalCreateElement(type, { ...p, style: nextStyle }, ...children);
      }
    }
    return originalCreateElement(type, props, ...children);
  }) as typeof React.createElement;

  reactAny.__rubikFontPatched = true;
})();

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
Text.defaultProps.style = [baseFontStyle, rtlTextStyle, Text.defaultProps.style].filter(Boolean);

TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [baseFontStyle, rtlTextStyle, TextInput.defaultProps.style].filter(Boolean);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
    ...Ionicons.font,
    ...(rubikFonts as any),
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
    // Ensure RTL + global font on web.
    // Note: the Rubik font is loaded via `global.css` (Google Fonts @import).
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
    // Prevent native splash from hiding until we're ready.
    // Do this in an effect (not module scope) to avoid edge cases on fast refresh.
    void SplashScreen.preventAutoHideAsync().catch(() => {
      // ignore
    });
  }, []);

  useEffect(() => {
    // Never let the splash screen block the app forever.
    // We render immediately; fonts can continue loading in the background.
    const t = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {
        // ignore
      });
    }, 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (error) {
      console.error('Font loading error:', error);
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync().catch(() => {
        // ignore
      });
    }
  }, [loaded]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutNav />
    </GestureHandlerRootView>
  );
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
            router.replace('/onboarding');
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

    const isPublicInvitation = segments[0] === 'invitation' || segments[0] === 'i';
    const isOnboarding = segments[0] === 'onboarding';
    const isLogin = segments[0] === 'login';
    const isIndex = segments[0] === 'index';

    // אם המשתמש מחובר והוא בעמוד public (index/login/onboarding) - העבר לקבוצת הטאבים לפי תפקיד
    if (isLoggedIn && (isLogin || isIndex || isOnboarding)) {
      const { userType } = useUserStore.getState();
      if (userType === 'admin') {
        router.replace('/(admin)/admin-events');
      } else if (userType === 'employee') {
        router.replace('/(employee)/employee-events');
      } else {
        router.replace('/(couple)');
      }
    }
    // אם המשתמש לא מחובר - ברירת מחדל היא onboarding (גם אחרי התנתקות).
    // את login נציג רק אם המשתמש כבר נמצא שם (למשל אחרי לחיצה על הכפתור ב-onboarding).
    else if (!isLoggedIn && !isPublicInvitation) {
      if (isOnboarding || isLogin) return;
      router.replace('/onboarding');
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
      initialRouteName="index"
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      {/* Legacy mixed tabs kept for backward compatibility */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* New role-based groups */}
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen name="(couple)" options={{ headerShown: false }} />
      <Stack.Screen name="(employee)" options={{ headerShown: false }} />
      <Stack.Screen name="invitation/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="i/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      
      <Stack.Screen name="seating/templates" options={{ headerShown: false }} />
       
    </Stack>
  );
}