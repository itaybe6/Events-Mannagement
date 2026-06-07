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
    version: "1.0.5",
    runtimeVersion: "1.0.5",
    updates: {
      url: "https://u.expo.dev/292e2bf1-e784-4c87-9375-36040694dec9",
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
      supportsRtl: true,
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
      EXPO_PUBLIC_SITE_BASE_URL: process.env.EXPO_PUBLIC_SITE_BASE_URL || "",
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yzsfozjrhznlzqcgoqar.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubHpxY2dvcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY0OTIwNTUsImV4cCI6MjA1MjA2ODA1NX0.FXBSofoKWJVJfRJQ8IlXXLqT59BXnbhgqU4LNGVdRlg',
      EXPO_PUBLIC_SUPABASE_SERVICE_KEY: process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubGVxY2dnb3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjk5NDgwNSwiZXhwIjoyMDY4NTcwODA1fQ.vyF70hbjXOOne7mZgKL7bDHOnTKvP7UCiVFa1n2_ikE'
    }
  }
}; 