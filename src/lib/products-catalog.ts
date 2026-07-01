import { isHtmlEmpty } from "@/lib/html-text";
import { optionValuesKey } from "@/lib/product-variants";
import type { Product } from "@/types";

export function isProductPublished(product: Product): boolean {
  if (product.isArchived) return false;
  if (product.status) return product.status === "published";
  return product.isActive !== false;
}

export function productStatusLabel(product: Product): "Draft" | "Published" | "Archived" {
  if (product.isArchived) return "Archived";
  return isProductPublished(product) ? "Published" : "Draft";
}

export function canPublishProduct(product: Product): {
  ok: boolean;
  reason?: string;
} {
  if (product.isArchived) {
    return { ok: false, reason: "Restore the product before publishing" };
  }
  if (!product.name.trim()) {
    return { ok: false, reason: "Name is required" };
  }
  if (isHtmlEmpty(product.description)) {
    return { ok: false, reason: "Description is required" };
  }
  if (product.categoryIds.length === 0) {
    return { ok: false, reason: "Select at least one category" };
  }
  if (!product.variants.length) {
    return { ok: false, reason: "At least one variant is required" };
  }

  for (const variant of product.variants) {
    if (!Number.isFinite(variant.price) || variant.price < 0) {
      return { ok: false, reason: "Every variant needs a valid price" };
    }
    if (
      variant.compareAtPrice != null &&
      variant.compareAtPrice <= variant.price
    ) {
      return {
        ok: false,
        reason: "Compare at price must be higher than the sale price on each variant",
      };
    }
  }

  const keys = new Set<string>();
  for (const variant of product.variants) {
    const key = optionValuesKey(variant.optionValues);
    if (keys.has(key)) {
      return { ok: false, reason: "Duplicate variant combinations are not allowed" };
    }
    keys.add(key);
  }

  for (const option of product.options) {
    if (!option.name.trim()) {
      return { ok: false, reason: "Every option needs a name" };
    }
    if (option.values.filter((v) => v.trim()).length === 0) {
      return { ok: false, reason: `Option "${option.name}" needs at least one value` };
    }
  }

  return { ok: true };
}
