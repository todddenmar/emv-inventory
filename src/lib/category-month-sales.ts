import {
  endOfMonthDateInput,
  formatMonthLabel,
  startOfMonthDateInput,
} from "@/lib/dates";
import { getProducts } from "@/lib/firestore/products";
import { getPosSales } from "@/lib/firestore/pos-sales";
import type { PosSale, Product } from "@/types";

const SALE_FETCH_MAX = 5000;

export type CategoryMonthSoldProductRow = {
  productId: string;
  name: string;
  quantity: number;
  receipts: number;
};

export type CategoryMonthSoldReport = {
  categoryId: string;
  categoryName: string;
  monthKey: string;
  monthLabel: string;
  branchId: string | null;
  catalogProductCount: number;
  unitsSold: number;
  receipts: number;
  productsSold: number;
  truncated: boolean;
  rows: CategoryMonthSoldProductRow[];
};

function summarizeCategorySales(
  sales: PosSale[],
  productIds: Set<string>
): {
  unitsSold: number;
  receipts: number;
  rows: CategoryMonthSoldProductRow[];
} {
  const map = new Map<string, CategoryMonthSoldProductRow>();
  let unitsSold = 0;
  let receipts = 0;

  for (const sale of sales) {
    const seenInSale = new Set<string>();
    let matchedInSale = false;

    for (const item of sale.items) {
      if (!productIds.has(item.productId) || item.quantity <= 0) continue;
      matchedInSale = true;
      unitsSold += item.quantity;

      const existing = map.get(item.productId) ?? {
        productId: item.productId,
        name: item.productName,
        quantity: 0,
        receipts: 0,
      };
      existing.quantity += item.quantity;
      if (item.productName) existing.name = item.productName;
      map.set(item.productId, existing);
      seenInSale.add(item.productId);
    }

    if (!matchedInSale) continue;
    receipts += 1;
    for (const productId of seenInSale) {
      const row = map.get(productId);
      if (row) row.receipts += 1;
    }
  }

  const rows = [...map.values()].sort(
    (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)
  );

  return { unitsSold, receipts, rows };
}

function productIdsForCategory(
  products: Pick<Product, "id" | "categoryIds">[],
  categoryId: string
): Set<string> {
  const ids = new Set<string>();
  for (const product of products) {
    if (product.categoryIds.includes(categoryId)) ids.add(product.id);
  }
  return ids;
}

/** Load monthly sold totals for one or more tracked categories (one sales fetch). */
export async function getTrackedCategoryMonthSoldReports(options: {
  categories: Array<{ id: string; name: string }>;
  monthKey: string;
  branchId?: string | null;
}): Promise<CategoryMonthSoldReport[]> {
  const monthKey = options.monthKey.trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("Select a valid month");

  const categories = options.categories.filter((category) => category.id.trim());
  if (categories.length === 0) return [];

  const fromDate = startOfMonthDateInput(monthKey);
  const toDate = endOfMonthDateInput(monthKey);
  const monthLabel = formatMonthLabel(monthKey);
  const branchId = options.branchId ?? null;

  const [products, sales] = await Promise.all([
    getProducts(false, true),
    getPosSales({
      branchId,
      fromDate,
      toDate,
      max: SALE_FETCH_MAX,
    }),
  ]);

  const truncated = sales.length >= SALE_FETCH_MAX;

  return categories.map((category) => {
    const productIds = productIdsForCategory(products, category.id);
    const { unitsSold, receipts, rows } = summarizeCategorySales(
      sales,
      productIds
    );
    return {
      categoryId: category.id,
      categoryName: category.name,
      monthKey,
      monthLabel,
      branchId,
      catalogProductCount: productIds.size,
      unitsSold,
      receipts,
      productsSold: rows.length,
      truncated,
      rows,
    };
  });
}
