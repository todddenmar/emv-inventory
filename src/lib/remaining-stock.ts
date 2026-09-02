import { resolveCategoryLowStockThreshold } from "@/lib/inventory";
import { defaultVariantId, formatVariantLabel } from "@/lib/product-variants";
import type {
  Branch,
  BranchInventory,
  Category,
  Product,
} from "@/types";

export const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

export interface RemainingStockVariantRow {
  variantId: string;
  sku: string;
  label: string;
  lowStockThreshold: number;
  stocks: Record<string, number>;
  assigned: Record<string, boolean>;
  total: number;
}

export interface RemainingStockProductGroup {
  productId: string;
  productName: string;
  categoryIds: string[];
  variants: RemainingStockVariantRow[];
}

export interface RemainingStockCategoryGroup {
  categoryId: string;
  categoryName: string;
  products: RemainingStockProductGroup[];
}

export interface RemainingStockProductEntry {
  categoryId: string;
  categoryName: string;
  product: RemainingStockProductGroup;
}

export function sellingVariantIdsFromInventory(
  inventory: BranchInventory[]
): Set<string> {
  const ids = new Set<string>();
  for (const row of inventory) {
    if (row.isSelling === false) continue;
    ids.add(row.variantId);
  }
  return ids;
}

function inventoryKey(branchId: string, variantId: string): string {
  return `${branchId}_${variantId}`;
}

export function buildInventoryByBranchVariant(
  inventory: BranchInventory[]
): Map<string, BranchInventory> {
  const map = new Map<string, BranchInventory>();
  for (const row of inventory) {
    map.set(inventoryKey(row.branchId, row.variantId), row);
  }
  return map;
}

export function resolveBranchInventoryRow(
  byKey: Map<string, BranchInventory>,
  branchId: string,
  variantId: string,
  fallbackVariantId?: string | null
): BranchInventory | undefined {
  const direct = byKey.get(inventoryKey(branchId, variantId));
  if (direct) return direct;
  if (fallbackVariantId) {
    return byKey.get(inventoryKey(branchId, fallbackVariantId));
  }
  return undefined;
}

function isAssignedAtBranch(row: BranchInventory | undefined): boolean {
  if (!row) return false;
  return row.isSelling !== false;
}

