import React, { useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';

type Props = {
  name: string;
  phone?: string | null;
  arrived: number;
  invited: number;
  checkedIn: boolean;
  /** Icon size. The button grows with it. */
  iconSize?: number;
  /** Outer button size. Defaults to 38. */
  buttonSize?: number;
};

function digitsOnly(raw: string) {
  return String(raw || '').replace(/\D/g, '');
}

/** Show an Israeli mobile number as 052-123-4567 when we have enough digits. */
function formatPhoneDisplay(raw: string) {
  let digits = digitsOnly(raw);
  if (!digits) return '';
  if (digits.startsWith('972') && digits.length >= 11) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function phoneToTel(raw: string) {
  const digits = digitsOnly(raw);
  if (digits.length < 9) return null;
  if (digits.startsWith('972')) return `+${digits}`;
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
  return `+${digits}`;
}

export function GuestPhoneRevealButton({
  name,
  phone,
  arrived,
  invited,
  checkedIn,
  iconSize = 16,
  buttonSize = 38,
}: Props) {
  const [open, setOpen] = useState(false);
  const displayPhone = formatPhoneDisplay(String(phone || ''));
  const tel = phoneToTel(String(phone || ''));
  const arrivedCount = checkedIn ? Math.max(0, Number(arrived) || 0) : 0;
  const invitedCount = Math.max(1, Number(invited) || 1);

  const call = async () => {
    if (!tel) return;
    const url = `tel:${tel}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('שגיאה', 'לא ניתן לחייג מהמכשיר הזה');
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      console.error('Call guest error:', error);
      Alert.alert('שגיאה', `לא ניתן לפתוח שיחה ל-${name}`);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          displayPhone ? `הצג טלפון וכמות שהגיעה עבור ${name}` : `הצג כמות שהגיעה עבור ${name}`
        }
        onPress={() => setOpen(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed, hovered }: any) => [
          styles.btn,
          { width: buttonSize, height: buttonSize },
          !displayPhone && styles.btnMuted,
          Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
          Platform.OS === 'web' && hovered ? styles.btnHover : null,
          pressed ? { opacity: 0.88 } : null,
        ]}
      >
        <Ionicons
          name="call-outline"
          size={iconSize}
          color={displayPhone ? colors.primary : 'rgba(17,24,39,0.35)'}
        />
      </Pressable>

      {open ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <Pressable style={styles.card} onPress={() => null}>
              <Text style={styles.name} numberOfLines={2}>
                {name}
              </Text>
              <Text style={styles.label}>טלפון</Text>
              <Text selectable style={styles.phone}>
                {displayPhone || 'אין מספר טלפון'}
              </Text>
              <Text style={styles.label}>הגיעו</Text>
              <Text style={styles.arrived}>
                {arrivedCount} מתוך {invitedCount}
              </Text>
              <View style={styles.actions}>
                {tel ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`התקשר ל-${name}`}
                    onPress={() => void call()}
                    style={({ pressed }) => [styles.callBtn, pressed ? { opacity: 0.9 } : null]}
                  >
                    <Ionicons name="call" size={16} color={colors.white} />
                    <Text style={styles.callText}>התקשר</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="סגירה"
                  onPress={() => setOpen(false)}
                  style={({ pressed }) => [styles.closeBtn, pressed ? { opacity: 0.9 } : null]}
                >
                  <Text style={styles.closeText}>סגירה</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 0 },
  btn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,238,255,0.96)',
    borderWidth: 1.5,
    borderColor: 'rgba(17, 82, 212, 0.18)',
  },
  btnMuted: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderColor: 'rgba(0,0,0,0.06)',
  },
  btnHover: { backgroundColor: 'rgba(232,238,255,1)' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6,23,62,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 4,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 18px 40px rgba(6,23,62,0.22)' } as any) : null),
  },
  name: { fontSize: 18, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  label: { marginTop: 10, fontSize: 12, fontWeight: '800', color: colors.gray[500], textAlign: 'right' },
  phone: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'right', letterSpacing: 0.4 },
  arrived: { fontSize: 20, fontWeight: '900', color: '#0E9F6E', textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: 8, marginTop: 16 },
  callBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  callText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  closeBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
});
