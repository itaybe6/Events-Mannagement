import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { colors } from '@/constants/colors';
import { avatarService } from '@/lib/services/avatarService';
import { supabase } from '@/lib/supabase';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';
import BrideGroomProfileScreen from './brideGroomProfile';

export default function BrideGroomProfileWebScreen() {
  const router = useRouter();
  const globalParams = useGlobalSearchParams<{ eventId?: string | string[] }>();
  const { userData, logout } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [profileAvatarUploading, setProfileAvatarUploading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [draftProfileName, setDraftProfileName] = useState('');
  const [draftProfileEmail, setDraftProfileEmail] = useState('');
  const [draftPassword, setDraftPassword] = useState('');
  const [draftConfirmPassword, setDraftConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const isDesktopWide = width >= 1180;
  const isHeroStack = width < 1180;
  const avatarUri = String(userData?.avatar_url || '').trim();

  useEffect(() => {
    setDraftProfileName(String(userData?.name || ''));
    setDraftProfileEmail(String(userData?.email || ''));
  }, [userData?.email, userData?.name]);

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
    if (loggingOut) return;
    try {
      setLoggingOut(true);
      await logout();
      router.replace('/login');
    } finally {
      setLoggingOut(false);
    }
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

      Alert.alert('נשמר', 'פרטי הפרופיל נשמרו בהצלחה');
    } catch (e) {
      console.warn('Failed to save profile edits:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את פרטי הפרופיל כרגע.');
    } finally {
      setProfileSaving(false);
    }
  };

  const saveSecurityPassword = async () => {
    if (!userData?.id || securitySaving) return;

    const nextPassword = String(draftPassword || '').trim();
    const nextConfirmPassword = String(draftConfirmPassword || '').trim();

    if (!nextPassword) {
      Alert.alert('שגיאה', 'יש להזין סיסמה חדשה');
      return;
    }

    if (nextPassword.length < 6) {
      Alert.alert('שגיאה', 'הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    if (nextPassword !== nextConfirmPassword) {
      Alert.alert('שגיאה', 'הסיסמאות אינן תואמות');
      return;
    }

    try {
      setSecuritySaving(true);
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;

      setDraftPassword('');
      setDraftConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      Alert.alert('נשמר', 'הסיסמה עודכנה בהצלחה');
    } catch (e) {
      console.warn('Failed to update couple password:', e);
      Alert.alert('שגיאה', 'לא ניתן לעדכן את הסיסמה כרגע.');
    } finally {
      setSecuritySaving(false);
    }
  };

  if (width < 900) {
    return <BrideGroomProfileScreen />;
  }

  return (
    <View style={styles.page}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Hero Card ── */}
        <View style={styles.heroOuter}>
          <View style={styles.hero}>
            <LinearGradient colors={[colors.primary, colors.accent, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.heroTopLine} />
            <View pointerEvents="none" style={styles.heroDecor1} />
            <View pointerEvents="none" style={styles.heroDecor2} />

            <View style={[styles.heroMainRow, isHeroStack ? styles.heroMainRowStack : null]}>
              <View style={[styles.heroIdentityGroup, isHeroStack ? styles.heroIdentityGroupStack : null]}>
                <View style={[styles.heroAvatarCol, isHeroStack ? styles.heroAvatarColStack : null]}>
                  <View style={styles.heroAvatarBlock}>
                    <View style={styles.heroAvatarRing}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.heroAvatarImg} contentFit="cover" transition={180} />
                      ) : (
                        <View style={styles.heroAvatarFallback}>
                          <Ionicons name="person-circle" size={88} color="rgba(15,23,42,0.32)" />
                        </View>
                      )}
                    </View>
                    <View style={styles.heroStatusDot} />
                  </View>
                </View>

                <View style={styles.heroInfoCol}>
                  <View style={styles.heroTitleRow}>
                    <Text style={styles.heroName} numberOfLines={1}>
                      {weddingNames || String(userData?.name || 'פרופיל').trim()}
                    </Text>
                    <View style={styles.rolePill}>
                      <Ionicons name="sparkles" size={16} color={colors.gold} />
                      <Text style={styles.rolePillText}>בעלי האירוע</Text>
                    </View>
                  </View>

                  {weddingNames ? (
                    <Text style={styles.heroSubName} numberOfLines={1}>
                      {String(userData?.name || '').trim()}
                    </Text>
                  ) : null}

                  <Text style={styles.heroEmail} numberOfLines={1}>
                    {String(userData?.email || '').trim()}
                  </Text>

                  <View style={styles.heroMetaRow}>
                    {dateLabel ? (
                      <View style={styles.heroMetaChip}>
                        <Ionicons name="calendar-outline" size={13} color={colors.gray[600]} />
                        <Text style={styles.heroMetaChipText}>{dateLabel}</Text>
                      </View>
                    ) : null}
                    {eventMeta?.title ? (
                      <View style={styles.heroMetaChip}>
                        <Ionicons name="sparkles-outline" size={13} color={colors.gray[600]} />
                        <Text style={styles.heroMetaChipText} numberOfLines={1}>
                          {String(eventMeta.title).trim()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Body ── */}
        <View style={styles.contentOuter}>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle}>פרופיל ואבטחה</Text>
                <Text style={styles.cardSubtitle}>מבנה דסקטופ חדש בהשראת פרופיל המנהל, עם אזורי עריכה ואבטחה מסודרים זה לצד זה.</Text>
              </View>
            </View>

            <View style={[styles.profileCardsRow, !isDesktopWide ? styles.profileCardsRowStack : null]}>
              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHeader}>
                  <View style={styles.profileSectionTitleRow}>
                    <Ionicons name="create-outline" size={20} color={colors.primary} />
                    <Text style={styles.profileSectionTitle}>עריכת פרופיל</Text>
                  </View>
                  <Text style={styles.profileSectionSubtitle}>עדכנו כאן את תמונת הפרופיל, השם והאימייל בלי לעבור למסך נפרד.</Text>
                </View>

                <View style={styles.profileSectionBody}>
                  <View style={styles.inlineProfileEditor}>
                    <View style={styles.profileAvatarCard}>
                      <View style={styles.profileAvatarEditorRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="בחירת תמונת פרופיל"
                          onPress={() => void pickAndUploadProfileAvatar()}
                          disabled={profileAvatarUploading || profileSaving}
                          style={({ pressed, hovered }: any) => [
                            styles.profileAvatarEditorBtn,
                            Platform.OS === 'web' && hovered ? styles.profileAvatarEditorBtnHover : null,
                            pressed ? styles.profilePressed : null,
                            (profileAvatarUploading || profileSaving) ? styles.profileActionDisabled : null,
                          ]}
                        >
                          {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={styles.profileAvatarEditorImg} contentFit="cover" transition={120} />
                          ) : (
                            <View style={styles.profileAvatarEditorFallback}>
                              <Ionicons name="person" size={34} color={colors.primary} />
                            </View>
                          )}
                          <View style={styles.profileAvatarEditorBadge}>
                            {profileAvatarUploading ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Ionicons name="camera" size={16} color="#fff" />
                            )}
                          </View>
                        </Pressable>

                        <View style={styles.profileAvatarEditorMeta}>
                          <Text style={styles.profileAvatarEditorLabel}>תמונת פרופיל</Text>
                          <Text style={styles.profileAvatarEditorHint} numberOfLines={2}>
                            {profileAvatarUploading ? 'מעלה תמונה חדשה...' : 'לחץ על התמונה כדי לבחור תמונה חדשה'}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="בחר תמונה"
                            onPress={() => void pickAndUploadProfileAvatar()}
                            disabled={profileAvatarUploading || profileSaving}
                            style={({ pressed, hovered }: any) => [
                              styles.profileSecondaryBtn,
                              Platform.OS === 'web' && hovered ? styles.profileSecondaryBtnHover : null,
                              pressed ? styles.profilePressed : null,
                              (profileAvatarUploading || profileSaving) ? styles.profileActionDisabled : null,
                            ]}
                          >
                            <Text style={styles.profileSecondaryBtnText}>
                              {profileAvatarUploading ? 'מעלה...' : 'בחר תמונה'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>

                    <View style={styles.profileFieldCard}>
                      <View style={styles.profileFieldHeader}>
                        <View style={styles.profileFieldIconBox}>
                          <Ionicons name="person-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.profileFieldTitleWrap}>
                          <Text style={styles.profileFieldLabel}>שם מלא</Text>
                          <Text style={styles.profileFieldHint}>השם שמוצג בפרופיל ובאזורים האישיים.</Text>
                        </View>
                      </View>
                      <TextInput
                        value={draftProfileName}
                        onChangeText={setDraftProfileName}
                        style={styles.profileInput}
                        placeholder="הזן שם מלא"
                        placeholderTextColor="#9CA3AF"
                        textAlign="right"
                      />
                    </View>

                    <View style={styles.profileFieldCard}>
                      <View style={styles.profileFieldHeader}>
                        <View style={styles.profileFieldIconBox}>
                          <Ionicons name="mail-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.profileFieldTitleWrap}>
                          <Text style={styles.profileFieldLabel}>כתובת אימייל</Text>
                          <Text style={styles.profileFieldHint}>כתובת המייל האישית של בעל האירוע.</Text>
                        </View>
                      </View>
                      <TextInput
                        value={draftProfileEmail}
                        style={[styles.profileInput, styles.profileInputReadonly]}
                        editable={false}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        // @ts-ignore - react-native-web supports direction
                        dir="ltr"
                        textAlign="left"
                      />
                    </View>

                    <View style={styles.profileEditorActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="שמור פרטי פרופיל"
                        onPress={() => void saveProfileEdits()}
                        disabled={profileSaving || profileAvatarUploading}
                        style={({ pressed, hovered }: any) => [
                          styles.profileSaveBtn,
                          Platform.OS === 'web' && hovered ? styles.profileSaveBtnHover : null,
                          pressed ? styles.profilePressed : null,
                          (profileSaving || profileAvatarUploading) ? styles.profileActionDisabled : null,
                        ]}
                      >
                        {profileSaving ? (
                          <>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={styles.profileSaveBtnText}>שומר...</Text>
                          </>
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.profileSaveBtnText}>שמור פרופיל</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHeader}>
                  <View style={styles.profileSectionTitleRow}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                    <Text style={styles.profileSectionTitle}>אבטחה</Text>
                  </View>
                  <Text style={styles.profileSectionSubtitle}>עדכון סיסמה בנפרד לשמירה על אזור אבטחה ממוקד.</Text>
                </View>

                <View style={styles.profileSectionBody}>
                  <View style={styles.securityInfoBox}>
                    <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                    <Text style={styles.securityInfoText}>
                      מומלץ לבחור סיסמה חזקה הכוללת אותיות, מספרים וסימנים מיוחדים.
                    </Text>
                  </View>

                  <View style={styles.securityFieldGroup}>
                    <Text style={styles.securityFieldLabel}>סיסמה חדשה</Text>
                    <View style={styles.securityInputShell}>
                      <TextInput
                        style={[styles.profileInput, styles.securityInputInner]}
                        value={draftPassword}
                        onChangeText={setDraftPassword}
                        placeholder="הזן סיסמה חדשה"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry={!showPassword}
                        textAlign="right"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                        onPress={() => setShowPassword((v) => !v)}
                        style={({ hovered, pressed }: any) => [
                          styles.securityInputIconBtn,
                          Platform.OS === 'web' && hovered ? styles.securityInputIconBtnHover : null,
                          pressed ? styles.profilePressed : null,
                        ]}
                      >
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.gray[500]} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.securityFieldGroup}>
                    <Text style={styles.securityFieldLabel}>אישור סיסמה</Text>
                    <View style={styles.securityInputShell}>
                      <TextInput
                        style={[styles.profileInput, styles.securityInputInner]}
                        value={draftConfirmPassword}
                        onChangeText={setDraftConfirmPassword}
                        placeholder="הזן שוב את הסיסמה"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry={!showConfirmPassword}
                        textAlign="right"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showConfirmPassword ? 'הסתר אישור סיסמה' : 'הצג אישור סיסמה'}
                        onPress={() => setShowConfirmPassword((v) => !v)}
                        style={({ hovered, pressed }: any) => [
                          styles.securityInputIconBtn,
                          Platform.OS === 'web' && hovered ? styles.securityInputIconBtnHover : null,
                          pressed ? styles.profilePressed : null,
                        ]}
                      >
                        <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.gray[500]} />
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={styles.profileEditorActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="עדכן סיסמה"
                    onPress={() => void saveSecurityPassword()}
                    disabled={securitySaving}
                    style={({ pressed, hovered }: any) => [
                      styles.profileSaveBtn,
                      Platform.OS === 'web' && hovered ? styles.profileSaveBtnHover : null,
                      pressed ? styles.profilePressed : null,
                      securitySaving ? styles.profileActionDisabled : null,
                    ]}
                  >
                    {securitySaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                        <Text style={styles.profileSaveBtnText}>עדכן סיסמה</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.logoutCard}>
            <View style={styles.logoutRow}>
              <View style={styles.logoutInfo}>
                <Text style={styles.logoutTitle}>התנתקות מהחשבון</Text>
                <Text style={styles.logoutSubtitle}>לסיום העבודה במערכת בצורה בטוחה, ניתן להתנתק כאן בכל רגע.</Text>
              </View>

              <View style={styles.logoutActionWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="התנתק מהחשבון"
                  onPress={() => void handleLogout()}
                  disabled={loggingOut}
                  style={({ hovered, pressed }: any) => [
                    styles.logoutBtn,
                    Platform.OS === 'web' && hovered ? styles.logoutBtnHover : null,
                    pressed ? { opacity: 0.92 } : null,
                    loggingOut ? { opacity: 0.78 } : null,
                  ]}
                >
                  {loggingOut ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.logoutBtnText}>התנתק</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>

          <View style={{ height: 24 }} />
        </View>
      </ScrollView>
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
    backgroundColor: 'transparent',
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
          backgroundImage: 'radial-gradient(circle, rgba(6,23,62,0.06) 0%, rgba(255,255,255,0) 72%)',
        } as any)
      : { backgroundColor: 'rgba(6,23,62,0.06)' }),
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
          backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, rgba(255,255,255,0) 72%)',
        } as any)
      : { backgroundColor: 'rgba(59,130,246,0.07)' }),
  },

  scroll: { flex: 1 },
  scrollContent: { paddingTop: 22, paddingBottom: 36 },
  heroOuter: {
    paddingHorizontal: 22,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  hero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    paddingHorizontal: 28,
    paddingVertical: 28,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  heroTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  heroDecor1: {
    position: 'absolute',
    top: -90,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.10)',
    filter: 'blur(55px)',
  },
  heroDecor2: {
    position: 'absolute',
    bottom: -110,
    left: -110,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(11,27,61,0.06)',
    filter: 'blur(55px)',
  },
  heroMainRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  heroMainRowStack: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  heroIdentityGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 22,
  },
  heroIdentityGroupStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 12,
  },
  heroAvatarCol: { width: 148, alignItems: 'flex-end', justifyContent: 'center' },
  heroAvatarColStack: { width: '100%', alignItems: 'flex-end' },
  heroAvatarBlock: { position: 'relative' },
  heroAvatarRing: {
    width: 130,
    height: 130,
    borderRadius: 999,
    padding: 4,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(59,130,246,0.20)',
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  heroAvatarImg: { width: '100%', height: '100%', borderRadius: 999 },
  heroAvatarFallback: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatusDot: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#16A34A',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#16A34A',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  heroInfoCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl', textAlign: 'right' } as any) : null),
  },
  heroTitleRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    gap: 10,
  },
  heroName: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    letterSpacing: -0.5,
  },
  rolePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  rolePillText: { fontSize: 13, fontWeight: '900', color: 'rgba(161,98,7,0.98)', textAlign: 'right' },
  heroSubName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroEmail: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 10,
    alignSelf: 'stretch',
  },
  heroMetaChip: {
    minHeight: 34,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  heroMetaChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroActions: { flexDirection: 'column', gap: 10, alignSelf: 'flex-start', alignItems: 'flex-start' },
  heroActionsNarrow: { alignSelf: 'stretch', alignItems: 'stretch', width: '100%' },
  primaryBtn: {
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 0.18s ease' } as any) : null),
  },
  primaryBtnHover: {
    backgroundColor: '#1D4ED8',
    shadowOpacity: 0.4,
    shadowRadius: 30,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  primaryBtnPressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  primaryBtnIconBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnIconBoxHover: { backgroundColor: 'rgba(255,255,255,0.22)' },
  primaryBtnText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', textAlign: 'right', letterSpacing: 0.2 },
  secondaryBtn: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(254,242,242,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.22)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 0.18s ease' } as any) : null),
  },
  secondaryBtnHover: { backgroundColor: 'rgba(254,226,226,1)' },
  secondaryBtnText: { fontSize: 14, fontWeight: '900', color: '#DC2626', textAlign: 'right' },

  contentOuter: {
    paddingHorizontal: 22,
    paddingTop: 22,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  card: {
    borderRadius: 24,
    padding: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  cardSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right', lineHeight: 18 },
  profileCardsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 16, flexWrap: 'nowrap' },
  profileCardsRowStack: { flexDirection: 'column' },
  profileSectionCard: {
    flex: 1,
    minWidth: 320,
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(248,250,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    gap: 16,
  },
  profileSectionHeader: { gap: 4 },
  profileSectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileSectionTitle: { fontSize: 17, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  profileSectionSubtitle: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right', lineHeight: 18 },
  profileSectionBody: { gap: 12 },
  inlineProfileEditor: { gap: 12 },

  profileAvatarCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    gap: 14,
  },
  profileAvatarEditorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 12,
    padding: 14,
    paddingBottom: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(59,130,246,0.28)',
    backgroundColor: 'rgba(59,130,246,0.04)',
  },
  profileAvatarEditorBtn: {
    width: 82,
    height: 82,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.18)',
    position: 'relative',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 0.18s ease' } as any) : null),
  },
  profileAvatarEditorBtnHover: {
    borderColor: 'rgba(59,130,246,0.40)',
    transform: [{ scale: 1.03 }] as any,
  },
  profileAvatarEditorImg: {
    width: '100%',
    height: '100%',
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
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  profileAvatarEditorMeta: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 8,
  },
  profileAvatarEditorLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileAvatarEditorHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  profileFieldCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    gap: 10,
  },
  profileFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileFieldIconBox: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileFieldTitleWrap: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  profileFieldLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileFieldHint: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 14,
  },
  profileInput: {
    height: 50,
    borderRadius: 16,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    writingDirection: 'rtl',
  },
  profileInputReadonly: {
    color: 'rgba(15,23,42,0.62)',
    backgroundColor: 'rgba(241,245,249,0.95)',
  },
  profileEditorActions: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
  },
  profileSecondaryBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 0.18s ease' } as any) : null),
  },
  profileSecondaryBtnHover: {
    backgroundColor: 'rgba(255,255,255,1)',
    borderColor: 'rgba(59,130,246,0.32)',
  },
  profileSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileSaveBtn: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 0.18s ease' } as any) : null),
  },
  profileSaveBtnHover: {
    backgroundColor: '#0b4fe4',
  },
  profileSaveBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profilePressed: { opacity: 0.9 },
  profileActionDisabled: { opacity: 0.6 },
  securityInfoBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.14)',
  },
  securityInfoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  securityFieldGroup: { gap: 6 },
  securityFieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  securityInputShell: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: '#F8FAFD',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  securityInputInner: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  securityInputIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  securityInputIconBtnHover: {
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  logoutCard: {
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'nowrap',
  },
  logoutInfo: { flex: 1, minWidth: 260, alignItems: 'flex-start', gap: 4 },
  logoutTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  logoutSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  logoutActionWrap: {
    padding: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(248,250,252,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  logoutBtn: {
    minWidth: 150,
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 0.18s ease' } as any) : null),
  },
  logoutBtnHover: { backgroundColor: '#B91C1C' },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  summaryCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'left',
  },
  sectionActionsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionActionBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 0.18s ease' } as any) : null),
  },
  sectionActionBtnHover: {
    backgroundColor: 'rgba(59,130,246,0.04)',
    borderColor: 'rgba(59,130,246,0.18)',
  },
  sectionActionBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  eventBody: { gap: 12 },
  fieldsGrid: { gap: 10 },
  fieldBlock: {
    flexDirection: 'row-reverse',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
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

  rsvpCard: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
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
    opacity: 0.7,
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

  skeletonBlock: { gap: 11, marginTop: 4 },
  skeletonLine: {
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.07)',
    width: '88%',
    alignSelf: 'flex-end',
  },

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

  tipsGrid: { gap: 10 },
  tipCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
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
