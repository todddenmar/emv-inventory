import type { CategoryGroup, Product } from "@/types";

export interface CategoryGroupCatalogRow {
  groupId: string;
  name: string;
  productCount: number;
  variantCount: number;
}

/**
 * Count distinct products and variants whose categories fall in each group.
 * Products with no matching group categories are returned as "Ungrouped"
 * when any such products exist.
 */
export function catalogCountsByCategoryGroup(
  products: Product[],
  groups: CategoryGroup[]
): CategoryGroupCatalogRow[] {
  const activeGroups = groups
    .filter((group) => !group.isArchived)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupedCategoryIds = new Set(
    activeGroups.flatMap((group) => group.categoryIds)
  );

  const rows: CategoryGroupCatalogRow[] = activeGroups.map((group) => {
    const categoryIds = new Set(group.categoryIds);
    let productCount = 0;
    let variantCount = 0;
    for (const product of products) {
      if (!product.categoryIds.some((id) => categoryIds.has(id))) continue;
      productCount += 1;
      variantCount += product.variants.length;
    }
    return {
      groupId: group.id,
      name: group.name,
      productCount,
      variantCount,
    };
  });

  let ungroupedProducts = 0;
  let ungroupedVariants = 0;
  for (const product of products) {
    const inAnyGroup = product.categoryIds.some((id) =>
      groupedCategoryIds.has(id)
    );
    if (inAnyGroup) continue;
    ungroupedProducts += 1;
    ungroupedVariants += product.variants.length;
  }

  if (ungroupedProducts > 0) {
    rows.push({
      groupId: "__ungrouped__",
      name: "Ungrouped",
      productCount: ungroupedProducts,
      variantCount: ungroupedVariants,
    });
  }

  return rows;
}
