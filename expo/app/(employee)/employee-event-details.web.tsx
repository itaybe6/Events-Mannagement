import React, { useMemo } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function EmployeeEventDetailsWebScreen() {
  const { id } = useLocalSearchParams();
  const eventId = useMemo(() => (typeof id === 'string' ? id : Array.isArray(id) ? id[0] : ''), [id]);

  if (!eventId) return <Redirect href="/(admin)/admin-events" />;
  return <Redirect href={{ pathname: '/(admin)/admin-event-details', params: { id: eventId } }} />;
}

