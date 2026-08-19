import { Alert, Linking, Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';

export function buildInviteUrl(tokenOrCode: string): string {
  const t = String(tokenOrCode || '').trim();
  if (!t) return '';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/i/${t}`;
  }
  return ExpoLinking.createURL(`/i/${t}`);
}

export function getGuestInviteUrl(guest: {
  invitationCode?: string | null;
  invitationToken?: string | null;
}): string {
  const token = String(guest?.invitationCode || guest?.invitationToken || '').trim();
  return token ? buildInviteUrl(token) : '';
}

export async function openInviteUrl(url: string): Promise<void> {
  const u = String(url || '').trim();
  if (!u) return;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(u, '_blank', 'noopener,noreferrer');
      return;
    }
    const can = await Linking.canOpenURL(u);
    if (can) await Linking.openURL(u);
    else Alert.alert('שגיאה', 'לא ניתן לפתוח את הקישור');
  } catch (e) {
    console.error('openInviteUrl error:', e);
    Alert.alert('שגיאה', 'לא ניתן לפתוח את הקישור');
  }
}
