import React, { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';

import AdminEventsScreen from './admin-events';
import { colors } from '@/constants/colors';
import { useMobileWebLayout } from '@/lib/useMobileWebLayout';

const AdminEventsDesktop = React.lazy(() => import('@/features/admin/admin-events-desktop.web'));
const AdminEventsListDesktop = React.lazy(() =>
  import('@/features/admin/admin-events-desktop.web').then((module) => ({
    default: module.AdminEventsListWebScreen,
  }))
);

function WebScreenLoader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray[100] }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function AdminEventsListWebScreen() {
  const { preferNativeMobileLayout } = useMobileWebLayout();

  if (preferNativeMobileLayout) {
    return <AdminEventsScreen />;
  }

  return (
    <Suspense fallback={<WebScreenLoader />}>
      <AdminEventsListDesktop />
    </Suspense>
  );
}

export default function AdminEventsWebScreen() {
  const { preferNativeMobileLayout } = useMobileWebLayout();

  if (preferNativeMobileLayout) {
    return <AdminEventsScreen />;
  }

  return (
    <Suspense fallback={<WebScreenLoader />}>
      <AdminEventsDesktop />
    </Suspense>
  );
}
