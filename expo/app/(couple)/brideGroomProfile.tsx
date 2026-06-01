import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { NavyCardBackground } from '@/components/couple/NavyCardBackground';
import { guestService } from '@/lib/services/guestService';
import { tableService } from '@/lib/services/tableService';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import * as ImagePicker from 'expo-image-picker';
import { invitationAssetService } from '@/lib/services/invitationAssetService';
import { avatarService } from '@/lib/services/avatarService';
import { ensurePhotoLibraryPermission } from '@/lib/permissions';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { EventSwitcher } from '@/components/EventSwitcher';
import { DeleteAccountSection } from '@/components/DeleteAccountSection';
import { ProfileMenuCard, ProfileMenuRow } from '@/components/couple/ProfileMenuRow';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ui = {
  bg: '#FDFCF9',
  card: colors.white,
  text: '#1A2A4A',
  muted: '#6B7A94',
  faint: '#9AA0B4',
  border: 'rgba(22,29,56,0.08)',
  line: 'rgba(22,29,56,0.07)',
  navy: '#152949',
  iconBg: '#E8EEF5',
  primary: colors.primary,
  accent: colors.accent,
  gold: colors.gold,
  danger: colors.error,
};

function getNameInitial(name: string) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0);
}

function formatDateDisplay(value?: Date | string | null) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

const EVENT_TYPE_PREFIXES = ['חתונה', 'בר מצווה', 'בת מצווה', 'ברית', 'בריתה', 'אירוע חברה'] as const;

function getEventTitleBadgeText(title: string) {
  const raw = String(title || '').trim();
  if (!raw) return '';

  for (const prefix of EVENT_TYPE_PREFIXES) {
    if (raw.startsWith(prefix)) {
      return raw.slice(prefix.length).replace(/^[\s\-:|–—]+/, '').trim() || raw;
    }
  }

  return raw;
}

/** שמות חתן/כלה רלוונטיים רק כשסוג האירוע בכותרת הוא חתונה (פורמט כמו בשאר המערכת). */
function isWeddingEventTitle(title: string) {
  const t = String(title || '').trim();
  if (!t) return false;
  if (t.startsWith('חתונה')) return true;
  return t.toLowerCase().includes('wedding');
}

