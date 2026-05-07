import React, { FC } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useState } from "react";
import { CircleX, ScanBarcode, SearchIcon } from "lucide-react-native";
import { TextInput } from "react-native";
import { useRouter } from "expo-router";

// shopify-tabs-shared-header-animation 🔽

export const SearchBar: FC = () => {
  const [query, setQuery] = useState<string>("");

  const router = useRouter();

  return (
    <View
      /* Fixed paddings and absolute icons prevent intrinsic text width changes from
       * shifting layout while the header animates. This keeps the bar visually stable
       * as other parts fade/translate. */
      className="flex-1 rounded-2xl justify-center bg-[#303030]"
    >
      <SearchIcon size={18} color="#B5B5B5" style={styles.searchIcon} />
      <TextInput
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          router.setParams({ query: value });
        }}
        placeholder="Search"
        placeholderTextColor="#B5B5B5"
        /* Horizontal padding reserves space for absolute icons, avoiding text reflow
         * during press/clear toggles for smoother perceived animation. */
        className="px-10 h-full text-base/5 text-[#B5B5B5]"
        autoFocus
      />

      {query ? (
        <Pressable
          onPress={() => {
            setQuery("");
            router.setParams({ query: "" });
          }}
          style={styles.scanIcon}
        >
          <CircleX size={18} color="#B5B5B5" />
        </Pressable>
      ) : (
        <Pressable style={styles.scanIcon}>
          <ScanBarcode size={18} color="#B5B5B5" />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  searchIcon: {
    position: "absolute",
    left: 11,
  },
  scanIcon: {
    position: "absolute",
    right: 13,
  },
});

// shopify-tabs-shared-header-animation 🔼
