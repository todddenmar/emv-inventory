import type { BranchInventory, Product } from "@/types";

export interface ProductWithStock extends Product {
  stock: number;
  lowStockThreshold: number;
}

export function mergeProductsWithInventory(
  products: Product[],
  inventory: BranchInventory[]
): ProductWithStock[] {
  const map = new Map(inventory.map((i) => [i.productId, i]));

  return products.map((product) => {
    const entry = map.get(product.id);
    return {
      ...product,
      stock: entry?.stock ?? 0,
      lowStockThreshold: entry?.lowStockThreshold ?? 5,
    };
  });
}

export function getLowStockItems(
  items: ProductWithStock[]
): ProductWithStock[] {
  return items.filter(
    (p) => p.stock > 0 && p.stock <= p.lowStockThreshold
  );
}
