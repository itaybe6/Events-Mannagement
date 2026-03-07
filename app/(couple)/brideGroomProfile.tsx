import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Pressable, TextInput, Platform } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import * as ImagePicker from 'expo-image-picker';
import { invitationAssetService } from '@/lib/services/invitationAssetService';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';

export default function BrideGroomSettings() {
  const { userData, logout } = useUserStore();
  const router = useRouter();
  const globalParams = useGlobalSearchParams<{ eventId?: string | string[] }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
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

  const AVATAR_SIZE = 104;
  const avatarUri = userData?.avatar_url?.trim() || '';

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

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  // =============================
  // Profile edit shortcuts (event / invitation)
  // =============================
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [invitationEditorOpen, setInvitationEditorOpen] = useState(false);

  const [draftEventTitle, setDraftEventTitle] = useState('');
  const [draftGroomName, setDraftGroomName] = useState('');
  const [draftBrideName, setDraftBrideName] = useState('');
  const [draftEventDate, setDraftEventDate] = useState(''); // yyyy-mm-dd (best-effort)

  const [draftRsvpLink, setDraftRsvpLink] = useState('');
  const [draftInvitationImageUrl, setDraftInvitationImageUrl] = useState('');
  const [invitationUploading, setInvitationUploading] = useState(false);
  const [removeInvitationConfirmOpen, setRemoveInvitationConfirmOpen] = useState(false);

  const loadProfile = useCallback(() => {
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
      await logout();
      router.replace('/login');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן להתנתק כרגע, נסה שוב.');
    }
  };

  const askLogout = () => setLogoutModalOpen(true);

  const groomName = String(eventMeta?.groomName ?? '').trim();
  const brideName = String(eventMeta?.brideName ?? '').trim();
  const weddingNames = groomName && brideName ? `${groomName} ו${brideName}` : '';
  const invitationImageUrl = String(eventMeta?.invitationImageUrl ?? '').trim();

  const openEventEditor = () => {
    setDraftEventTitle(String(eventMeta?.title ?? ''));
    setDraftGroomName(String(eventMeta?.groomName ?? ''));
    setDraftBrideName(String(eventMeta?.brideName ?? ''));
    setDraftEventDate(eventMeta?.date ? eventMeta.date.toISOString().slice(0, 10) : '');
    setEventEditorOpen(true);
  };

  const openInvitationEditor = () => {
    setDraftRsvpLink(String(eventMeta?.rsvpLink ?? ''));
    setDraftInvitationImageUrl(String(eventMeta?.invitationImageUrl ?? ''));
    setInvitationEditorOpen(true);
  };

  const pickAndUploadInvitationImage = async () => {
    const eventId = String(resolvedEventId || '').trim();
    if (!eventId) {
      Alert.alert('שימו לב', 'לא נבחר אירוע. כדי לערוך תמונת הזמנה צריך לבחור/להיות משויך לאירוע.');
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
      setEventMeta((prev) =>
        prev ? { ...prev, invitationImageUrl: url || undefined } : prev
      );
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
    if (!eventId) return;

    const title = String(draftEventTitle || '').trim();
    const groom = String(draftGroomName || '').trim();
    const bride = String(draftBrideName || '').trim();
    const dateStr = String(draftEventDate || '').trim();

    const updates: any = {
      title,
      groom_name: groom || null,
      bride_name: bride || null,
    };

    if (dateStr) {
      const d = new Date(dateStr);
      if (!Number.isFinite(d.getTime())) {
        Alert.alert('שגיאה', 'תאריך לא תקין. השתמשו בפורמט YYYY-MM-DD');
        return;
      }
      updates.date = d.toISOString();
    }

    try {
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
    } catch (e) {
      console.warn('Failed to save event edits:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את פרטי האירוע כרגע.');
    }
  };

  const saveInvitationEdits = async () => {
    const eventId = String(resolvedEventId || '').trim();
    if (!eventId) return;

    const rsvpLink = String(draftRsvpLink || '').trim();

    const updates: any = {
      rsvp_link: rsvpLink || null,
      invitation_image_url: String(draftInvitationImageUrl || '').trim() || null,
    };

    try {
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
    } catch (e) {
      console.warn('Failed to save invitation edits:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את פרטי ההזמנה כרגע.');
    }
  };

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
              source={invitationImageUrl ? { uri: invitationImageUrl } : getEventCoverSource()}
              style={styles.eventCoverImg}
              contentFit="cover"
              transition={150}
              cachePolicy="none"
              recyclingKey={invitationImageUrl || 'fallback-cover'}
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

        {/* Edit section (replaces duplicated message settings) */}
        <View style={styles.notificationsSection}>
          <View style={styles.notifHeader}>
            <View style={styles.notifIconPill}>
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.notifHeaderText}>
              <Text style={styles.notifTitle}>עריכה וניהול</Text>
              <Text style={styles.notifSubtitle}>עריכת פרטי האירוע וההזמנה</Text>
            </View>
            <View style={styles.notifPill}>
              <Text style={styles.notifPillText}>עדכון</Text>
            </View>
          </View>

          <View style={styles.cardsStack}>
            <TouchableOpacity
              style={[styles.notificationCard, { borderColor: 'rgba(59,130,246,0.18)', backgroundColor: 'rgba(255,255,255,0.92)' }]}
              onPress={openEventEditor}
              activeOpacity={0.9}
            >
              <View style={[styles.whatsappAccent, { backgroundColor: 'rgba(59,130,246,0.95)' }]} />
              <View style={styles.cardMain}>
                <Text style={[styles.cardTitle, { color: colors.gray[900] }]} numberOfLines={1}>
                  עריכת פרטי אירוע
                </Text>
                <View style={styles.cardMetaRow}>
                  <Text style={[styles.metaText, { color: colors.gray[700] }]}>כותרת</Text>
                  <Text style={[styles.metaBullet, { color: colors.gray[400] }]}>•</Text>
                  <Text style={[styles.metaText, { color: colors.gray[700] }]}>שמות</Text>
                  <Text style={[styles.metaBullet, { color: colors.gray[400] }]}>•</Text>
                  <Text style={[styles.metaText, { color: colors.gray[700] }]}>תאריך</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.cardChevron} onPress={openEventEditor} activeOpacity={0.9}>
                <Ionicons name="chevron-back" size={20} color={colors.gray[500]} />
              </TouchableOpacity>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.notificationCard, { borderColor: 'rgba(37,211,102,0.18)', backgroundColor: 'rgba(255,255,255,0.92)' }]}
              onPress={openInvitationEditor}
              activeOpacity={0.9}
            >
              <View style={[styles.whatsappAccent, { backgroundColor: 'rgba(37,211,102,0.95)' }]} />
              <View style={styles.cardMain}>
                <Text style={[styles.cardTitle, { color: colors.gray[900] }]} numberOfLines={1}>
                  עריכת הזמנה
                </Text>
                <View style={styles.cardMetaRow}>
                  <Text style={[styles.metaText, { color: colors.gray[700] }]}>קישור אישור הגעה</Text>
                  <Text style={[styles.metaBullet, { color: colors.gray[400] }]}>•</Text>
                  <Text style={[styles.metaText, { color: colors.gray[700] }]}>תמונה</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.cardChevron} onPress={openInvitationEditor} activeOpacity={0.9}>
                <Ionicons name="chevron-back" size={20} color={colors.gray[500]} />
              </TouchableOpacity>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.notificationCard, { borderColor: 'rgba(15,23,42,0.10)', backgroundColor: 'rgba(255,255,255,0.92)' }]}
              onPress={() => router.push('/profile-editor')}
              activeOpacity={0.9}
            >
              <View style={[styles.whatsappAccent, { backgroundColor: 'rgba(15,23,42,0.85)' }]} />
              <View style={styles.cardMain}>
                <Text style={[styles.cardTitle, { color: colors.gray[900] }]} numberOfLines={1}>
                  עריכת פרופיל
                </Text>
                <View style={styles.cardMetaRow}>
                  <Text style={[styles.metaText, { color: colors.gray[700] }]}>שם</Text>
                  <Text style={[styles.metaBullet, { color: colors.gray[400] }]}>•</Text>
                  <Text style={[styles.metaText, { color: colors.gray[700] }]}>תמונה</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.cardChevron} onPress={() => router.push('/profile-editor')} activeOpacity={0.9}>
                <Ionicons name="chevron-back" size={20} color={colors.gray[500]} />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={askLogout}>
          <Text style={styles.logoutButtonText}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Event editor modal */}
      <Modal visible={eventEditorOpen} transparent animationType="fade" onRequestClose={() => setEventEditorOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.modalOverlayTouchable} onPress={() => setEventEditorOpen(false)} />

            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setEventEditorOpen(false)} style={styles.modalCloseBtn} accessibilityRole="button" accessibilityLabel="סגור">
                  <Ionicons name="close" size={18} color={colors.gray[700]} />
                </Pressable>
                <View style={styles.modalHeaderTitles}>
                  <Text style={styles.modalTitle}>עריכת פרטי אירוע</Text>
                  <Text style={styles.modalSubtitle} numberOfLines={2}>
                    עדכון כותרת, שמות ותאריך
                  </Text>
                </View>
                <View style={{ width: 40 }} />
              </View>

              <View style={styles.modalDivider} />

              <View style={styles.modalBody}>
                <View style={styles.block}>
                  <Text style={styles.blockLabel}>כותרת אירוע</Text>
                  <TextInput
                    value={draftEventTitle}
                    onChangeText={setDraftEventTitle}
                    style={styles.simpleInput}
                    placeholder="שם האירוע"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockLabel}>שם חתן</Text>
                  <TextInput
                    value={draftGroomName}
                    onChangeText={setDraftGroomName}
                    style={styles.simpleInput}
                    placeholder="לדוגמה: דניאל"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockLabel}>שם כלה</Text>
                  <TextInput
                    value={draftBrideName}
                    onChangeText={setDraftBrideName}
                    style={styles.simpleInput}
                    placeholder="לדוגמה: נועה"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockLabel}>תאריך (YYYY-MM-DD)</Text>
                  <TextInput
                    value={draftEventDate}
                    onChangeText={setDraftEventDate}
                    style={styles.simpleInput}
                    placeholder="2026-03-02"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.modalFooter}>
                <Pressable style={styles.footerBtnSecondary} onPress={() => setEventEditorOpen(false)} accessibilityRole="button" accessibilityLabel="ביטול">
                  <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                </Pressable>
                <Pressable style={styles.footerBtnPrimary} onPress={saveEventEdits} accessibilityRole="button" accessibilityLabel="שמור">
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.footerBtnPrimaryText}>שמור</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Invitation editor modal */}
      <Modal visible={invitationEditorOpen} transparent animationType="fade" onRequestClose={() => setInvitationEditorOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.modalOverlayTouchable} onPress={() => setInvitationEditorOpen(false)} />

            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setInvitationEditorOpen(false)} style={styles.modalCloseBtn} accessibilityRole="button" accessibilityLabel="סגור">
                  <Ionicons name="close" size={18} color={colors.gray[700]} />
                </Pressable>
                <View style={styles.modalHeaderTitles}>
                  <Text style={styles.modalTitle}>עריכת הזמנה</Text>
                  <Text style={styles.modalSubtitle} numberOfLines={2}>
                    קישור אישור הגעה ותמונה
                  </Text>
                </View>
                <View style={{ width: 40 }} />
              </View>

              <View style={styles.modalDivider} />

              <View style={styles.modalBody}>
                <View style={styles.block}>
                  <Text style={styles.blockLabel}>תמונת הזמנה</Text>
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
                        <Ionicons name="image-outline" size={22} color={colors.gray[600]} />
                        <Text style={styles.invitationEmptyText}>אין הזמנה</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.invitationActionsRow}>
                    <Pressable
                      style={[styles.invitationActionBtn, invitationUploading ? { opacity: 0.6 } : null]}
                      onPress={pickAndUploadInvitationImage}
                      disabled={invitationUploading}
                      accessibilityRole="button"
                      accessibilityLabel="העלה הזמנה חדשה"
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.gray[800]} />
                      <Text style={styles.invitationActionText}>העלה חדשה</Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.invitationActionBtn,
                        styles.invitationActionDanger,
                        !draftInvitationImageUrl || invitationUploading ? { opacity: 0.5 } : null,
                      ]}
                      onPress={removeInvitationImage}
                      disabled={!draftInvitationImageUrl || invitationUploading}
                      accessibilityRole="button"
                      accessibilityLabel="מחק הזמנה"
                    >
                      <Ionicons name="trash-outline" size={16} color={'#991b1b'} />
                      <Text style={[styles.invitationActionText, { color: '#991b1b' }]}>מחק</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockLabel}>קישור אישור הגעה</Text>
                  <TextInput
                    value={draftRsvpLink}
                    onChangeText={setDraftRsvpLink}
                    style={styles.simpleInput}
                    placeholder="https://..."
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.modalFooter}>
                <Pressable style={styles.footerBtnSecondary} onPress={() => setInvitationEditorOpen(false)} accessibilityRole="button" accessibilityLabel="ביטול">
                  <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                </Pressable>
                <Pressable style={styles.footerBtnPrimary} onPress={saveInvitationEdits} accessibilityRole="button" accessibilityLabel="שמור">
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.footerBtnPrimaryText}>שמור</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* RTL confirmation modal for removing invitation */}
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

      {/* חלון התנתקות - עיצוב זהה ל-admin-profile */}
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
  notificationsSection: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  notifHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    marginBottom: 12,
  },
  notifIconPill: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifHeaderText: { flex: 1, alignItems: ALIGN_RIGHT },
  notifTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right' },
  notifSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 16,
  },
  notifPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(29,78,216,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.14)',
  },
  notifPillText: { fontSize: 12, fontWeight: '900', color: 'rgba(29,78,216,0.95)' },
  notifCallout: {
    flexDirection: ROW_DIR,
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(6,23,62,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    marginBottom: 18,
  },
  notifCalloutIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  notifCalloutText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[700],
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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
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
    bottom: 0,
    right: 0,
    width: 4,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardMain: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  cardMetaRow: {
    marginTop: 8,
    alignSelf: ALIGN_RIGHT,
    flexDirection: ROW_DIR,
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
    paddingEnd: 4,
    paddingStart: 8,
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
  block: { gap: 10 },
  blockLabel: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
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
  invitationPreview: {
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
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
    marginTop: 10,
    flexDirection: ROW_DIR,
    gap: 10,
  },
  invitationActionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
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
  segmentWrap: {
    flexDirection: ROW_DIR,
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

  timingRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 12 },
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
    alignItems: ALIGN_RIGHT,
    minWidth: 128,
  },
  computedLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(29,78,216,0.75)' },
  computedValue: { marginTop: 4, fontSize: 13, fontWeight: '900', color: 'rgba(29,78,216,0.95)' },

  bodyDivider: { height: 1, backgroundColor: '#E5E7EB' },

  messageHeaderRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  messageTools: { flexDirection: ROW_DIR, gap: 8 },
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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
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
    fontSize: 16,
    color: colors.text,
  },

  /* חלון התנתקות - עיצוב זהה ל-admin-profile */
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
  loIconWrap: { marginBottom: 18 },
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