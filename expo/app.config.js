try {
  require('dotenv/config');
} catch (e) {
  // Allow config evaluation even when dependencies aren't installed locally.
  // EAS Build env vars should be provided via secrets/variables.
  if (e?.code !== 'MODULE_NOT_FOUND') throw e;
}

module.exports = {
  expo: {
    name: "Moon",
    slug: "euroe-nitgmal-eiroom-mekapim",
    version: "1.0.7",
    runtimeVersion: "1.0.7",
    updates: {
      url: "https://u.expo.dev/292e2bf1-e784-4c87-9375-36040694dec9",
      // Never block startup on (or instantly apply) an OTA update.
      // Updates download in the background and apply on the next launch,
      // which prevents a bad/partial bundle from crashing the app on open.
      fallbackToCacheTimeout: 0,
    },
    // Allow device rotation (portrait + landscape).
    // If you want only specific screens to rotate, lock/unlock at runtime via expo-screen-orientation,
    // but the app must still support the orientations at build time.
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: "myapp",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.itaybenyair.moonapp",
      icon: "./assets/images/icon.png",
      infoPlist: {
        NSPhotoLibraryUsageDescription:
          "האפליקציה מבקשת גישה לגלריה כדי שתוכלו לבחור תמונת פרופיל אישית או תמונת הזמנה לאירוע, להעלות אותן לחשבון שלכם ולהציג אותן בעמודי האפליקציה (פרופיל, הזמנה ועריכת אירוע).",
        NSPhotoLibraryAddUsageDescription:
          "האפליקציה מבקשת הרשאה לשמור תמונות של ההזמנה או הפרופיל בגלריית המכשיר שלכם, רק לאחר אישורכם המפורש בכל פעם.",
        NSCameraUsageDescription:
          "האפליקציה מבקשת גישה למצלמה כדי שתוכלו לצלם תמונת פרופיל חדשה או תמונת הזמנה ולהעלות אותה ישירות לאירוע שלכם, ללא צורך לשמור את התמונה בגלריה תחילה.",
        NSContactsUsageDescription:
          "האפליקציה מבקשת גישה לאנשי הקשר במכשיר כדי שתוכלו לייבא בקלות מוזמנים לרשימת האורחים של האירוע (שם וטלפון בלבד). הגישה משמשת אך ורק לתצוגה ולבחירה ידנית שלכם, ולא נשלחת לשום שרת מבלי שתאשרו זאת."
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.moonevents.app",
      supportsRtl: false,
      permissions: [
        "android.permission.READ_CONTACTS",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE"
      ]
    },
    web: {
      favicon: "./assets/images/favicon.png",
      bundler: "metro"
    },
    plugins: [
      "./plugins/withForceRTL.js",
      "expo-font",
      // Use direct path to avoid plugin resolution issues (e.g. paths with non-ASCII chars on Windows)
      [
        "./node_modules/expo-router/app.plugin.js",
        {
          origin: "https://rork.com/"
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "האפליקציה מבקשת גישה לגלריה כדי שתוכלו לבחור תמונת פרופיל או תמונת הזמנה לאירוע ולהעלות אותן לחשבון שלכם.",
          cameraPermission:
            "האפליקציה מבקשת גישה למצלמה כדי שתוכלו לצלם תמונת פרופיל או תמונת הזמנה חדשה ולהעלות אותה ישירות לאירוע."
        }
      ],
      [
        "expo-contacts",
        {
          contactsPermission:
            "האפליקציה מבקשת גישה לאנשי הקשר כדי לייבא מוזמנים (שם וטלפון בלבד) לרשימת האורחים של האירוע, לאחר בחירה ידנית שלכם."
        }
      ],
      "@react-native-community/datetimepicker",
      "expo-web-browser"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      eas: {
        projectId: "292e2bf1-e784-4c87-9375-36040694dec9"
      },
      EXPO_PUBLIC_SITE_BASE_URL: process.env.EXPO_PUBLIC_SITE_BASE_URL || "https://events-mannagement.vercel.app",
      // URL + anon key are public by design (anon key is protected by RLS and is
      // shipped in every client build). Kept as a fallback so the app always boots.
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://cxlmixykahuchilhyjjv.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bG1peHlrYWh1Y2hpbGh5amp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTIxMTgsImV4cCI6MjA4NTc2ODExOH0.dFkhUWcHjqgqlfowNcl8EtNJ6e697x4tUrKkz7X5IjE',
      // SECURITY: never hardcode the service_role key in the client bundle.
      // It is read from an EAS env var only (and ideally moved to an Edge Function).
      EXPO_PUBLIC_SUPABASE_SERVICE_KEY: process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY
    }
  }
}; 