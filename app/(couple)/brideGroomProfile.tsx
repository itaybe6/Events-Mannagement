import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Pressable, TextInput, Platform } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { useEventSelectionStore } from '@/store/eventSelectionStore';

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

  // =============================
  // Message / notification settings (SMS / WhatsApp templates)
  // =============================
  type NotificationSettingRow = {
    id: string;
    event_id: string;
    notification_type: string;
    title: string;
    days_from_wedding?: number | null;
    channel?: 'SMS' | 'WHATSAPP' | null;
    enabled: boolean;
    message_content?: string | null;
  };

  const [settingsSupported, setSettingsSupported] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settings, setSettings] = useState<NotificationSettingRow[]>([]);
  const [settingsEditorOpen, setSettingsEditorOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<NotificationSettingRow | null>(null);
  const [draftChannel, setDraftChannel] = useState<'WHATSAPP' | 'SMS'>('WHATSAPP');
  const [draftDays, setDraftDays] = useState('0');
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [draftMessage, setDraftMessage] = useState('');

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

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      const eventId = String(resolvedEventId || '').trim();
      if (!eventId) {
        setSettings([]);
        return;
      }

      setSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from('notification_settings')
          .select('id,event_id,notification_type,title,days_from_wedding,channel,enabled,message_content')
          .eq('event_id', eventId)
          .order('days_from_wedding', { ascending: true });

        if (error) {
          const msg = String((error as any)?.message || '');
          // If the table/feature isn't available in the connected Supabase env, fail gracefully.
          if (msg.toLowerCase().includes('does not exist') || String((error as any)?.code || '') === '42P01') {
            if (!cancelled) setSettingsSupported(false);
            return;
          }
          throw error;
        }

        if (!cancelled) {
          setSettingsSupported(true);
          setSettings(((data as any) || []) as NotificationSettingRow[]);
        }
      } catch (e) {
        console.warn('Failed to load notification settings:', e);
        if (!cancelled) setSettings([]);
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [resolvedEventId]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const groomName = String(eventMeta?.groomName ?? '').trim();
  const brideName = String(eventMeta?.brideName ?? '').trim();
  const weddingNames = groomName && brideName ? `${groomName} ו${brideName}` : '';
  const invitationImageUrl = String(eventMeta?.invitationImageUrl ?? '').trim();

  const openSettingsEditor = () => {
    setEditingSetting(null);
    setDraftChannel('WHATSAPP');
    setDraftDays('0');
    setDraftEnabled(true);
    setDraftMessage('');
    setSettingsEditorOpen(true);
  };

  const openEditSetting = (s: NotificationSettingRow) => {
    setEditingSetting(s);
    setDraftChannel((s.channel === 'SMS' ? 'SMS' : 'WHATSAPP') as any);
    setDraftDays(String(s.days_from_wedding ?? 0));
    setDraftEnabled(Boolean(s.enabled));
    setDraftMessage(String(s.message_content ?? ''));
    setSettingsEditorOpen(true);
  };

  const closeSettingsEditor = () => {
    setSettingsEditorOpen(false);
    setEditingSetting(null);
  };

  const toggleSettingEnabled = async (s: NotificationSettingRow) => {
    const nextEnabled = !s.enabled;
    setSettings((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: nextEnabled } : x)));
    try {
      const { error } = await supabase.from('notification_settings').update({ enabled: nextEnabled }).eq('id', s.id);
      if (error) throw error;
    } catch (e) {
      // rollback
      setSettings((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: s.enabled } : x)));
      Alert.alert('שגיאה', 'לא ניתן לעדכן את מצב ההודעה כרגע.');
    }
  };

  const saveSettingDraft = async () => {
    if (!editingSetting) {
      Alert.alert('שימו לב', 'בחרו הודעה לעריכה מהרשימה.');
      return;
    }

    const days = Number.parseInt(draftDays || '0', 10);
    const safeDays = Number.isFinite(days) ? days : 0;
    const msg = String(draftMessage || '').trim();

    try {
      const updates: any = {
        channel: draftChannel,
        days_from_wedding: safeDays,
        enabled: Boolean(draftEnabled),
        message_content: msg,
      };

      const { data, error } = await supabase
        .from('notification_settings')
        .update(updates)
        .eq('id', editingSetting.id)
        .select('id,event_id,notification_type,title,days_from_wedding,channel,enabled,message_content')
        .single();

      if (error) throw error;

      setSettings((prev) => prev.map((x) => (x.id === editingSetting.id ? ((data as any) as NotificationSettingRow) : x)));
      closeSettingsEditor();
    } catch (e) {
      console.error('Save notification setting error:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את ההגדרות כרגע.');
    }
  };

  const computedSendDateLabel = (() => {
    const base = eventMeta?.date ? new Date(eventMeta.date) : null;
    const days = Number.parseInt(draftDays || '0', 10);
    if (!base || !Number.isFinite(base.getTime()) || !Number.isFinite(days)) return null;
    const d = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  })();

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

        {/* Message settings (from mobile profile screen) */}
        {Platform.OS === 'web' ? null : (
          <View style={styles.notificationsSection}>
            <Text style={styles.sectionTitle}>הגדרות הודעות</Text>

            <View style={styles.noteWrap}>
              <Text style={styles.noteText}>
                כאן אפשר לנהל הודעות אוטומטיות (SMS / וואטסאפ) שקשורות לאירוע. אם אין תצוגה כאן — ייתכן שהפיצ׳ר לא זמין בסביבת השרת הנוכחית.
              </Text>
            </View>

            {!settingsSupported ? (
              <View style={[styles.notificationCard, { borderColor: 'rgba(15,23,42,0.08)', backgroundColor: 'rgba(255,255,255,0.85)' }]}>
                <View style={styles.cardMain}>
                  <Text style={[styles.cardTitle, { color: colors.gray[800] }]}>הגדרות הודעות לא זמינות</Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={[styles.metaText, { color: colors.gray[600] }]}>אין טבלת ״notification_settings״ בשרת המחובר.</Text>
                  </View>
                </View>
              </View>
            ) : settingsLoading ? (
              <View style={[styles.notificationCard, { borderColor: 'rgba(15,23,42,0.08)', backgroundColor: 'rgba(255,255,255,0.85)' }]}>
                <View style={styles.cardMain}>
                  <Text style={[styles.cardTitle, { color: colors.gray[800] }]}>טוען...</Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={[styles.metaText, { color: colors.gray[600] }]}>טוען הגדרות הודעות לאירוע</Text>
                  </View>
                </View>
              </View>
            ) : settings.length === 0 ? (
              <View style={[styles.notificationCard, { borderColor: 'rgba(15,23,42,0.08)', backgroundColor: 'rgba(255,255,255,0.85)' }]}>
                <View style={styles.cardMain}>
                  <Text style={[styles.cardTitle, { color: colors.gray[800] }]}>אין הודעות מוגדרות</Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={[styles.metaText, { color: colors.gray[600] }]}>אפשר להגדיר הודעות דרך ניהול האירוע.</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.cardsStack}>
                {settings.map((s) => {
                  const channel = s.channel === 'SMS' ? 'SMS' : 'WHATSAPP';
                  const isWhatsapp = channel === 'WHATSAPP';
                  const accent = isWhatsapp ? 'rgba(37,211,102,0.95)' : 'rgba(59,130,246,0.95)';
                  const border = isWhatsapp ? 'rgba(37,211,102,0.18)' : 'rgba(59,130,246,0.18)';
                  const days = typeof s.days_from_wedding === 'number' ? s.days_from_wedding : 0;
                  const whenLabel = days === 0 ? 'ביום האירוע' : days > 0 ? `${days}+ ימים אחרי האירוע` : `${Math.abs(days)} ימים לפני האירוע`;
                  return (
                    <View
                      key={s.id}
                      style={[
                        styles.notificationCard,
                        { borderColor: border, backgroundColor: 'rgba(255,255,255,0.92)' },
                        isWhatsapp ? styles.notificationCardWhatsapp : null,
                      ]}
                    >
                      <View style={[styles.whatsappAccent, { backgroundColor: accent }]} />

                      <View style={styles.cardMain}>
                        <Text style={[styles.cardTitle, { color: colors.gray[900] }]} numberOfLines={1}>
                          {s.title || 'הודעה'}
                        </Text>
                        <View style={styles.cardMetaRow}>
                          <TouchableOpacity style={styles.statusBtn} onPress={() => toggleSettingEnabled(s)} activeOpacity={0.9}>
                            <Text style={[styles.statusText, { color: s.enabled ? accent : colors.gray[400] }]}>
                              {s.enabled ? 'פעיל' : 'כבוי'}
                            </Text>
                          </TouchableOpacity>
                          <Text style={[styles.metaBullet, { color: colors.gray[400] }]}>•</Text>
                          <Text style={[styles.metaText, { color: colors.gray[700] }]}>{isWhatsapp ? 'וואטסאפ' : 'SMS'}</Text>
                          <Text style={[styles.metaBullet, { color: colors.gray[400] }]}>•</Text>
                          <Text style={[styles.metaText, { color: colors.gray[700] }]}>{whenLabel}</Text>
                        </View>
                      </View>

                      <TouchableOpacity style={styles.cardChevron} onPress={() => openEditSetting(s)} activeOpacity={0.9}>
                        <Ionicons name="chevron-back" size={20} color={colors.gray[500]} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={[styles.editMessagesButton, !settingsSupported ? { opacity: 0.5 } : null]}
              onPress={() => {
                if (!resolvedEventId) return;
                router.push({
                  pathname: '/(couple)/automatic-notifications',
                  params: { eventId: resolvedEventId },
                } as any);
              }}
              disabled={!settingsSupported}
              activeOpacity={0.9}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.white} />
              <Text style={styles.editMessagesText}>הודעות אוטומטיות</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Settings editor modal */}
      {Platform.OS === 'web' ? null : (
        <Modal visible={settingsEditorOpen} transparent animationType="fade" onRequestClose={closeSettingsEditor}>
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              <Pressable style={styles.modalOverlayTouchable} onPress={closeSettingsEditor} />

              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={closeSettingsEditor} style={styles.modalCloseBtn} accessibilityRole="button" accessibilityLabel="סגור">
                    <Ionicons name="close" size={18} color={colors.gray[700]} />
                  </Pressable>
                  <View style={styles.modalHeaderTitles}>
                    <Text style={styles.modalTitle}>עריכת הודעה</Text>
                    <Text style={styles.modalSubtitle} numberOfLines={2}>
                      {editingSetting?.title ? editingSetting.title : 'בחר הודעה מהרשימה כדי לערוך'}
                    </Text>
                  </View>
                  <View style={{ width: 40 }} />
                </View>

                <View style={styles.modalDivider} />

                <View style={styles.modalBody}>
                  {/* Channel */}
                  <View style={styles.block}>
                    <Text style={styles.blockLabel}>ערוץ</Text>
                    <View style={styles.segmentWrap}>
                      <Pressable
                        onPress={() => setDraftChannel('WHATSAPP')}
                        style={[styles.segmentBtn, draftChannel === 'WHATSAPP' ? styles.segmentBtnActive : null]}
                        accessibilityRole="button"
                        accessibilityLabel="וואטסאפ"
                      >
                        <Text style={[styles.segmentText, draftChannel === 'WHATSAPP' ? styles.segmentTextActive : null]}>וואטסאפ</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setDraftChannel('SMS')}
                        style={[styles.segmentBtn, draftChannel === 'SMS' ? styles.segmentBtnActive : null]}
                        accessibilityRole="button"
                        accessibilityLabel="SMS"
                      >
                        <Text style={[styles.segmentText, draftChannel === 'SMS' ? styles.segmentTextActive : null]}>SMS</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Timing */}
                  <View style={styles.block}>
                    <Text style={styles.blockLabel}>מתי לשלוח</Text>
                    <View style={styles.timingRow}>
                      <View style={styles.daysInputWrap}>
                        <View style={styles.daysIcon}>
                          <Ionicons name="time-outline" size={18} color="#6B7280" />
                        </View>
                        <TextInput
                          value={draftDays}
                          onChangeText={setDraftDays}
                          keyboardType={Platform.OS === 'web' ? ('default' as any) : 'numeric'}
                          style={styles.daysInput}
                          placeholder="0"
                          placeholderTextColor="#9CA3AF"
                        />
                        <Text style={styles.daysSuffix}>ימים</Text>
                      </View>
                      {computedSendDateLabel ? (
                        <View style={styles.computedPill}>
                          <Text style={styles.computedLabel}>תאריך משוער</Text>
                          <Text style={styles.computedValue}>{computedSendDateLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Enabled */}
                  <View style={styles.block}>
                    <Text style={styles.blockLabel}>סטטוס</Text>
                    <View style={styles.segmentWrap}>
                      <Pressable
                        onPress={() => setDraftEnabled(true)}
                        style={[styles.segmentBtn, draftEnabled ? styles.segmentBtnActive : null]}
                        accessibilityRole="button"
                        accessibilityLabel="פעיל"
                      >
                        <Text style={[styles.segmentText, draftEnabled ? styles.segmentTextActive : null]}>פעיל</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setDraftEnabled(false)}
                        style={[styles.segmentBtn, !draftEnabled ? styles.segmentBtnActive : null]}
                        accessibilityRole="button"
                        accessibilityLabel="כבוי"
                      >
                        <Text style={[styles.segmentText, !draftEnabled ? styles.segmentTextActive : null]}>כבוי</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Message */}
                  <View style={styles.block}>
                    <View style={styles.messageHeaderRow}>
                      <Text style={styles.blockLabel}>תוכן ההודעה</Text>
                      <View style={styles.messageTools}>
                        <Pressable
                          style={styles.toolBtn}
                          accessibilityRole="button"
                          accessibilityLabel="הכנס קישור אישור הגעה"
                          onPress={() => {
                            const link = String(eventMeta?.rsvpLink || '').trim();
                            if (!link) return;
                            setDraftMessage((prev) => `${prev}${prev ? '\n' : ''}${link}`);
                          }}
                        >
                          <Ionicons name="link-outline" size={16} color={colors.gray[700]} />
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.textareaWrap}>
                      <TextInput
                        value={draftMessage}
                        onChangeText={setDraftMessage}
                        placeholder="הקלידו כאן את תוכן ההודעה..."
                        placeholderTextColor="#9CA3AF"
                        style={styles.textarea}
                        multiline
                        textAlignVertical="top"
                      />
                      <View style={styles.charCountPill}>
                        <Text style={styles.charCountText}>{String(draftMessage || '').length} תווים</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.modalFooter}>
                  <Pressable
                    style={styles.footerBtnSecondary}
                    onPress={closeSettingsEditor}
                    accessibilityRole="button"
                    accessibilityLabel="ביטול"
                  >
                    <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.footerBtnPrimary, !editingSetting ? { opacity: 0.6 } : null]}
                    onPress={saveSettingDraft}
                    disabled={!editingSetting}
                    accessibilityRole="button"
                    accessibilityLabel="שמור"
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.footerBtnPrimaryText}>שמור</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
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