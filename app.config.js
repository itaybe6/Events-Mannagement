import 'dotenv/config';

export default {
  expo: {
    name: "Moon",
    slug: "euroe-nitgmal-eiroom-mekapim",
    version: "1.0.0",
    orientation: "portrait",
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
      bundleIdentifier: "app.rork.euroe-nitgmal-eiroom-mekapim"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "app.rork.euroe-nitgmal-eiroom-mekapim"
    },
    web: {
      favicon: "./assets/images/favicon.png",
      bundler: "metro"
    },
    plugins: [
      [
        "expo-router",
        {
          origin: "https://rork.com/"
        }
      ],
      ["expo-contacts"]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yzsfozjrhznlzqcgoqar.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubHpxY2dvcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY0OTIwNTUsImV4cCI6MjA1MjA2ODA1NX0.FXBSofoKWJVJfRJQ8IlXXLqT59BXnbhgqU4LNGVdRlg',
      EXPO_PUBLIC_SUPABASE_SERVICE_KEY: process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubGVxY2dnb3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjk5NDgwNSwiZXhwIjoyMDY4NTcwODA1fQ.vyF70hbjXOOne7mZgKL7bDHOnTKvP7UCiVFa1n2_ikE'
    }
  }
}; 