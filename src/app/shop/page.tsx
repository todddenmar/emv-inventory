import type { Metadata } from "next";
import { ShopCatalog } from "@/components/shop/shop-catalog";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Shop | ${SITE_NAME}`,
  description: `Browse products at ${SITE_NAME} and order with cash on delivery.`,
};

export default function ShopPage() {
  return <ShopCatalog />;
}
