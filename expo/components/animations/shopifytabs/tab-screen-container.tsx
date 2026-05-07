import React, { FC, PropsWithChildren } from "react";
import { View } from "react-native";

export const TabScreenContainer: FC<PropsWithChildren> = ({ children }) => {
  return (
    <View className="flex-1 rounded-tl-[24] rounded-tr-[24] overflow-hidden bg-white">
      {children}
    </View>
  );
};
