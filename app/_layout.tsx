import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { I18nManager } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/lib/supabase';

// Force RTL layout for Hebrew
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  // Silence console logs in production and during runtime to keep console clean
  useEffect(() => {
    const noop = () => {};
    // Replace noisy console methods
    console.log = noop;
    console.info = noop;
    console.debug = noop;
    // Keep errors and warnings if needed, or silence them as well:
    console.warn = noop;
    // Leave console.error for critical issues? Comment next line to keep errors
    console.error = noop;
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
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const { isLoggedIn, loading, initializeAuth, resetAuth } = useUserStore();
  const segments = useSegments();
  const router = useRouter();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Initialize auth state
        await initializeAuth();
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Reset auth state on any error during initialization
        resetAuth();
      } finally {
        if (mounted) {
          setInitializing(false);
        }
      }
    };

    // Set up auth state listener for token changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          // User signed out or token is invalid
          resetAuth();
          if (mounted) {
            router.replace('/login');
          }
        } else if (event === 'TOKEN_REFRESHED') {
          // Token was refreshed successfully, reinitialize
          try {
            await initializeAuth();
          } catch (error) {
            console.error('Error during token refresh:', error);
            resetAuth();
            if (mounted) {
              router.replace('/login');
            }
          }
        }
      }
    });

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Don't navigate until we've finished initializing
    if (initializing || loading) return;

    // אם המשתמש מחובר והוא בעמוד ההתחברות - העבר לקבוצת הטאבים לפי תפקיד
    if (isLoggedIn && segments[0] === 'login') {
      const { userType } = useUserStore.getState();
      if (userType === 'admin' || userType === 'employee') {
        router.replace('/(admin)/admin-events');
      } else {
        router.replace('/(couple)');
      }
    }
    // אם המשתמש לא מחובר ולא בעמוד ההתחברות - העבר להתחברות
    else if (!isLoggedIn && segments[0] !== 'login') {
      router.replace('/login');
    }
  }, [isLoggedIn, segments, initializing, loading]);

  // Show loading screen while initializing
  if (initializing || loading) {
    return null; // You could return a loading component here
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
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      
      <Stack.Screen name="rsvp/invite" options={{ title: "הזמנת אורחים" }} />
      <Stack.Screen name="seating/templates" options={{ headerShown: false }} />
       
    </Stack>
  );
}