import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { useDemoUsersStore } from '@/store/demoUsersStore';
import { authService } from '@/lib/services/authService';
import { userService, type UserWithMetadata } from '@/lib/services/userService';

type UserType = 'event_owner' | 'admin' | 'employee';

export default function AddUserV2WebScreen() {
  const router = useRouter();
  const { isLoggedIn, userType } = useUserStore();
  const addDemoUser = useDemoUsersStore((s) => s.addUser);
  const { width } = useWindowDimensions();
  const isTwoCol = Platform.OS === 'web' && width >= 860;

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    user_type: 'event_owner' as UserType,
  });

  const canSubmit = useMemo(() => {
    return Boolean(form.name.trim() && form.email.trim() && form.password.trim() && form.confirmPassword.trim());
  }, [form]);

  useEffect(() => {
    if (!isLoggedIn || userType !== 'admin') {
      router.replace('/login');
    }
  }, [isLoggedIn, userType, router]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setChecking(true);
        const r = await authService.testConnection();
        if (!alive) return;
        setIsDemoMode(!r.success);
      } catch {
        if (!alive) return;
        setIsDemoMode(true);
      } finally {
        if (!alive) return;
        setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setField = useCallback((key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onSubmit = useCallback(async () => {
    if (submitting) return;
    setErrorText(null);
    setSuccessText(null);

    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const password = form.password;
    const confirmPassword = form.confirmPassword;

    if (!name || !email || !password) {
      setErrorText('יש למלא שם, אימייל וסיסמה.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorText('הסיסמאות אינן תואמות.');
      return;
    }
    if (password.length < 6) {
      setErrorText('הסיסמה חייבת להכיל לפחות 6 תווים.');
      return;
    }

    setSubmitting(true);
    try {
      if (isDemoMode) {
        const demoUser: UserWithMetadata = {
          id: `demo-${Date.now()}`,
          name: `${name} (דמו)`,
          email,
          phone: phone || undefined,
          avatar_url: undefined,
          userType: form.user_type,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          events_count: 0,
          last_login: undefined,
        };
        addDemoUser(demoUser);
        setSuccessText('מצב דמו: המשתמש נוסף מקומית (לא נשמר בדאטאבייס).');
        return;
      }

      await userService.createUser(email, password, name, form.user_type, phone || undefined);
      setSuccessText('המשתמש נוסף בהצלחה.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      setErrorText(`לא ניתן להוסיף משתמש.\n${msg}`);
    } finally {
      setSubmitting(false);
    }
  }, [addDemoUser, form, isDemoMode, submitting]);

  const RoleChip = ({ value, label }: { value: UserType; label: string }) => {
    const active = form.user_type === value;
    const iconName =
      value === 'admin'
        ? 'admin-panel-settings'
        : value === 'employee'
          ? 'badge'
          : 'emoji-events';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setForm((p) => ({ ...p, user_type: value }))}
        style={({ hovered, pressed }: any) => [
          styles.roleChip,
          active ? styles.roleChipActive : null,
          Platform.OS === 'web' && hovered ? styles.roleChipHover : null,
          pressed ? { opacity: 0.92 } : null,
        ]}
      >
        <MaterialIcons
          // @ts-expect-error - icon names are runtime validated by the library
          name={iconName as any}
          size={18}
          color={active ? colors.primary : '#475569'}
          style={styles.roleChipIcon}
        />
        <Text style={[styles.roleChipText, active ? styles.roleChipTextActive : null]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.topNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חזרה לרשימה"
          onPress={() => router.back()}
          style={({ hovered, pressed }: any) => [
            styles.backBtn,
            Platform.OS === 'web' && hovered ? styles.backBtnHover : null,
            pressed ? styles.backBtnPressed : null,
          ]}
        >
          <MaterialIcons name="arrow-forward" size={18} color={colors.gray[600]} style={styles.backBtnIcon} />
          <Text style={styles.backBtnText}>חזרה לרשימה</Text>
        </Pressable>
      </View>

      <View style={styles.main}>
        <View style={styles.card}>
          <View style={styles.cardTopLine} />

          <View style={styles.cardInner}>
            <Text style={styles.title}>הוספת משתמש חדש</Text>
            <Text style={styles.subtitle}>מלא/י את הפרטים ובחר/י תפקיד. לאחר השמירה ניתן לעדכן פרטים והרשאות.</Text>

            {checking ? (
              <View style={styles.bannerInfo}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.bannerInfoText}>בודק חיבור לדאטאבייס...</Text>
              </View>
            ) : isDemoMode ? (
              <View style={styles.bannerWarn}>
                <MaterialIcons name="info" size={18} color={colors.primary} />
                <Text style={styles.bannerWarnText}>מצב דמו: לא ניתן להתחבר לדאטאבייס. המשתמש יתווסף מקומית בלבד.</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <View style={[styles.formGrid, isTwoCol ? styles.formGrid2 : styles.formGrid1]}>
                <Field label="שם מלא" value={form.name} onChangeText={(t) => setField('name', t)} textAlign="right" />
                <Field
                  label="אימייל"
                  value={form.email}
                  onChangeText={(t) => setField('email', t)}
                  textAlign="left"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={styles.gridSpan2}>
                  <Field
                    label="טלפון"
                    value={form.phone}
                    onChangeText={(t) => setField('phone', t)}
                    textAlign="left"
                    keyboardType="phone-pad"
                  />
                </View>
                <Field
                  label="סיסמה"
                  value={form.password}
                  onChangeText={(t) => setField('password', t)}
                  secureTextEntry
                  textAlign="right"
                />
                <Field
                  label="אימות סיסמה"
                  value={form.confirmPassword}
                  onChangeText={(t) => setField('confirmPassword', t)}
                  secureTextEntry
                  textAlign="right"
                />
              </View>

              <View style={styles.roleRow}>
                <Text style={styles.roleLabel}>תפקיד</Text>
                <View style={styles.roleChipsRow}>
                  <RoleChip value="event_owner" label="בעל אירוע" />
                  <RoleChip value="employee" label="עובד" />
                  <RoleChip value="admin" label="מנהל" />
                </View>
              </View>

              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
              {successText ? <Text style={styles.successText}>{successText}</Text> : null}

              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="שמור משתמש"
                  onPress={onSubmit}
                  disabled={!canSubmit || submitting}
                  style={({ hovered, pressed }: any) => [
                    styles.primaryBtn,
                    (!canSubmit || submitting) ? { opacity: 0.6 } : null,
                    Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
                    pressed ? styles.primaryBtnPressed : null,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.primaryBtnText}>שמור משתמש</Text>
                      <MaterialIcons name="arrow-forward" size={20} color="#fff" style={styles.primaryBtnArrow} />
                    </>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חזרה"
                  onPress={() => router.back()}
                  style={({ hovered, pressed }: any) => [
                    styles.secondaryBtn,
                    Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
                    pressed ? styles.secondaryBtnPressed : null,
                  ]}
                >
                  <Text style={styles.secondaryBtnText}>ביטול</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.cardBottomFade} />
        </View>
      </View>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  textAlign: 'right' | 'left';
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder=" "
        placeholderTextColor="transparent"
        secureTextEntry={props.secureTextEntry}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused ? styles.inputFocused : null, { textAlign: props.textAlign }]}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(1200px 600px at 20% 10%, rgba(15,69,230,0.10) 0%, rgba(15,69,230,0.00) 60%), linear-gradient(135deg, #f8f9fa 0%, #eef2f6 100%)',
          minHeight: '100vh',
          direction: 'rtl',
        } as any)
      : null),
  },
  topNav: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  } as any,
  backBtnHover: { backgroundColor: 'rgba(15, 23, 42, 0.04)' },
  backBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  backBtnText: { fontSize: 12, fontWeight: '900', color: colors.gray[600], writingDirection: 'rtl' },
  backBtnIcon: { transform: [{ rotate: '180deg' }] },

  main: { flex: 1, paddingHorizontal: 16, paddingBottom: 32, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 8,
  },
  cardTopLine: {
    height: 4,
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(90deg, rgba(6,23,62,0.85), rgba(6,23,62,1), rgba(6,23,62,0.85))',
        } as any)
      : null),
  },
  cardInner: { padding: 22, gap: 12 },
  cardBottomFade: {
    height: 8,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        } as any)
      : null),
  },

  title: { fontSize: 24, fontWeight: '900', color: '#06173e', textAlign: 'center', writingDirection: 'rtl' },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 6,
  },

  bannerInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.12)',
    backgroundColor: 'rgba(6, 23, 62, 0.06)',
  },
  bannerInfoText: { fontSize: 12, fontWeight: '800', color: '#0f172a', writingDirection: 'rtl' },
  bannerWarn: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.18)',
    backgroundColor: 'rgba(6, 23, 62, 0.08)',
  },
  bannerWarnText: { flex: 1, fontSize: 12, fontWeight: '800', color: '#0f172a', writingDirection: 'rtl' },

  form: { gap: 12, marginTop: 2 },
  formGrid: {
    gap: 12,
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          alignItems: 'start',
        } as any)
      : null),
  } as any,
  formGrid1: {
    ...(Platform.OS === 'web'
      ? ({
          gridTemplateColumns: '1fr',
        } as any)
      : null),
  } as any,
  formGrid2: {
    ...(Platform.OS === 'web'
      ? ({
          gridTemplateColumns: '1fr 1fr',
        } as any)
      : null),
  } as any,
  gridSpan2: {
    ...(Platform.OS === 'web'
      ? ({
          gridColumn: '1 / -1',
        } as any)
      : null),
  } as any,
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '900', color: '#334155', textAlign: 'right', writingDirection: 'rtl' },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fbfdff',
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          transitionProperty: 'box-shadow, border-color, background-color',
          transitionDuration: '140ms',
        } as any)
      : null),
  },
  inputFocused: {
    borderColor: 'rgba(15,69,230,0.55)',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 0 0 4px rgba(15,69,230,0.10)',
        } as any)
      : null),
  },

  roleRow: { marginTop: 4, gap: 8 },
  roleLabel: { fontSize: 12, fontWeight: '900', color: '#334155', textAlign: 'right', writingDirection: 'rtl' },
  roleChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          alignItems: 'stretch',
        } as any)
      : null),
  } as any,
  roleChip: {
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  roleChipIcon: { opacity: 0.95 },
  roleChipHover: {
    backgroundColor: 'rgba(255,255,255,1)',
    borderColor: 'rgba(15,69,230,0.18)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 26px rgba(6,23,62,0.10)' } as any) : null),
  } as any,
  roleChipActive: {
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderColor: 'rgba(15,69,230,0.35)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 14px 34px rgba(15,69,230,0.16)' } as any) : null),
  } as any,
  roleChipText: { fontSize: 13, fontWeight: '900', color: '#0f172a', writingDirection: 'rtl' },
  roleChipTextActive: { color: colors.primary },

  errorText: { color: '#dc2626', fontSize: 12, fontWeight: '800', writingDirection: 'rtl', textAlign: 'right' },
  successText: { color: '#16a34a', fontSize: 12, fontWeight: '800', writingDirection: 'rtl', textAlign: 'right' },

  actionsRow: { marginTop: 4, gap: 10 },
  primaryBtn: {
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 14px 30px rgba(6, 23, 62, 0.22)',
        } as any)
      : null),
  } as any,
  primaryBtnHover: { backgroundColor: 'rgba(15,69,230,0.92)' },
  primaryBtnPressed: { transform: [{ translateY: -1 }], opacity: 0.98 },
  primaryBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800', writingDirection: 'rtl' },
  primaryBtnArrow: { transform: [{ rotate: '180deg' }] },

  secondaryBtn: {
    height: 44,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 18,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  } as any,
  secondaryBtnHover: { backgroundColor: '#f1f5f9' },
  secondaryBtnPressed: { opacity: 0.95 },
  secondaryBtnText: { fontSize: 13, fontWeight: '900', color: '#0f172a', writingDirection: 'rtl' },
});
