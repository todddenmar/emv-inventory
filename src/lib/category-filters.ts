import type { InventoryLog, PosSale, Product } from "@/types";

/** Empty selection means no category filter (show everything). */
export function productIdsForCategoryFilter(
  products: Pick<Product, "id" | "categoryIds">[],
  selectedCategoryIds: string[]
): Set<string> | null {
  if (selectedCategoryIds.length === 0) return null;
  const selected = new Set(selectedCategoryIds);
  const allowed = new Set<string>();
  for (const product of products) {
    if (product.categoryIds.some((id) => selected.has(id))) {
      allowed.add(product.id);
    }
  }
  return allowed;
}

export function filterInventoryLogsByProducts(
  logs: InventoryLog[],
  allowedProductIds: Set<string> | null
): InventoryLog[] {
  if (!allowedProductIds) return logs;
  return logs.filter((log) => allowedProductIds.has(log.productId));
}

export function filterSalesByProducts(
  sales: PosSale[],
  allowedProductIds: Set<string> | null
): PosSale[] {
  if (!allowedProductIds) return sales;

  return sales
    .map((sale) => {
      const items = sale.items.filter((item) =>
        allowedProductIds.has(item.productId)
      );
      if (items.length === 0) return null;
      const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
      return {
        ...sale,
        items,
        total,
        itemCount,
        // Voucher already applied against original cart; keep amountDue as-is
        // relative to filtered merchandise for display consistency.
        amountDue: Math.max(0, total - (sale.voucherAmountApplied ?? 0)),
      };
    })
    .filter((sale): sale is PosSale => sale != null);
}
