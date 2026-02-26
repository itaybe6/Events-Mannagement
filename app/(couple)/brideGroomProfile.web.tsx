import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';

export default function BrideGroomProfileWebScreen() {
  const router = useRouter();
  const globalParams = useGlobalSearchParams<{ eventId?: string | string[] }>();
  const { userData, logout } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [eventMeta, setEventMeta] = useState<{
    id: string;
    title: string;
    date: Date;
    groomName?: string;
    brideName?: string;
    rsvpLink?: string;
  } | null>(null);

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

  const isWide = width >= 1024;
  const avatarUri = String(userData?.avatar_url || '').trim();

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!userData?.id) {
        if (active) setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Best-effort refresh avatar url from DB
        const { data: avatarRow } = await supabase
          .from('users')
          .select('avatar_url')
          .eq('id', userData.id)
          .maybeSingle();

        const nextUrl = avatarRow?.avatar_url ? String((avatarRow as any).avatar_url).trim() : '';
        if (nextUrl && nextUrl !== String(userData.avatar_url || '').trim()) {
          useUserStore.setState((state) => ({
            userData: state.userData ? { ...state.userData, avatar_url: nextUrl } : state.userData,
          }));
        }

        if (!resolvedEventId) {
          setEventMeta(null);
          return;
        }

        const { data: eventRow, error } = await supabase
          .from('events')
          .select('id, title, date, groom_name, bride_name, rsvp_link')
          .eq('id', resolvedEventId)
          .maybeSingle();

        if (error || !eventRow) {
          setEventMeta(null);
          return;
        }

        setEventMeta({
          id: (eventRow as any).id,
          title: String((eventRow as any).title || ''),
          date: new Date((eventRow as any).date),
          groomName: (eventRow as any).groom_name ?? undefined,
          brideName: (eventRow as any).bride_name ?? undefined,
          rsvpLink: (eventRow as any).rsvp_link ?? undefined,
        });
      } catch (e) {
        console.error('Error loading couple profile (web):', e);
        setEventMeta(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [resolvedEventId, userData?.avatar_url, userData?.id]);

  const groomName = String(eventMeta?.groomName ?? '').trim();
  const brideName = String(eventMeta?.brideName ?? '').trim();
  const weddingNames = groomName && brideName ? `${groomName} ו${brideName}` : '';

  const displayTitle = weddingNames || String(userData?.name || 'פרופיל').trim() || 'פרופיל';
  const displaySubtitle = eventMeta?.title ? `אירוע: ${String(eventMeta.title).trim()}` : 'פרטי משתמש ואירוע';

  const dateLabel = useMemo(() => {
    const d = eventMeta?.date ? new Date(eventMeta.date) : null;
    if (!d || !Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, [eventMeta?.date]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const openAutomaticNotifications = () => {
    if (!resolvedEventId) return;
    router.push({
      pathname: '/(couple)/automatic-notifications',
      params: { eventId: resolvedEventId },
    } as any);
  };

  const openRsvpLink = async () => {
    const link = String(eventMeta?.rsvpLink || '').trim();
    if (!link) return;
    try {
      await Linking.openURL(link);
    } catch {
      // noop
    }
  };

  return (
    <View style={styles.page}>
      <View pointerEvents="none" style={styles.bgShapes}>
        <View style={styles.shapeTopRight} />
        <View style={styles.shapeBottomLeft} />
      </View>

      <DesktopTopBar
        title={displayTitle}
        subtitle={displaySubtitle}
        rightActions={
          <>
            <TopBarIconButton icon="create-outline" label="עריכת פרופיל" onPress={() => router.push('/profile-editor')} />
            <TopBarIconButton
              icon="chatbubble-ellipses-outline"
              label="הודעות אוטומטיות"
              onPress={openAutomaticNotifications}
              disabled={!resolvedEventId}
            />
          </>
        }
        leftActions={<TopBarIconButton icon="log-out-outline" label="התנתקות" onPress={handleLogout} />}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.contentOuter}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="person-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>פרטי חשבון</Text>
            </View>

            <View style={[styles.profileRow, isWide ? styles.profileRowWide : null]}>
              <View style={styles.avatarRing}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" transition={120} />
                ) : (
                  <Ionicons name="person-circle" size={92} color={colors.primary} />
                )}
              </View>

              <View style={styles.profileMeta}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {weddingNames || String(userData?.name || '').trim() || 'משתמש'}
                </Text>
                {weddingNames ? (
                  <Text style={styles.profileSub} numberOfLines={1}>
                    {String(userData?.name || '').trim()}
                  </Text>
                ) : null}
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {String(userData?.email || '').trim()}
                </Text>
              </View>

              <View style={[styles.actionsRow, !isWide ? styles.actionsRowStack : null]}>
                <PrimaryButton label="עריכת פרופיל" icon="create-outline" onPress={() => router.push('/profile-editor')} />
                <PrimaryButton
                  label="הודעות אוטומטיות"
                  icon="chatbubble-ellipses-outline"
                  onPress={openAutomaticNotifications}
                  disabled={!resolvedEventId}
                />
                <SecondaryButton label="התנתקות" icon="log-out-outline" onPress={handleLogout} danger />
              </View>
            </View>
          </View>

          <View style={[styles.grid, isWide ? styles.gridWide : null]}>
            <View style={[styles.col, styles.mainCol]}>
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View
                    style={[
                      styles.cardHeaderIcon,
                      { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.18)' },
                    ]}
                  >
                    <Ionicons name="calendar-outline" size={18} color="rgba(16,185,129,0.95)" />
                  </View>
                  <Text style={styles.cardTitle}>פרטי אירוע</Text>
                </View>

                {loading ? (
                  <View style={styles.skeletonBlock}>
                    <View style={styles.skeletonLine} />
                    <View style={[styles.skeletonLine, { width: '72%' }]} />
                    <View style={[styles.skeletonLine, { width: '60%' }]} />
                  </View>
                ) : !resolvedEventId ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>לא נבחר אירוע</Text>
                    <Text style={styles.emptySubtitle}>בחרו אירוע כדי לראות פרטים וקישורים.</Text>
                  </View>
                ) : !eventMeta ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>לא נמצאו פרטי אירוע</Text>
                    <Text style={styles.emptySubtitle}>ייתכן שהאירוע נמחק או שאין הרשאה.</Text>
                  </View>
                ) : (
                  <View style={styles.kvList}>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>שם האירוע</Text>
                      <Text style={styles.kvValue} numberOfLines={2}>
                        {String(eventMeta.title || '').trim() || '-'}
                      </Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>תאריך</Text>
                      <Text style={styles.kvValue} numberOfLines={1}>
                        {dateLabel || '-'}
                      </Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>חתן</Text>
                      <Text style={styles.kvValue} numberOfLines={1}>
                        {groomName || '-'}
                      </Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>כלה</Text>
                      <Text style={styles.kvValue} numberOfLines={1}>
                        {brideName || '-'}
                      </Text>
                    </View>
                    <View style={styles.kvRow}>
                      <Text style={styles.kvLabel}>קישור אישור הגעה</Text>
                      <View style={styles.kvInlineActions}>
                        <Text style={[styles.kvValue, { maxWidth: isWide ? 520 : 260 }]} numberOfLines={1}>
                          {String(eventMeta.rsvpLink || '').trim() || '-'}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="פתח קישור"
                          onPress={openRsvpLink}
                          disabled={!String(eventMeta.rsvpLink || '').trim()}
                          style={({ pressed, hovered }: any) => [
                            styles.linkPill,
                            Platform.OS === 'web' && hovered ? styles.linkPillHover : null,
                            pressed ? styles.linkPillPressed : null,
                            !String(eventMeta.rsvpLink || '').trim() ? { opacity: 0.5 } : null,
                          ]}
                        >
                          <Ionicons name="open-outline" size={16} color={colors.primary} />
                          <Text style={styles.linkPillText}>פתח</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View style={[styles.col, styles.sideCol, isWide ? styles.sideColStagger : null]}>
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View
                    style={[
                      styles.cardHeaderIcon,
                      { backgroundColor: 'rgba(99,102,241,0.10)', borderColor: 'rgba(99,102,241,0.18)' },
                    ]}
                  >
                    <Ionicons name="sparkles-outline" size={18} color="rgba(99,102,241,0.95)" />
                  </View>
                  <Text style={styles.cardTitle}>טיפים מהירים</Text>
                </View>

                <View style={styles.tipsGrid}>
                  <TipItem icon="create-outline" title="עדכנו פרטים" subtitle="שמרו על שם ותמונה מעודכנים." />
                  <TipItem icon="chatbubble-ellipses-outline" title="הודעות אוטומטיות" subtitle="הגדירו תזמונים ותוכן מראש." />
                  <TipItem icon="shield-checkmark-outline" title="בטיחות" subtitle="התנתקו ממחשבים משותפים." />
                </View>
              </View>
            </View>
          </View>

          <View style={{ height: 16 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function PrimaryButton({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }: any) => [
        styles.btnPrimary,
        Platform.OS === 'web' && hovered && !disabled ? styles.btnPrimaryHover : null,
        pressed && !disabled ? styles.btnPressed : null,
        disabled ? styles.btnDisabled : null,
      ]}
    >
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={styles.btnPrimaryText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  icon,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const isDanger = Boolean(danger);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }: any) => [
        styles.btnSecondary,
        isDanger ? styles.btnSecondaryDanger : null,
        Platform.OS === 'web' && hovered && !disabled ? styles.btnSecondaryHover : null,
        pressed && !disabled ? styles.btnPressed : null,
        disabled ? styles.btnDisabled : null,
      ]}
    >
      <Ionicons name={icon} size={18} color={isDanger ? 'rgba(239,68,68,0.95)' : colors.primary} />
      <Text style={[styles.btnSecondaryText, isDanger ? styles.btnSecondaryTextDanger : null]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function TipItem({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.tipCard}>
      <View style={styles.tipIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.tipTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.tipSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f6f7f8',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },

  bgShapes: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  shapeTopRight: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 720,
    height: 720,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.10) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(59,130,246,0.10)' }),
  },
  shapeBottomLeft: {
    position: 'absolute',
    bottom: -140,
    left: -160,
    width: 860,
    height: 860,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(139,92,246,0.07)' }),
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 28 },

  contentOuter: {
    paddingHorizontal: 18,
    paddingTop: 18,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },

  grid: {
    marginTop: 16,
    gap: 16,
  },
  gridWide: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
  },
  col: {
    minWidth: 0,
    gap: 16,
  },
  mainCol: {
    flex: 1,
  },
  sideCol: {
    flexBasis: 420,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  sideColStagger: {
    marginTop: 22,
  },

  card: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.78)',
    padding: 18,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 0 0 1px rgba(11,48,65,0.02), 0 14px 40px rgba(11,48,65,0.08)',
        } as any)
      : null),
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  cardHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  profileRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  profileRowWide: {
    alignItems: 'flex-start',
  },
  avatarRing: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 98, height: 98 },
  profileMeta: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  profileName: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  profileSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileEmail: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
    marginVertical: 14,
  },

  kvList: { gap: 10 },
  kvRow: { gap: 6 },
  kvLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  kvValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  kvInlineActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  actionsStack: { marginTop: 16, gap: 10 },
  actionsRow: {
    flex: 1,
    minWidth: 0,
    gap: 10,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  actionsRowStack: {
    width: '100%',
    marginTop: 14,
  },
  btnPrimary: {
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  btnPrimaryHover: { backgroundColor: '#1347d4' },
  btnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff', writingDirection: 'rtl' },
  btnSecondary: {
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  btnSecondaryHover: { backgroundColor: 'rgba(15,69,230,0.12)' },
  btnSecondaryText: { fontSize: 14, fontWeight: '900', color: colors.primary, writingDirection: 'rtl' },
  btnSecondaryDanger: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.16)',
  },
  btnSecondaryTextDanger: { color: 'rgba(239,68,68,0.95)' },
  btnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  btnDisabled: { opacity: 0.55 },

  linkPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  linkPillHover: { backgroundColor: 'rgba(15,69,230,0.12)' },
  linkPillPressed: { opacity: 0.92 },
  linkPillText: { fontSize: 12, fontWeight: '900', color: colors.primary, writingDirection: 'rtl' },

  skeletonBlock: { gap: 10, marginTop: 6 },
  skeletonLine: {
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.08)',
    width: '86%',
    alignSelf: 'flex-end',
  },

  emptyState: {
    marginTop: 8,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    alignItems: 'flex-end',
    gap: 6,
  },
  emptyTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  tipsGrid: {
    gap: 10,
  },
  tipCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  tipIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  tipSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

