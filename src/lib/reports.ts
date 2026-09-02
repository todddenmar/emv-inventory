import { sumCashTenderAmount } from "@/lib/daily-sales-report";
import {
  eachDateInRange,
  eachMonthInRange,
  formatMonthLabel,
  toDateInputValue,
  toMonthKey,
} from "@/lib/dates";
import { isNonRevenueCustomerType } from "@/lib/pos-customer-type";
import type {
  InventoryLog,
  InventoryLogReason,
  PaymentMethod,
  PosSale,
} from "@/types";

export interface SalesTotals {
  revenue: number;
  receipts: number;
  itemsSold: number;
  avgTicket: number;
}

export interface SalesDayRow {
  date: string;
  revenue: number;
  receipts: number;
  itemsSold: number;
}

export interface SalesMonthRow {
  month: string;
  label: string;
  revenue: number;
  receipts: number;
  itemsSold: number;
}

export interface SalesHourRow {
  hour: number;
  label: string;
  revenue: number;
  receipts: number;
  itemsSold: number;
}

export interface SalesProductRow {
  key: string;
  productId: string;
  variantId: string;
  name: string;
  quantity: number;
  revenue: number;
  receipts: number;
}

export interface SalesStaffRow {
  key: string;
  name: string;
  receipts: number;
  revenue: number;
  itemsSold: number;
  cashTotal: number;
}

export interface StockMovementSummary {
  reason: InventoryLogReason;
  events: number;
  unitsIn: number;
  unitsOut: number;
  netUnits: number;
}

function saleRevenue(sale: PosSale): number {
  return isNonRevenueCustomerType(sale.customerType) ? 0 : sale.total;
}

export function summarizeSales(sales: PosSale[]): SalesTotals {
  const revenue = sales.reduce((sum, sale) => sum + saleRevenue(sale), 0);
  const receipts = sales.length;
  const itemsSold = sales.reduce((sum, sale) => sum + sale.itemCount, 0);
  return {
    revenue,
    receipts,
    itemsSold,
    avgTicket: receipts > 0 ? revenue / receipts : 0,
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function salesByDay(
  sales: PosSale[],
  fromDate: string,
  toDate: string
): SalesDayRow[] {
  const map = new Map<string, SalesDayRow>();
  for (const date of eachDateInRange(fromDate, toDate)) {
    map.set(date, { date, revenue: 0, receipts: 0, itemsSold: 0 });
  }
  for (const sale of sales) {
    const date = toDateInputValue(sale.createdAt);
    const row = map.get(date);
    if (!row) continue;
    row.revenue += saleRevenue(sale);
    row.receipts += 1;
    row.itemsSold += sale.itemCount;
  }
  return [...map.values()];
}

export function salesByMonth(
  sales: PosSale[],
  fromMonth: string,
  toMonth: string
): SalesMonthRow[] {
  const map = new Map<string, SalesMonthRow>();
  for (const month of eachMonthInRange(fromMonth, toMonth)) {
    map.set(month, {
      month,
      label: formatMonthLabel(month),
      revenue: 0,
      receipts: 0,
      itemsSold: 0,
    });
  }
  for (const sale of sales) {
    const month = toMonthKey(sale.createdAt);
    const row = map.get(month);
    if (!row) continue;
    row.revenue += saleRevenue(sale);
    row.receipts += 1;
    row.itemsSold += sale.itemCount;
  }
  return [...map.values()];
}

export function salesByHour(sales: PosSale[]): SalesHourRow[] {
  const rows: SalesHourRow[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    revenue: 0,
    receipts: 0,
    itemsSold: 0,
  }));

  for (const sale of sales) {
    const hour = sale.createdAt.getHours();
    const row = rows[hour];
    row.revenue += saleRevenue(sale);
    row.receipts += 1;
    row.itemsSold += sale.itemCount;
  }

  return rows;
}

export function topProducts(
  sales: PosSale[],
  limit = 15
): SalesProductRow[] {
  const map = new Map<string, SalesProductRow>();

  for (const sale of sales) {
    const seen = new Set<string>();
    for (const item of sale.items) {
      const key = item.variantId || `${item.productId}:${item.productName}`;
      const existing = map.get(key) ?? {
        key,
        productId: item.productId,
        variantId: item.variantId,
        name: item.productName,
        quantity: 0,
        revenue: 0,
        receipts: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue += isNonRevenueCustomerType(sale.customerType)
        ? 0
        : item.lineTotal;
      if (!seen.has(key)) {
        existing.receipts += 1;
        seen.add(key);
      }
      map.set(key, existing);
    }
  }

  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
    .slice(0, limit);
}

function cashTenderFromSale(
  sale: PosSale,
  methods?: PaymentMethod[] | null
): number {
  return sumCashTenderAmount([sale], methods);
}

export function salesByStaff(
  sales: PosSale[],
  methods?: PaymentMethod[] | null
): SalesStaffRow[] {
  const map = new Map<string, SalesStaffRow>();

  for (const sale of sales) {
    const key = sale.createdBy || "unknown";
    const existing = map.get(key) ?? {
      key,
      name: sale.createdByName?.trim() || "Staff",
      receipts: 0,
      revenue: 0,
      itemsSold: 0,
      cashTotal: 0,
    };
    existing.receipts += 1;
    existing.revenue += saleRevenue(sale);
    existing.itemsSold += sale.itemCount;
    existing.cashTotal += cashTenderFromSale(sale, methods);
    map.set(key, existing);
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export function summarizeStockMovements(
  logs: InventoryLog[]
): StockMovementSummary[] {
  const order: InventoryLogReason[] = [
    "pos_sale",
    "supplier_stock_in",
    "transfer_in",
    "transfer_out",
    "manual_adjustment",
  ];
  const map = new Map<InventoryLogReason, StockMovementSummary>();

  for (const reason of order) {
    map.set(reason, {
      reason,
      events: 0,
      unitsIn: 0,
      unitsOut: 0,
      netUnits: 0,
    });
  }

  for (const log of logs) {
    const row = map.get(log.reason) ?? {
      reason: log.reason,
      events: 0,
      unitsIn: 0,
      unitsOut: 0,
      netUnits: 0,
    };
    row.events += 1;
    if (log.delta > 0) row.unitsIn += log.delta;
    if (log.delta < 0) row.unitsOut += Math.abs(log.delta);
    row.netUnits += log.delta;
    map.set(log.reason, row);
  }

  return order
    .map((reason) => map.get(reason)!)
    .filter((row) => row.events > 0);
}
