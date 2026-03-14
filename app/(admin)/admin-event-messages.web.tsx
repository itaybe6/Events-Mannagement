import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

// This screen is redundant with `/(couple)/automatic-notifications.web.tsx`.
// On web, admins cannot navigate into /(couple) because the couple web layout redirects admins
// back to `/(admin)/admin-events`. So we forward to an admin wrapper route.
export default function AdminEventMessagesWebRedirect() {
  const params = useLocalSearchParams<{ eventId?: string | string[]; returnTo?: string | string[] }>();
  const eventId = typeof params.eventId === 'string' ? params.eventId : Array.isArray(params.eventId) ? params.eventId[0] : undefined;
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : Array.isArray(params.returnTo) ? params.returnTo[0] : undefined;

  return (
    <Redirect
      href={{
        pathname: '/(admin)/automatic-notifications',
        params: {
          ...(eventId ? { eventId: String(eventId) } : {}),
          ...(returnTo ? { returnTo: String(returnTo) } : {}),
        },
      }}
    />
  );
}