export default function BrideGroomSettings() {
  const { userData, logout } = useUserStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const globalParams = useGlobalSearchParams<{ eventId?: string | string[] }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const [eventMeta, setEventMeta] = useState<{
    id: string;
    title: string;
    date: Date;
    groomName?: string;
    brideName?: string;
    rsvpLink?: string;
    invitationImageUrl?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const avatarUri = userData?.avatar_url?.trim() || '';
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [invitationEditorOpen, setInvitationEditorOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [invitationSaving, setInvitationSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAvatarUploading, setProfileAvatarUploading] = useState(false);
  const [hasMultipleEvents, setHasMultipleEvents] = useState(false);
  const [profileStats, setProfileStats] = useState({ invitations: 0, attending: 0, tables: 0 });
  const [draftEventTitle, setDraftEventTitle] = useState('');
  const [draftGroomName, setDraftGroomName] = useState('');
  const [draftBrideName, setDraftBrideName] = useState('');
  const [draftInvitationImageUrl, setDraftInvitationImageUrl] = useState('');
  const [draftProfileName, setDraftProfileName] = useState('');
  const [draftProfileEmail, setDraftProfileEmail] = useState('');
  const [invitationUploading, setInvitationUploading] = useState(false);
  const [removeInvitationConfirmOpen, setRemoveInvitationConfirmOpen] = useState(false);

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

  const loadProfile = useCallback(() => {
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
        if (nextUrl && nextUrl !== (userData.avatar_url || '').trim()) {
          useUserStore.setState((state) => ({
            userData: state.userData ? { ...state.userData, avatar_url: nextUrl } : state.userData,
          }));
        }

        if (!resolvedEventId) {
          setEventMeta(null);
          setProfileStats({ invitations: 0, attending: 0, tables: 0 });
          return;
        }

        const { data: eventRow, error } = await supabase
          .from('events')
          .select('id, title, date, groom_name, bride_name, rsvp_link, invitation_image_url')
          .eq('id', resolvedEventId)
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
          invitationImageUrl: (eventRow as any).invitation_image_url ?? undefined,
        });

        try {
          const [guestsData, tablesData] = await Promise.all([
            guestService.getGuests(resolvedEventId),
            tableService.getTables(resolvedEventId),
          ]);
          const attending = guestsData.reduce((sum, guest) => {
            if (guest?.status !== 'מגיע') return sum;
            return sum + (Number(guest?.numberOfPeople ?? 1) || 1);
          }, 0);
          if (active) {
            setProfileStats({
              invitations: guestsData.length,
              attending,
              tables: tablesData.length,
            });
          }
        } catch {
          if (active) setProfileStats({ invitations: 0, attending: 0, tables: 0 });
        }
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
  }, [resolvedEventId, userData?.avatar_url, userData?.id]);

  useEffect(() => loadProfile(), [loadProfile]);
  useFocusEffect(loadProfile);

  const performLogout = async () => {
    try {
      router.replace('/(couple)');
      await logout();
      router.replace('/onboarding');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן להתנתק כרגע, נסה שוב.');
    }
  };

  const groomName = String(eventMeta?.groomName ?? '').trim();
  const brideName = String(eventMeta?.brideName ?? '').trim();
  const weddingNames = groomName && brideName ? `${groomName} ו${brideName}` : '';
  const invitationImageUrl = String(eventMeta?.invitationImageUrl ?? '').trim();
  const eventTitle = String(eventMeta?.title ?? '').trim() || 'טרם הוגדר שם אירוע';
  const eventTitleBadgeText = useMemo(() => getEventTitleBadgeText(eventTitle), [eventTitle]);
  const formattedEventDate = useMemo(() => {
    if (!eventMeta?.date || !Number.isFinite(eventMeta.date.getTime())) return 'טרם נקבע תאריך';
    try {
      return eventMeta.date.toLocaleDateString('he-IL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return eventMeta.date.toDateString();
    }
  }, [eventMeta?.date]);
  const invitationMenuDetail = invitationImageUrl
    ? eventMeta?.rsvpLink
      ? 'הזמנה וקישור RSVP'
      : 'תמונת הזמנה מעודכנת'
    : eventMeta?.rsvpLink
      ? 'קישור RSVP פעיל'
      : 'טרם הוגדרה הזמנה';
  const profileSubtitle = weddingNames
    ? `בעלי אירוע · ${weddingNames}`
    : eventTitleBadgeText
      ? `בעלי אירוע · ${eventTitleBadgeText}`
      : 'בעלי אירוע';
  const nameInitial = getNameInitial(String(userData?.name || ''));
  const readonlyEventDateDisplay = useMemo(() => formatDateDisplay(eventMeta?.date), [eventMeta?.date]);

  const askLogout = () => setLogoutModalOpen(true);

  const handleSelectEventId = (nextEventId: string) => {
    if (userData?.id) setActiveEvent(userData.id, nextEventId);
    router.replace({
      pathname: '/(couple)/brideGroomProfile',
      params: { eventId: nextEventId },
    } as any);
  };

  const openEventEditor = () => {
    setDraftEventTitle(String(eventMeta?.title ?? ''));
    setDraftGroomName(String(eventMeta?.groomName ?? ''));
    setDraftBrideName(String(eventMeta?.brideName ?? ''));
    setEventEditorOpen(true);
  };

  const openInvitationEditor = () => {
    setDraftInvitationImageUrl(String(eventMeta?.invitationImageUrl ?? ''));
    setInvitationEditorOpen(true);
  };

  const openProfileEditor = () => {
    setDraftProfileName(String(userData?.name ?? ''));
    setDraftProfileEmail(String(userData?.email ?? ''));
    setProfileEditorOpen(true);
  };

  const pickAndUploadProfileAvatar = async () => {
    if (!userData?.id || profileAvatarUploading) return;

    try {
      const permission = await ensurePhotoLibraryPermission({ purpose: 'profile' });
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0] as any;

      setProfileAvatarUploading(true);
      const url = await avatarService.uploadUserAvatar(userData.id, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
        base64: asset.base64,
      });

      useUserStore.setState((state) => ({
        userData: state.userData ? { ...state.userData, avatar_url: url } : state.userData,
      }));

      Alert.alert('נשמר', 'תמונת הפרופיל עודכנה');
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לעדכן תמונת פרופיל.\n\n${message}`);
    } finally {
      setProfileAvatarUploading(false);
    }
  };

  const saveProfileEdits = async () => {
    if (!userData?.id || profileSaving) return;

    const nextName = String(draftProfileName || '').trim();
    const nextEmail = String(draftProfileEmail || '').trim();

    if (!nextName) {
      Alert.alert('שגיאה', 'נא להזין שם מלא');
      return;
    }

    if (!nextEmail) {
      Alert.alert('שגיאה', 'נא להזין כתובת אימייל');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nextEmail)) {
      Alert.alert('שגיאה', 'כתובת אימייל לא תקינה');
      return;
    }

    const nameChanged = nextName !== String(userData?.name || '');
    const emailChanged = nextEmail !== String(userData?.email || '');

    try {
      setProfileSaving(true);

      if (nameChanged || emailChanged) {
        const { error: profileError } = await supabase
          .from('users')
          .update({ name: nextName, email: nextEmail })
          .eq('id', userData.id);
        if (profileError) throw profileError;
      }

      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
        if (emailError) throw emailError;
      }

      useUserStore.setState((state) => ({
        userData: state.userData
          ? { ...state.userData, name: nextName, email: nextEmail }
          : state.userData,
      }));

      setProfileEditorOpen(false);
      Alert.alert('נשמר', 'פרטי הפרופיל נשמרו בהצלחה');
    } catch (e) {
      console.warn('Failed to save profile edits:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את פרטי הפרופיל כרגע.');
    } finally {
      setProfileSaving(false);
    }
  };

  const pickAndUploadInvitationImage = async () => {
    const eventId = String(resolvedEventId || '').trim();
    if (!eventId) {
      Alert.alert('שימו לב', 'לא נבחר אירוע. כדי לערוך תמונת הזמנה צריך לבחור או להיות משויך לאירוע.');
      return;
    }
    if (invitationUploading) return;

    try {
      const permission = await ensurePhotoLibraryPermission({ purpose: 'invitation' });
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0] as any;

      setInvitationUploading(true);
      const url = await invitationAssetService.uploadInvitationImage(eventId, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
        base64: asset.base64,
      });

      const { error } = await supabase.from('events').update({ invitation_image_url: url }).eq('id', eventId);
      if (error) throw error;

      setDraftInvitationImageUrl(url);
      setEventMeta((prev) => (prev ? { ...prev, invitationImageUrl: url || undefined } : prev));
      Alert.alert('נשמר', 'תמונת ההזמנה עודכנה');
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לעדכן תמונת הזמנה.\n\n${message}`);
    } finally {
      setInvitationUploading(false);
    }
  };

  const removeInvitationImage = async () => {
    if (!draftInvitationImageUrl) return;
    setRemoveInvitationConfirmOpen(true);
  };

  const confirmRemoveInvitationImage = async () => {
    const eventId = String(resolvedEventId || '').trim();
    if (!eventId) return;

    try {
      setInvitationUploading(true);
      const { error } = await supabase.from('events').update({ invitation_image_url: null }).eq('id', eventId);
      if (error) throw error;
      setDraftInvitationImageUrl('');
      setEventMeta((prev) => (prev ? { ...prev, invitationImageUrl: undefined } : prev));
      setRemoveInvitationConfirmOpen(false);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן להסיר הזמנה.\n\n${message}`);
    } finally {
      setInvitationUploading(false);
    }
  };

  const saveEventEdits = async () => {
    const eventId = String(resolvedEventId || '').trim();
    if (!eventId || eventSaving) return;

    const title = String(draftEventTitle || '').trim();
    const groom = String(draftGroomName || '').trim();
    const bride = String(draftBrideName || '').trim();

    const updates: Record<string, unknown> = { title };
    if (isWeddingEventTitle(draftEventTitle)) {
      updates.groom_name = groom || null;
      updates.bride_name = bride || null;
    }

    try {
      setEventSaving(true);
      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', eventId)
        .select('id, title, date, groom_name, bride_name, rsvp_link, invitation_image_url')
        .maybeSingle();
      if (error) throw error;

      if (data) {
        setEventMeta({
          id: (data as any).id,
          title: String((data as any).title || ''),
          date: new Date((data as any).date),
          groomName: (data as any).groom_name ?? undefined,
          brideName: (data as any).bride_name ?? undefined,
          rsvpLink: (data as any).rsvp_link ?? undefined,
          invitationImageUrl: (data as any).invitation_image_url ?? undefined,
        });
      }
      setEventEditorOpen(false);
      Alert.alert('נשמר', 'השינויים נשמרו בהצלחה');
    } catch (e) {
      console.warn('Failed to save event edits:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את פרטי האירוע כרגע.');
    } finally {
      setEventSaving(false);
    }
  };

  const saveInvitationEdits = async () => {
    const eventId = String(resolvedEventId || '').trim();
    if (!eventId || invitationSaving) return;

    const updates: any = {
      invitation_image_url: String(draftInvitationImageUrl || '').trim() || null,
    };

    try {
      setInvitationSaving(true);
      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', eventId)
        .select('id, title, date, groom_name, bride_name, rsvp_link, invitation_image_url')
        .maybeSingle();
      if (error) throw error;

      if (data) {
        setEventMeta({
          id: (data as any).id,
          title: String((data as any).title || ''),
          date: new Date((data as any).date),
          groomName: (data as any).groom_name ?? undefined,
          brideName: (data as any).bride_name ?? undefined,
          rsvpLink: (data as any).rsvp_link ?? undefined,
          invitationImageUrl: (data as any).invitation_image_url ?? undefined,
        });
      }
      setInvitationEditorOpen(false);
      Alert.alert('נשמר', 'ההזמנה נשמרה בהצלחה');
    } catch (e) {
      console.warn('Failed to save invitation edits:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את פרטי ההזמנה כרגע.');
    } finally {
      setInvitationSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={ui.primary} />
        <Text style={styles.loadingText}>טוען פרופיל...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppKeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8, paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>הפרופיל שלי</Text>

        <View style={styles.identityCard}>
          <NavyCardBackground variant="compact" />
          <View style={styles.identityContent}>
            <View style={styles.identityAvatarRing}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.identityAvatarImg} contentFit="cover" transition={120} />
              ) : (
                <View style={styles.identityAvatarFallback}>
                  <Text style={styles.identityAvatarInitial}>{nameInitial}</Text>
                </View>
              )}
            </View>
            <Text style={styles.identityName}>{String(userData?.name || '')}</Text>
            <Text style={styles.identitySubtitle} numberOfLines={2}>
              {profileSubtitle}
            </Text>

            <View style={styles.statsRow}>
              {(
                [
                  ['הזמנות', profileStats.invitations],
                  ['מגיעים', profileStats.attending],
                  ['שולחנות', profileStats.tables],
                ] as const
              ).map(([label, value], index) => (
                <React.Fragment key={label}>
                  {index > 0 ? <View style={styles.statsDivider} /> : null}
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{value}</Text>
                    <Text style={styles.statLabel}>{label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>
        </View>

        <ProfileMenuCard>
          <ProfileMenuRow
            icon="calendar-outline"
            label="עריכת פרטי אירוע"
            detail={formattedEventDate}
            onPress={openEventEditor}
          />
          <ProfileMenuRow
            icon="image-outline"
            label="עריכת הזמנה"
            detail={invitationMenuDetail}
            onPress={openInvitationEditor}
          />
          <ProfileMenuRow icon="person-outline" label="עריכת פרופיל" onPress={openProfileEditor} />
          <DeleteAccountSection
            embedded
            last={false}
            onDeleted={() => {
              router.replace('/onboarding');
            }}
          />
          <ProfileMenuRow
            icon="log-out-outline"
            label="התנתק"
            onPress={askLogout}
            variant="danger"
            last
          />
        </ProfileMenuCard>

        {hasMultipleEvents ? (
          <ProfileMenuCard>
            <View style={styles.eventSwitcherHeader}>
              <View style={styles.eventSwitcherIconBox}>
                <Ionicons name="swap-horizontal-outline" size={19} color={ui.navy} />
              </View>
              <Text style={styles.eventSwitcherTitle}>בחירת אירוע</Text>
            </View>
            <View style={styles.eventSwitcherBody}>
            <EventSwitcher
              userId={userData?.id}
              selectedEventId={resolvedEventId}
              onSelectEventId={handleSelectEventId}
              label="אירוע לניהול"
              onHasMultipleChange={setHasMultipleEvents}
            />
            </View>
          </ProfileMenuCard>
        ) : (
          <View style={styles.hiddenEventSwitcherProbe}>
            <EventSwitcher
              userId={userData?.id}
              selectedEventId={resolvedEventId}
              onSelectEventId={handleSelectEventId}
              label="אירוע לניהול"
              onHasMultipleChange={setHasMultipleEvents}
            />
          </View>
        )}

      </AppKeyboardAwareScrollView>

      <Modal visible={eventEditorOpen} transparent animationType="fade" onRequestClose={() => setEventEditorOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <AppKeyboardAwareScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.modalOverlayTouchable} onPress={() => setEventEditorOpen(false)} />

            <View style={[styles.modalCard, styles.eventEditorCard]}>
              <LinearGradient
                colors={['#F8FBFF', '#EEF4FF', '#F5E8C8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.eventEditorHero}
              >
                <Pressable onPress={() => setEventEditorOpen(false)} style={styles.eventEditorCloseBtn} accessibilityRole="button" accessibilityLabel="סגור">
                  <Ionicons name="close" size={18} color={colors.gray[700]} />
                </Pressable>

                <View style={styles.eventEditorHeroBadge}>
                  <Ionicons name="sparkles-outline" size={20} color={ui.primary} />
                </View>

                <Text style={styles.eventEditorTitle}>עריכת פרטי אירוע</Text>
                <Text style={styles.eventEditorSubtitle}>עדכנו כותרת, שמות ותאריך בעיצוב נקי שמתאים לשפה של האפליקציה</Text>
              </LinearGradient>

              <ScrollView
                style={styles.eventEditorBodyScroll}
                contentContainerStyle={styles.eventEditorBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <View style={styles.eventFieldCard}>
                  <View style={styles.eventFieldHeader}>
                    <View style={styles.eventFieldIconBox}>
                      <Ionicons name="sparkles-outline" size={18} color={ui.primary} />
                    </View>
                    <View style={styles.eventFieldTitleWrap}>
                      <Text style={styles.eventFieldLabel}>כותרת אירוע</Text>
                      <Text style={styles.eventFieldHint}>השם הראשי שיופיע לאורך המערכת</Text>
                    </View>
                  </View>
                  <TextInput
                    value={draftEventTitle}
                    onChangeText={setDraftEventTitle}
                    style={[styles.simpleInput, styles.eventEditorInput]}
                    placeholder="שם האירוע"
                    placeholderTextColor="#9CA3AF"
                    textAlign="right"
                  />
                </View>

                {isWeddingEventTitle(draftEventTitle) ? (
                  <>
                    <View style={styles.eventFieldCard}>
                      <View style={styles.eventFieldHeader}>
                        <View style={styles.eventFieldIconBox}>
                          <Ionicons name="person-outline" size={18} color={ui.primary} />
                        </View>
                        <View style={styles.eventFieldTitleWrap}>
                          <Text style={styles.eventFieldLabel}>שם חתן</Text>
                          <Text style={styles.eventFieldHint}>השם שיופיע לצד פרטי האירוע</Text>
                        </View>
                      </View>
                      <TextInput
                        value={draftGroomName}
                        onChangeText={setDraftGroomName}
                        style={[styles.simpleInput, styles.eventEditorInput]}
                        placeholder="לדוגמה: דניאל"
                        placeholderTextColor="#9CA3AF"
                        textAlign="right"
                      />
                    </View>

                    <View style={styles.eventFieldCard}>
                      <View style={styles.eventFieldHeader}>
                        <View style={styles.eventFieldIconBox}>
                          <Ionicons name="person-outline" size={18} color={ui.primary} />
                        </View>
                        <View style={styles.eventFieldTitleWrap}>
                          <Text style={styles.eventFieldLabel}>שם כלה</Text>
                          <Text style={styles.eventFieldHint}>השם השני שיופיע בפרופיל ובהזמנה</Text>
                        </View>
                      </View>
                      <TextInput
                        value={draftBrideName}
                        onChangeText={setDraftBrideName}
                        style={[styles.simpleInput, styles.eventEditorInput]}
                        placeholder="לדוגמה: נועה"
                        placeholderTextColor="#9CA3AF"
                        textAlign="right"
                      />
                    </View>
                  </>
                ) : null}

                <View style={styles.eventFieldCard}>
                  <View style={styles.eventFieldHeader}>
                    <View style={styles.eventFieldIconBox}>
                      <Ionicons name="calendar-outline" size={18} color={ui.primary} />
                    </View>
                    <View style={styles.eventFieldTitleWrap}>
                      <Text style={styles.eventFieldLabel}>תאריך האירוע</Text>
                      <Text style={styles.eventFieldHint}>התאריך קבוע ומוצג לתצוגה בלבד</Text>
                    </View>
                  </View>
                  <TextInput
                    value={readonlyEventDateDisplay}
                    style={[styles.simpleInput, styles.eventEditorInput, styles.eventEditorInputReadonly]}
                    placeholder="31/03/2026"
                    placeholderTextColor="#9CA3AF"
                    editable={false}
                    selectTextOnFocus={false}
                    showSoftInputOnFocus={false}
                    textAlign="right"
                  />
                </View>
              </ScrollView>

              <View style={[styles.modalFooter, styles.eventEditorFooter]}>
                <Pressable
                  style={[styles.footerBtnSecondary, styles.eventEditorSecondaryBtn, eventSaving && styles.eventEditorBtnDisabled]}
                  onPress={() => setEventEditorOpen(false)}
                  disabled={eventSaving}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                </Pressable>
                <Pressable
                  style={[styles.footerBtnPrimary, styles.eventEditorPrimaryBtn, eventSaving && styles.eventEditorBtnDisabled]}
                  onPress={saveEventEdits}
                  disabled={eventSaving}
                  accessibilityRole="button"
                  accessibilityLabel="שמור"
                >
                  {eventSaving ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.footerBtnPrimaryText}>שומר...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.footerBtnPrimaryText}>שמור</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </AppKeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal
        visible={invitationEditorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!invitationUploading && !invitationSaving) setInvitationEditorOpen(false);
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <AppKeyboardAwareScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Pressable
              style={styles.modalOverlayTouchable}
              onPress={() => {
                if (!invitationUploading && !invitationSaving) setInvitationEditorOpen(false);
              }}
            />

            <View style={[styles.modalCard, styles.invitationEditorCard]}>
              <LinearGradient
                colors={['#FFF9F3', '#F7F9FF', '#EEF4FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.invitationEditorHero}
              >
                <Pressable
                  onPress={() => setInvitationEditorOpen(false)}
                  style={styles.eventEditorCloseBtn}
                  disabled={invitationSaving || invitationUploading}
                  accessibilityRole="button"
                  accessibilityLabel="סגור"
                >
                  <Ionicons name="close" size={18} color={colors.gray[700]} />
                </Pressable>

                <View style={styles.invitationEditorHeroBadge}>
                  <Ionicons name="image-outline" size={20} color={ui.primary} />
                </View>

                <Text style={styles.eventEditorTitle}>עריכת הזמנה</Text>
                <Text style={styles.eventEditorSubtitle}>עדכנו את תמונת ההזמנה בעיצוב אחיד, נקי ואלגנטי שמתאים לשפה של האפליקציה</Text>
              </LinearGradient>

              <View style={styles.eventEditorBody}>
                <View style={styles.invitationPanelCard}>
                  <View style={styles.eventFieldHeader}>
                    <View style={styles.eventFieldIconBox}>
                      <Ionicons name="image-outline" size={18} color={ui.primary} />
                    </View>
                    <View style={styles.eventFieldTitleWrap}>
                      <Text style={styles.eventFieldLabel}>תמונת הזמנה</Text>
                      <Text style={styles.eventFieldHint}>בחרו תמונה מעודכנת להזמנה של האירוע</Text>
                    </View>
                  </View>

                  <View style={styles.invitationPreview}>
                    {draftInvitationImageUrl ? (
                      <Image
                        source={{ uri: draftInvitationImageUrl }}
                        style={styles.invitationPreviewImg}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="none"
                        recyclingKey={draftInvitationImageUrl}
                      />
                    ) : (
                      <View style={styles.invitationEmpty}>
                        <Ionicons name="image-outline" size={26} color={colors.gray[600]} />
                        <Text style={styles.invitationEmptyText}>אין הזמנה שמורה כרגע</Text>
                      </View>
                    )}
                    {invitationUploading ? (
                      <View style={styles.invitationPreviewUploadOverlay} accessibilityLabel="מעלה הזמנה">
                        <ActivityIndicator size="large" color={ui.primary} />
                        <Text style={styles.invitationUploadingText}>מעלה הזמנה...</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.invitationActionsRow}>
                    <Pressable
                      style={[styles.invitationActionBtn, invitationUploading && styles.eventEditorBtnDisabled]}
                      onPress={pickAndUploadInvitationImage}
                      disabled={invitationUploading || invitationSaving}
                      accessibilityRole="button"
                      accessibilityLabel="העלה הזמנה חדשה"
                    >
                      {invitationUploading ? (
                        <ActivityIndicator size="small" color={ui.primary} />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={16} color={colors.gray[800]} />
                      )}
                      <Text style={styles.invitationActionText}>{invitationUploading ? 'מעלה...' : 'העלה חדשה'}</Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.invitationActionBtn,
                        styles.invitationActionDanger,
                        (!draftInvitationImageUrl || invitationUploading || invitationSaving) && styles.eventEditorBtnDisabled,
                      ]}
                      onPress={removeInvitationImage}
                      disabled={!draftInvitationImageUrl || invitationUploading || invitationSaving}
                      accessibilityRole="button"
                      accessibilityLabel="מחק הזמנה"
                    >
                      <Ionicons name="trash-outline" size={16} color="#991b1b" />
                      <Text style={[styles.invitationActionText, { color: '#991b1b' }]}>מחק</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={[styles.modalFooter, styles.eventEditorFooter]}>
                <Pressable
                  style={[
                    styles.footerBtnSecondary,
                    styles.eventEditorSecondaryBtn,
                    (invitationSaving || invitationUploading) && styles.eventEditorBtnDisabled,
                  ]}
                  onPress={() => setInvitationEditorOpen(false)}
                  disabled={invitationSaving || invitationUploading}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.footerBtnPrimary,
                    styles.eventEditorPrimaryBtn,
                    (invitationSaving || invitationUploading) && styles.eventEditorBtnDisabled,
                  ]}
                  onPress={saveInvitationEdits}
                  disabled={invitationSaving || invitationUploading}
                  accessibilityRole="button"
                  accessibilityLabel="שמור"
                >
                  {invitationSaving ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.footerBtnPrimaryText}>שומר...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.footerBtnPrimaryText}>שמור</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </AppKeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal visible={profileEditorOpen} transparent animationType="fade" onRequestClose={() => setProfileEditorOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <AppKeyboardAwareScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.modalOverlayTouchable} onPress={() => setProfileEditorOpen(false)} />

            <View style={[styles.modalCard, styles.profileEditorCard]}>
              <LinearGradient
                colors={['#F8FBFF', '#EEF4FF', '#F5E8C8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.profileEditorHero}
              >
                <Pressable
                  onPress={() => setProfileEditorOpen(false)}
                  style={styles.eventEditorCloseBtn}
                  disabled={profileSaving}
                  accessibilityRole="button"
                  accessibilityLabel="סגור"
                >
                  <Ionicons name="close" size={18} color={colors.gray[700]} />
                </Pressable>

                <View style={styles.profileEditorHeroBadge}>
                  <Ionicons name="person-outline" size={20} color={ui.primary} />
                </View>

                <Text style={styles.eventEditorTitle}>עריכת פרופיל</Text>
                <Text style={styles.eventEditorSubtitle}>עדכנו שם, אימייל ותמונת פרופיל באותו קו עיצובי של שאר חלונות העריכה</Text>
              </LinearGradient>

              <ScrollView
                style={styles.eventEditorBodyScroll}
                contentContainerStyle={styles.eventEditorBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <View style={styles.profileAvatarCard}>
                  <View style={styles.eventFieldHeader}>
                    <View style={styles.eventFieldIconBox}>
                      <Ionicons name="camera-outline" size={18} color={ui.primary} />
                    </View>
                    <View style={styles.eventFieldTitleWrap}>
                      <Text style={styles.eventFieldLabel}>תמונת פרופיל</Text>
                      <Text style={styles.eventFieldHint}>בחרו תמונה חדשה לפרופיל של בעלי האירוע</Text>
                    </View>
                  </View>

                  <View style={styles.profileAvatarEditorRow}>
                    <TouchableOpacity
                      style={styles.profileAvatarEditorBtn}
                      onPress={pickAndUploadProfileAvatar}
                      disabled={profileAvatarUploading || profileSaving}
                      activeOpacity={0.92}
                    >
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.profileAvatarEditorImg} contentFit="cover" transition={120} />
                      ) : (
                        <View style={styles.profileAvatarEditorFallback}>
                          <Ionicons name="person" size={34} color={ui.primary} />
                        </View>
                      )}
                      <View style={styles.profileAvatarEditorBadge}>
                        {profileAvatarUploading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="camera" size={16} color="#fff" />
                        )}
                      </View>
                    </TouchableOpacity>

                    <View style={styles.profileAvatarEditorMeta}>
                      <Text style={styles.profileAvatarEditorHint}>אפשר ללחוץ על התמונה או להשתמש בכפתור כדי לבחור תמונה חדשה מהגלריה</Text>
                      <TouchableOpacity
                        style={[styles.invitationActionBtn, styles.profileAvatarActionBtn, (profileAvatarUploading || profileSaving) && styles.eventEditorBtnDisabled]}
                        onPress={pickAndUploadProfileAvatar}
                        disabled={profileAvatarUploading || profileSaving}
                        activeOpacity={0.92}
                      >
                        <Ionicons name="cloud-upload-outline" size={16} color={ui.primary} />
                        <Text style={[styles.invitationActionText, styles.profileAvatarActionText]}>
                          {profileAvatarUploading ? 'מעלה...' : 'בחר תמונה'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={styles.eventFieldCard}>
                  <View style={styles.eventFieldHeader}>
                    <View style={styles.eventFieldIconBox}>
                      <Ionicons name="person-outline" size={18} color={ui.primary} />
                    </View>
                    <View style={styles.eventFieldTitleWrap}>
                      <Text style={styles.eventFieldLabel}>שם מלא</Text>
                      <Text style={styles.eventFieldHint}>השם שמוצג בפרופיל ובאזורים האישיים</Text>
                    </View>
                  </View>
                  <TextInput
                    value={draftProfileName}
                    onChangeText={setDraftProfileName}
                    style={[styles.simpleInput, styles.eventEditorInput]}
                    placeholder="הזן שם מלא"
                    placeholderTextColor="#9CA3AF"
                    textAlign="right"
                  />
                </View>

                <View style={styles.eventFieldCard}>
                  <View style={styles.eventFieldHeader}>
                    <View style={styles.eventFieldIconBox}>
                      <Ionicons name="mail-outline" size={18} color={ui.primary} />
                    </View>
                    <View style={styles.eventFieldTitleWrap}>
                      <Text style={styles.eventFieldLabel}>כתובת אימייל</Text>
                      <Text style={styles.eventFieldHint}>כתובת המייל האישית של בעל האירוע</Text>
                    </View>
                  </View>
                  <TextInput
                    value={draftProfileEmail}
                    onChangeText={setDraftProfileEmail}
                    style={[styles.simpleInput, styles.eventEditorInput]}
                    placeholder="הזן כתובת אימייל"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    textAlign="right"
                  />
                </View>
              </ScrollView>

              <View style={[styles.modalFooter, styles.eventEditorFooter]}>
                <Pressable
                  style={[styles.footerBtnSecondary, styles.eventEditorSecondaryBtn, profileSaving && styles.eventEditorBtnDisabled]}
                  onPress={() => setProfileEditorOpen(false)}
                  disabled={profileSaving}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                </Pressable>
                <Pressable
                  style={[styles.footerBtnPrimary, styles.eventEditorPrimaryBtn, profileSaving && styles.eventEditorBtnDisabled]}
                  onPress={saveProfileEdits}
                  disabled={profileSaving}
                  accessibilityRole="button"
                  accessibilityLabel="שמור"
                >
                  {profileSaving ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.footerBtnPrimaryText}>שומר...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.footerBtnPrimaryText}>שמור</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </AppKeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal
        visible={removeInvitationConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveInvitationConfirmOpen(false)}
      >
        <Pressable style={styles.loBackdrop} onPress={() => setRemoveInvitationConfirmOpen(false)}>
          <Pressable style={styles.loSheet} onPress={() => {}} accessibilityRole="dialog">
            <View style={styles.loIconWrap}>
              <View style={styles.loIconRing}>
                <Ionicons name="trash-outline" size={26} color="#c62828" />
              </View>
            </View>

            <Text style={styles.loTitle}>מחיקת הזמנה</Text>
            <Text style={styles.loBody}>בטוח שברצונך למחוק את ההזמנה הקיימת?</Text>

            <View style={styles.loActions}>
              <View style={styles.loBtnOuter}>
                <Pressable
                  onPress={() => setRemoveInvitationConfirmOpen(false)}
                  style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.78 : 1 })}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <View style={styles.loCancelBtn}>
                    <Text style={styles.loCancelText}>ביטול</Text>
                  </View>
                </Pressable>
              </View>
              <View style={styles.loBtnOuter}>
                <Pressable
                  onPress={() => void confirmRemoveInvitationImage()}
                  disabled={invitationUploading}
                  style={({ pressed }) => ({ flex: 1, opacity: invitationUploading ? 0.6 : pressed ? 0.85 : 1 })}
                  accessibilityRole="button"
                  accessibilityLabel="מחק"
                >
                  <View style={styles.loConfirmBtn}>
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                    <Text style={styles.loConfirmText}>מחק</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={logoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalOpen(false)}
      >
        <Pressable style={styles.loBackdrop} onPress={() => setLogoutModalOpen(false)}>
          <Pressable style={styles.loSheet} onPress={() => {}} accessibilityRole="dialog">
            <View style={styles.loIconWrap}>
              <View style={styles.loIconRing}>
                <Ionicons name="log-out-outline" size={26} color="#c62828" />
              </View>
            </View>

            <Text style={styles.loTitle}>התנתקות</Text>
            <Text style={styles.loBody}>בטוח שברצונך להתנתק?</Text>

            <View style={styles.loActions}>
              <View style={styles.loBtnOuter}>
                <Pressable
                  onPress={() => setLogoutModalOpen(false)}
                  style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.78 : 1 })}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <View style={styles.loCancelBtn}>
                    <Text style={styles.loCancelText}>ביטול</Text>
                  </View>
                </Pressable>
              </View>
              <View style={styles.loBtnOuter}>
                <Pressable
                  onPress={() => {
                    setLogoutModalOpen(false);
                    void performLogout();
                  }}
                  style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.78 : 1 })}
                  accessibilityRole="button"
                  accessibilityLabel="התנתק"
                >
                  <View style={styles.loConfirmBtn}>
                    <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.loConfirmText}>התנתק</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.bg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '800',
    color: colors.textLight,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    gap: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.text,
    textAlign: 'right',
    marginBottom: 2,
    writingDirection: 'rtl',
  },
  identityCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: ui.navy,
    borderRadius: 22,
    padding: 20,
    shadowColor: ui.navy,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  identityContent: {
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  identityAvatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: 'rgba(126,168,232,0.4)',
    backgroundColor: 'rgba(126,168,232,0.16)',
    overflow: 'hidden',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityAvatarImg: {
    width: '100%',
    height: '100%',
  },
  identityAvatarFallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityAvatarInitial: {
    fontSize: 30,
    fontWeight: '600',
    color: '#cfe0fb',
    textAlign: 'center',
  },
  identityName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  identitySubtitle: {
    marginTop: 2,
    fontSize: 13.5,
    fontWeight: '500',
    color: 'rgba(220,228,245,0.7)',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: ROW_DIR,
    alignItems: 'stretch',
    width: '100%',
    marginTop: 18,
  },
  statsDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 4,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(220,228,245,0.6)',
    textAlign: 'center',
  },
  eventSwitcherIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: ui.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventSwitcherHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 13,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  eventSwitcherTitle: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '600',
    color: ui.text,
    textAlign: 'right',
  },
  eventSwitcherBody: {
    paddingBottom: 12,
    paddingHorizontal: 4,
  },

  hiddenEventSwitcherProbe: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
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
  eventEditorCard: {
    borderColor: 'rgba(6,23,62,0.10)',
    maxHeight: '82%',
  },
  invitationEditorCard: {
    borderColor: 'rgba(6,23,62,0.10)',
  },
  profileEditorCard: {
    borderColor: 'rgba(6,23,62,0.10)',
    maxHeight: '84%',
  },
  eventEditorHero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.06)',
    position: 'relative',
  },
  invitationEditorHero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.06)',
    position: 'relative',
  },
  profileEditorHero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.06)',
    position: 'relative',
  },
  eventEditorCloseBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
  },
  eventEditorHeroBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  invitationEditorHeroBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  profileEditorHeroBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  eventEditorTitle: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '900',
    color: ui.primary,
    textAlign: 'center',
  },
  eventEditorSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: ui.muted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 270,
  },
  eventEditorBodyScroll: {
    maxHeight: 360,
  },
  eventEditorBody: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  eventFieldCard: {
    borderRadius: 22,
    padding: 12,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    gap: 10,
  },
  invitationPanelCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    gap: 14,
  },
  profileAvatarCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    gap: 14,
  },
  profileAvatarEditorRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 14,
  },
  profileAvatarEditorBtn: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarEditorImg: {
    width: '100%',
    height: '100%',
    borderRadius: 46,
  },
  profileAvatarEditorFallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.04)',
  },
  profileAvatarEditorBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ui.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarEditorMeta: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    gap: 10,
  },
  profileAvatarEditorHint: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.muted,
    textAlign: 'right',
    lineHeight: 18,
  },
  profileAvatarActionBtn: {
    alignSelf: ALIGN_RIGHT,
    minWidth: 132,
  },
  profileAvatarActionText: {
    color: ui.primary,
  },
  eventFieldHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
  },
  eventFieldIconBox: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventFieldTitleWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  eventFieldLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: ui.primary,
    textAlign: 'right',
  },
  eventFieldHint: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '700',
    color: ui.muted,
    textAlign: 'right',
    lineHeight: 14,
  },
  modalHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    flexDirection: ROW_DIR,
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
  block: {
    gap: 10,
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  simpleInput: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    writingDirection: 'rtl',
  },
  eventEditorInput: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '900',
    color: ui.primary,
    shadowColor: colors.black,
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  eventEditorInputReadonly: {
    backgroundColor: 'rgba(6,23,62,0.04)',
    color: 'rgba(6,23,62,0.78)',
  },
  invitationPreview: {
    height: 190,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
    position: 'relative',
  },
  invitationPreviewImg: {
    width: '100%',
    height: '100%',
  },
  invitationPreviewUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  invitationUploadingText: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: 0.2,
  },
  invitationEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  invitationEmptyText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[600],
  },
  invitationActionsRow: {
    flexDirection: ROW_DIR,
    gap: 10,
  },
  invitationActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  invitationActionDanger: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.20)',
  },
  invitationActionText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
  modalFooter: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: ROW_DIR,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  eventEditorFooter: {
    borderTopColor: 'rgba(6,23,62,0.08)',
    paddingTop: 12,
    paddingBottom: 14,
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
  eventEditorSecondaryBtn: {
    backgroundColor: '#F4F6FB',
    borderColor: 'rgba(6,23,62,0.06)',
    height: 50,
  },
  footerBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  footerBtnPrimary: {
    flex: 2,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  eventEditorPrimaryBtn: {
    backgroundColor: ui.primary,
    shadowColor: ui.primary,
    shadowOpacity: 0.22,
    height: 50,
  },
  eventEditorBtnDisabled: {
    opacity: 0.72,
  },
  footerBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
  },
  loBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  loIconWrap: {
    marginBottom: 18,
  },
  loIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(198,40,40,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(198,40,40,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  loBody: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[600],
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 21,
    marginBottom: 28,
  },
  loActions: {
    width: '100%',
    flexDirection: ROW_DIR,
    gap: 12,
  },
  loBtnOuter: {
    flex: 1,
    minHeight: 50,
    height: 50,
  },
  loCancelBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(6,23,62,0.14)',
    backgroundColor: 'rgba(6,23,62,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    writingDirection: 'rtl',
  },
  loConfirmBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#c62828',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#c62828',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  loConfirmText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    writingDirection: 'rtl',
  },
});