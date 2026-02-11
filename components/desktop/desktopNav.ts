import type { DesktopNavItem } from './DesktopSidebar';
import type { UserType } from '@/store/userStore';

export function getDesktopNavForUserType(userType: UserType | null): { title: string; navItems: DesktopNavItem[] } {
  if (userType === 'admin') {
    return {
      title: 'ניהול אירועים',
      navItems: [
        { href: '/(admin)/admin-events', label: 'אירועים', icon: 'calendar-outline' },
        { href: '/(admin)/users', label: 'משתמשים', icon: 'people-circle' },
        { href: '/(admin)/admin-profile', label: 'פרופיל', icon: 'person-circle' },
      ],
    };
  }

  if (userType === 'employee') {
    return {
      title: 'צוות אירועים',
      navItems: [
        { href: '/(employee)/employee-events', label: 'אירועים', icon: 'calendar-outline' },
        { href: '/(employee)/employee-profile', label: 'פרופיל', icon: 'person-circle' },
      ],
    };
  }

  // Couple / default
  return {
    title: 'ניהול אירוע',
    navItems: [
      { href: '/(couple)', label: 'בית', icon: 'home' },
      { href: '/(couple)/guests', label: 'אורחים', icon: 'people' },
      { href: '/(couple)/BrideGroomSeating', label: 'הושבה', icon: 'grid' },
      { href: '/(couple)/brideGroomProfile', label: 'פרופיל', icon: 'person-circle' },
    ],
  };
}

