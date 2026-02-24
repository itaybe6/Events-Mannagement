import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';



function getExpoExtra(): Record<string, any> | undefined {
  return (
    (Constants.expoConfig?.extra as any) ??
    ((Constants as any).manifest?.extra as any) ??
    ((Constants as any).manifest2?.extra as any)
  );
}

function normalizeSupabaseUrl(input?: string): string | undefined {
  const raw = String(input ?? '').trim();
  if (!raw) return undefined;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.includes('.supabase.co')) return `https://${raw.replace(/^\/+/, '')}`;

  // If caller provided only the project ref (e.g. "xyzcompanyref"), expand it.
  // This avoids net::ERR_NAME_NOT_RESOLVED on web deploys.
  if (/^[a-z0-9-]+$/i.test(raw)) return `https://${raw}.supabase.co`;

  return raw;
}

const extra = getExpoExtra();

const supabaseUrl = normalizeSupabaseUrl(
  process.env.EXPO_PUBLIC_SUPABASE_URL || extra?.EXPO_PUBLIC_SUPABASE_URL
);

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// For admin operations, we need the service role key
// You'll need to add this to your .env file or Supabase dashboard
const supabaseServiceKey =
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || extra?.EXPO_PUBLIC_SUPABASE_SERVICE_KEY;

// Debug logging - Extended


if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('URL:', supabaseUrl);
  console.error('Anon key exists:', !!supabaseAnonKey);
  throw new Error('Missing Supabase environment variables. Please check your .env file and make sure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.');
}

// On web, Supabase auth can hang indefinitely due to its internal lock mechanism
// (Web Locks API) + async storage adapters. We avoid passing AsyncStorage on web,
// and additionally bypass the lock on web to prevent "infinite loading" on login.
const webNoopLock = async <T,>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>
): Promise<T> => fn();


// Regular client for normal operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    ...(Platform.OS === 'web' ? { lock: webNoopLock } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Admin client for user management (using service role key)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
}); 