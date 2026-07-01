import type { BranchInventory, Product, ProductVariant } from "@/types";
import { defaultVariantId } from "@/lib/product-variants";

export interface VariantWithStock extends ProductVariant {
  productId: string;
  productName: string;
  categoryIds: string[];
  stock: number;
  lowStockThreshold: number;
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

function resolveInventoryForVariant(
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

export function mergeVariantsWithInventory(
  products: Product[],
  inventory: BranchInventory[]
): VariantWithStock[] {
  const rows: VariantWithStock[] = [];

  for (const product of products) {
    for (const variant of product.variants) {
      const entry = resolveInventoryForVariant(product, variant, inventory);
      rows.push({
        ...variant,
        productId: product.id,
        productName: product.name,
        categoryIds: product.categoryIds,
        stock: entry?.stock ?? 0,
        lowStockThreshold: entry?.lowStockThreshold ?? 5,
      });
    }
  }

  return rows;
}

export function mergeProductsWithInventory(
  products: Product[],
  inventory: BranchInventory[]
): ProductWithStock[] {
  return products.map((product) => {
    const stocks = product.variants.map((variant) => {
      const entry = resolveInventoryForVariant(product, variant, inventory);
      return entry?.stock ?? 0;
    });
    const totalStock = stocks.reduce((sum, value) => sum + value, 0);
    const first = product.variants[0];
    const defaultEntry = first
      ? resolveInventoryForVariant(product, first, inventory)
      : undefined;
    const defaultStock = stocks[0] ?? 0;

    return {
      ...product,
      stock: defaultStock,
      totalStock,
      anyInStock: stocks.some((value) => value > 0),
      lowStockThreshold: defaultEntry?.lowStockThreshold ?? 5,
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
    return (entry?.stock ?? 0) > 0;
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
  return entry?.stock ?? 0;
}
