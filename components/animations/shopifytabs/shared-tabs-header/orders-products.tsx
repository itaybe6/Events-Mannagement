import React, { FC } from "react";
import { Pressable } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { usePathname } from "expo-router";
import { ChevronDown, PlusCircle } from "lucide-react-native";
import { Tab } from "../custom-tab-bar";

// shopify-tabs-shared-header-animation 🔽

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const simulatePress = () => {};

export const OrdersProducts: FC = () => {
  const pathname = usePathname();

  return (
    <Animated.View
      /* Consistent 150ms fade aligns with other tab headers for cohesive feel. */
      entering={FadeIn.duration(150)}
      className="flex-row items-center justify-between"
    >
      <AnimatedPressable
        /* AnimatedPressable lets Reanimated control layout transitions on the UI thread.
         * LinearTransition smoothly swaps title text (Orders/Products) without reflow jank. */
        layout={LinearTransition}
        className="flex-row items-center gap-1"
        // Different onPress logic can be handled depending on pathname
        onPress={simulatePress}
      >
        {pathname.includes(Tab.Orders) && (
          <Animated.Text
            key="orders"
            /* Fade matches container timing; LinearTransition keeps title swap smooth. */
            entering={FadeIn.duration(150)}
            layout={LinearTransition}
            className="text-2xl font-bold text-white"
          >
            Orders
          </Animated.Text>
        )}
        {pathname.includes(Tab.Products) && (
          <Animated.Text
            key="products"
            /* Fade matches container timing; LinearTransition keeps title swap smooth. */
            entering={FadeIn.duration(150)}
            layout={LinearTransition}
            className="text-2xl font-bold text-white"
          >
            Products
          </Animated.Text>
        )}
        <Animated.View
          /* Chevron position/visibility is included in the same layout transition so
           * it stays visually locked to the title during tab switches. */
          layout={LinearTransition}
          className="mt-1"
        >
          <ChevronDown size={20} color="white" />
        </Animated.View>
      </AnimatedPressable>
      {/* Different onPress logic can be handled depending on pathname */}
      <Pressable onPress={simulatePress}>
        <PlusCircle size={20} color="white" />
      </Pressable>
    </Animated.View>
  );
};

// shopify-tabs-shared-header-animation 🔼
