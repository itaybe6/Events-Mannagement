import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { ROW_DIR } from '@/lib/rtl';

const CONFIRM_PHRASE = 'מחק';
const ACCENT_COLOR = '#DC2626';

type Props = {
  /**
   * Called once the account is fully deleted on the server and the local
   * session is cleared. Use this to navigate the user away from authenticated
   * screens (typically to the login/onboarding flow).
   */
  onDeleted: () => void | Promise<void>;
  /**
   * Optional title shown on the action card. Defaults to a Hebrew string.
   */
  title?: string;
  /**
   * Optional subtitle shown on the action card. Defaults to a Hebrew string.
   */
  subtitle?: string;
};

/**
 * Account deletion section, required by Apple App Store Guideline 5.1.1(v).
 *
 * Renders a danger-styled action card that matches the rest of the profile
 * cards (e.g. "עריכת פרטי אירוע", "עריכת הזמנה", "עריכת פרופיל"). When tapped
 * it opens a confirmation dialog. The user must type the Hebrew word "מחק" to
 * confirm, so accidental taps cannot wipe an account. On confirmation it calls
 * `userStore.deleteAccount` which removes the auth user and the corresponding
 * profile row, then signs the user out locally and invokes `onDeleted` for
 * navigation.
 */
export function DeleteAccountSection({
  onDeleted,
  title = 'מחיקת חשבון',
  subtitle = 'מחיקה תמידית של החשבון והנתונים האישיים שלך',
}: Props) {
  const deleteAccount = useUserStore((s) => s.deleteAccount);
  const userType = useUserStore((s) => s.userType);
  const isEventOwner = userType === 'event_owner';

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canConfirm = confirmText.trim() === CONFIRM_PHRASE && !deleting;

  const closeModal = () => {
    if (deleting) return;
    setOpen(false);
    setConfirmText('');
  };

  const handleConfirmDelete = async () => {
    if (!canConfirm) return;
    setDeleting(true);
    try {
      await deleteAccount();
      setOpen(false);
      setConfirmText('');
      await Promise.resolve(onDeleted());
    } catch (e: any) {
      const message =
        e?.message && typeof e.message === 'string'
          ? e.message
          : 'אירעה שגיאה במחיקת החשבון. נסו שוב מאוחר יותר.';
      Alert.alert('לא ניתן למחוק את החשבון', message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.actionCard}
        onPress={() => setOpen(true)}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <View style={[styles.actionAccent, { backgroundColor: ACCENT_COLOR }]} />
        <View style={[styles.actionIconBox, { backgroundColor: `${ACCENT_COLOR}15` }]}>
          <Ionicons name="trash-outline" size={22} color={ACCENT_COLOR} />
        </View>
        <View style={styles.actionBody}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.actionChevron}>
          <View style={[styles.actionChevronCircle, { backgroundColor: `${ACCENT_COLOR}12` }]}>
            <Ionicons name="chevron-back" size={15} color={ACCENT_COLOR} />
          </View>
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.kbAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={closeModal}>
            <Pressable
              style={styles.sheetWrap}
              onPress={() => {
                Keyboard.dismiss();
              }}
              accessibilityRole="dialog"
            >
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheet}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <View style={styles.sheetIconWrap}>
                  <View style={styles.sheetIconRing}>
                    <Ionicons name="warning-outline" size={26} color={ACCENT_COLOR} />
                  </View>
                </View>

                <Text style={styles.sheetTitle}>מחיקת חשבון</Text>
                <Text style={styles.sheetBody}>
                  {isEventOwner
                    ? 'פעולה זו תמחק לצמיתות את החשבון שלך וגם את כל המידע של האירוע: רשימת המוזמנים, השולחנות, הסידורים, ההזמנה, ההודעות והתזכורות. לא ניתן לשחזר את החשבון או את האירוע לאחר המחיקה.'
                    : 'פעולה זו תמחק לצמיתות את החשבון, פרטי ההתחברות והנתונים האישיים השמורים שלך באפליקציה. לא ניתן לשחזר את החשבון לאחר המחיקה.'}
                </Text>

                <View style={styles.bullets}>
                  <BulletRow text="החשבון יוסר מהמערכת ומהאימות" />
                  <BulletRow text="לא תוכלו להתחבר שוב עם אותו אימייל" />
                  {isEventOwner ? (
                    <>
                      <BulletRow text="כל האירועים שיצרתם יימחקו" />
                      <BulletRow text="רשימת המוזמנים, השולחנות והסידורים יימחקו" />
                      <BulletRow text="ההזמנה, ההודעות והתזכורות יימחקו" />
                    </>
                  ) : (
                    <BulletRow text="הנתונים האישיים שלכם יימחקו" />
                  )}
                </View>

                <Text style={styles.confirmHint}>
                  כדי לאשר, הקלידו את המילה <Text style={styles.confirmHintBold}>{CONFIRM_PHRASE}</Text>
                </Text>

                <TextInput
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder={CONFIRM_PHRASE}
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!deleting}
                  style={styles.confirmInput}
                  textAlign="right"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />

                <View style={styles.actions}>
                  <View style={styles.actionOuter}>
                    <Pressable
                      onPress={closeModal}
                      disabled={deleting}
                      style={({ pressed }) => ({
                        flex: 1,
                        opacity: deleting ? 0.6 : pressed ? 0.78 : 1,
                      })}
                      accessibilityRole="button"
                      accessibilityLabel="ביטול"
                    >
                      <View style={styles.cancelBtn}>
                        <Text style={styles.cancelText}>ביטול</Text>
                      </View>
                    </Pressable>
                  </View>
                  <View style={styles.actionOuter}>
                    <Pressable
                      onPress={handleConfirmDelete}
                      disabled={!canConfirm}
                      style={({ pressed }) => ({
                        flex: 1,
                        opacity: !canConfirm ? 0.5 : pressed ? 0.85 : 1,
                      })}
                      accessibilityRole="button"
                      accessibilityLabel="אישור מחיקת חשבון"
                    >
                      <LinearGradient
                        colors={['#dc2626', '#b91c1c', '#991b1b']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.confirmBtn}
                      >
                        {deleting ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="trash-outline" size={18} color="#fff" />
                            <Text style={styles.confirmBtnText}>מחק חשבון</Text>
                          </>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function BulletRow({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Action card (matches the rest of the profile cards: עריכת פרטי אירוע / עריכת הזמנה / עריכת פרופיל) ──
  actionCard: {
    position: 'relative',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.07)',
    paddingVertical: 18,
    paddingHorizontal: 14,
    paddingStart: 16,
    backgroundColor: 'rgba(255,255,255,0.97)',
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    overflow: 'hidden',
  },
  actionAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 5,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  actionIconBox: {
    width: 50,
    height: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBody: {
    flex: 1,
    alignItems: 'flex-end',
    paddingHorizontal: 10,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  actionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 17,
  },
  actionChevron: {
    paddingStart: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionChevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Confirmation modal ──
  kbAvoider: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  sheetWrap: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '100%',
    borderRadius: 28,
    backgroundColor: colors.white,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  sheetScroll: {
    width: '100%',
  },
  sheet: {
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
  },
  sheetIconWrap: { marginBottom: 14 },
  sheetIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(220,38,38,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#7f1d1d',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  sheetBody: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[700],
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 20,
    marginBottom: 16,
  },
  bullets: {
    width: '100%',
    gap: 8,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  bulletRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT_COLOR,
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  confirmHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  confirmHintBold: {
    fontWeight: '900',
    color: ACCENT_COLOR,
  },
  confirmInput: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(220,38,38,0.22)',
    backgroundColor: '#FFF7F7',
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '800',
    color: '#7f1d1d',
    marginBottom: 18,
  },
  actions: {
    width: '100%',
    flexDirection: ROW_DIR,
    gap: 10,
  },
  actionOuter: {
    flex: 1,
    minHeight: 50,
    height: 50,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(6,23,62,0.14)',
    backgroundColor: 'rgba(6,23,62,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    writingDirection: 'rtl',
  },
  confirmBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: ACCENT_COLOR,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    writingDirection: 'rtl',
  },
});

export default DeleteAccountSection;
