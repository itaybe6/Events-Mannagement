import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { I18nManager } from 'react-native';

// Force RTL layout for Hebrew
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

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
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "חזרה",
      }}
    >
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