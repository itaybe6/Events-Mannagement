import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';



const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                   Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL 

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                       Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY 

// For admin operations, we need the service role key
// You'll need to add this to your .env file or Supabase dashboard
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY ||
                          Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_SERVICE_KEY 

// Debug logging - Extended


if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('URL:', supabaseUrl);
  console.error('Anon key exists:', !!supabaseAnonKey);
  throw new Error('Missing Supabase environment variables. Please check your .env file and make sure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.');
}


// Regular client for normal operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
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