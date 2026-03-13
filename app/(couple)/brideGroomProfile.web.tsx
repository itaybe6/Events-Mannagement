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

  const dateLabel = useMemo(() => {
    const d = eventMeta?.date ? new Date(eventMeta.date) : null;
    if (!d || !Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, [eventMeta?.date]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Hero Card ── */}
        <View style={styles.heroOuter}>
        <View style={styles.hero}>
          <View pointerEvents="none" style={styles.heroOverlay} />
          <View pointerEvents="none" style={styles.heroPatternDots} />

          <View style={[styles.heroContent, isWide ? styles.heroContentWide : null]}>
            {/* Avatar */}
            <View style={styles.heroAvatarWrap}>
              <View style={styles.heroAvatarGlow} />
              <View style={styles.heroAvatarRing}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.heroAvatarImg} contentFit="cover" transition={180} />
                ) : (
                  <Ionicons name="person-circle" size={90} color="rgba(255,255,255,0.45)" />
                )}
              </View>
            </View>

            {/* Names + info */}
            <View style={styles.heroInfo}>
              {weddingNames ? (
                <View style={styles.heroNamesRow}>
                  <Ionicons name="heart" size={14} color={colors.gold} />
                  <Text style={styles.heroNames}>{weddingNames}</Text>
                  <Ionicons name="heart" size={14} color={colors.gold} />
                </View>
              ) : (
                <Text style={styles.heroNames}>
                  {String(userData?.name || 'פרופיל').trim()}
                </Text>
              )}

              {weddingNames ? (
                <Text style={styles.heroUserName} numberOfLines={1}>
                  {String(userData?.name || '').trim()}
                </Text>
              ) : null}

              <Text style={styles.heroEmail} numberOfLines={1}>
                {String(userData?.email || '').trim()}
              </Text>

              {dateLabel ? (
                <View style={styles.heroDatePill}>
                  <Ionicons name="calendar-outline" size={13} color={colors.gold} />
                  <Text style={styles.heroDateText}>{dateLabel}</Text>
                </View>
              ) : null}

              {eventMeta?.title ? (
                <View style={styles.heroEventPill}>
                  <Ionicons name="sparkles-outline" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.heroEventText} numberOfLines={1}>
                    {String(eventMeta.title).trim()}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Action buttons */}
            <View style={styles.heroActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="עריכת פרופיל"
                onPress={() => router.push('/profile-editor')}
                style={({ pressed, hovered }: any) => [
                  styles.heroBtn,
                  Platform.OS === 'web' && hovered ? styles.heroBtnHover : null,
                  pressed ? styles.heroBtnPressed : null,
                ]}
              >
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={styles.heroBtnText}>עריכת פרופיל</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="התנתקות"
                onPress={handleLogout}
                style={({ pressed, hovered }: any) => [
                  styles.heroBtn,
                  styles.heroBtnDanger,
                  Platform.OS === 'web' && hovered ? styles.heroBtnDangerHover : null,
                  pressed ? styles.heroBtnPressed : null,
                ]}
              >
                <Ionicons name="log-out-outline" size={16} color="#dc2626" />
                <Text style={[styles.heroBtnText, styles.heroBtnTextDanger]}>התנתקות</Text>
              </Pressable>
            </View>
          </View>
        </View>
        </View>

        {/* ── Body ── */}
        <View style={styles.contentOuter}>
          <View style={[styles.grid, isWide ? styles.gridWide : null]}>

            {/* Main column: Event details */}
            <View style={[styles.col, styles.mainCol]}>
              <View style={[styles.card, isWide ? styles.equalHeightCard : null]}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.cardHeaderIcon, { backgroundColor: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.18)' }]}>
                    <Ionicons name="calendar-outline" size={18} color="rgba(16,185,129,0.9)" />
                  </View>
                  <Text style={styles.cardTitle}>פרטי האירוע</Text>
                </View>

                {loading ? (
                  <View style={styles.skeletonBlock}>
                    <View style={styles.skeletonLine} />
                    <View style={[styles.skeletonLine, { width: '70%' }]} />
                    <View style={[styles.skeletonLine, { width: '55%' }]} />
                  </View>
                ) : !resolvedEventId ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconWrap}>
                      <Ionicons name="calendar-outline" size={28} color="rgba(15,23,42,0.22)" />
                    </View>
                    <Text style={styles.emptyTitle}>לא נבחר אירוע</Text>
                    <Text style={styles.emptySubtitle}>בחרו אירוע כדי לראות פרטים וקישורים.</Text>
                  </View>
                ) : !eventMeta ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconWrap}>
                      <Ionicons name="alert-circle-outline" size={28} color="rgba(15,23,42,0.22)" />
                    </View>
                    <Text style={styles.emptyTitle}>לא נמצאו פרטי אירוע</Text>
                    <Text style={styles.emptySubtitle}>ייתכן שהאירוע נמחק או שאין הרשאה.</Text>
                  </View>
                ) : (
                  <View style={styles.eventBody}>
                    <View style={styles.fieldsGrid}>
                      <FieldBlock
                        icon="text-outline"
                        label="שם האירוע"
                        value={String(eventMeta.title || '').trim() || '-'}
                        accentColor="rgba(16,185,129,0.75)"
                      />
                      <FieldBlock
                        icon="calendar-outline"
                        label="תאריך"
                        value={dateLabel || '-'}
                        accentColor="rgba(99,102,241,0.75)"
                      />
                      <FieldBlock
                        icon="man-outline"
                        label="חתן"
                        value={groomName || '-'}
                        accentColor="rgba(59,130,246,0.75)"
                      />
                      <FieldBlock
                        icon="woman-outline"
                        label="כלה"
                        value={brideName || '-'}
                        accentColor="rgba(236,72,153,0.75)"
                      />
                    </View>

                    <View style={styles.rsvpCard}>
                      <View style={styles.rsvpInfo}>
                        <Text style={styles.rsvpLabel}>קישור אישור הגעה</Text>
                        <Text style={styles.rsvpUrl} numberOfLines={1}>
                          {String(eventMeta.rsvpLink || '').trim() || '-'}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="פתח קישור"
                        onPress={openRsvpLink}
                        disabled={!String(eventMeta.rsvpLink || '').trim()}
                        style={({ pressed, hovered }: any) => [
                          styles.linkPill,
                          Platform.OS === 'web' && hovered ? styles.linkPillHover : null,
                          pressed ? styles.linkPillPressed : null,
                          !String(eventMeta.rsvpLink || '').trim() ? { opacity: 0.4 } : null,
                        ]}
                      >
                        <Ionicons name="open-outline" size={15} color={colors.primary} />
                        <Text style={styles.linkPillText}>פתח</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Sidebar */}
            <View style={[styles.col, styles.sideCol]}>
              <View style={[styles.card, isWide ? styles.equalHeightCard : null]}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.cardHeaderIcon, { backgroundColor: 'rgba(99,102,241,0.10)', borderColor: 'rgba(99,102,241,0.18)' }]}>
                    <Ionicons name="sparkles-outline" size={18} color="rgba(99,102,241,0.9)" />
                  </View>
                  <Text style={styles.cardTitle}>טיפים מהירים</Text>
                </View>

                <View style={styles.tipsGrid}>
                  <TipItem
                    icon="create-outline"
                    color="rgba(99,102,241,0.9)"
                    bg="rgba(99,102,241,0.08)"
                    title="עדכנו פרטים"
                    subtitle="שמרו על שם ותמונת פרופיל מעודכנים."
                  />
                  <TipItem
                    icon="people-outline"
                    color="rgba(16,185,129,0.9)"
                    bg="rgba(16,185,129,0.08)"
                    title="ניהול אורחים"
                    subtitle="עקבו אחר אישורי הגעה ורשימות מוזמנים."
                  />
                  <TipItem
                    icon="shield-checkmark-outline"
                    color="rgba(239,68,68,0.8)"
                    bg="rgba(239,68,68,0.07)"
                    title="בטיחות"
                    subtitle="התנתקו תמיד ממחשבים משותפים."
                  />
                  <TipItem
                    icon="notifications-outline"
                    color="rgba(245,158,11,0.9)"
                    bg="rgba(245,158,11,0.08)"
                    title="תזכורות"
                    subtitle="הגדירו הודעות אוטומטיות מראש."
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={{ height: 24 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function FieldBlock({
  icon,
  label,
  value,
  accentColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accentColor: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <View style={[styles.fieldAccentBar, { backgroundColor: accentColor }]} />
      <View style={styles.fieldBlockBody}>
        <View style={styles.fieldLabelRow}>
          <Ionicons name={icon} size={11} color={colors.gray[500]} />
          <Text style={styles.fieldLabel}>{label}</Text>
        </View>
        <Text style={styles.fieldValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function TipItem({
  icon,
  color,
  bg,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.tipCard}>
      <View style={[styles.tipIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={17} color={color} />
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
    backgroundColor: '#eef0f5',
    // @ts-expect-error
    direction: 'rtl',
  },

  bgShapes: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  shapeTopRight: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 560,
    height: 560,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(6,23,62,0.07) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(6,23,62,0.07)' }),
  },
  shapeBottomLeft: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 660,
    height: 660,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(204,160,0,0.07) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(204,160,0,0.07)' }),
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 36 },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroOuter: {
    paddingHorizontal: 22,
    paddingTop: 22,
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    borderRadius: 28,
    overflow: 'hidden',
    paddingVertical: 40,
    paddingHorizontal: 36,
    position: 'relative',
    backgroundColor: '#001D3D',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.22)',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(135deg, #06173e 0%, #001D3D 55%, #003566 100%)',
          boxShadow: '0 4px 6px rgba(0,0,0,0.07), 0 20px 60px rgba(6,23,62,0.22), inset 0 1px 0 rgba(255,255,255,0.06)',
        } as any)
      : null),
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: [
            'radial-gradient(ellipse at 90% 10%, rgba(204,160,0,0.18) 0%, transparent 50%)',
            'radial-gradient(ellipse at 5% 90%, rgba(0,53,102,0.6) 0%, transparent 50%)',
          ].join(', '),
          pointerEvents: 'none',
        } as any)
      : null),
  },
  heroPatternDots: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          pointerEvents: 'none',
        } as any)
      : null),
  },

  heroContent: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 28,
    flexWrap: 'wrap',
  },
  heroContentWide: {
    flexWrap: 'nowrap',
  },

  heroAvatarWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 0 40px rgba(204,160,0,0.30), 0 0 80px rgba(204,160,0,0.10)',
          pointerEvents: 'none',
        } as any)
      : null),
  },
  heroAvatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 3,
    borderColor: colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroAvatarImg: { width: 112, height: 112 },

  heroInfo: {
    flex: 1,
    minWidth: 220,
    alignItems: 'flex-end',
    gap: 5,
  },
  heroNamesRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 9,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  heroNames: {
    fontSize: 27,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'right',
    writingDirection: 'rtl',
    letterSpacing: 0.3,
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0 2px 12px rgba(0,0,0,0.25)' } as any)
      : null),
  },
  heroUserName: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 1,
  },
  heroEmail: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroDatePill: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(204,160,0,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.32)',
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
  heroDateText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
    writingDirection: 'rtl',
  },
  heroEventPill: {
    marginTop: 4,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
  heroEventText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.58)',
    writingDirection: 'rtl',
  },

  heroActions: {
    gap: 10,
    alignItems: 'stretch',
    minWidth: 168,
  },
  heroBtn: {
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
        } as any)
      : null),
  },
  heroBtnHover: {
    ...(Platform.OS === 'web'
      ? ({ transform: 'translateY(-2px)', boxShadow: '0 6px 18px rgba(0,0,0,0.20)' } as any)
      : null),
  },
  heroBtnPressed: { opacity: 0.88 },
  heroBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    writingDirection: 'rtl',
  },
  heroBtnDanger: {
    backgroundColor: 'rgba(254,226,226,0.96)',
  },
  heroBtnDangerHover: {
    ...(Platform.OS === 'web'
      ? ({ transform: 'translateY(-2px)', boxShadow: '0 6px 18px rgba(220,38,38,0.18)' } as any)
      : null),
  },
  heroBtnTextDanger: { color: '#dc2626' },

  // ── Body ─────────────────────────────────────────────────────────────────
  contentOuter: {
    paddingHorizontal: 22,
    paddingTop: 26,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },

  grid: { gap: 20 },
  gridWide: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
  },
  col: { minWidth: 0, gap: 20 },
  mainCol: { flex: 1 },
  sideCol: {
    flexBasis: 380,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  equalHeightCard: {
    flex: 1,
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    padding: 24,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 10px 40px rgba(6,23,62,0.07)',
        } as any)
      : null),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
    justifyContent: 'flex-end',
  },
  cardHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    letterSpacing: 0.1,
  },

  // ── Event fields ──────────────────────────────────────────────────────────
  eventBody: { gap: 12 },
  fieldsGrid: { gap: 10 },

  fieldBlock: {
    flexDirection: 'row-reverse',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f8f9fc',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
  },
  fieldAccentBar: {
    width: 4,
    borderRadius: 0,
  },
  fieldBlockBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  fieldLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  // ── RSVP row ─────────────────────────────────────────────────────────────
  rsvpCard: {
    borderRadius: 14,
    backgroundColor: '#f8f9fc',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  rsvpInfo: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 3,
  },
  rsvpLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  rsvpUrl: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    opacity: 0.65,
  },

  linkPill: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(6,23,62,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.13)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  linkPillHover: { backgroundColor: 'rgba(6,23,62,0.11)' },
  linkPillPressed: { opacity: 0.88 },
  linkPillText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    writingDirection: 'rtl',
  },

  // ── Skeletons ─────────────────────────────────────────────────────────────
  skeletonBlock: { gap: 11, marginTop: 4 },
  skeletonLine: {
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.07)',
    width: '88%',
    alignSelf: 'flex-end',
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(15,23,42,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  // ── Tips ─────────────────────────────────────────────────────────────────
  tipsGrid: { gap: 10 },
  tipCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f8f9fc',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tipSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
