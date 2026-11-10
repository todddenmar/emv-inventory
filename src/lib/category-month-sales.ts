import {
  endOfMonthDateInput,
  formatMonthLabel,
  startOfMonthDateInput,
} from "@/lib/dates";
import { getProductsByCategoryId } from "@/lib/firestore/products";
import { getPosSales } from "@/lib/firestore/pos-sales";
import type { PosSale } from "@/types";

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

/** On-demand: units sold in a category for one calendar month. */
export async function getCategoryMonthSoldReport(options: {
  categoryId: string;
  categoryName: string;
  monthKey: string;
  branchId?: string | null;
}): Promise<CategoryMonthSoldReport> {
  const categoryId = options.categoryId.trim();
  const monthKey = options.monthKey.trim();
  if (!categoryId) throw new Error("Select a category");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("Select a valid month");

  const fromDate = startOfMonthDateInput(monthKey);
  const toDate = endOfMonthDateInput(monthKey);

  const [products, sales] = await Promise.all([
    getProductsByCategoryId(categoryId, true),
    getPosSales({
      branchId: options.branchId ?? null,
      fromDate,
      toDate,
      max: SALE_FETCH_MAX,
    }),
  ]);

  const productIds = new Set(products.map((product) => product.id));
  const { unitsSold, receipts, rows } = summarizeCategorySales(
    sales,
    productIds
  );

  return {
    categoryId,
    categoryName: options.categoryName,
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    branchId: options.branchId ?? null,
    catalogProductCount: products.length,
    unitsSold,
    receipts,
    productsSold: rows.length,
    truncated: sales.length >= SALE_FETCH_MAX,
    rows,
  };
}
