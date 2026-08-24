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
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

// Admin client for user management (using service role key).
// The service role key must NOT be bundled in the client; it is only present when
// provided via an EAS env var. When it is missing we fall back to the regular
// (anon) client so importing this module never throws ("supabaseKey is required")
// and the app can still boot. Admin-only operations will then run with anon
// privileges (and should ideally be moved to a Supabase Edge Function).
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : supabase;

if (!supabaseServiceKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_SERVICE_KEY is not set. supabaseAdmin falls back to the anon client; admin-only operations may fail due to RLS.'
  );
}

/** Thrown when an RLS-dependent read is attempted with no signed-in session. */
export class NoSupabaseSessionError extends Error {
  constructor() {
    super('No active Supabase session');
    this.name = 'NoSupabaseSessionError';
  }
}

/**
 * Awaits the client's session restore and fails loudly when there is none.
 *
 * Every table policy here is keyed on `auth.uid()`, so PostgREST answers a
 * signed-out request with an empty result set and no error — indistinguishable
 * from "this account really has no rows". On web the router sends an already
 * persisted user straight into the app, so a screen can fire its first query
 * before `supabase.auth` has finished reading the session out of storage.
 * `getSession()` resolves only after that restore, so awaiting it both
 * serialises the read behind auth init and lets the caller throw instead of
 * caching an empty list as if it were real data.
 */
export async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new NoSupabaseSessionError();
  return data.session;
}
