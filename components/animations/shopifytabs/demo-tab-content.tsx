import React, { FC } from "react";
import { ScrollView, Text, View } from "react-native";
import { TabScreenContainer } from "./tab-screen-container";

type DemoTabContentProps = {
  title: string;
  subtitle: string;
};

const DEMO_ROWS = [
  "Today",
  "Abandoned checkouts",
  "New customers",
  "Top products",
  "Sales summary",
] as const;

export const DemoTabContent: FC<DemoTabContentProps> = ({ title, subtitle }) => {
  return (
    <TabScreenContainer>
      <ScrollView
        className="flex-1 bg-[#F5F5F5]"
        contentContainerStyle={{ padding: 20, paddingBottom: 160, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-[28] bg-black px-6 py-7">
          <Text className="text-3xl font-bold text-white">{title}</Text>
          <Text className="mt-2 text-base text-neutral-300">{subtitle}</Text>
        </View>

        {DEMO_ROWS.map((label, index) => (
          <View key={label} className="rounded-[24] bg-white px-5 py-4">
            <Text className="text-lg font-semibold text-black">{label}</Text>
            <Text className="mt-1 text-sm text-neutral-500">
              Demo card {index + 1} for the copied Shopify tabs animation.
            </Text>
          </View>
        ))}
      </ScrollView>
    </TabScreenContainer>
  );
};
