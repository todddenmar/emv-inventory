import type {
  BranchInventory,
  Category,
  Product,
  ProductVariant,
} from "@/types";
import { defaultVariantId } from "@/lib/product-variants";
import { resolveVariantPrices } from "@/lib/product-pricing";

export interface VariantWithStock extends ProductVariant {
  productId: string;
  productName: string;
  categoryIds: string[];
  stock: number;
  lowStockThreshold: number;
  isSelling: boolean;
}

export interface ProductWithStock extends Product {
  /** Stock for the default variant (card / quick add). */
  stock: number;
  /** Total stock across all variants. */
  totalStock: number;
  /** True when any variant has stock > 0. */
  anyInStock: boolean;
  lowStockThreshold: number;
}

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Lowest threshold among a product's categories (most conservative). */
export function resolveCategoryLowStockThreshold(
  categoryIds: string[],
  categories: Array<Pick<Category, "id" | "lowStockThreshold">>
): number {
  if (categoryIds.length === 0 || categories.length === 0) {
    return DEFAULT_LOW_STOCK_THRESHOLD;
  }
  const byId = new Map(
    categories.map((category) => [category.id, category.lowStockThreshold])
  );
  const thresholds = categoryIds
    .map((id) => byId.get(id))
    .filter((value): value is number => typeof value === "number" && value >= 0);
  if (thresholds.length === 0) return DEFAULT_LOW_STOCK_THRESHOLD;
  return Math.min(...thresholds);
}

export function resolveInventoryForVariant(
  product: Product,
  variant: ProductVariant,
  inventory: BranchInventory[]
): BranchInventory | undefined {
  const byVariant = inventory.find((row) => row.variantId === variant.id);
  if (byVariant) return byVariant;

  const legacy = inventory.find(
    (row) =>
      row.productId === product.id &&
      (row.variantId === defaultVariantId(product.id) ||
        row.id.endsWith(`_${product.id}`))
  );
  return legacy;
}

export function isVariantSelling(
  entry: BranchInventory | undefined
): boolean {
  if (!entry) return false;
  return entry.isSelling !== false;
}

export function mergeVariantsWithInventory(
  products: Product[],
  inventory: BranchInventory[],
  categories: Array<Pick<Category, "id" | "lowStockThreshold">> = []
): VariantWithStock[] {
  const rows: VariantWithStock[] = [];

  for (const product of products) {
    const lowStockThreshold = resolveCategoryLowStockThreshold(
      product.categoryIds,
      categories
    );
    for (const variant of product.variants) {
      const entry = resolveInventoryForVariant(product, variant, inventory);
      const prices = resolveVariantPrices(variant, entry ?? null);
      rows.push({
        ...variant,
        price: prices.price,
        retailPrice: prices.retailPrice,
        productId: product.id,
        productName: product.name,
        categoryIds: product.categoryIds,
        stock: entry?.stock ?? 0,
        lowStockThreshold,
        isSelling: isVariantSelling(entry),
      });
    }
  }

  return rows;
}

/** Only variants assigned as selling at the branch (requires an inventory row). */
export function mergeSellingVariantsWithInventory(
  products: Product[],
  inventory: BranchInventory[],
  categories: Array<Pick<Category, "id" | "lowStockThreshold">> = []
): VariantWithStock[] {
  return mergeVariantsWithInventory(products, inventory, categories).filter(
    (row) => row.isSelling
  );
}

export function mergeProductsWithInventory(
  products: Product[],
  inventory: BranchInventory[],
  categories: Array<Pick<Category, "id" | "lowStockThreshold">> = []
): ProductWithStock[] {
  return products.map((product) => {
    const sellingEntries = product.variants
      .map((variant) => resolveInventoryForVariant(product, variant, inventory))
      .filter((entry): entry is BranchInventory => isVariantSelling(entry));

    const stocks = sellingEntries.map((entry) => entry.stock);
    const totalStock = stocks.reduce((sum, value) => sum + value, 0);
    const defaultStock = stocks[0] ?? 0;

    return {
      ...product,
      stock: defaultStock,
      totalStock,
      anyInStock: stocks.some((value) => value > 0),
      lowStockThreshold: resolveCategoryLowStockThreshold(
        product.categoryIds,
        categories
      ),
    };
  });
}

export function getLowStockVariants(
  items: VariantWithStock[]
): VariantWithStock[] {
  return items.filter(
    (item) => item.stock > 0 && item.stock <= item.lowStockThreshold
  );
}

export function getLowStockItems(
  items: ProductWithStock[]
): ProductWithStock[] {
  return items.filter(
    (p) => p.stock > 0 && p.stock <= p.lowStockThreshold
  );
}

export function productHasInStockVariant(
  product: Product,
  inventory: BranchInventory[]
): boolean {
  return product.variants.some((variant) => {
    const entry = resolveInventoryForVariant(product, variant, inventory);
    return isVariantSelling(entry) && (entry?.stock ?? 0) > 0;
  });
}

export function getVariantStock(
  product: Product,
  variantId: string,
  inventory: BranchInventory[]
): number {
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) return 0;
  const entry = resolveInventoryForVariant(product, variant, inventory);
  if (!isVariantSelling(entry)) return 0;
  return entry?.stock ?? 0;
}
