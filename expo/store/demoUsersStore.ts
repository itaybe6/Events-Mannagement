import { create } from 'zustand';
import { UserWithMetadata } from '@/lib/services/userService';

interface DemoUsersState {
  users: UserWithMetadata[];
  addUser: (user: UserWithMetadata) => void;
  clear: () => void;
}

export const useDemoUsersStore = create<DemoUsersState>((set) => ({
  users: [],
  addUser: (user) => set((state) => ({ users: [...state.users, user] })),
  clear: () => set({ users: [] }),
}));
