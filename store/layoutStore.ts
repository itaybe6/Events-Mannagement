import { create } from 'zustand';

type LayoutState = {
  isTabBarVisible: boolean;
  setTabBarVisible: (isVisible: boolean) => void;
};

export const useLayoutStore = create<LayoutState>((set) => ({
  isTabBarVisible: true,
  setTabBarVisible: (isVisible) => set({ isTabBarVisible: isVisible }),
})); 