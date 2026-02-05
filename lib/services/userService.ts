import { authService, AuthUser } from './authService';
import { UserType } from '@/store/userStore';

export interface UserWithMetadata extends AuthUser {
  created_at: string;
  updated_at: string;
  events_count?: number;
  last_login?: string;
}

export const userService = {
  // Get all users (admin only)
  getAllUsers: async (): Promise<UserWithMetadata[]> => {
    try {
      const users = await authService.getAllUsers();
      
      // Convert to UserWithMetadata format - now we have real timestamps
      const usersWithMetadata = users.map(user => ({
        ...user,
        created_at: user.created_at || new Date().toISOString(),
        updated_at: user.updated_at || new Date().toISOString(),
        events_count: 0, // TODO: Count actual events from events table
        last_login: undefined, // TODO: Implement last login tracking
      }));
      
      return usersWithMetadata;
    } catch (error) {
      console.error('❌ UserService - getAllUsers error:', error);
      throw error;
    }
  },

  // Create new user (admin only)
  createUser: async (
    email: string,
    password: string,
    name: string,
    userType: UserType,
    phone?: string
  ): Promise<UserWithMetadata> => {
    try {
      const user = await authService.createUser(email, password, name, userType, phone);
      
      return {
        ...user,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        events_count: 0,
        last_login: undefined,
      };
    } catch (error) {
      console.error('UserService - createUser error:', error);
      throw error;
    }
  },

  // Delete user (admin only)
  deleteUser: async (userId: string): Promise<void> => {
    try {
      await authService.deleteUser(userId);
    } catch (error) {
      console.error('UserService - deleteUser error:', error);
      throw error;
    }
  },

  // Get event owners (users with type 'event_owner')
  getClients: async (): Promise<UserWithMetadata[]> => {
    try {
      const allUsers = await userService.getAllUsers();
      return allUsers.filter(user => user.userType === 'event_owner');
    } catch (error) {
      console.error('UserService - getClients error:', error);
      throw error;
    }
  },

  // Update user profile
  updateUser: async (userId: string, updates: Partial<Pick<AuthUser, 'name' | 'email' | 'phone'>>): Promise<void> => {
    try {
      await authService.updateProfile(updates);
    } catch (error) {
      console.error('UserService - updateUser error:', error);
      throw error;
    }
  },

  // Search users
  searchUsers: async (query: string): Promise<UserWithMetadata[]> => {
    try {
      const allUsers = await userService.getAllUsers();
      
      if (!query.trim()) {
        return allUsers;
      }

      const searchTerm = query.toLowerCase();
      return allUsers.filter(user => 
        user.name.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm)
      );
    } catch (error) {
      console.error('UserService - searchUsers error:', error);
      throw error;
    }
  },
}; 