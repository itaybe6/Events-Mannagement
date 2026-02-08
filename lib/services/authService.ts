import { supabase, supabaseAdmin } from '../supabase';
import { UserType } from '@/store/userStore';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar_url?: string;
  event_id?: string;
  userType: UserType;
  created_at?: string;
  updated_at?: string;
}

export const authService = {
  // Resolve a primary event id for an event owner (fallback if users.event_id is missing)
  getPrimaryEventId: async (userId: string): Promise<string | null> => {
    try {
      const nowIso = new Date().toISOString();
      const { data: upcoming, error: upcomingError } = await supabase
        .from('events')
        .select('id')
        .eq('user_id', userId)
        .gte('date', nowIso)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (upcomingError) {
        console.error('Get upcoming event error:', upcomingError);
      }

      if (upcoming?.id) return upcoming.id;

      const { data: latest, error: latestError } = await supabase
        .from('events')
        .select('id')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        console.error('Get latest event error:', latestError);
      }

      return latest?.id ?? null;
    } catch (error) {
      console.error('Get primary event id error:', error);
      return null;
    }
  },

  // Helper function to check if error is a token expiry error
  isTokenExpiredError: (error: any): boolean => {
    if (!error) return false;
    
    const errorMessage = typeof error === 'string' ? error : error.message || '';
    return errorMessage.includes('Invalid Refresh Token') || 
           errorMessage.includes('Refresh Token Not Found') ||
           errorMessage.includes('refresh_token_not_found') ||
           error.status === 401;
  },

  // Helper function to handle token expiry by clearing session
  handleTokenExpiry: async (): Promise<void> => {
    try {
      // Use local scope so we can always clear storage even if refresh token is missing/invalid.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        // Best-effort cleanup; don't rethrow from a recovery path.
        console.warn('Auth cleanup (local signOut) error:', error);
      }
    } catch (signOutError) {
      // Best-effort cleanup; avoid surfacing as a hard error.
      console.warn('Auth cleanup exception:', signOutError);
    }
  },

  // Test connection and permissions
  testConnection: async (): Promise<{ success: boolean; message: string }> => {
    try {
      // First try an even simpler test - just ping the API
      try {
        const response = await fetch(`${supabase.supabaseUrl}/rest/v1/`, {
          method: 'GET',
          headers: {
            'apikey': supabase.supabaseKey,
            'Authorization': `Bearer ${supabase.supabaseKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          return {
            success: false,
            message: `API not reachable: ${response.status} ${response.statusText}`
          };
        }
      } catch (fetchError) {
        console.error('❌ Fetch error:', fetchError);
        return {
          success: false,
          message: `🌐 בעיית רשת: לא ניתן להתחבר לשרתי Supabase\n\n💡 זה יכול לקרות בגלל:\n• אין חיבור לאינטרנט\n• חסימת פיירוול/אנטי-ויירוס\n• שירותי Supabase לא זמינים\n\nהאפליקציה תעבוד במצב דמו עד שהחיבור יחזור.`
        };
      }
      
      // Now try the Supabase query
      const { error } = await supabase
        .from('users')
        .select('count', { count: 'exact', head: true });

      if (error) {
        console.error('❌ Supabase query failed:', error);
        return {
          success: false,
          message: `Supabase query failed: ${error.message}\n\nCode: ${error.code || 'No code'}\n\nDetails: ${error.details || 'No details'}\n\nHint: ${error.hint || 'No hint'}`
        };
      }
      return {
        success: true,
        message: 'Connection and database access successful'
      };
    } catch (error) {
      console.error('❌ Unexpected error during connection test:', error);
      return {
        success: false,
        message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },

  // Sign up with email and password (admin only function)
  signUp: async (email: string, password: string, name: string, userType: UserType) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        // Create user profile in our users table
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email,
            name,
            user_type: userType,
          });

        if (profileError) throw profileError;

        return {
          user: {
            id: authData.user.id,
            email,
            name,
            userType,
          } as AuthUser,
          session: authData.session,
        };
      }

      throw new Error('Failed to create user');
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  },

  // Get all users (admin only)
  getAllUsers: async (): Promise<AuthUser[]> => {
    try {
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw error;
      }

      const mappedUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone || undefined,
        avatar_url: user.avatar_url || undefined,
        userType: user.user_type as UserType,
        created_at: user.created_at,
        updated_at: user.updated_at,
      }));

      return mappedUsers;
    } catch (error) {
      console.error('❌ Get all users error:', error);
      throw error;
    }
  },

  // Create user (admin only)
  createUser: async (
    email: string,
    password: string,
    name: string,
    userType: UserType,
    phone?: string
  ): Promise<AuthUser> => {
    try {
      // First create auth user using Supabase Auth Admin API
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          user_type: userType,
          phone,
        }
      });

      if (authError) {
        console.error('❌ Auth creation error:', authError);
        throw authError;
      }

      if (authData.user) {
        // Then create profile in our users table
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('users')
          .insert({
            id: authData.user.id,
            email,
            name,
            phone: phone || null,
            user_type: userType,
          })
          .select()
          .single();

        if (profileError) {
            console.error('❌ Profile creation error:', profileError);
            // If profile creation fails, clean up auth user
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            throw profileError;
          }

        return {
          id: authData.user.id,
          email,
          name,
          phone,
          userType,
          created_at: profileData.created_at,
          updated_at: profileData.updated_at,
        } as AuthUser;
      }

      throw new Error('Failed to create user');
    } catch (error) {
      console.error('❌ Create user error:', error);
      throw error;
    }
  },

  // Delete user (admin only)
  deleteUser: async (userId: string): Promise<void> => {
    try {
      // First delete from our users table
      const { error: profileError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', userId);

      if (profileError) {
        console.error('❌ Profile deletion error:', profileError);
        throw profileError;
      }

      // Then delete auth user
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      
      if (authError) {
        console.error('❌ Auth deletion error:', authError);
        throw authError;
      }
    } catch (error) {
      console.error('❌ Delete user error:', error);
      throw error;
    }
  },

  // Sign in with email and password
  signIn: async (email: string, password: string) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error('Sign in auth error:', authError);
        
        // Handle specific auth errors
        if (authError.message?.includes('Invalid login credentials')) {
          throw new Error('מייל או סיסמה שגויים');
        } else if (authError.message?.includes('Email not confirmed')) {
          throw new Error('יש לאמת את כתובת המייל לפני ההתחברות');
        } else if (authError.message?.includes('Too many requests')) {
          throw new Error('יותר מדי ניסיונות התחברות. נסה שוב מאוחר יותר');
        }
        
        throw authError;
      }

      if (authData.user) {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profileError) {
          console.error('Profile fetch error:', profileError);
          throw new Error('שגיאה בטעינת פרטי המשתמש');
        }

        return {
          user: {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            phone: profile.phone || undefined,
            avatar_url: profile.avatar_url || undefined,
            event_id: profile.event_id,
            userType: profile.user_type as UserType,
          } as AuthUser,
          session: authData.session,
        };
      }

      throw new Error('Failed to sign in');
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  },

  // Sign out
  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  },

  // Get current user
  getCurrentUser: async (): Promise<AuthUser | null> => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      // No session is a normal state (not an error).
      if (sessionError) {
        // Treat refresh-token issues as a normal "logged out" state.
        // This commonly happens in dev when AsyncStorage contains a stale/corrupt auth payload,
        // or when opening the app without ever signing in.
        if (authService.isTokenExpiredError(sessionError)) {
          await authService.handleTokenExpiry();
          return null;
        }

        console.error('Auth session error:', sessionError);
        throw sessionError;
      }

      if (!session?.user) return null;
      const user = session.user;

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
        throw profileError;
      }

      if (!profile) return null;

      let resolvedEventId = profile.event_id;
      if (!resolvedEventId && profile.user_type === 'event_owner') {
        resolvedEventId = await authService.getPrimaryEventId(profile.id);
      }

      return {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        phone: profile.phone,
        avatar_url: profile.avatar_url || undefined,
        event_id: resolvedEventId ?? undefined,
        userType: profile.user_type as UserType,
      };
    } catch (error) {
      if (authService.isTokenExpiredError(error)) {
        await authService.handleTokenExpiry();
        return null;
      }
      
      console.error('Get current user error:', error);
      return null;
    }
  },

  // Update user profile
  updateProfile: async (updates: Partial<{ name: string; email: string; phone?: string }>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  },

  // Listen to auth state changes
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  },

  // Check if users table exists and create demo user if needed
  setupDatabase: async (): Promise<{ success: boolean; message: string }> => {
    try {
      // First check if table exists by trying to count rows
      const { error: countError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        if (countError.code === 'PGRST116' || countError.message?.includes('does not exist')) {
          return {
            success: false,
            message: 'טבלת המשתמשים לא קיימת בדאטאבייס. יש להריץ את הקוד SQL מהקובץ supabase/schema.sql'
          };
        }
        
        return {
          success: false,
          message: `שגיאה בגישה לטבלת המשתמשים: ${countError.message}`
        };
      }
      
      // Check if admin user exists
      const { data: adminUsers, error: adminError } = await supabase
        .from('users')
        .select('*')
        .eq('user_type', 'admin')
        .limit(1);
      
      if (adminError) {
        console.error('❌ Error checking admin users:', adminError);
        return {
          success: false,
          message: `שגיאה בבדיקת משתמש מנהל: ${adminError.message}`
        };
      }
      
      if (!adminUsers || adminUsers.length === 0) {
        return {
          success: true,
          message: 'הדאטאבייס מוכן, אך לא נמצא משתמש מנהל. צור משתמש מנהל דרך Supabase Dashboard'
        };
      }
      return {
        success: true,
        message: 'הדאטאבייס מוכן ופועל'
      };
      
    } catch (error) {
      console.error('❌ Database setup error:', error);
      return {
        success: false,
        message: `שגיאה בהגדרת הדאטאבייס: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
}; 