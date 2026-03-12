import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import React, { FC } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabButton } from "../custom-tab-bar/tab-button";

enum CoupleTabRoute {
  Home = "index",
  Guests = "guests",
  Seating = "BrideGroomSeating",
  Tables = "TablesList",
  Profile = "brideGroomProfile",
  Messages = "automatic-notifications",
}

type CoupleTabIconProps = {
  focused: boolean;
  activeIcon: React.ComponentProps<typeof Ionicons>["name"];
  inactiveIcon: React.ComponentProps<typeof Ionicons>["name"];
};

function CoupleTabIcon({ focused, activeIcon, inactiveIcon }: CoupleTabIconProps) {
  return <Ionicons name={focused ? activeIcon : inactiveIcon} size={24} color={focused ? "#FFFFFF" : "#8A8A8A"} />;
}

export const CoupleTabBar: FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();

  const isTabFocused = (routeName: string) => {
    const index = state.routes.findIndex((route) => route.name === routeName);
    return state.index === index;
  };

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom: insets.bottom + 12 }]}>
      <View style={[styles.edgeButtonWrap, styles.buttonBorder, styles.shadow]}>
        <TabButton
          focused={isTabFocused(CoupleTabRoute.Home)}
          onPress={() => navigation.navigate(CoupleTabRoute.Home)}
        >
          <CoupleTabIcon
            focused={isTabFocused(CoupleTabRoute.Home)}
            activeIcon="home"
            inactiveIcon="home-outline"
          />
        </TabButton>
      </View>

      <View style={[styles.centerGroup, styles.buttonBorder, styles.shadow]}>
        <TabButton
          focused={isTabFocused(CoupleTabRoute.Guests)}
          onPress={() => navigation.navigate(CoupleTabRoute.Guests)}
        >
          <CoupleTabIcon
            focused={isTabFocused(CoupleTabRoute.Guests)}
            activeIcon="list"
            inactiveIcon="list-outline"
          />
        </TabButton>

        <TabButton
          focused={isTabFocused(CoupleTabRoute.Seating)}
          onPress={() => navigation.navigate(CoupleTabRoute.Seating)}
        >
          <CoupleTabIcon
            focused={isTabFocused(CoupleTabRoute.Seating)}
            activeIcon="grid"
            inactiveIcon="grid-outline"
          />
        </TabButton>

        <TabButton
          focused={isTabFocused(CoupleTabRoute.Tables)}
          onPress={() => navigation.navigate(CoupleTabRoute.Tables)}
        >
          <CoupleTabIcon
            focused={isTabFocused(CoupleTabRoute.Tables)}
            activeIcon="restaurant"
            inactiveIcon="restaurant-outline"
          />
        </TabButton>

        <TabButton
          focused={isTabFocused(CoupleTabRoute.Messages)}
          onPress={() => navigation.navigate(CoupleTabRoute.Messages)}
        >
          <CoupleTabIcon
            focused={isTabFocused(CoupleTabRoute.Messages)}
            activeIcon="chatbubble-ellipses"
            inactiveIcon="chatbubble-ellipses-outline"
          />
        </TabButton>
      </View>

      <View style={[styles.edgeButtonWrap, styles.buttonBorder, styles.shadow]}>
        <TabButton
          focused={isTabFocused(CoupleTabRoute.Profile)}
          onPress={() => navigation.navigate(CoupleTabRoute.Profile)}
        >
          <CoupleTabIcon
            focused={isTabFocused(CoupleTabRoute.Profile)}
            activeIcon="person"
            inactiveIcon="person-outline"
          />
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
  buttonBorder: {
    borderWidth: 1,
    borderColor: "rgba(17,17,17,0.06)",
  },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
  },
});
