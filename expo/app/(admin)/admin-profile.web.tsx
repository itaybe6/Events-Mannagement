import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';

import { useUserStore } from '@/store/userStore';
import { supabase } from '@/lib/supabase';
import { avatarService } from '@/lib/services/avatarService';
import AdminProfileScreen from './admin-profile';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';

const ui = {
  bgLight: '#f6f6f8',
  primary: '#0b1b3d',
  primaryLight: '#1a2c55',
  accent: '#3B82F6',
  accentDark: '#1D4ED8',
  gold: '#D4AF37',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: 'rgba(15, 23, 42, 0.08)',
  ring: 'rgba(11, 27, 61, 0.06)',
  success: '#16A34A',
  danger: '#E11D48',
};

type WebProfileMode = 'admin' | 'employee';

type DesktopAccountProfileWebProps = {
  mode?: WebProfileMode;
};

export function DesktopAccountProfileWeb({ mode = 'admin' }: DesktopAccountProfileWebProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  if (width < 900 && mode === 'admin') {
    return <AdminProfileScreen />;
  }

  const [heroWidth, setHeroWidth] = useState(0);
  const isHeroStack = heroWidth > 0 ? heroWidth < 520 : width < 520;

  const { userData, logout } = useUserStore();

  const [formSaving, setFormSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [clientsCount, setClientsCount] = useState<number | null>(null);
  const [eventsThisYear, setEventsThisYear] = useState<Event[]>([]);
  const [bars12, setBars12] = useState<MonthBar[]>([]);
  const [yearTotalEvents, setYearTotalEvents] = useState<number>(0);
  const [yearTotalGuests, setYearTotalGuests] = useState<number>(0);
  const [yearTotalBudget, setYearTotalBudget] = useState<number>(0);

  useEffect(() => {
    if (userData) {
      setForm({ name: userData.name, email: userData.email, password: '', confirmPassword: '' });
    }
  }, [userData?.id]);

  const avatarUri = useMemo(() => {
    const direct = String(userData?.avatar_url ?? '').trim();
    if (direct) return direct;
    return null;
  }, [userData?.avatar_url]);

  const avatarInitials = useMemo(() => {
    const name = String(userData?.name ?? '').trim();
    if (!name) return mode === 'employee' ? 'E' : 'M';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [userData?.name, mode]);

  const handleSave = async (section: 'details' | 'security') => {
    if (!userData) return;

    const isDetailsTab = section === 'details';
    const nextName = form.name.trim();
    const nextEmail = form.email.trim();

    if (isDetailsTab && !nextName) {
      // eslint-disable-next-line no-alert
      alert('שגיאה: יש למלא שם');
      return;
    }

    if (!isDetailsTab && !form.password.trim()) {
      // eslint-disable-next-line no-alert
      alert('שגיאה: יש להזין סיסמה חדשה');
      return;
    }

    if (!isDetailsTab && form.password !== form.confirmPassword) {
      // eslint-disable-next-line no-alert
      alert('שגיאה: הסיסמאות אינן תואמות');
      return;
    }

    setFormSaving(true);
    try {
      const nameChanged = nextName !== userData.name;

      if (isDetailsTab && nameChanged) {
        const { error: profileError } = await supabase
          .from('users')
          .update({ name: nextName })
          .eq('id', userData.id);
        if (profileError) throw profileError;
      }

      if (!isDetailsTab && form.password) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: form.password });
        if (passwordError) throw passwordError;
      }

      if (isDetailsTab) {
        useUserStore.setState((state) => ({
          userData: state.userData ? { ...state.userData, name: nextName } : state.userData,
        }));
      }

      // eslint-disable-next-line no-alert
      alert(isDetailsTab ? 'הצלחה: הפרטים האישיים עודכנו בהצלחה' : 'הצלחה: הסיסמה עודכנה בהצלחה');
      setForm((f) => ({ ...f, password: '', confirmPassword: '' }));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(isDetailsTab ? 'שגיאה: לא ניתן לעדכן את הפרטים האישיים' : 'שגיאה: לא ניתן לעדכן את הסיסמה');
    } finally {
      setFormSaving(false);
    }
  };

  const pickAndUploadAvatar = async () => {
    if (!userData?.id) return;
    if (avatarUploading) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0] as any;

      setAvatarUploading(true);
      const url = await avatarService.uploadUserAvatar(userData.id, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
        base64: asset.base64,
      });

      // Update local store immediately so avatar updates everywhere.
      useUserStore.setState((state) => ({
        userData: state.userData ? { ...state.userData, avatar_url: url } : state.userData,
      }));

      // eslint-disable-next-line no-alert
      alert('הצלחה: תמונת הפרופיל עודכנה');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('שגיאה: לא ניתן להעלות תמונה');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  if (!userData) {
    return (
      <View style={[styles.center, { backgroundColor: ui.bgLight }]}>
        <ActivityIndicator size="large" color={ui.accentDark} />
      </View>
    );
  }

  const isEmployeeMode = mode === 'employee';
  const userName = String(userData.name || (isEmployeeMode ? 'עובד' : 'אדמין'));

  return (
    <View style={styles.page}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <AdminWebPageHeader eyebrow={isEmployeeMode ? 'חשבון עובד' : 'חשבון מנהל'} title={isEmployeeMode ? 'פרופיל עובד' : 'פרופיל מנהל'} />

          {/* HERO */}
          <View
            style={styles.heroCard}
            onLayout={(e) => {
              const next = e?.nativeEvent?.layout?.width ?? 0;
              if (next && next !== heroWidth) setHeroWidth(next);
            }}
          >
            <LinearGradient colors={[ui.primary, ui.accent, ui.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.heroTopLine} />
            <View style={styles.heroDecor1} pointerEvents="none" />
            <View style={styles.heroDecor2} pointerEvents="none" />

            <View style={[styles.heroMainRow, isHeroStack ? styles.heroMainRowStack : null]}>
              <View style={[styles.heroIdentityGroup, isHeroStack ? styles.heroIdentityGroupStack : null]}>
                <View style={[styles.heroAvatarCol, isHeroStack ? styles.heroAvatarColStack : null]}>
                  <View style={styles.heroAvatarBlock}>
                    <View style={styles.heroAvatarRing}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.heroAvatar} contentFit="cover" transition={0} />
                      ) : (
                        <View style={styles.heroAvatarFallback}>
                          <Text style={styles.heroAvatarInitials}>{avatarInitials}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.heroStatusDot} />
                  </View>
                </View>

                <View style={styles.heroInfoCol}>
                  <View style={styles.heroTitleRow}>
                    <Text style={styles.heroName} numberOfLines={1}>
                      {userName}
                    </Text>
                    <View style={styles.rolePill}>
                      <Ionicons name="checkmark-circle" size={16} color={ui.gold} />
                      <Text style={styles.rolePillText}>{isEmployeeMode ? 'עובד מערכת' : 'מנהל מערכת'}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle}>עריכת פרופיל</Text>
                <Text style={styles.cardSubtitle}>שני אזורים קבועים לעריכת פרטים אישיים ואבטחה, זה לצד זה.</Text>
              </View>
            </View>

            <View style={styles.profileCardsRow}>
              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHeader}>
                  <View style={styles.profileSectionTitleRow}>
                    <Ionicons name="person-circle-outline" size={20} color={ui.primary} />
                    <Text style={styles.profileSectionTitle}>פרטים אישיים</Text>
                  </View>
                  <Text style={styles.profileSectionSubtitle}>עדכון שם, אימייל ותמונת פרופיל.</Text>
                </View>

                <View style={styles.profileSectionBody}>
                  <View style={styles.avatarEditRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="בחירת תמונת פרופיל"
                      disabled={avatarUploading}
                      onPress={() => void pickAndUploadAvatar()}
                      style={({ hovered, pressed }: any) => [
                        styles.avatarEditBtn,
                        Platform.OS === 'web' && hovered ? styles.avatarEditBtnHover : null,
                        pressed ? { opacity: 0.92 } : null,
                        avatarUploading ? { opacity: 0.75 } : null,
                      ]}
                    >
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.avatarEditImg} contentFit="cover" transition={0} />
                      ) : (
                        <View style={styles.avatarEditFallback}>
                          <Text style={styles.avatarEditInitials}>{avatarInitials}</Text>
                        </View>
                      )}
                      <View style={styles.avatarEditBadge}>
                        {avatarUploading ? <ActivityIndicator color="#fff" /> : <Ionicons name="camera" size={16} color="#fff" />}
                      </View>
                    </Pressable>

                    <View style={styles.avatarEditMeta}>
                      <Text style={styles.avatarEditLabel}>תמונת פרופיל</Text>
                      <Text style={styles.avatarEditHint} numberOfLines={2}>
                        לחץ על התמונה כדי לבחור תמונה חדשה
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="בחר תמונה"
                        disabled={avatarUploading}
                        onPress={() => void pickAndUploadAvatar()}
                        style={({ hovered, pressed }: any) => [
                          styles.avatarEditActionBtn,
                          Platform.OS === 'web' && hovered ? styles.avatarEditActionBtnHover : null,
                          pressed ? { opacity: 0.92 } : null,
                          avatarUploading ? { opacity: 0.75 } : null,
                        ]}
                      >
                        <Text style={styles.avatarEditActionText}>{avatarUploading ? 'מעלה...' : 'בחר תמונה'}</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>שם מלא</Text>
                    <TextInput
                      style={styles.input}
                      value={form.name}
                      onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                      placeholder="הזן שם מלא"
                      placeholderTextColor="rgba(15,23,42,0.35)"
                      textAlign="right"
                    />
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>כתובת אימייל</Text>
                    <TextInput
                      style={[styles.input, styles.inputReadonly]}
                      value={form.email}
                      editable={false}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      // @ts-ignore - react-native-web supports direction
                      dir="ltr"
                      textAlign="left"
                    />
                  </View>
                </View>

                <View style={[styles.modalActions, styles.profileSectionActions]}>
                  <Pressable
                    onPress={() => void handleSave('details')}
                    disabled={formSaving}
                    style={({ hovered, pressed }: any) => [
                      styles.modalBtn,
                      styles.modalBtnPrimary,
                      styles.profileSectionSaveBtn,
                      Platform.OS === 'web' && hovered ? styles.modalBtnPrimaryHover : null,
                      pressed ? { opacity: 0.92 } : null,
                      formSaving ? { opacity: 0.85 } : null,
                    ]}
                  >
                    {formSaving ? <ActivityIndicator color="white" /> : <Text style={[styles.modalBtnText, { color: 'white' }]}>שמור פרטים אישיים</Text>}
                  </Pressable>
                </View>
              </View>

              <View style={styles.profileSectionCard}>
                <View style={styles.profileSectionHeader}>
                  <View style={styles.profileSectionTitleRow}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={ui.primary} />
                    <Text style={styles.profileSectionTitle}>אבטחה</Text>
                  </View>
                  <Text style={styles.profileSectionSubtitle}>עדכון סיסמה בנפרד לשמירה על אזור אבטחה ממוקד.</Text>
                </View>

                <View style={styles.profileSectionBody}>
                  <View style={styles.securityInfoBox}>
                    <Ionicons name="shield-checkmark" size={18} color={ui.primary} />
                    <Text style={styles.securityInfoText}>
                      מומלץ לבחור סיסמה חזקה הכוללת אותיות, מספרים וסימנים מיוחדים.
                    </Text>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>סיסמה חדשה</Text>
                    <View style={styles.inputShell}>
                      <TextInput
                        style={[styles.input, styles.inputInner]}
                        value={form.password}
                        onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
                        placeholder="הזן סיסמה חדשה"
                        placeholderTextColor="rgba(15,23,42,0.35)"
                        secureTextEntry={!showPassword}
                        textAlign="right"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                        onPress={() => setShowPassword((v) => !v)}
                        style={({ hovered, pressed }: any) => [
                          styles.inputIconBtn,
                          Platform.OS === 'web' && hovered ? styles.inputIconBtnHover : null,
                          pressed ? { opacity: 0.85 } : null,
                        ]}
                      >
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={ui.muted} />
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>אישור סיסמה</Text>
                    <View style={styles.inputShell}>
                      <TextInput
                        style={[styles.input, styles.inputInner]}
                        value={form.confirmPassword}
                        onChangeText={(t) => setForm((f) => ({ ...f, confirmPassword: t }))}
                        placeholder="הזן שוב את הסיסמה"
                        placeholderTextColor="rgba(15,23,42,0.35)"
                        secureTextEntry={!showConfirmPassword}
                        textAlign="right"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showConfirmPassword ? 'הסתר אישור סיסמה' : 'הצג אישור סיסמה'}
                        onPress={() => setShowConfirmPassword((v) => !v)}
                        style={({ hovered, pressed }: any) => [
                          styles.inputIconBtn,
                          Platform.OS === 'web' && hovered ? styles.inputIconBtnHover : null,
                          pressed ? { opacity: 0.85 } : null,
                        ]}
                      >
                        <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={ui.muted} />
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={[styles.modalActions, styles.profileSectionActions]}>
                  <Pressable
                    onPress={() => void handleSave('security')}
                    disabled={formSaving}
                    style={({ hovered, pressed }: any) => [
                      styles.modalBtn,
                      styles.modalBtnPrimary,
                      styles.profileSectionSaveBtn,
                      Platform.OS === 'web' && hovered ? styles.modalBtnPrimaryHover : null,
                      pressed ? { opacity: 0.92 } : null,
                      formSaving ? { opacity: 0.85 } : null,
                    ]}
                  >
                    {formSaving ? <ActivityIndicator color="white" /> : <Text style={[styles.modalBtnText, { color: 'white' }]}>עדכן סיסמה</Text>}
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

          <Text style={styles.footer}>© {new Date().getFullYear()} EventFlow Systems. כל הזכויות שמורות.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

