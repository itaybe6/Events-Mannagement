import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CalendarDays, SearchIcon, User, Users } from "lucide-react-native";
import React, { FC } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabButton } from "../custom-tab-bar/tab-button";
import { AdminTabRoute } from "../lib/constants/admin-tabs";

export const AdminTabBar: FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();

  const isTabFocused = (routeName: string) => {
    const index = state.routes.findIndex((route) => route.name === routeName);
    return state.index === index;
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { bottom: insets.bottom + 12 }]}
    >
      <View style={[styles.edgeButtonWrap, styles.buttonBorder, styles.shadow]}>
        <TabButton
          focused={isTabFocused(AdminTabRoute.Search)}
          onPress={() => navigation.navigate(AdminTabRoute.Search)}
        >
          <SearchIcon
            size={24}
            color={isTabFocused(AdminTabRoute.Search) ? "#FFFFFF" : "#8A8A8A"}
          />
        </TabButton>
      </View>

      <View
        style={[styles.centerGroup, styles.buttonBorder, styles.shadow]}
      >
        <TabButton
          focused={isTabFocused(AdminTabRoute.Events)}
          onPress={() => navigation.navigate(AdminTabRoute.Events)}
        >
          <CalendarDays
            size={24}
            color={isTabFocused(AdminTabRoute.Events) ? "#FFFFFF" : "#8A8A8A"}
          />
        </TabButton>

        <TabButton
          focused={isTabFocused(AdminTabRoute.Users)}
          onPress={() => navigation.navigate(AdminTabRoute.Users)}
        >
          <Users size={24} color={isTabFocused(AdminTabRoute.Users) ? "#FFFFFF" : "#8A8A8A"} />
        </TabButton>
      </View>

      <View style={[styles.edgeButtonWrap, styles.buttonBorder, styles.shadow]}>
        <TabButton
          focused={isTabFocused(AdminTabRoute.Profile)}
          onPress={() => navigation.navigate(AdminTabRoute.Profile)}
        >
          <User size={24} color={isTabFocused(AdminTabRoute.Profile) ? "#FFFFFF" : "#8A8A8A"} />
        </TabButton>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 0,
  },
  edgeButtonWrap: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  centerGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  buttonBorder: { borderWidth: 1, borderColor: "rgba(17,17,17,0.06)" },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
  },
});
