import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';



const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                   Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
                   'https://yzsfozjrhznlzqcgoqar.supabase.co'; // Your actual URL as fallback

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                       Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                       'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubHpxY2dvcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY0OTIwNTUsImV4cCI6MjA1MjA2ODA1NX0.FXBSofoKWJVJfRJQ8IlXXLqT59BXnbhgqU4LNGVdRlg'; // Your anon key as fallback

// For admin operations, we need the service role key
// You'll need to add this to your .env file or Supabase dashboard
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY ||
                          Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_SERVICE_KEY ||
                          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubGVxY2dnb3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjk5NDgwNSwiZXhwIjoyMDY4NTcwODA1fQ.vyF70hbjXOOne7mZgKL7bDHOnTKvP7UCiVFa1n2_ikE'; // Your service role key

// Debug logging - Extended
console.log('🔑 Supabase Config Debug (DETAILED):');
console.log('URL from process.env:', process.env.EXPO_PUBLIC_SUPABASE_URL);
console.log('URL from Constants:', Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL);
console.log('Final URL:', supabaseUrl);
console.log('Final URL length:', supabaseUrl?.length);
console.log('Has anon key:', !!supabaseAnonKey);
console.log('Anon key length:', supabaseAnonKey?.length);
console.log('Has service key:', !!supabaseServiceKey);
console.log('Service key length:', supabaseServiceKey?.length);
console.log('All process.env vars:', Object.keys(process.env).filter(key => key.includes('SUPABASE')));
console.log('Constants config:', Constants.expoConfig?.extra);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('URL:', supabaseUrl);
  console.error('Anon key exists:', !!supabaseAnonKey);
  throw new Error('Missing Supabase environment variables. Please check your .env file and make sure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.');
}

console.log('✅ Supabase client initialized with URL:', supabaseUrl);

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