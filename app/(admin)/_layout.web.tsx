import React from 'react';
import { Slot } from 'expo-router';
import { WebScaffold } from '@/components/WebScaffold';

export default function AdminWebLayout() {
  return (
    <WebScaffold
      title="מערכת מנהל"
      navItems={[
        { href: '/(admin)/admin-events', label: 'אירועים', icon: 'calendar-outline' },
        { href: '/(admin)/users', label: 'משתמשים', icon: 'people-circle' },
        { href: '/(admin)/admin-profile', label: 'פרופיל', icon: 'person-circle' },
      ]}
    >
      <Slot />
    </WebScaffold>
  );
}

