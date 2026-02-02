import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService, AuthUser } from '@/lib/services/authService';

export type UserType = 'couple' | 'admin' | 'employee'; // Added employee type

interface UserState {
  isLoggedIn: boolean;
  userType: UserType | null;
  userData: AuthUser | null;
  loading: boolean;
  
  // Actions
  signUp: (email: string, password: string, name: string, userType: UserType) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  login: (userType: UserType, userData: AuthUser) => void;
  logout: () => Promise<void>;
  resetAuth: () => void;
  updateUserData: (userData: Partial<AuthUser>) => Promise<void>;
  initializeAuth: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      isLoggedIn: false,
      userType: null,
      userData: null,
      loading: false,
      
      signUp: async (email: string, password: string, name: string, userType: UserType) => {
        try {
          set({ loading: true });
          const { user } = await authService.signUp(email, password, name, userType);
          
          set({
            isLoggedIn: true,
            userType: user.userType,
            userData: user,
            loading: false,
          });
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },
      
      signIn: async (email: string, password: string) => {
        try {
          set({ loading: true });
          const { user } = await authService.signIn(email, password);
          
          set({
            isLoggedIn: true,
            userType: user.userType,
            userData: user,
            loading: false,
          });
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },
      
      login: (userType: UserType, userData: AuthUser) => {
        set({
          isLoggedIn: true,
          userType,
          userData,
        });
      },
      
      logout: async () => {
        try {
          await authService.signOut();
          set({
            isLoggedIn: false,
            userType: null,
            userData: null,
          });
        } catch (error) {
          console.error('Logout error:', error);
          // Force logout even if there's an error
          set({
            isLoggedIn: false,
            userType: null,
            userData: null,
          });
        }
      },
      
      resetAuth: () => {
        set({
          isLoggedIn: false,
          userType: null,
          userData: null,
          loading: false,
        });
      },
      
      updateUserData: async (userData: Partial<AuthUser>) => {
        try {
          await authService.updateProfile(userData);
          set((state) => ({
            userData: state.userData ? { ...state.userData, ...userData } : null,
          }));
        } catch (error) {
          console.error('Update user data error:', error);
          throw error;
        }
      },
      
      initializeAuth: async () => {
        try {
          set({ loading: true });
          const user = await authService.getCurrentUser();
          
          if (user) {
            set({
              isLoggedIn: true,
              userType: user.userType,
              userData: user,
              loading: false,
            });
          } else {
            set({
              isLoggedIn: false,
              userType: null,
              userData: null,
              loading: false,
            });
          }
        } catch (error) {
          console.error('Initialize auth error:', error);
          
          // Handle refresh token errors specifically using helper
          if (authService.isTokenExpiredError(error)) {
            console.log('Token expired during auth initialization, resetting auth state');
          }
          
          // Always reset auth state on any error during initialization
          set({
            isLoggedIn: false,
            userType: null,
            userData: null,
            loading: false,
          });
        }
      },
    }),
    {
      name: 'user-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        userType: state.userType,
        userData: state.userData,
      }),
    }
  )
); 