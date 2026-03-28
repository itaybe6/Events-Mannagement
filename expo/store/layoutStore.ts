import { create } from 'zustand';

type LayoutState = {
  isTabBarVisible: boolean;
  isAdminHeaderVisible: boolean;
  setTabBarVisible: (isVisible: boolean) => void;
  setAdminHeaderVisible: (isVisible: boolean) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  isTabBarVisible: true,
  isAdminHeaderVisible: true,
  setTabBarVisible: (isVisible) => set({ isTabBarVisible: isVisible }),
  setAdminHeaderVisible: (isVisible) => set({ isAdminHeaderVisible: isVisible }),
})); 