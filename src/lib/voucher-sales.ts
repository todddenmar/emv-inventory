import type { PosSale } from "@/types";
import { roundMoney } from "@/lib/pos-payments";

export function formatSaleItemsSummary(
  sale: Pick<PosSale, "items">
): string {
  if (!sale.items?.length) return "—";
  return sale.items
    .map((item) => `${item.productName} ×${item.quantity}`)
    .join(", ");
}

export function voucherSaleCustomerName(
  sale: Pick<PosSale, "customer">
): string {
  return sale.customer?.name?.trim() || "—";
}

export function voucherSaleResellerLabel(
  sale: Pick<PosSale, "resellerId" | "resellerName">
): string {
  if (sale.resellerName?.trim()) return sale.resellerName.trim();
  if (sale.resellerId) return "Reseller";
  return "Walk-in";
}

export interface VoucherCommissionSummary {
  saleCount: number;
  totalLess: number;
  pendingLess: number;
  sentLess: number;
  pendingCount: number;
  sentCount: number;
}

export function summarizeVoucherCommission(
  sales: PosSale[]
): VoucherCommissionSummary {
  let totalLess = 0;
  let pendingLess = 0;
  let sentLess = 0;
  let pendingCount = 0;
  let sentCount = 0;

  for (const sale of sales) {
    const less = roundMoney(sale.voucherAmountApplied ?? 0);
    totalLess = roundMoney(totalLess + less);
    if (sale.resellerCommissionSentAt) {
      sentLess = roundMoney(sentLess + less);
      sentCount += 1;
    } else if (sale.resellerId) {
      pendingLess = roundMoney(pendingLess + less);
      pendingCount += 1;
    }
  }

  return {
    saleCount: sales.length,
    totalLess,
    pendingLess,
    sentLess,
    pendingCount,
    sentCount,
  };
}
