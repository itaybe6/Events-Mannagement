import React from "react";
import { Image, View } from "react-native";
import Animated, {
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLayoutStore } from "@/store/layoutStore";

type AdminSharedHeaderProps = {
  transparentBackground?: boolean;
};

export const AdminSharedHeader = ({ transparentBackground = false }: AdminSharedHeaderProps) => {
  const insets = useSafeAreaInsets();
  const topInset = insets.top;
  const isAdminHeaderVisible = useLayoutStore((state) => state.isAdminHeaderVisible);
  const progress = useSharedValue(isAdminHeaderVisible ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(isAdminHeaderVisible ? 1 : 0, { duration: 220 });
  }, [isAdminHeaderVisible, progress]);

  const rStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, topInset + 72]),
    opacity: progress.value,
    paddingTop: interpolate(progress.value, [0, 1], [0, topInset + 1]),
    paddingBottom: interpolate(progress.value, [0, 1], [0, 5]),
    borderBottomWidth: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [-22, 0]),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
        width: "100%",
        backgroundColor: transparentBackground ? "transparent" : "#FFFFFF",
        paddingHorizontal: 16,
        borderBottomColor: transparentBackground ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.04)",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      },
        rStyle,
      ]}
    >
      <Animated.View entering={FadeIn.duration(180)} style={{ width: "100%" }}>
        <View
          style={{
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            marginTop: -8,
          }}
        >
          <Image
            source={require("../../../../assets/images/logoMoon.png")}
            style={{ width: 275, height: 66 }}
            resizeMode="contain"
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
};
