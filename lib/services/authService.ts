import { supabase, supabaseAdmin } from '../supabase';
import { UserType } from '@/store/userStore';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  userType: UserType;
  created_at?: string;
  updated_at?: string;
}

export const authService = {
  // Test connection and permissions
  testConnection: async (): Promise<{ success: boolean; message: string }> => {
    try {
      console.log('🧪 Testing Supabase connection...');
      console.log('🔗 URL:', supabase.supabaseUrl);
      console.log('🔑 Has anon key:', !!supabase.supabaseKey);
      console.log('🔧 Client config:', {
        url: supabase.supabaseUrl,
        hasKey: !!supabase.supabaseKey
      });
      
      // First try an even simpler test - just ping the API
      console.log('🏓 Testing basic API connectivity...');
      
      try {
        const response = await fetch(`${supabase.supabaseUrl}/rest/v1/`, {
          method: 'GET',
          headers: {
            'apikey': supabase.supabaseKey,
            'Authorization': `Bearer ${supabase.supabaseKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('📊 Fetch response status:', response.status);
        console.log('📊 Fetch response ok:', response.ok);
        
        if (!response.ok) {
          return {
            success: false,
            message: `API not reachable: ${response.status} ${response.statusText}`
          };
        }
        
        console.log('✅ Basic API connectivity works');
        
      } catch (fetchError) {
        console.error('❌ Fetch error:', fetchError);
        return {
          success: false,
          message: `🌐 בעיית רשת: לא ניתן להתחבר לשרתי Supabase\n\n💡 זה יכול לקרות בגלל:\n• אין חיבור לאינטרנט\n• חסימת פיירוול/אנטי-ויירוס\n• שירותי Supabase לא זמינים\n\nהאפליקציה תעבוד במצב דמו עד שהחיבור יחזור.`
        };
      }
      
      // Now try the Supabase query
      console.log('🔍 Testing Supabase query...');
      const { data, error, status, statusText } = await supabase
        .from('users')
        .select('count', { count: 'exact', head: true });
      
      console.log('📊 Supabase response status:', status);
      console.log('📊 Supabase response statusText:', statusText);
      console.log('📊 Supabase response data:', data);
      console.log('📊 Supabase response error:', error);
      
      if (error) {
        console.error('❌ Supabase query failed:', error);
        return {
          success: false,
          message: `Supabase query failed: ${error.message}\n\nCode: ${error.code || 'No code'}\n\nDetails: ${error.details || 'No details'}\n\nHint: ${error.hint || 'No hint'}`
        };
      }
      
      console.log('✅ Supabase connection test successful');
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
      console.log('🔍 AuthService - Querying users table with admin client...');
      
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw error;
      }

      console.log('✅ Raw users from Supabase:', users);

      const mappedUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        userType: user.user_type as UserType,
        created_at: user.created_at,
        updated_at: user.updated_at,
      }));

      console.log('✅ Mapped users:', mappedUsers);
      return mappedUsers;
    } catch (error) {
      console.error('❌ Get all users error:', error);
      throw error;
    }
  },

  // Create user (admin only)
  createUser: async (email: string, password: string, name: string, userType: UserType): Promise<AuthUser> => {
    try {
      console.log('👤 AuthService - Creating new user:', { email, name, userType });
      
      // First create auth user using Supabase Auth Admin API
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          user_type: userType,
        }
      });

      if (authError) {
        console.error('❌ Auth creation error:', authError);
        throw authError;
      }

      console.log('✅ Auth user created:', authData.user?.id);

      if (authData.user) {
        // Then create profile in our users table
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('users')
          .insert({
            id: authData.user.id,
            email,
            name,
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

        console.log('✅ User profile created:', profileData);

        return {
          id: authData.user.id,
          email,
          name,
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
      console.log('🗑️ AuthService - Deleting user:', userId);
      
      // First delete from our users table
      const { error: profileError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', userId);

      if (profileError) {
        console.error('❌ Profile deletion error:', profileError);
        throw profileError;
      }

      console.log('✅ User profile deleted');

      // Then delete auth user
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      
      if (authError) {
        console.error('❌ Auth deletion error:', authError);
        throw authError;
      }

      console.log('✅ Auth user deleted');
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

      if (authError) throw authError;

      if (authData.user) {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profileError) throw profileError;

        return {
          user: {
            id: profile.id,
            email: profile.email,
            name: profile.name,
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
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return null;

      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      return {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        userType: profile.user_type as UserType,
      };
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  },

  // Update user profile
  updateProfile: async (updates: Partial<{ name: string; email: string }>) => {
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
      console.log('🔧 Setting up database...');
      
      // First check if table exists by trying to count rows
      const { data: countData, error: countError } = await supabase
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
      
      console.log('✅ Users table exists');
      
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
        console.log('⚠️ No admin user found, you may need to create one manually');
        return {
          success: true,
          message: 'הדאטאבייס מוכן, אך לא נמצא משתמש מנהל. צור משתמש מנהל דרך Supabase Dashboard'
        };
      }
      
      console.log('✅ Admin user exists');
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