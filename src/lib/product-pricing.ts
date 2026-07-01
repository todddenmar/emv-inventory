import type { Product } from "@/types";

export function isProductOnSale(
  product: Pick<Product, "price" | "compareAtPrice">
): boolean {
  return (
    product.compareAtPrice != null &&
    product.compareAtPrice > product.price
  );
}

export function normalizeCompareAtPrice(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}
