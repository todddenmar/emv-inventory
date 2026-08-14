import type { Category, CategoryFreebieVariant } from "@/types";
import type { PosCartLine } from "@/components/admin/pos-cart";

export type DesiredFreebie = {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  sourceCategoryIds: string[];
};

/** Paid (non-freebie) units per category id. */
export function qualifyingUnitsByCategory(
  paidLines: PosCartLine[],
  productCategoryIds: Map<string, string[]>
): Map<string, number> {
  const byCategory = new Map<string, number>();
  for (const line of paidLines) {
    if (line.isFreebie) continue;
    const categoryIds = productCategoryIds.get(line.productId) ?? [];
    for (const categoryId of categoryIds) {
      byCategory.set(
        categoryId,
        (byCategory.get(categoryId) ?? 0) + line.quantity
      );
    }
  }
  return byCategory;
}

/**
 * For each configured freebie variant, required qty is the max qualifying
 * units among categories that list that freebie (avoids double-counting when
 * a product sits in multiple categories).
 */
export function computeDesiredFreebies(
  categories: Category[],
  paidLines: PosCartLine[],
  productCategoryIds: Map<string, string[]>,
  ignoredVariantIds: Set<string>
): DesiredFreebie[] {
  const unitsByCategory = qualifyingUnitsByCategory(
    paidLines,
    productCategoryIds
  );

  type Acc = DesiredFreebie & { qtyByCategory: Map<string, number> };
  const byVariant = new Map<string, Acc>();

  for (const category of categories) {
    const freebies = category.freebieVariants ?? [];
    if (freebies.length === 0) continue;
    const units = unitsByCategory.get(category.id) ?? 0;
    if (units <= 0) continue;

    for (const freebie of freebies) {
      if (ignoredVariantIds.has(freebie.variantId)) continue;

      const existing = byVariant.get(freebie.variantId);
      if (!existing) {
        byVariant.set(freebie.variantId, {
          productId: freebie.productId,
          variantId: freebie.variantId,
          productName: freebie.productName,
          variantLabel: freebie.variantLabel,
          quantity: units,
          sourceCategoryIds: [category.id],
          qtyByCategory: new Map([[category.id, units]]),
        });
      } else {
        existing.qtyByCategory.set(category.id, units);
        if (!existing.sourceCategoryIds.includes(category.id)) {
          existing.sourceCategoryIds.push(category.id);
        }
        existing.quantity = Math.max(...existing.qtyByCategory.values());
        if (!existing.productName && freebie.productName) {
          existing.productName = freebie.productName;
        }
        if (!existing.variantLabel && freebie.variantLabel) {
          existing.variantLabel = freebie.variantLabel;
        }
      }
    }
  }

  return [...byVariant.values()].map(
    ({ qtyByCategory: _q, ...rest }) => rest
  );
}

export function freebieDisplayName(freebie: CategoryFreebieVariant): string {
  return freebie.variantLabel
    ? `${freebie.productName} — ${freebie.variantLabel}`
    : freebie.productName;
}
