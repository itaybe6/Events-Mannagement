import React from 'react';
import { Redirect } from 'expo-router';
import { AppLoaderScreen } from '@/components/AppLoader';
import { useUserStore } from '@/store/userStore';

export default function IndexScreen() {
  const { isLoggedIn, userType, loading } = useUserStore();

  if (isLoggedIn) {
    if (userType === 'admin') return <Redirect href="/(admin)/admin-events" />;
    if (userType === 'employee') return <Redirect href="/(employee)/employee-events" />;
    return <Redirect href="/(couple)" />;
  }

  if (loading) {
    return (
      <AppLoaderScreen variant="default" title="טוען" subtitle="מעביר למסך הפתיחה..." />
    );
  }

  return <Redirect href="/onboarding" />;
}