export function primaryCategoryForProduct(
  categoryIds: string[],
  categories: Array<Pick<Category, "id" | "name">>
): { id: string; name: string } {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const named = categoryIds
    .map((id) => byId.get(id))
    .filter((category): category is Pick<Category, "id" | "name"> =>
      Boolean(category)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (named.length === 0) {
    return { id: UNCATEGORIZED_CATEGORY_ID, name: "Uncategorized" };
  }
  return { id: named[0].id, name: named[0].name };
}

function isVariantSellingAnywhere(
  variantId: string,
  productId: string,
  sellingIds: Set<string>
): boolean {
  if (sellingIds.has(variantId)) return true;
  return sellingIds.has(defaultVariantId(productId));
}

export function buildRemainingStockGroups(input: {
  products: Product[];
  categories: Array<Pick<Category, "id" | "name" | "lowStockThreshold">>;
  branches: Array<Pick<Branch, "id">>;
  inventory: BranchInventory[];
}): RemainingStockCategoryGroup[] {
  const sellingIds = sellingVariantIdsFromInventory(input.inventory);
  const byKey = buildInventoryByBranchVariant(input.inventory);
  const branchIds = input.branches.map((branch) => branch.id);
  const categoryGroups = new Map<string, RemainingStockCategoryGroup>();

  for (const product of input.products) {
    const threshold = resolveCategoryLowStockThreshold(
      product.categoryIds,
      input.categories
    );
    const fallbackId = defaultVariantId(product.id);
    const variants: RemainingStockVariantRow[] = [];

    for (const variant of [...product.variants].sort(
      (a, b) => a.position - b.position || a.sku.localeCompare(b.sku)
    )) {
      if (!isVariantSellingAnywhere(variant.id, product.id, sellingIds)) {
        continue;
      }

      const byBranch: Record<string, number> = {};
      const assigned: Record<string, boolean> = {};
      let total = 0;
      for (const branchId of branchIds) {
        const row = resolveBranchInventoryRow(
          byKey,
          branchId,
          variant.id,
          fallbackId === variant.id ? null : fallbackId
        );
        const isAssigned = isAssignedAtBranch(row);
        const amount = row?.stock ?? 0;
        assigned[branchId] = isAssigned;
        byBranch[branchId] = amount;
        if (isAssigned) total += amount;
      }

      variants.push({
        variantId: variant.id,
        sku: variant.sku,
        label: formatVariantLabel(variant, product.options),
        lowStockThreshold: threshold,
        stocks: byBranch,
        assigned,
        total,
      });
    }

    if (variants.length === 0) continue;

    const category = primaryCategoryForProduct(
      product.categoryIds,
      input.categories
    );
    const group = categoryGroups.get(category.id) ?? {
      categoryId: category.id,
      categoryName: category.name,
      products: [],
    };
    group.products.push({
      productId: product.id,
      productName: product.name.trim() || "Untitled",
      categoryIds: product.categoryIds,
      variants,
    });
    categoryGroups.set(category.id, group);
  }

  return [...categoryGroups.values()]
    .map((group) => ({
      ...group,
      products: group.products.sort((a, b) =>
        a.productName.localeCompare(b.productName)
      ),
    }))
    .sort((a, b) => {
      if (a.categoryId === UNCATEGORIZED_CATEGORY_ID) return 1;
      if (b.categoryId === UNCATEGORIZED_CATEGORY_ID) return -1;
      return a.categoryName.localeCompare(b.categoryName);
    });
}

export function filterRemainingStockGroups(
  groups: RemainingStockCategoryGroup[],
  options: {
    search: string;
    selectedCategoryIds: string[];
    categories: Array<Pick<Category, "id" | "name">>;
  }
): RemainingStockCategoryGroup[] {
  const query = options.search.trim().toLowerCase();

  const matchSearch = (
    product: RemainingStockProductGroup
  ): RemainingStockProductGroup | null => {
    if (!query) return product;
    if (product.productName.toLowerCase().includes(query)) return product;
    const variants = product.variants.filter(
      (variant) =>
        variant.sku.toLowerCase().includes(query) ||
        variant.label.toLowerCase().includes(query)
    );
    if (variants.length === 0) return null;
    return { ...product, variants };
  };

  const searched = groups
    .map((group) => ({
      ...group,
      products: group.products
        .map(matchSearch)
        .filter((product): product is RemainingStockProductGroup =>
          Boolean(product)
        ),
    }))
    .filter((group) => group.products.length > 0);

  if (options.selectedCategoryIds.length === 0) return searched;

  const selected = new Set(options.selectedCategoryIds);
  const products = new Map<string, RemainingStockProductGroup>();
  for (const group of searched) {
    for (const product of group.products) {
      products.set(product.productId, product);
    }
  }

  const categoryById = new Map(
    options.categories.map((category) => [category.id, category])
  );
  const orderedIds = [...selected].sort((a, b) => {
    if (a === UNCATEGORIZED_CATEGORY_ID) return 1;
    if (b === UNCATEGORIZED_CATEGORY_ID) return -1;
    const nameA = categoryById.get(a)?.name ?? a;
    const nameB = categoryById.get(b)?.name ?? b;
    return nameA.localeCompare(nameB);
  });

  return orderedIds
    .map((categoryId) => {
      const name =
        categoryId === UNCATEGORIZED_CATEGORY_ID
          ? "Uncategorized"
          : (categoryById.get(categoryId)?.name ?? categoryId);
      const inCategory = [...products.values()]
        .filter((product) =>
          categoryId === UNCATEGORIZED_CATEGORY_ID
            ? product.categoryIds.length === 0
            : product.categoryIds.includes(categoryId)
        )
        .sort((a, b) => a.productName.localeCompare(b.productName));
      return {
        categoryId,
        categoryName: name,
        products: inCategory,
      };
    })
    .filter((group) => group.products.length > 0);
}

export function flattenRemainingStockProducts(
  groups: RemainingStockCategoryGroup[]
): RemainingStockProductEntry[] {
  return groups.flatMap((group) =>
    group.products.map((product) => ({
      categoryId: group.categoryId,
      categoryName: group.categoryName,
      product,
    }))
  );
}

export function regroupRemainingStockProducts(
  entries: RemainingStockProductEntry[]
): RemainingStockCategoryGroup[] {
  const groups: RemainingStockCategoryGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.categoryId === entry.categoryId) {
      last.products.push(entry.product);
      continue;
    }
    groups.push({
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      products: [entry.product],
    });
  }
  return groups;
}
