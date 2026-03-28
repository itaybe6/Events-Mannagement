import React from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AnimatedTabsContainer } from "@/components/animations/shopifytabs/animated-tabs-container";
import { CustomTabBar } from "@/components/animations/shopifytabs/custom-tab-bar";
import { Menu } from "@/components/animations/shopifytabs/menu";
import { SharedTabsHeader } from "@/components/animations/shopifytabs/shared-tabs-header";
import { MenuProvider } from "@/components/animations/shopifytabs/lib/providers/menu-provider";

export default function ShopifyTabsDemoTabsLayout() {
  return (
    <SafeAreaProvider>
      <MenuProvider>
        <View style={{ flex: 1, backgroundColor: "#000000" }}>
          <AnimatedTabsContainer>
            <Tabs
              tabBar={(props) => <CustomTabBar {...props} />}
              screenOptions={{
                header: () => <SharedTabsHeader />,
                headerShadowVisible: false,
                sceneStyle: { backgroundColor: "#000000" },
              }}
            >
              <Tabs.Screen name="home" options={{ title: "Home" }} />
              <Tabs.Screen name="search" options={{ title: "Search" }} />
              <Tabs.Screen name="orders" options={{ title: "Orders" }} />
              <Tabs.Screen name="products" options={{ title: "Products" }} />
              <Tabs.Screen name="profile" options={{ title: "Profile" }} />
            </Tabs>
          </AnimatedTabsContainer>
          <Menu />
        </View>
      </MenuProvider>
    </SafeAreaProvider>
  );
}
