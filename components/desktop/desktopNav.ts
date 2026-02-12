import type { UserType } from '@/store/userStore';
import type { DesktopNavItem } from '@/components/desktop/DesktopSidebar';

export type DesktopNavConfig = {
  title: string;
  navItems: DesktopNavItem[];
};

export function getDesktopNavForUserType(userType: UserType | null | undefined): DesktopNavConfig {
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

  // event_owner (couple) is the default for logged-in users
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

