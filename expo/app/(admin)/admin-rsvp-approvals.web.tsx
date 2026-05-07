import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

// This screen is redundant with `/(couple)/guests.web.tsx`.
// On web, admins cannot navigate into /(couple) because the couple web layout redirects admins
// back to `/(admin)/admin-events`. So we forward to an admin wrapper route.
export default function AdminRsvpApprovalsWebRedirect() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();

  return (
    <Redirect
      href={{
        pathname: '/(admin)/guests',
        params: eventId ? { eventId: String(eventId) } : {},
      }}
    />
  );
}

