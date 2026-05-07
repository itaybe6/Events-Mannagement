import React from "react";
import { DemoTabContent } from "@/components/animations/shopifytabs/demo-tab-content";

export default function ShopifyTabsDemoHomeScreen() {
  return (
    <DemoTabContent
      title="Home"
      subtitle="This demo route mounts the copied Shopify-style tabs animation with local providers only."
    />
  );
}
