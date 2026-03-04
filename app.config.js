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
    version: "1.0.0",
    runtimeVersion: "1.0.0",
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
      bundleIdentifier: "com.moonevents.app",
      icon: "./assets/images/icon.png"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.moonevents.app",
      supportsRtl: true
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
      ["expo-contacts"],
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
      EXPO_PUBLIC_SITE_BASE_URL: process.env.EXPO_PUBLIC_SITE_BASE_URL || "https://rork.com",
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yzsfozjrhznlzqcgoqar.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubHpxY2dvcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY0OTIwNTUsImV4cCI6MjA1MjA2ODA1NX0.FXBSofoKWJVJfRJQ8IlXXLqT59BXnbhgqU4LNGVdRlg',
      EXPO_PUBLIC_SUPABASE_SERVICE_KEY: process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubGVxY2dnb3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjk5NDgwNSwiZXhwIjoyMDY4NTcwODA1fQ.vyF70hbjXOOne7mZgKL7bDHOnTKvP7UCiVFa1n2_ikE'
    }
  }
}; 