import type { Metadata } from "next";
import {
  fetchPublicCategories,
  fetchPublicProducts,
} from "@/lib/firestore/public-catalog";
import { absoluteUrl, categoryPath, productPath } from "@/lib/seo";

export default async function sitemap() {
  const [categories, products] = await Promise.all([
    fetchPublicCategories().catch(() => []),
    fetchPublicProducts().catch(() => []),
  ]);

  const now = new Date();

  return [
    { url: absoluteUrl("/"), lastModified: now },
    { url: absoluteUrl("/shop"), lastModified: now },
    ...categories.map((category) => ({
      url: absoluteUrl(categoryPath(category.slug)),
      lastModified: category.updatedAt,
    })),
    ...products.map((product) => ({
      url: absoluteUrl(productPath(product.slug)),
      lastModified: product.updatedAt,
    })),
  ];
}
