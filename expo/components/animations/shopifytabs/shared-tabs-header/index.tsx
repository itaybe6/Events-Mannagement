import React from "react";
import { usePathname } from "expo-router";
import { Tab } from "../custom-tab-bar";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search } from "./search";
import { SEARCH_BAR_HEIGHT, SEARCH_FILTERS_HEIGHT } from "../lib/constants/styles";
import { Home } from "./home";
import { OrdersProducts } from "./orders-products";
import { ProfileTab } from "./profile-tab";
import { MENU_TRANSITION_SPRING_CONFIG } from "../lib/constants/animation-configs";

// shopify-tabs-shared-header-animation 🔽

export const SharedTabsHeader = () => {
  const pathname = usePathname();

  const insets = useSafeAreaInsets();

  /**
   * Animated container height that morphs based on the active tab.
   * Why: Search has a 2-row header (search bar + filters), other tabs are single-row.
   * We compute exact pixel heights up front using safe-area top inset + section constants
   * to avoid runtime measurement jitter.
   */
  const rContainerStyle = useAnimatedStyle(() => {
    // Search header: status bar (insets.top) + padding (18) + search (42) + filters (56)
    const searchScreenHeaderHeight = insets.top + 18 + SEARCH_BAR_HEIGHT + SEARCH_FILTERS_HEIGHT;
    // Other tabs: status bar (insets.top) + compact row (approx 50)
    const restScreenHeaderHeight = insets.top + 50;

    return {
      /* Spring smooths between header heights on tab change.
       * Damping/Stiffness tuned for a quick but not snappy feel akin to Shopify.
       * Running on the UI thread keeps the morphing jank-free.
       */
      height: withSpring(
        pathname.endsWith(Tab.Search) ? searchScreenHeaderHeight : restScreenHeaderHeight,
        MENU_TRANSITION_SPRING_CONFIG
      ),
    };
  });

  return (
    <Animated.View
      /* Animated wrapper is required so the height spring runs on the UI thread
       * (createAnimatedComponent). Padding uses safe-area top to align content
       * with OS status bar on both iOS/Android. */
      className="px-5 bg-black"
      style={[{ paddingTop: insets.top + 12 }, rContainerStyle]}
    >
      {/* Route-driven rendering triggers consistent entrance animations per tab.
       * Keeping content split by tab clarifies which section participates in the
       * shared header height calculation above. */}
      {pathname.endsWith(Tab.Search) && <Search />}
      {pathname.endsWith(Tab.Home) && <Home />}
      {(pathname.endsWith(Tab.Orders) || pathname.endsWith(Tab.Products)) && <OrdersProducts />}
      {pathname.endsWith(Tab.Profile) && <ProfileTab />}
    </Animated.View>
  );
};

// shopify-tabs-shared-header-animation 🔼
