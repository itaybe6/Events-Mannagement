import React from "react";
import { DemoTabContent } from "@/components/animations/shopifytabs/demo-tab-content";

export default function ShopifyTabsDemoProfileScreen() {
  return (
    <DemoTabContent
      title="Profile"
      subtitle="The profile tab keeps the copied header animation mounted without depending on the original source app."
    />
  );
}
