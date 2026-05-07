import React from "react";
import { Pressable, Text } from "react-native";
import { ListFilter } from "lucide-react-native";
import type { RefObject } from "react";
import type { FlatList } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

// shopify-search-screen-top-tabs-animation 🔽

type FilterItemProps = {
  item: string;
  index: number;
  activeFilterItem: string | null;
  flatListRef: RefObject<FlatList<string> | null>;
  setActiveFilterItem: (item: string) => void;
};

const FilterItem = ({
  item,
  index,
  activeFilterItem,
  flatListRef,
  setActiveFilterItem,
}: FilterItemProps) => {
  const isActive = activeFilterItem === item;
  const isPressed = useSharedValue(false);

  const rStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: isPressed.get() ? "#737373" : "rgba(0, 0, 0, 0)",
    };
  });

  return (
    <Pressable
      onPressIn={() => isPressed.set(true)}
      onPressOut={() => isPressed.set(false)}
      onPress={() => {
        setActiveFilterItem(item);
        // Center the selected tab in view for better discoverability (viewPosition: 0.5)
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      }}
      className={`rounded-full ${isActive ? "bg-[#303030]" : "bg-transparent"}`}
    >
      <Animated.View
        className="flex-row gap-2 items-center justify-center px-4 py-1 rounded-full"
        style={rStyle}
      >
        {item === "All filters" ? <ListFilter size={18} color={"#E5E7EB"} /> : null}
        <Text className="text-lg text-gray-200 ">{item}</Text>
      </Animated.View>
    </Pressable>
  );
};

export default FilterItem;

// shopify-search-screen-top-tabs-animation 🔼
