import { createContext, FC, PropsWithChildren, useContext } from "react";
import { SharedValue, useSharedValue } from "react-native-reanimated";

// shopify-menu-transition-animation 🔽

type ContextValue = {
  menuProgress: SharedValue<number>;
};

const MenuContext = createContext<ContextValue>({} as ContextValue);

export const MenuProvider: FC<PropsWithChildren> = ({ children }) => {
  // Single source of truth for menu open/close progress shared across the tab layout.
  // Range: 0 (fully closed) → 1 (fully open). Using a shared value keeps
  // animations on the UI thread and avoids prop-drilling between screens.
  const menuProgress = useSharedValue(0);

  const value = { menuProgress };

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
};

export const useMenu = () => {
  const context = useContext(MenuContext);

  if (!context) {
    throw new Error("useMenu must be used within an MenuProvider");
  }
  return context;
};

// shopify-menu-transition-animation 🔼
