import React from 'react';
import { Slot } from 'expo-router';
import { WebScaffold } from '@/components/WebScaffold';

export default function CoupleWebLayout() {
  return (
    <WebScaffold
      title="מערכת זוג"
      navItems={[
        { href: '/(couple)', label: 'דשבורד', icon: 'home' },
        { href: '/(couple)/guests', label: 'אורחים', icon: 'people' },
        { href: '/(couple)/BrideGroomSeating', label: 'סידור הושבה', icon: 'grid' },
        { href: '/(couple)/brideGroomProfile', label: 'הגדרות', icon: 'settings' },
      ]}
    >
      <Slot />
    </WebScaffold>
  );
}

