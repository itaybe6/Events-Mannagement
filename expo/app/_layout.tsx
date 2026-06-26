import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, usePathname, useRootNavigationState, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, I18nManager, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppLoaderScreen } from '@/components/AppLoader';
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

// RTL is forced in native (plugins/withForceRTL.js) so it applies from first launch.
// Keep a JS safety net for native release builds while excluding web.
if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

const rtlTextStyle = { textAlign: 'right' as const, writingDirection: 'rtl' as const };
const webFontStack =
  `${rubikBaseFontFamily}, Rubik, system-ui, -apple-system, "Segoe UI", Arial, "Noto Sans Hebrew", "Noto Sans", sans-serif`;
const baseFontStyle = { fontFamily: (Platform.OS === 'web' ? webFontStack : rubikBaseFontFamily) as any };
const RTL_MARK = '\u200F';

// React 19 + RNW/RN ignore `defaultProps`-based global styling for function /
// forwardRef components like `Text`/`TextInput`. To ensure Rubik (and RTL) is
// applied consistently we patch the element factories and inject default styles
// for Text/TextInput unless a component already set them.
//
// IMPORTANT: with Babel's automatic JSX runtime (the Expo default) JSX compiles
// to `react/jsx-runtime`'s `jsx`/`jsxs` — NOT `React.createElement`. Patching
// only `React.createElement` therefore has no effect on JSX-authored screens, so
// we patch the jsx runtimes too (and keep createElement for legacy callers).
(() => {
  const patchedFlag = globalThis as typeof globalThis & { __rubikFontPatched?: boolean };
  if (patchedFlag.__rubikFontPatched) return;

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

  const hasStyleProp = (style: unknown, key: string): boolean => {
    if (!style) return false;
    if (Array.isArray(style)) return style.some((s) => hasStyleProp(s, key));
    if (typeof style === 'object') return key in (style as any) && (style as any)[key] != null;
    return false;
  };

  const pickRubikFamily = (weight?: number | null) => {
    const w = typeof weight === 'number' ? weight : null;
    const pick =
      // Rubik 900 looks too heavy in this app's UI, so cap it at 700 globally.
      w != null && w >= 900 ? 'Rubik_700Bold'
      : w != null && w >= 800 ? 'Rubik_800ExtraBold'
      : w != null && w >= 700 ? 'Rubik_700Bold'
      : w != null && w >= 600 ? 'Rubik_600SemiBold'
      : w != null && w >= 500 ? 'Rubik_500Medium'
      : w != null && w <= 300 ? 'Rubik_300Light'
      : 'Rubik_400Regular';

    if (rubikKeys.size === 0) return Platform.OS === 'web' ? 'Rubik' : rubikBaseFontFamily;
    return rubikKeys.has(pick) ? pick : rubikBaseFontFamily;
  };

  // Returns the original props if nothing needs injecting, otherwise a shallow
  // clone with Rubik + RTL defaults merged *under* any caller-provided style.
  const withRubikDefaults = (type: any, props: any) => {
    if (type !== Text && type !== TextInput) return props;
    const p = props ?? {};
    const injectFont = !hasFontFamily(p.style);
    const injectTextAlign = !hasStyleProp(p.style, 'textAlign');
    const injectWritingDir = !hasStyleProp(p.style, 'writingDirection');
    if (!injectFont && !injectTextAlign && !injectWritingDir) return props;

    const injected: any = {};
    if (injectFont) injected.fontFamily = pickRubikFamily(getFontWeight(p.style)) as any;
    if (injectTextAlign) injected.textAlign = 'right';
    if (injectWritingDir) injected.writingDirection = 'rtl';
    const nextStyle = p.style ? [injected, p.style] : injected;
    return { ...p, style: nextStyle };
  };

  // 1) Patch the classic createElement path (legacy / non-JSX callers).
  const reactAny = React as unknown as { createElement: typeof React.createElement };
  const originalCreateElement = reactAny.createElement.bind(React);
  reactAny.createElement = ((type: any, props: any, ...children: any[]) =>
    originalCreateElement(type, withRubikDefaults(type, props), ...children)) as typeof React.createElement;

  // 2) Patch the automatic JSX runtimes (the path actually used by screens).
  // Use static require strings so Metro can resolve them at bundle time.
  const patchJsxRuntime = (runtime: any) => {
    if (!runtime || runtime.__rubikFontPatched) return;
    for (const key of ['jsx', 'jsxs', 'jsxDEV'] as const) {
      const original = runtime[key];
      if (typeof original !== 'function') continue;
      const wrapped = (type: any, props: any, ...rest: any[]) =>
        original(type, withRubikDefaults(type, props), ...rest);
      try {
        runtime[key] = wrapped;
      } catch {
        try {
          Object.defineProperty(runtime, key, { value: wrapped, configurable: true, writable: true });
        } catch {
          // last resort: leave the original in place for this key
        }
      }
    }
    try {
      Object.defineProperty(runtime, '__rubikFontPatched', { value: true });
    } catch {
      runtime.__rubikFontPatched = true;
    }
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    patchJsxRuntime(require('react/jsx-runtime'));
  } catch {
    // jsx-runtime may be unavailable in some environments; ignore.
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    patchJsxRuntime(require('react/jsx-dev-runtime'));
  } catch {
    // jsx-dev-runtime is only present in dev builds; ignore otherwise.
  }

  patchedFlag.__rubikFontPatched = true;
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

      // Ensure the viewport opts into `viewport-fit=cover` so iOS Safari exposes
      // the safe-area insets (`env(safe-area-inset-*)`). Without this, bottom
      // content like the RSVP submit button can sit under the browser toolbar /
      // home indicator and become impossible to tap.
      const viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      const desiredViewport = 'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover';
      if (viewport) {
        if (!/viewport-fit\s*=\s*cover/.test(viewport.content)) {
          viewport.content = desiredViewport;
        }
      } else {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = desiredViewport;
        head.appendChild(meta);
      }
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

    // Prevent the whole page from scrolling/shifting horizontally (common in RTL
    // when decorative/off-screen elements bleed past the viewport edge). Inner
    // horizontal ScrollViews keep their own overflow, so this is safe.
    try {
      document.documentElement.style.overflowX = 'hidden';
      document.documentElement.style.maxWidth = '100%';
      if (document.body) {
        document.body.style.overflowX = 'hidden';
        document.body.style.maxWidth = '100%';
      }
    } catch {
      // ignore
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

function normalizePath(path: string): string {
  return String(path || '').replace(/\/+$/, '') || '/';
}

function isPublicAuthRoute(segments: string[], pathname: string): boolean {
  const first = segments[0];
  if (first === 'onboarding' || first === 'login' || first === 'signup') return true;
  const path = normalizePath(pathname);
  return path === '/onboarding' || path === '/login' || path === '/signup';
}

function isPublicInvitationRoute(segments: string[], pathname: string): boolean {
  const first = segments[0];
  if (first === 'invitation' || first === 'i' || first === 'w') return true;
  const path = normalizePath(pathname);
  return path.startsWith('/invitation/') || path.startsWith('/i/') || path.startsWith('/w/');
}

function RootLayoutNav() {
  const { isLoggedIn, loading, initializeAuth, resetAuth } = useUserStore();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isNavigationReady = Boolean(rootNavigationState?.key);
  const [initializing, setInitializing] = useState(true);
  const [initTimedOut, setInitTimedOut] = useState(false);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const AUTH_INIT_UI_TIMEOUT_MS = 15_000;

  // Wait only for the (fast, local) persisted-state hydration before deciding
  // what to render. Once hydrated, an already-logged-in user is shown the app
  // immediately while we validate/refresh the session in the background.
  const [hydrated, setHydrated] = useState<boolean>(() => {
    try {
      return (useUserStore as any).persist?.hasHydrated?.() ?? false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const persistApi = (useUserStore as any).persist;
    if (!persistApi?.onFinishHydration) {
      setHydrated(true);
      return;
    }
    if (persistApi.hasHydrated?.()) {
      setHydrated(true);
    }
    const unsub = persistApi.onFinishHydration(() => setHydrated(true));
    // Safety net: never block forever if hydration never resolves.
    const t = setTimeout(() => setHydrated(true), 1500);
    return () => {
      if (typeof unsub === 'function') unsub();
      clearTimeout(t);
    };
  }, []);

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
          // Navigation is deferred to the routing effect once the Stack is ready.
        } else if (event === 'TOKEN_REFRESHED') {
          // Token was refreshed successfully, reinitialize (with timeout guard)
          try {
            await startAuthInit();
          } catch (error) {
            console.error('Error during token refresh:', error);
            resetAuth();
            // Navigation is deferred to the routing effect once the Stack is ready.
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
    // Expo Router requires the Stack to be mounted before any navigation call.
    if (!isNavigationReady) return;
    // Wait for the local persisted state to hydrate before routing.
    if (!hydrated) return;
    // For users without a (persisted) session, wait for the initial auth check
    // before deciding where to send them. Logged-in users route immediately
    // from persisted state while the background refresh runs.
    if (!isLoggedIn && (initializing || loading)) return;

    const isPublicAuth = isPublicAuthRoute(segments, pathname);
    const isIndex = segments[0] === 'index' || normalizePath(pathname) === '/';

    let targetHref: string | null = null;

    // אם המשתמש מחובר והוא בעמוד public (index/login/onboarding/signup) - העבר לקבוצת הטאבים לפי תפקיד
    if (isLoggedIn && (isPublicAuth || isIndex)) {
      const { userType } = useUserStore.getState();
      if (userType === 'admin') {
        targetHref = '/(admin)/admin-events';
      } else if (userType === 'employee') {
        targetHref = '/(employee)/employee-events';
      } else {
        targetHref = '/(couple)';
      }
    } else if (!isLoggedIn && !isPublicInvitationRoute(segments, pathname)) {
      // גישה ישירה לעמוד מוגן בלי התחברות -> login (onboarding נשאר דרך index בלבד).
      if (!isPublicAuth) {
        targetHref = '/login';
      }
    }

    if (!targetHref || normalizePath(pathname) === normalizePath(targetHref)) return;

    const timer = setTimeout(() => {
      router.replace(targetHref as any);
    }, 0);

    return () => clearTimeout(timer);
  }, [isLoggedIn, segments, pathname, initializing, loading, hydrated, isNavigationReady, router]);

  const showAuthLoader = !hydrated || (!isLoggedIn && (initializing || loading));
  const showInitTimeout = initTimedOut && !isLoggedIn;

  return (
    <>
    <Stack
      screenOptions={{
        headerBackTitle: "חזרה",
      }}
      initialRouteName="index"
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      {/* Legacy mixed tabs kept for backward compatibility */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* New role-based groups */}
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen name="(couple)" options={{ headerShown: false }} />
      <Stack.Screen name="(employee)" options={{ headerShown: false }} />
      <Stack.Screen name="invitation/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="i/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="w/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      
      <Stack.Screen name="seating/templates" options={{ headerShown: false }} />
       
    </Stack>
    {showInitTimeout ? (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 }}>
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
            if (isNavigationReady) router.replace('/login');
          }}
          style={{ paddingVertical: 8, paddingHorizontal: 24 }}
        >
          <Text style={{ color: colors.yaleBlue, fontSize: 16 }}>חזרה להתחברות</Text>
        </TouchableOpacity>
      </View>
    ) : showAuthLoader ? (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <AppLoaderScreen variant="default" title="מתחבר" subtitle="מכין את האפליקציה..." />
      </View>
    ) : null}
    </>
  );
}