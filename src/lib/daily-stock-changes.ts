import type { Category, InventoryLog, Product } from "@/types";
import { formatVariantLabel } from "@/lib/product-variants";

export type DailyStockChangeStatus = "Added" | "Reduced";

export interface DailyStockChangeRow {
  key: string;
  branchId: string;
  branchName: string | null;
  productId: string;
  variantId: string | null;
  productLabel: string;
  categoryLabel: string;
  openingStock: number;
  closingStock: number;
  change: number;
  status: DailyStockChangeStatus;
}

export interface DailyStockChangeSummary {
  productsChanged: number;
  totalStockAdded: number;
  totalStockReduced: number;
}

function categoryLabelForProduct(
  product: Product | undefined,
  categoriesById: Map<string, Category>
): string {
  if (!product?.categoryIds.length) return "—";
  const names = product.categoryIds
    .map((id) => categoriesById.get(id)?.name?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : "—";
}

function productLabelForLog(
  log: InventoryLog,
  product: Product | undefined
): string {
  const base = (log.productName ?? product?.name ?? log.productId).trim();
  if (!log.variantId || !product) return base || "Unknown product";
  const variant = product.variants.find((item) => item.id === log.variantId);
  if (!variant) return base || "Unknown product";
  const variantLabel = formatVariantLabel(variant, product.options);
  if (!variantLabel || variantLabel === "Default") {
    return base || "Unknown product";
  }
  return `${base} — ${variantLabel}`;
}

/**
 * Build daily stock change rows from inventory logs for one calendar day.
 * Opening = previousStock on the first log of the day per variant.
 * Closing = newStock on the last log of the day per variant.
 * Only rows with opening !== closing are returned.
 */
export function buildDailyStockChanges(
  logs: InventoryLog[],
  products: Product[],
  categories: Category[]
): DailyStockChangeRow[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const categoriesById = new Map(
    categories.map((category) => [category.id, category])
  );

  const byKey = new Map<string, InventoryLog[]>();
  for (const log of logs) {
    const variantKey = log.variantId ?? "default";
    const key = `${log.branchId}|${log.productId}|${variantKey}`;
    const list = byKey.get(key) ?? [];
    list.push(log);
    byKey.set(key, list);
  }

  const rows: DailyStockChangeRow[] = [];

  for (const [key, keyLogs] of byKey) {
    const sorted = [...keyLogs].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) continue;

    const openingStock = first.previousStock;
    const closingStock = last.newStock;
    const change = closingStock - openingStock;
    if (change === 0) continue;

    const product = productsById.get(first.productId);

    rows.push({
      key,
      branchId: first.branchId,
      branchName: first.branchName,
      productId: first.productId,
      variantId: first.variantId,
      productLabel: productLabelForLog(first, product),
      categoryLabel: categoryLabelForProduct(product, categoriesById),
      openingStock,
      closingStock,
      change,
      status: change > 0 ? "Added" : "Reduced",
    });
  }

  return rows.sort((a, b) =>
    a.productLabel.localeCompare(b.productLabel, undefined, {
      sensitivity: "base",
    })
  );
}

export function summarizeDailyStockChanges(
  rows: DailyStockChangeRow[]
): DailyStockChangeSummary {
  let totalStockAdded = 0;
  let totalStockReduced = 0;
  for (const row of rows) {
    if (row.change > 0) totalStockAdded += row.change;
    if (row.change < 0) totalStockReduced += Math.abs(row.change);
  }
  return {
    productsChanged: rows.length,
    totalStockAdded,
    totalStockReduced,
  };
}
