import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Slot, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EventSwitcher } from '@/components/EventSwitcher';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import CoupleWebTopNav from '@/components/desktop/CoupleWebTopNav';
import CoupleProfileShortcutBadge from '@/components/desktop/CoupleProfileShortcutBadge';

function getWebPathname() {
  if (Platform.OS === 'web' && typeof (globalThis as any)?.location?.pathname === 'string') {
    return String((globalThis as any).location.pathname);
  }
  return '';
}

function isCoupleHomePath(path: string) {
  const normalized = String(path || '').trim().replace(/\/+$/, '') || '/';
  return normalized === '/' || normalized === '/index';
}

export default function CoupleWebLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ eventId?: string | string[] }>();
  const { userType, isLoggedIn, loading, userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const [hasMultipleEvents, setHasMultipleEvents] = useState(false);
  const [eventMeta, setEventMeta] = useState<any>(null);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (userType === 'admin') {
      router.replace('/(admin)/admin-events');
      return;
    }
    if (userType === 'employee') {
      router.replace('/(employee)/employee-events');
    }
  }, [isLoggedIn, userType, loading, router]);

  const queryEventId = Array.isArray(globalParams.eventId) ? globalParams.eventId[0] : globalParams.eventId;
  const resolvedEventId = useMemo(() => {
    return (
      String(
        queryEventId ||
          (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
          userData?.event_id ||
          ''
      ).trim() || null
    );
  }, [activeEventId, activeUserId, queryEventId, userData?.event_id, userData?.id]);

  const handleSelectEventId = (nextEventId: string) => {
    if (userData?.id) setActiveEvent(userData.id, nextEventId);

    const cleanedParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(globalParams || {})) {
      if (typeof v === 'string') cleanedParams[k] = v;
    }
    cleanedParams.eventId = nextEventId;

    router.replace({
      // expo-router web usually exposes pathname without group segments
      pathname: (pathname || '/(couple)') as any,
      params: cleanedParams as any,
    });
  };

  const handleHasMultipleChange = useCallback((value: boolean) => {
    setHasMultipleEvents(value);
  }, []);

  useEffect(() => {
    let active = true;

    const loadEventMeta = async () => {
      if (!resolvedEventId) {
        if (active) setEventMeta(null);
        return;
      }

      try {
        const event = await eventService.getEvent(resolvedEventId);
        if (active) setEventMeta(event);
      } catch (error) {
        if (active) setEventMeta(null);
        console.error('Failed to load couple web event shell metadata:', error);
      }
    };

    void loadEventMeta();
    return () => {
      active = false;
    };
  }, [resolvedEventId]);

  const normalizedPathname = useMemo(() => {
    const candidate = Platform.OS === 'web' ? getWebPathname() || pathname || '' : pathname || '';
    return String(candidate).replace(/\/\([^/]+\)/g, '') || '/';
  }, [pathname]);

  const headerTitle = useMemo(() => {
    const groom = String((eventMeta as any)?.groomName || (eventMeta as any)?.groom_name || '').trim();
    const bride = String((eventMeta as any)?.brideName || (eventMeta as any)?.bride_name || '').trim();
    if (groom && bride) return `${groom} ו${bride}`;
    const title = String((eventMeta as any)?.title || '').trim();
    if (title) return title;
    return 'ניהול האירוע';
  }, [eventMeta]);

  const eventDateLabel = useMemo(() => {
    const raw = (eventMeta as any)?.date;
    if (!raw) return '';
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return '';
    return parsed.toLocaleDateString('he-IL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [eventMeta]);

  const eventLocationLabel = useMemo(() => {
    const location = String((eventMeta as any)?.location || '').trim();
    const city = String((eventMeta as any)?.city || '').trim();
    return [location, city].filter(Boolean).join(' · ');
  }, [eventMeta]);
  const usePageScrollShell = isCoupleHomePath(normalizedPathname) || Platform.OS === 'web';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>טוען...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View pointerEvents="none" style={styles.bgOrbs}>
        <View style={styles.bgOrbTopRight} />
        <View style={styles.bgOrbTopLeft} />
      </View>

      <View style={styles.shell}>
        {usePageScrollShell ? (
          <ScrollView
            style={styles.pageScroll}
            contentContainerStyle={styles.pageScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerWrap}>
              <AdminWebPageHeader
                eyebrow="אזור בעל האירוע"
                title={headerTitle}
                titleMeta={
                  <View style={styles.headerMetaRow}>
                    {eventDateLabel ? (
                      <View style={styles.headerMetaChip}>
                        <Text style={styles.headerMetaText}>{eventDateLabel}</Text>
                      </View>
                    ) : null}
                    {eventLocationLabel ? (
                      <View style={styles.headerMetaChip}>
                        <Text style={styles.headerMetaText}>{eventLocationLabel}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.headerEventSwitcherWrap, !hasMultipleEvents ? styles.headerEventSwitcherWrapHidden : null]}>
                      <EventSwitcher
                        userId={userData?.id}
                        selectedEventId={resolvedEventId}
                        onSelectEventId={handleSelectEventId}
                        label="אירוע פעיל"
                        onHasMultipleChange={handleHasMultipleChange}
                      />
                    </View>
                  </View>
                }
                hideSubtitleDivider
                subtitleContent={
                  <View style={styles.headerContent}>
                    <View style={styles.headerNavWrap}>
                      <View style={styles.headerNavSectionHeader}>
                        <View style={styles.headerNavSectionDivider} />
                        <Text style={styles.headerNavSectionLabel}>ניווט מהיר</Text>
                      </View>
                      <CoupleWebTopNav eventId={resolvedEventId} />
                    </View>
                  </View>
                }
                showNav={false}
                useDefaultActions={false}
                actions={<CoupleProfileShortcutBadge />}
              />
            </View>

            <View style={styles.pageScrollSlot}>
              <Slot />
            </View>
          </ScrollView>
        ) : (
          <>
            <View style={styles.headerWrap}>
              <AdminWebPageHeader
                eyebrow="אזור בעל האירוע"
                title={headerTitle}
                titleMeta={
                  <View style={styles.headerMetaRow}>
                    {eventDateLabel ? (
                      <View style={styles.headerMetaChip}>
                        <Text style={styles.headerMetaText}>{eventDateLabel}</Text>
                      </View>
                    ) : null}
                    {eventLocationLabel ? (
                      <View style={styles.headerMetaChip}>
                        <Text style={styles.headerMetaText}>{eventLocationLabel}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.headerEventSwitcherWrap, !hasMultipleEvents ? styles.headerEventSwitcherWrapHidden : null]}>
                      <EventSwitcher
                        userId={userData?.id}
                        selectedEventId={resolvedEventId}
                        onSelectEventId={handleSelectEventId}
                        label="אירוע פעיל"
                        onHasMultipleChange={handleHasMultipleChange}
                      />
                    </View>
                  </View>
                }
                hideSubtitleDivider
                subtitleContent={
                  <View style={styles.headerContent}>
                    <View style={styles.headerNavWrap}>
                      <View style={styles.headerNavSectionHeader}>
                        <View style={styles.headerNavSectionDivider} />
                        <Text style={styles.headerNavSectionLabel}>ניווט מהיר</Text>
                      </View>
                      <CoupleWebTopNav eventId={resolvedEventId} />
                    </View>
                  </View>
                }
                showNav={false}
                useDefaultActions={false}
                actions={<CoupleProfileShortcutBadge />}
              />
            </View>

            <View
              style={[
                styles.content,
                normalizedPathname === '/BrideGroomSeating' ? styles.contentForSeating : null,
              ]}
            >
              <Slot />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7FAFF',
    ...(Platform.OS === 'web'
      ? ({
          minHeight: '100vh',
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.14), rgba(25,93,230,0) 40%), radial-gradient(circle at top left, rgba(232,241,255,0.95), rgba(232,241,255,0) 34%), radial-gradient(circle at bottom left, rgba(242,224,186,0.34), rgba(242,224,186,0) 32%), radial-gradient(circle at bottom center, rgba(240,203,70,0.12), rgba(240,203,70,0) 26%)',
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat',
        } as any)
      : null),
  },
  bgOrbs: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  bgOrbTopRight: {
    position: 'absolute',
    top: -180,
    right: -120,
    width: 520,
    height: 520,
    borderRadius: 999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(25,93,230,0.14) 0%, rgba(25,93,230,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(25,93,230,0.10)' }),
  },
  bgOrbTopLeft: {
    position: 'absolute',
    top: -220,
    left: -160,
    width: 480,
    height: 480,
    borderRadius: 999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(240,203,70,0.18) 0%, rgba(240,203,70,0) 72%)',
        } as any)
      : { backgroundColor: 'rgba(240,203,70,0.12)' }),
  },
  shell: {
    flex: 1,
    minWidth: 0,
  },
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    paddingBottom: 24,
  },
  pageScrollSlot: {
    minWidth: 0,
    marginTop: -4,
  },
  headerWrap: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  headerContent: {
    gap: 16,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  headerMetaChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
  },
  headerMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  headerEventSwitcherWrap: {
    minWidth: 280,
    flexGrow: 1,
  },
  headerEventSwitcherWrapHidden: {
    display: 'none',
  },
  headerNavWrap: {
    minHeight: 42,
    justifyContent: 'center',
    gap: 12,
  },
  headerNavSectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  headerNavSectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  headerNavSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    letterSpacing: 0.2,
    textAlign: 'right',
  },
  content: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
  },
  contentForSeating: {
    overflow: 'visible',
  },
  center: {
    flex: 1,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.gray[600],
  },
});

