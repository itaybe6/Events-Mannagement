import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import * as ImagePicker from 'expo-image-picker';
import { invitationAssetService } from '@/lib/services/invitationAssetService';
import { avatarService } from '@/lib/services/avatarService';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { EventSwitcher } from '@/components/EventSwitcher';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ui = {
  bg: '#E8F1FF',
  card: colors.white,
  text: colors.text,
  muted: colors.gray[600],
  border: 'rgba(6,23,62,0.08)',
  primary: colors.primary,
  accent: colors.accent,
  gold: colors.gold,
  danger: colors.error,
};

function formatDateDisplay(value?: Date | string | null) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      <View style={styles.infoIconBox}>
        <Ionicons name={icon} size={18} color={ui.primary} />
      </View>
    </View>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  accentColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.92}>
      <View style={[styles.actionAccent, { backgroundColor: accentColor }]} />
      <View style={[styles.actionIconBox, { backgroundColor: `${accentColor}18` }]}>
        <Ionicons name={icon} size={20} color={accentColor} />
      </View>
      <View style={styles.actionBody}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.actionChevron}>
        <Ionicons name="chevron-back" size={18} color={colors.gray[500]} />
      </View>
    </TouchableOpacity>
  );
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
  const rsvpStatus = eventMeta?.rsvpLink ? 'קישור אישור הגעה פעיל' : 'אין עדיין קישור אישור הגעה';
  const invitationStatus = invitationImageUrl ? 'יש תמונת הזמנה מעודכנת' : 'עדיין לא נוספה תמונת הזמנה';
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
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('הרשאה נדרשת', 'כדי לבחור תמונה יש לאשר גישה לגלריה');
          return;
        }
      }

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
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('הרשאה נדרשת', 'כדי לבחור תמונה יש לאשר גישה לגלריה');
          return;
        }
      }

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

    const updates: any = {
      title,
      groom_name: groom || null,
      bride_name: bride || null,
    };

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

  const getEventCoverSource = () => {
    const title = String(eventMeta?.title ?? '').toLowerCase();

    const hasBarMitzvah = title.includes('בר מצו') || title.includes('בר-מצו') || title.includes('bar mitz');
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
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={ui.primary} />
        <Text style={styles.loadingText}>טוען פרופיל...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.bg} pointerEvents="none">
        <LinearGradient
          colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bg}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.7, y: 0.55 }}
          style={styles.bgHighlight}
        />
        <LinearGradient
          colors={['rgba(232,196,122,0.52)', 'rgba(244,224,186,0.18)', 'rgba(244,224,186,0)']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0.1, y: 0.15 }}
          style={styles.bgWarmGlow}
        />
      </View>

      <AppKeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12, paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroCoverWrap}>
            <Image
              source={invitationImageUrl ? { uri: invitationImageUrl } : getEventCoverSource()}
              style={styles.heroCoverImg}
              contentFit="cover"
              transition={150}
              cachePolicy="none"
              recyclingKey={invitationImageUrl || 'fallback-cover'}
            />
            <LinearGradient colors={['rgba(6,23,62,0.04)', 'rgba(6,23,62,0.78)']} style={styles.heroCoverOverlay} />

          </View>

          <View style={styles.heroBody}>
            <View style={styles.heroAvatarWrap}>
              <View style={styles.heroAvatarRing}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.heroAvatar} contentFit="cover" transition={120} />
                ) : (
                  <View style={styles.heroAvatarFallback}>
                    <Ionicons name="person" size={38} color={ui.primary} />
                  </View>
                )}
              </View>
            </View>

            <View style={styles.heroDatePill}>
              <Ionicons name="calendar-outline" size={14} color={ui.primary} />
              <Text style={styles.heroDatePillText}>{formattedEventDate}</Text>
            </View>

            <View style={styles.heroTextCol}>
              <Text style={styles.heroName}>{eventTitle}</Text>
              {weddingNames ? <Text style={styles.heroSubName}>{String(userData?.name || '')}</Text> : null}
              <Text style={styles.heroEmail}>{String(userData?.email || '')}</Text>
              {userData?.phone ? <Text style={styles.heroPhone}>{userData.phone}</Text> : null}
            </View>
          </View>

        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <Ionicons name="create-outline" size={18} color={ui.primary} />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>ניהול מהיר</Text>
              <Text style={styles.cardSubtitle}>כפתורי פעולה מעוצבים בגישה של מסך מנהל, רק מותאמים לבעלי האירוע</Text>
            </View>
          </View>

          <View style={styles.actionsStack}>
            <ActionCard
              icon="calendar-outline"
              title="עריכת פרטי אירוע"
              subtitle="כותרת, שמות ותאריך האירוע"
              accentColor="#2563EB"
              onPress={openEventEditor}
            />
            <ActionCard
              icon="image-outline"
              title="עריכת הזמנה"
              subtitle="תמונה וקישור אישור הגעה במקום אחד"
              accentColor="#16A34A"
              onPress={openInvitationEditor}
            />
            <ActionCard
              icon="person-outline"
              title="עריכת פרופיל"
              subtitle="שם, אימייל ותמונת פרופיל"
              accentColor="#0F172A"
              onPress={openProfileEditor}
            />
          </View>
        </View>

        {hasMultipleEvents ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="swap-horizontal-outline" size={18} color={ui.primary} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>בחירת אירוע</Text>
                <Text style={styles.cardSubtitle}>אם יש לך כמה אירועים מקושרים, אפשר לעבור מכאן בין האירועים שברצונך לנהל</Text>
              </View>
            </View>

            <EventSwitcher
              userId={userData?.id}
              selectedEventId={resolvedEventId}
              onSelectEventId={handleSelectEventId}
              label="אירוע לניהול"
              onHasMultipleChange={setHasMultipleEvents}
            />
          </View>
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

        <View style={styles.logoutPanel}>
          <TouchableOpacity style={styles.logoutButton} onPress={askLogout} activeOpacity={0.92}>
            <LinearGradient
              colors={['#e53935', '#c62828', '#b71c1c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoutGradient}
            >
              <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
              <Text style={styles.logoutButtonText}>התנתק</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
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

      <Modal visible={invitationEditorOpen} transparent animationType="fade" onRequestClose={() => setInvitationEditorOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <AppKeyboardAwareScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.modalOverlayTouchable} onPress={() => setInvitationEditorOpen(false)} />

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
                  disabled={invitationSaving}
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
                  </View>

                  <View style={styles.invitationActionsRow}>
                    <Pressable
                      style={[styles.invitationActionBtn, invitationUploading && styles.eventEditorBtnDisabled]}
                      onPress={pickAndUploadInvitationImage}
                      disabled={invitationUploading || invitationSaving}
                      accessibilityRole="button"
                      accessibilityLabel="העלה הזמנה חדשה"
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.gray[800]} />
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
                  style={[styles.footerBtnSecondary, styles.eventEditorSecondaryBtn, invitationSaving && styles.eventEditorBtnDisabled]}
                  onPress={() => setInvitationEditorOpen(false)}
                  disabled={invitationSaving}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                </Pressable>
                <Pressable
                  style={[styles.footerBtnPrimary, styles.eventEditorPrimaryBtn, invitationSaving && styles.eventEditorBtnDisabled]}
                  onPress={saveInvitationEdits}
                  disabled={invitationSaving}
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
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.82,
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
    paddingHorizontal: 16,
    gap: 14,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ui.border,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  heroCoverWrap: {
    height: 200,
    position: 'relative',
    backgroundColor: colors.gray[100],
  },
  heroCoverImg: {
    width: '100%',
    height: '100%',
  },
  heroCoverOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroDatePill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    marginBottom: 12,
  },
  heroDatePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.primary,
    textAlign: 'center',
  },
  heroBody: {
    marginTop: -42,
    paddingHorizontal: 18,
    paddingBottom: 18,
    alignItems: 'center',
  },
  heroAvatarWrap: {
    marginBottom: 14,
  },
  heroAvatarRing: {
    width: 104,
    height: 104,
    borderRadius: 999,
    padding: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  heroAvatarFallback: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  heroName: {
    fontSize: 26,
    fontWeight: '900',
    color: ui.primary,
    textAlign: 'center',
  },
  heroSubName: {
    fontSize: 14,
    fontWeight: '800',
    color: ui.muted,
    textAlign: 'center',
  },
  heroEmail: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.muted,
    textAlign: 'center',
  },
  heroPhone: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'center',
  },
  card: {
    backgroundColor: ui.card,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: ui.border,
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  cardHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: ui.primary,
    textAlign: 'right',
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: ui.muted,
    textAlign: 'right',
    lineHeight: 18,
  },
  infoList: {
    gap: 10,
  },
  infoRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(6,23,62,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
  },
  infoTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.muted,
    textAlign: 'right',
  },
  infoValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '900',
    color: ui.text,
    textAlign: 'right',
    lineHeight: 20,
  },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsStack: {
    gap: 12,
  },
  actionCard: {
    position: 'relative',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ui.border,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    overflow: 'hidden',
  },
  actionAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 4,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  actionChevron: {
    paddingEnd: 4,
    paddingStart: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBody: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    paddingHorizontal: 10,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: ui.text,
    textAlign: 'right',
  },
  actionSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: ui.muted,
    textAlign: 'right',
    lineHeight: 18,
  },
  actionIconBox: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenEventSwitcherProbe: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
  },
  logoutPanel: {
    marginTop: 4,
    marginBottom: 8,
  },
  logoutButton: {
    width: '100%',
    minHeight: 62,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#c62828',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  logoutGradient: {
    minHeight: 62,
    borderRadius: 22,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
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
  },
  invitationPreviewImg: {
    width: '100%',
    height: '100%',
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