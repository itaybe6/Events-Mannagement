import React from "react";
import { DemoTabContent } from "@/components/animations/shopifytabs/demo-tab-content";

export default function ShopifyTabsDemoProductsScreen() {
  return (
    <DemoTabContent
      title="Products"
      subtitle="This route shares the same copied header animation path as Orders while keeping the demo isolated."
    />
  );
}
