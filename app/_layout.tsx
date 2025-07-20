import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { I18nManager } from 'react-native';
import { useUserStore } from '@/store/userStore';

// Force RTL layout for Hebrew
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);



// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) {
      console.error(error);
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
  const { isLoggedIn } = useUserStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // אם המשתמש מחובר והוא בעמוד ההתחברות - העבר לטאבים
    if (isLoggedIn && segments[0] === 'login') {
      const { userType } = useUserStore.getState();
      if (userType === 'admin') {
        router.replace('/(tabs)/clients');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isLoggedIn, segments]);

  return (
    <Stack
      screenOptions={{
        headerBackTitle: "חזרה",
      }}
      initialRouteName="login"
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      <Stack.Screen name="gift/payment" options={{ title: "תשלום מתנה" }} />
      <Stack.Screen name="gift/confirmation" options={{ title: "אישור תשלום", headerBackVisible: false }} />
      <Stack.Screen name="rsvp/invite" options={{ title: "הזמנת אורחים" }} />
      <Stack.Screen name="seating/edit" options={{ title: "סידור ישיבה" }} />
      <Stack.Screen name="financing/apply" options={{ title: "בקשת מימון" }} />
      <Stack.Screen name="profile/edit" options={{ title: "עריכת פרופיל" }} />
      <Stack.Screen name="profile/share" options={{ title: "שיתוף פרופיל" }} />
      <Stack.Screen name="3d-seating" options={{ title: "סידור ישיבה תלת-ממדי" }} />
    </Stack>
  );
}