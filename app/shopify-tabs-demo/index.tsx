import { Href, Redirect } from "expo-router";
import React from "react";

export default function ShopifyTabsDemoIndex() {
  return <Redirect href={"/shopify-tabs-demo/home" as Href} />;
}