export default function AdminProfileWebScreen() {
  return <DesktopAccountProfileWeb mode="admin" />;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7FAFF',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.14), rgba(25,93,230,0) 40%), radial-gradient(circle at top left, rgba(232,241,255,0.95), rgba(232,241,255,0) 34%), radial-gradient(circle at bottom left, rgba(242,224,186,0.34), rgba(242,224,186,0) 32%), radial-gradient(circle at bottom center, rgba(240,203,70,0.12), rgba(240,203,70,0) 26%)',
        } as any)
      : null),
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 22,
  },
  container: {
    width: '100%',
    gap: 18,
  },

  card: {
    backgroundColor: ui.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 18,
    shadowColor: ui.primary,
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  heroCard: {
    backgroundColor: ui.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: ui.border,
    paddingHorizontal: 28,
    paddingVertical: 28,
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl', textAlign: 'right' } as any) : null),
    shadowColor: ui.primary,
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
    // row-reverse = visual right-to-left: avatar (right) → text (middle) → actions (left)
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  heroMainRowStack: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },

  heroActionsCol: { width: 190, gap: 12, alignItems: 'stretch', justifyContent: 'center' },
  heroActionsColStack: { width: '100%' },

  heroInfoCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl', textAlign: 'right' } as any) : null),
  },

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
    shadowColor: ui.accent,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  heroAvatar: { width: '100%', height: '100%', borderRadius: 999 },
  heroAvatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarInitials: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  heroStatusDot: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: ui.success,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: ui.success,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  heroInfo: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 8 },
  heroTitleRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    flexWrap: 'nowrap',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ textAlign: 'right' } as any) : null),
  },
  heroName: { fontSize: 32, fontWeight: '900', color: ui.primary, textAlign: 'right', letterSpacing: -0.5 },
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
  heroActions: { flexDirection: 'column', gap: 10, alignSelf: 'flex-start', alignItems: 'flex-start' },
  heroActionsNarrow: { alignSelf: 'flex-start', alignItems: 'stretch', width: '100%' },
  primaryBtn: {
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: ui.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: ui.accent,
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 0.18s ease' } as any) : null),
  },
  primaryBtnHover: {
    backgroundColor: ui.accentDark,
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
  primaryBtnText: { fontSize: 14, fontWeight: '900', color: '#fff', textAlign: 'right', letterSpacing: 0.2 },

  statsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  statCard: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    backgroundColor: ui.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 16,
    shadowColor: ui.primary,
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  statCardHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
  statIconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(22,163,74,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.18)',
  },
  statBadgeText: { fontSize: 12, fontWeight: '900', color: ui.success, textAlign: 'right' },
  statTitle: { marginTop: 10, fontSize: 13, fontWeight: '800', color: ui.muted, textAlign: 'right' },
  statValue: { marginTop: 6, fontSize: 28, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  statSub: { marginTop: 6, fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,0.95)', textAlign: 'right' },

  statCardDark: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    borderRadius: 24,
    padding: 16,
    backgroundColor: ui.primary,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: ui.primary,
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  statDarkBgDecor1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    filter: 'blur(30px)',
  },
  statDarkBgDecor2: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.22)',
    filter: 'blur(30px)',
  },
  statTitleDark: { marginTop: 12, fontSize: 13, fontWeight: '800', color: 'rgba(203,213,225,0.90)', textAlign: 'right' },
  statValueDark: { marginTop: 8, fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'right' },
  statSubDark: { marginTop: 6, fontSize: 12, fontWeight: '700', color: 'rgba(203,213,225,0.85)', textAlign: 'right' },

  analyticsRow: { flexDirection: 'row-reverse', gap: 14, alignItems: 'stretch' },
  analyticsMain: { flex: 2, minWidth: 0 },
  analyticsSide: { flex: 1, minWidth: 300 },

  cardHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  // Push the bottom cards lower on the page (as requested)
  bottomCardLower: { marginTop: 28 },
  cardSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: ui.muted, textAlign: 'right' },
  profileCardsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 16, flexWrap: 'nowrap' },
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
  profileSectionTitle: { fontSize: 17, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  profileSectionSubtitle: { fontSize: 12, fontWeight: '700', color: ui.muted, textAlign: 'right', lineHeight: 18 },
  profileSectionBody: { gap: 10 },
  profileSectionActions: { justifyContent: 'flex-start', marginTop: 'auto' },
  profileSectionSaveBtn: { flex: 0, minWidth: 190, paddingHorizontal: 22 },

  yearControls: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 0 },
  yearBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  yearPill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: ui.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  yearPillText: { fontSize: 12, fontWeight: '900', color: ui.text },
  pillDot: { width: 4, height: 4, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.30)' },

  loadingBox: { height: 240, alignItems: 'center', justifyContent: 'center' },
  barsWrap: { height: 260, flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, paddingTop: 10 },
  // Make the bars denser on narrower content widths (prevents horizontal overflow).
  barsWrapTight: { gap: 6 },
  barCol: { flex: 1, minWidth: 42, alignItems: 'center', gap: 10 },
  barColTight: { minWidth: 28, gap: 8 },
  barColHover: {},
  barTrack: {
    width: '100%',
    maxWidth: 56,
    height: 200,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: ui.border,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  barTrackTight: { maxWidth: 44, height: 170 },
  barTrackHover: { borderColor: 'rgba(59,130,246,0.22)', backgroundColor: 'rgba(59,130,246,0.05)' },
  barBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,27,61,0.03)' },
  barFill: { width: '100%', borderRadius: 14 },
  barFillHot: {
    shadowColor: ui.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  barTooltip: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    alignItems: 'center',
    opacity: 0,
    pointerEvents: 'none',
  },
  barTooltipText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    backgroundColor: ui.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  barLabel: { fontSize: 12, fontWeight: '800', color: ui.muted },
  barLabelHot: { color: ui.primary },
  barValue: { marginTop: -6, fontSize: 11, fontWeight: '900', color: 'rgba(15,23,42,0.55)' },
  barValueHot: { color: ui.primary },

  sideCardPrimary: {
    flex: 1,
    borderRadius: 24,
    padding: 18,
    backgroundColor: ui.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    shadowColor: ui.primary,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  sideDecor1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    filter: 'blur(40px)',
  },
  sideDecor2: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.26)',
    filter: 'blur(45px)',
  },
  sideTitle: { fontSize: 18, fontWeight: '900', color: '#fff', textAlign: 'right' },
  sideRows: { marginTop: 16, gap: 12 },
  sideRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sideKpiLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(203,213,225,0.85)', textAlign: 'right' },
  sideKpiValue: { marginTop: 4, fontSize: 18, fontWeight: '900', color: '#fff', textAlign: 'right' },
  sideKpiIcon: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  sideDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  downloadBtn: {
    marginTop: 18,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#fff',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: 'rgba(2,6,23,0.35)',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  downloadBtnHover: { backgroundColor: 'rgba(248,250,252,1)' },
  downloadBtnText: { fontSize: 13, fontWeight: '900', color: ui.primary, textAlign: 'right' },

  bottomRow: { flexDirection: 'row-reverse', gap: 14, alignItems: 'stretch', marginTop: 18 },
  bottomCol: { flex: 1, minWidth: 320 },

  linkBtn: { fontSize: 13, fontWeight: '900', color: ui.accentDark, textAlign: 'right' },

  timeline: { marginTop: 6, position: 'relative', paddingRight: 6 },
  timelineLine: { position: 'absolute', top: 8, bottom: 10, right: 24, width: 2, backgroundColor: 'rgba(15,23,42,0.06)' },
  timelineItem: { flexDirection: 'row-reverse', gap: 14, paddingBottom: 18, alignItems: 'flex-start' },
  timelineIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: ui.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineBody: { flex: 1, minWidth: 0, paddingTop: 4 },
  timelineTitleRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  timelineTitle: { fontSize: 13, fontWeight: '900', color: ui.text, textAlign: 'right' },
  timelineTime: { fontSize: 11, fontWeight: '800', color: 'rgba(100,116,139,0.95)' },
  timelineText: { marginTop: 6, fontSize: 13, fontWeight: '700', color: ui.muted, textAlign: 'right', lineHeight: 20 },
  emptyTimeline: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 10, paddingVertical: 10 },
  emptyTimelineText: { fontSize: 13, fontWeight: '800', color: ui.muted, textAlign: 'right' },

  footer: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,0.85)', textAlign: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.40)', padding: 16, justifyContent: 'center' },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  avatarEditRow: {
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
  avatarEditBtn: {
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
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  avatarEditBtnHover: { borderColor: 'rgba(59,130,246,0.40)', transform: [{ scale: 1.03 }] as any },
  avatarEditImg: { width: '100%', height: '100%' },
  avatarEditFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditInitials: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  avatarEditMeta: { flex: 1, minWidth: 0, alignItems: 'flex-start', justifyContent: 'flex-start', gap: 8 },
  avatarEditLabel: { fontSize: 13, fontWeight: '900', color: ui.text, textAlign: 'right' },
  avatarEditHint: { fontSize: 12, fontWeight: '700', color: ui.muted, textAlign: 'right', lineHeight: 18 },
  avatarEditActionBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  avatarEditActionBtnHover: { backgroundColor: 'rgba(255,255,255,1)', borderColor: 'rgba(59,130,246,0.32)' },
  avatarEditActionText: { fontSize: 12, fontWeight: '900', color: ui.primary, textAlign: 'right' },
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
  securityInfoText: { flex: 1, fontSize: 12, fontWeight: '700', color: ui.primary, textAlign: 'right', lineHeight: 18 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '800', color: ui.text, textAlign: 'right' },
  input: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: 'rgba(244, 247, 251, 0.9)',
    color: ui.text,
    fontSize: 15,
    fontWeight: '700',
  },
  inputReadonly: { color: 'rgba(15,23,42,0.62)', backgroundColor: 'rgba(241,245,249,0.95)' },
  inputShell: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: 'rgba(244, 247, 251, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputInner: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  inputIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  inputIconBtnHover: { backgroundColor: 'rgba(15,23,42,0.06)' },
  logoutCard: {
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
  logoutTitle: { fontSize: 16, fontWeight: '900', color: ui.primary, textAlign: 'right' },
  logoutSubtitle: { fontSize: 13, fontWeight: '700', color: ui.muted, textAlign: 'right', lineHeight: 20 },
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
    borderWidth: 1,
    borderColor: '#B91C1C',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#7F1D1D',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  logoutBtnHover: { backgroundColor: '#B91C1C', borderColor: '#991B1B' },
  logoutBtnText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', textAlign: 'right' },
  modalActions: { flexDirection: 'row-reverse', gap: 10 },
  modalBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalBtnGhost: { backgroundColor: 'rgba(15,23,42,0.05)', borderWidth: 1, borderColor: ui.border },
  modalBtnHover: { backgroundColor: 'rgba(15,23,42,0.07)' },
  modalBtnPrimary: { backgroundColor: ui.primary },
  modalBtnPrimaryHover: { backgroundColor: ui.primaryLight },
  modalBtnText: { fontSize: 14, fontWeight: '900' },
});

