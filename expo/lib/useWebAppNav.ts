import { useMemo } from 'react';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';

import { getWebAppNav, getWebPathLeaf, type WebAppNavItem } from '@/lib/webAppNav';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';

export function useWebAppNav() {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ id?: string | string[]; eventId?: string | string[] }>();
  const userType = useUserStore((state) => state.userType);
  const userData = useUserStore((state) => state.userData);
  const activeUserId = useEventSelectionStore((state) => state.activeUserId);
  const activeEventId = useEventSelectionStore((state) => state.activeEventId);

  const paramEventId = useMemo(() => {
    const fromEventId = Array.isArray(globalParams.eventId) ? globalParams.eventId[0] : globalParams.eventId;
    const fromId = Array.isArray(globalParams.id) ? globalParams.id[0] : globalParams.id;
    return String(fromEventId || fromId || '').trim();
  }, [globalParams.eventId, globalParams.id]);

  const resolvedEventId = useMemo(() => {
    if (paramEventId) return paramEventId;
    if (userType === 'event_owner') {
      const stored =
        userData?.id && activeUserId === userData.id ? String(activeEventId || '').trim() : '';
      return stored || String(userData?.event_id || '').trim();
    }
    return '';
  }, [activeEventId, activeUserId, paramEventId, userData?.event_id, userData?.id, userType]);

  const { inEvent, sections } = useMemo(
    () =>
      getWebAppNav({
        userType,
        pathname: pathname || '/',
        eventId: resolvedEventId,
      }),
    [pathname, resolvedEventId, userType]
  );

  const currentLeaf = getWebPathLeaf(pathname || '/');

  const navigate = (item: WebAppNavItem) => {
    if (item.params) {
      router.push({ pathname: item.href as any, params: item.params as any });
      return;
    }
    router.push(item.href as any);
  };

  return {
    userType,
    userData,
    inEvent,
    sections,
    currentLeaf,
    resolvedEventId,
    navigate,
  };
}
