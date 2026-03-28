// We also load Rubik on web via `expo-font` so RN-web Text gets a real font-family
// (and we don't depend on Google Fonts / CSS import timing / network).
import {
  Rubik_300Light,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  Rubik_800ExtraBold,
  Rubik_900Black,
} from "@expo-google-fonts/rubik";

export const rubikFonts = {
  Rubik_300Light,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  Rubik_800ExtraBold,
  Rubik_900Black,
};

// Keep the same base font name on all platforms.
export const rubikBaseFontFamily = "Rubik_400Regular" as const;

