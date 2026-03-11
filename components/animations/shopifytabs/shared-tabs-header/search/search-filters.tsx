import React, { useEffect, useRef, useState } from "react";
import { FlatList, View, StyleSheet } from "react-native";
import FilterItem from "./search-filter-item";
import { SEARCH_FILTERS_HEIGHT } from "../../lib/constants/styles";
import { useRouter } from "expo-router";

// shopify-tabs-shared-header-animation 🔽
// shopify-search-screen-top-tabs-animation 🔽

/**
 * FILTERS acts as the source of truth for the top tabs. Order matters because
 * FlatList uses the index for `scrollToIndex` centering math in `FilterItem` (viewPosition: 0.5).
 */
const FILTERS = ["All", "Orders", "Products", "Customers", "All filters"] as const;

export const SearchFilters = () => {
  const [activeFilterItem, setActiveFilterItem] = useState<string>("All");

  const router = useRouter();

  /**
   * Ref used by tab items to programmatically center the active tab.
   * This allows each `FilterItem` to call `scrollToIndex({ viewPosition: 0.5 })`
   * so the selected tab is brought into focus.
   */
  const flatListRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (activeFilterItem) {
      router.setParams({ filter: activeFilterItem });
    }
  }, [activeFilterItem, router]);

  return (
    <View
      className="-mx-5"
      /* Fixed container height ties into the shared header stack so the
       * filters row can animate in/out without layout jumps. */
      style={styles.searchBarContainer}
    >
      <FlatList
        ref={flatListRef}
        data={FILTERS}
        keyExtractor={(item) => item.toString()}
        /* Top tabs list. Keeping it horizontal and lightweight so `FilterItem`
         * can animate press feedback purely on the UI thread via shared values.
         * We avoid extra state here to reduce re-renders while flicking.
         */
        renderItem={({ item, index }) => (
          <FilterItem
            item={item}
            index={index}
            flatListRef={flatListRef}
            activeFilterItem={activeFilterItem}
            setActiveFilterItem={setActiveFilterItem}
          />
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
        /* Content spacing ensures chips don't clip and keeps center-on-select math
         * stable across devices (padding is part of scrollToIndex positioning). */
        contentContainerClassName="gap-1 px-5 items-center"
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  searchBarContainer: {
    // Magic number documented in constants; sets row height for animation math.
    height: SEARCH_FILTERS_HEIGHT,
  },
});

// shopify-search-screen-top-tabs-animation 🔼
// shopify-tabs-shared-header-animation 🔼
