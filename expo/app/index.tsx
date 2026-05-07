import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';

export default function IndexScreen() {
  const router = useRouter();
  const { isLoggedIn, userType, loading } = useUserStore();

  useEffect(() => {
    // Index is only a transitional route; never keep users here.
    if (loading) return;

    if (isLoggedIn) {
      if (userType === 'admin') {
        router.replace('/(admin)/admin-events');
        return;
      }
      if (userType === 'employee') {
        router.replace('/(employee)/employee-events');
        return;
      }
      router.replace('/(couple)');
      return;
    }

    router.replace('/onboarding');
  }, [isLoggedIn, userType, loading, router]);

  useEffect(() => {
    // Hard fallback: avoid endless loader if state hydration/auth hangs.
    const t = setTimeout(() => router.replace('/onboarding'), 4000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 12, fontSize: 16 }}>מעביר למסך הפתיחה...</Text>
    </View>
  );
}

