import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/lib/supabase';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';

const WIDE_BREAKPOINT = 768;
const MAX_CONTENT = 980;

export default function EmployeeProfileWebScreen() {
  const router = useRouter();
  const { userData, logout } = useUserStore();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [avatarFromUsersTable, setAvatarFromUsersTable] = useState('');

  useEffect(() => {
    if (userData) {
      setForm({
        name: String(userData.name || ''),
        email: String(userData.email || ''),
        phone: String(userData.phone || ''),
      });
    }
  }, [userData?.id]);

  useEffect(() => {
    const loadAvatar = async () => {
      if (!userData?.id) { setAvatarFromUsersTable(''); return; }
      const { data } = await supabase
        .from('users')
        .select('avatar_url')
        .eq('id', userData.id)
        .maybeSingle();
      setAvatarFromUsersTable(String(data?.avatar_url ?? '').trim());
    };
    void loadAvatar();
  }, [userData?.id]);

  const avatarUri = useMemo(() => {
    const a = avatarFromUsersTable.trim() || String(userData?.avatar_url ?? '').trim();
    if (a) return a;
    return `https://i.pravatar.cc/256?u=${encodeURIComponent(userData?.email ?? 'employee')}`;
  }, [avatarFromUsersTable, userData?.avatar_url, userData?.email]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleSave = async () => {
    if (!userData?.id) return;
    const nextName = form.name.trim();
    const nextEmail = form.email.trim();
    const nextPhone = form.phone.trim();
    if (!nextName || !nextEmail) return;
    setSaving(true);
    try {
      const nameChanged = nextName !== (userData.name || '');
      const emailChanged = nextEmail !== (userData.email || '');
      const phoneChanged = nextPhone !== String(userData.phone || '');
      if (nameChanged || emailChanged || phoneChanged) {
        const { error } = await supabase
          .from('users')
          .update({ name: nextName, email: nextEmail, phone: nextPhone || null })
          .eq('id', userData.id);
        if (error) throw error;
      }
      if (emailChanged) {
        const { error } = await supabase.auth.updateUser({ email: nextEmail });
        if (error) throw error;
      }
      useUserStore.setState((s) => ({
        userData: s.userData
          ? { ...s.userData, name: nextName, email: nextEmail, phone: nextPhone || undefined }
          : s.userData,
      }));
      setEditOpen(false);
    } catch (e) {
      console.error('Profile save error:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!userData) {
    return (
      <View style={st.page}>
        <DesktopTopBar title="פרופיל" subtitle="פרטי עובד" />
        <View style={st.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const infoItems = [
    { icon: 'person-outline' as const, label: 'שם מלא', value: userData.name || '—' },
    { icon: 'mail-outline' as const, label: 'אימייל', value: userData.email || '—' },
    { icon: 'call-outline' as const, label: 'טלפון', value: userData.phone ? String(userData.phone) : 'לא הוגדר' },
    { icon: 'shield-checkmark-outline' as const, label: 'תפקיד', value: 'עובד' },
  ];

  return (
    <View style={st.page}>
      <DesktopTopBar
        title="פרופיל"
        subtitle="פרטי עובד"
        leftActions={
          <TopBarIconButton
            icon="create-outline"
            label="עריכת פרטים"
            onPress={() => setEditOpen(true)}
          />
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scroll}
      >
        {/* ── Hero Banner ── */}
        <View style={st.hero} pointerEvents="box-none">
          <View style={st.heroBlob1} pointerEvents="none" />
          <View style={st.heroBlob2} pointerEvents="none" />
          <View style={st.heroBlob3} pointerEvents="none" />

          <View style={st.heroBadgeRow}>
            <View style={st.heroBadge}>
              <Ionicons name="briefcase-outline" size={12} color={colors.gold} />
              <Text style={st.heroBadgeText}>עובד</Text>
            </View>
          </View>
          <Text style={st.heroName}>{userData.name}</Text>
          <Text style={st.heroEmail}>{userData.email}</Text>

          <View style={st.heroGoldLine} pointerEvents="none" />
        </View>

        {/* ── Content wrapper ── */}
        <View style={[st.outer, wide && st.outerWide]}>

          {/* ─── Sidebar ─── */}
          <View style={[st.sidebar, wide && st.sidebarWide]}>

            {/* Profile card */}
            <View style={[st.profileCard, wide && st.profileCardWide]}>
              <View style={st.avatarWrap}>
                <View style={st.avatarRing}>
                  <Image source={{ uri: avatarUri }} style={st.avatar} contentFit="cover" />
                </View>
                <View style={st.onlineDot} />
              </View>

              <Text style={[st.profileName, !wide && st.profileNameCenter]}>{userData.name}</Text>
              <Text style={[st.profileEmail, !wide && st.profileEmailCenter]}>{userData.email}</Text>
              {userData.phone ? (
                <Text style={[st.profilePhone, !wide && st.profilePhoneCenter]}>
                  {String(userData.phone)}
                </Text>
              ) : null}

              <View style={st.rolePill}>
                <Ionicons name="shield-checkmark-outline" size={13} color={colors.primary} />
                <Text style={st.rolePillText}>עובד מורשה</Text>
              </View>

              <View style={[st.sidebarActions, !wide && st.sidebarActionsWide]}>
                <TouchableOpacity
                  onPress={() => setEditOpen(true)}
                  style={[st.btnEdit, !wide && st.btnEditFull]}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="עריכת פרטים"
                >
                  <Ionicons name="create-outline" size={15} color={colors.white} />
                  <Text style={st.btnEditText}>עריכת פרטים</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleLogout}
                  style={[st.btnLogout, !wide && st.btnLogoutFull]}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="התנתק"
                >
                  <Ionicons name="log-out-outline" size={15} color={colors.error} />
                  <Text style={st.btnLogoutText}>התנתק</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ─── Main ─── */}
          <View style={[st.main, wide && st.mainWide]}>

            {/* Info card */}
            <View style={st.card}>
              <View style={st.cardHead}>
                <View style={st.cardHeadIcon}>
                  <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
                </View>
                <Text style={st.cardTitle}>הפרטים שלי</Text>
              </View>

              <View style={[st.infoGrid, wide && st.infoGridWide]}>
                {infoItems.map((item, i) => (
                  <View key={i} style={[st.infoCell, wide && st.infoCellWide]}>
                    <View style={st.infoCellIcon}>
                      <Ionicons name={item.icon} size={18} color={colors.primary} />
                    </View>
                    <View style={st.infoCellBody}>
                      <Text style={st.infoCellLabel}>{item.label}</Text>
                      <Text style={st.infoCellValue} numberOfLines={1}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Activity placeholder card */}
            <View style={st.card}>
              <View style={st.cardHead}>
                <View style={st.cardHeadIcon}>
                  <Ionicons name="stats-chart-outline" size={20} color={colors.primary} />
                </View>
                <Text style={st.cardTitle}>פעילות</Text>
              </View>

              <View style={[st.statGrid, wide && st.statGridWide]}>
                {[
                  { icon: 'checkmark-done-circle-outline' as const, label: 'אישורי הגעה', value: '—' },
                  { icon: 'people-outline' as const, label: 'אורחים שטופלו', value: '—' },
                  { icon: 'calendar-outline' as const, label: 'אירועים', value: '—' },
                ].map((stat, i) => (
                  <View key={i} style={[st.statCell, wide && st.statCellWide]}>
                    <View style={st.statCellIcon}>
                      <Ionicons name={stat.icon} size={22} color={colors.primary} />
                    </View>
                    <Text style={st.statValue}>{stat.value}</Text>
                    <Text style={st.statLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>

          </View>
        </View>
      </ScrollView>

      {/* ── Edit Modal ── */}
      <Modal
        transparent
        visible={editOpen}
        animationType="fade"
        onRequestClose={() => setEditOpen(false)}
      >
        <Pressable style={st.backdrop} onPress={() => setEditOpen(false)}>
          <Pressable
            style={[st.modalCard, wide && st.modalCardWide]}
            onPress={() => null}
          >
            <View style={st.modalStripe} />

            <AppKeyboardAwareScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={st.modalBody}
            >
              {/* Modal header */}
              <View style={st.modalHead}>
                <TouchableOpacity
                  onPress={() => setEditOpen(false)}
                  style={st.modalClose}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="סגירת חלון"
                >
                  <Ionicons name="close" size={18} color={colors.gray[600]} />
                </TouchableOpacity>

                <View style={st.modalHeadText}>
                  <Text style={st.modalTitle}>עריכת פרטים</Text>
                  <Text style={st.modalDesc}>עדכן את הפרטים האישיים שלך</Text>
                </View>

                <View style={st.modalHeadIcon}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                </View>
              </View>

              {/* Fields */}
              <View style={st.modalFields}>
                {[
                  { key: 'name', label: 'שם מלא', placeholder: 'שם מלא', keyboard: 'default', cap: 'words' },
                  { key: 'email', label: 'אימייל', placeholder: 'כתובת אימייל', keyboard: 'email-address', cap: 'none' },
                  { key: 'phone', label: 'טלפון', placeholder: 'מספר טלפון (לא חובה)', keyboard: 'phone-pad', cap: 'none' },
                ].map((f) => (
                  <View key={f.key} style={st.inputGroup}>
                    <Text style={st.inputLabel}>{f.label}</Text>
                    <TextInput
                      style={st.input}
                      value={form[f.key as keyof typeof form]}
                      onChangeText={(t) => setForm((prev) => ({ ...prev, [f.key]: t }))}
                      placeholder={f.placeholder}
                      placeholderTextColor={colors.gray[500]}
                      keyboardType={f.keyboard as any}
                      autoCapitalize={f.cap as any}
                      textAlign="right"
                    />
                  </View>
                ))}
              </View>

              {/* Actions */}
              <View style={st.modalFooter}>
                <TouchableOpacity
                  onPress={() => setEditOpen(false)}
                  style={[st.modalBtn, st.modalBtnGhost]}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <Text style={st.modalBtnGhostText}>ביטול</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSave}
                  style={[st.modalBtn, st.modalBtnPrimary, saving ? { opacity: 0.85 } : null]}
                  activeOpacity={0.9}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="שמירה"
                >
                  {saving ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color={colors.white} />
                      <Text style={st.modalBtnPrimaryText}>שמור שינויים</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </AppKeyboardAwareScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 60 },

  // ── Hero ──
  hero: {
    height: 210,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web'
      ? ({ background: 'linear-gradient(135deg, #06173e 0%, #001D3D 55%, #003566 100%)' } as any)
      : {}),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    gap: 6,
  },
  heroBlob1: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(204,160,0,0.09)',
    top: -170,
    right: -60,
  },
  heroBlob2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(240,203,70,0.06)',
    bottom: -110,
    left: '35%',
  },
  heroBlob3: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(0,53,102,0.45)',
    top: -50,
    left: -30,
  },
  heroBadgeRow: { zIndex: 1 },
  heroBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(204,160,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.35)',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
  },
  heroName: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.5,
    zIndex: 1,
  },
  heroEmail: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    zIndex: 1,
  },
  heroGoldLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    ...(Platform.OS === 'web'
      ? ({ background: 'linear-gradient(90deg, transparent, #CCA000 30%, #F0CB46 50%, #CCA000 70%, transparent)' } as any)
      : { backgroundColor: colors.gold }),
  },

  // ── Layout ──
  outer: {
    width: '100%',
    maxWidth: MAX_CONTENT,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 28,
    gap: 20,
  },
  outerWide: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    paddingHorizontal: 28,
    gap: 24,
  },

  // ── Sidebar ──
  sidebar: { width: '100%' },
  sidebarWide: { width: 280 },

  profileCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(17,19,24,0.06)',
    shadowColor: colors.black,
    shadowOpacity: 0.07,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  profileCardWide: {},

  avatarWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    marginBottom: 4,
    marginTop: -52,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.gold,
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  avatar: { width: '100%', height: '100%', borderRadius: 99 },
  onlineDot: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    borderWidth: 2.5,
    borderColor: colors.white,
  },

  profileName: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    marginTop: 4,
  },
  profileNameCenter: { textAlign: 'center' },
  profileEmail: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  profileEmailCenter: { textAlign: 'center' },
  profilePhone: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
  },
  profilePhoneCenter: { textAlign: 'center' },

  rolePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(6,23,62,0.07)',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 4,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },

  sidebarActions: {
    width: '100%',
    gap: 10,
    marginTop: 12,
  },
  sidebarActionsWide: {
    flexDirection: 'row',
    gap: 10,
  },

  btnEdit: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    flex: 1,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  btnEditFull: { flex: 1 },
  btnEditText: { fontSize: 14, fontWeight: '800', color: colors.white },

  btnLogout: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244,67,54,0.2)',
    flex: 1,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  btnLogoutFull: { flex: 1 },
  btnLogoutText: { fontSize: 14, fontWeight: '800', color: colors.error },

  // ── Main ──
  main: { width: '100%', gap: 20 },
  mainWide: { flex: 1 },

  // ── Card ──
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(17,19,24,0.06)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,19,24,0.06)',
  },
  cardHeadIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(6,23,62,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },

  // ── Info Grid ──
  infoGrid: { gap: 10 },
  infoGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoCell: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.gray[50],
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,19,24,0.05)',
  },
  infoCellWide: { width: '48%' },
  infoCellIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(6,23,62,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCellBody: { flex: 1, alignItems: 'flex-end', gap: 2 },
  infoCellLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
    letterSpacing: 0.4,
    ...(Platform.OS === 'web' ? ({ textTransform: 'uppercase' } as any) : {}),
  },
  infoCellValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },

  // ── Stats ──
  statGrid: { gap: 10 },
  statGridWide: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: 16,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(17,19,24,0.05)',
  },
  statCellWide: { flex: 1 },
  statCellIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(6,23,62,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'center',
  },

  // ── Modal ──
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,23,62,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 26,
    width: '100%',
    maxWidth: 460,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 20 },
    elevation: 14,
  },
  modalCardWide: { maxWidth: 520 },
  modalStripe: {
    height: 4,
    ...(Platform.OS === 'web'
      ? ({ background: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.gold} 100%)` } as any)
      : { backgroundColor: colors.primary }),
  },
  modalBody: { padding: 26, gap: 22 },

  modalHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  modalHeadIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(6,23,62,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeadText: { flex: 1, alignItems: 'flex-end', gap: 3 },
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(17,19,24,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  modalDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },

  modalFields: { gap: 16 },
  inputGroup: { gap: 7 },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  input: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(17,19,24,0.1)',
    backgroundColor: colors.gray[50],
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },

  modalFooter: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  modalBtnGhost: {
    backgroundColor: 'rgba(17,19,24,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(17,19,24,0.08)',
  },
  modalBtnPrimary: { backgroundColor: colors.primary },
  modalBtnGhostText: { fontSize: 14, fontWeight: '800', color: colors.gray[600] },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: '800', color: colors.white },
});
