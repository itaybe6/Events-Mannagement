import React, { FC } from "react";
import { View, Pressable, StyleSheet, Keyboard } from "react-native";
import { SearchBar } from "./search-bar";
import { Href, useGlobalSearchParams, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { SearchFilters } from "./search-filters";
import { SEARCH_BAR_HEIGHT } from "../../lib/constants/styles";
import Animated, { FadeIn } from "react-native-reanimated";
import { Tab } from "../../custom-tab-bar";
import { SHOPIFY_TABS_DEMO_BASE_ROUTE } from "../../lib/constants/routes";

// shopify-tabs-shared-header-animation 🔽

export const Search: FC = () => {
  const router = useRouter();

  const params = useGlobalSearchParams<{ lastRoute: string }>();

  return (
    <Animated.View
      /* Staggered entrance for search header stack.
       * Delay 200ms: lets the parent tab header settle before this section fades in,
       * preventing competing motions. Duration 150ms keeps it snappy.
       * Animated.View ensures the entering animation runs on the UI thread
       * via createAnimatedComponent for smoothness.
       */
      entering={FadeIn.delay(200).duration(150)}
    >
      <View className="flex-row items-center gap-2" style={styles.searchBarContainer}>
        <Pressable
          onPress={() => {
            router.push(
              `${SHOPIFY_TABS_DEMO_BASE_ROUTE}/${params?.lastRoute || Tab.Home}` as Href
            );
            router.setParams({
              lastRoute: params.lastRoute,
            });
            Keyboard.dismiss();
          }}
          className="h-full aspect-square rounded-full items-center justify-center bg-[#303030]"
        >
          <X size={22} color="#E5E7EB" />
        </Pressable>
        <SearchBar />
      </View>
      <SearchFilters />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  searchBarContainer: {
    /* Fixed height ensures predictable vertical rhythm and keeps
     * touch targets aligned with the shared header animation measurements. */
    height: SEARCH_BAR_HEIGHT,
  },
});

// shopify-tabs-shared-header-animation 🔼
