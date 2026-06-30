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

<<<<<<< HEAD
=======
  // Keep mobile-web in this file to avoid native/web route cycles.
>>>>>>> ccb73d27959e6160f8ef3d9d3cc1278550247d8d
  if (preferNativeMobileLayout) {
    return <AdminEventsListWebInner />;
  }

  return (
    <Suspense fallback={<WebScreenLoader />}>
      <AdminEventsListDesktop />
    </Suspense>
  );
}

export default function AdminEventsWebScreen() {
  const { preferNativeMobileLayout } = useMobileWebLayout();

<<<<<<< HEAD
=======
  // Keep mobile-web in this file to avoid native/web route cycles.
>>>>>>> ccb73d27959e6160f8ef3d9d3cc1278550247d8d
  if (preferNativeMobileLayout) {
    return <AdminEventsListWebInner />;
  }

  return (
    <Suspense fallback={<WebScreenLoader />}>
      <AdminEventsDesktop />
    </Suspense>
  );
}
