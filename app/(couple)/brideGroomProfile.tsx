import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';

export default function BrideGroomSettings() {
  const { userData, logout } = useUserStore();
  const router = useRouter();
  const [eventMeta, setEventMeta] = useState<{
    id: string;
    title: string;
    date: Date;
    groomName?: string;
    brideName?: string;
    rsvpLink?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const AVATAR_SIZE = 104;
  const avatarUri = userData?.avatar_url?.trim() || '';

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
        if (nextUrl && nextUrl !== (userData.avatar_url || '').trim()) {
          useUserStore.setState((state) => ({
            userData: state.userData ? { ...state.userData, avatar_url: nextUrl } : state.userData,
          }));
        }

        if (!userData.event_id) {
          setEventMeta(null);
          return;
        }

        const { data: eventRow, error } = await supabase
          .from('events')
          .select('id, title, date, groom_name, bride_name, rsvp_link')
          .eq('id', userData.event_id)
          .maybeSingle();

        if (error) {
          console.warn('Failed to load event meta:', error);
          setEventMeta(null);
          return;
        }

        if (!eventRow) {
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
        console.error('Error loading couple profile:', e);
        Alert.alert('שגיאה', 'לא ניתן לטעון את הפרופיל');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [userData?.id, userData?.event_id]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const groomName = String(eventMeta?.groomName ?? '').trim();
  const brideName = String(eventMeta?.brideName ?? '').trim();
  const weddingNames = groomName && brideName ? `${groomName} ו${brideName}` : '';

  const getEventCoverSource = () => {
    const title = String(eventMeta?.title ?? '').toLowerCase();

    const hasBarMitzvah =
      title.includes('בר מצו') || title.includes('בר-מצו') || title.includes('bar mitz');
    const hasBaby =
      title.includes('ברית') ||
      title.includes('בריתה') ||
      title.includes('תינוק') ||
      title.includes('תינוקת') ||
      title.includes('baby') ||
      title.includes('בייבי');

    if (hasBarMitzvah) return require('../../assets/images/Bar Mitzvah.jpg');
    if (hasBaby) return require('../../assets/images/baby.jpg');

    const hasCoupleNames = Boolean(eventMeta?.groomName || eventMeta?.brideName);
    const isWedding = hasCoupleNames || title.includes('חתונה') || title.includes('wedding');
    if (isWedding) return require('../../assets/images/bride and groom.jpg');

    return require('../../assets/images/wedding.jpg');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>טוען הגדרות...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.editProfileIconButton} onPress={() => router.push('/profile-editor')}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </TouchableOpacity>

          <View style={styles.eventCoverWrap}>
            <Image
              source={getEventCoverSource()}
              style={styles.eventCoverImg}
              contentFit="cover"
              transition={150}
            />
          </View>

          <View style={styles.profileContent}>
          
          <View style={styles.profileIconContainer}>
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.profileAvatar}
                contentFit="cover"
                transition={120}
              />
            ) : (
              <Ionicons name="person-circle" size={AVATAR_SIZE} color={colors.primary} />
            )}
          </View>
          <Text style={styles.profileName}>{weddingNames || userData?.name}</Text>
          {weddingNames ? <Text style={styles.profileSubName}>{userData?.name}</Text> : null}
          <Text style={styles.profileEmail}>{userData?.email}</Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.textLight,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 120,
  },
  profileCard: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 32,
    position: 'relative',
    overflow: 'hidden',
  },
  eventCoverWrap: {
    width: '100%',
    height: 140,
    backgroundColor: colors.gray[100],
    position: 'relative',
  },
  eventCoverImg: {
    width: '100%',
    height: '100%',
  },
  profileContent: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  profileIconContainer: {
    marginTop: -52,
    marginBottom: 16,
  },
  profileAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: colors.gray[100],
  },
  profileName: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  profileSubName: {
    marginTop: -2,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 6,
  },
  profileEmail: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'center',
  },
  editProfileIconButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 1,
  },
  editMessagesButton: {
    backgroundColor: colors.primary,
    marginHorizontal: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  editMessagesText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
    marginRight: 8,
  },
  notificationsSection: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
    textAlign: 'right',
  },
  noteWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 6,
    marginBottom: 18,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'right',
    lineHeight: 18,
  },
  logoutButton: {
    backgroundColor: colors.error,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
  },
  notificationGroup: {
    marginBottom: 32,
  },
  groupHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
    gap: 10,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  cardsStack: {
    gap: 16,
  },
  notificationCard: {
    position: 'relative',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    overflow: 'hidden',
  },
  notificationCardWhatsapp: {
    borderColor: 'rgba(37,211,102,0.18)',
  },
  whatsappAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 4,
    height: '100%',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardMain: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  cardMetaRow: {
    marginTop: 8,
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statusBtn: {
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '800',
  },
  metaBullet: {
    marginHorizontal: 10,
    fontSize: 14,
    fontWeight: '800',
  },
  metaText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardChevron: {
    paddingRight: 4,
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  modalScroll: {
    flex: 1,
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },

  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeaderTitles: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 24,
    width: '90%',
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 22,
    gap: 18,
  },
  block: { gap: 10 },
  blockLabel: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  segmentWrap: {
    flexDirection: 'row-reverse',
    gap: 6,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  segmentBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: colors.black,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '800', color: '#6B7280' },
  segmentTextActive: { color: '#1d4ed8' },

  timingRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  daysInputWrap: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
  },
  daysIcon: { position: 'absolute', right: 12 },
  daysSuffix: { position: 'absolute', left: 12, fontSize: 12, fontWeight: '700', color: '#6B7280' },
  daysInput: {
    paddingHorizontal: 40,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    height: 54,
  },
  computedPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(29,78,216,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.16)',
    alignItems: 'flex-end',
    minWidth: 128,
  },
  computedLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(29,78,216,0.75)' },
  computedValue: { marginTop: 4, fontSize: 13, fontWeight: '900', color: 'rgba(29,78,216,0.95)' },

  bodyDivider: { height: 1, backgroundColor: '#E5E7EB' },

  messageHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  messageTools: { flexDirection: 'row-reverse', gap: 8 },
  toolBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textareaWrap: { position: 'relative' },
  textarea: {
    borderWidth: 0,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    minHeight: 150,
    lineHeight: 20,
    writingDirection: 'rtl',
  },
  charCountPill: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    opacity: 0.75,
  },
  charCountText: { fontSize: 11, fontWeight: '800', color: '#6B7280' },

  modalFooter: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row-reverse',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  footerBtnSecondary: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  footerBtnSecondaryText: { fontSize: 15, fontWeight: '900', color: '#111827' },
  footerBtnPrimary: {
    flex: 2,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  footerBtnPrimaryText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  dateDisplay: {
    marginLeft: 8,
    fontSize: 16,
    color: colors.text,
  },
  // (legacy modal styles removed in favor of the new modern editor modal)
}); 