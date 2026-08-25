import {
  formatPaymentLineNote,
  roundMoney,
  tenderMethodLabel,
} from "@/lib/pos-payments";
import type {
  DailyExpense,
  PosPaymentKind,
  PosSale,
  PosSaleItem,
  PosTenderMethod,
} from "@/types";

export interface DailySalesReportRow {
  key: string;
  saleId: string;
  amount: number;
  itemLabel: string;
  paymentNote: string | null;
  tenderMethod: PosTenderMethod | null;
}

export interface DailySalesReportSummary {
  totalSales: number;
  bankTransferTotal: number;
  homeCreditTotal: number;
  expensesTotal: number;
  netCashFromDay: number;
  cashOnHand: number;
}

function salePayments(sale: PosSale): Array<{
  tenderMethod: PosTenderMethod;
  amount: number;
  kind: PosPaymentKind;
  note: string | null;
}> {
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return sale.payments.map((line) => ({
      tenderMethod: line.tenderMethod,
      amount: line.amount,
      kind: line.kind ?? "full",
      note: line.note ?? null,
    }));
  }
  return [
    {
      tenderMethod: sale.tenderMethod,
      amount: sale.amountDue,
      kind: "full",
      note: null,
    },
  ];
}

function itemPaymentNote(item: PosSaleItem): string | null {
  const pays =
    item.payments?.length > 0
      ? item.payments
      : item.tenderMethod
        ? [
            {
              tenderMethod: item.tenderMethod,
              kind: item.kind,
              note: item.note,
              amount: item.lineTotal,
            },
          ]
        : [];
  if (pays.length === 0) return null;

  const parts = pays.map((pay) => {
    const methodLabel =
      pay.tenderMethod === "bank_transfer"
        ? "BANK TRANSFER"
        : pay.tenderMethod === "home_credit"
          ? "HC"
          : pay.tenderMethod === "cash"
            ? null
            : tenderMethodLabel(pay.tenderMethod).toUpperCase();
    const kindNote = formatPaymentLineNote(pay);
    const bits = [methodLabel, kindNote].filter(Boolean);
    if (bits.length === 0 && pays.length > 1) {
      return formatCurrencyPlain(pay.amount);
    }
    if (bits.length === 0) return null;
    return `${bits.join(" ")} ${formatCurrencyPlain(pay.amount)}`;
  });

  const joined = parts.filter(Boolean).join(" · ");
  const priceBit =
    item.priceList === "retail"
      ? "RETAIL"
      : item.priceList === "cash"
        ? null
        : null;
  if (priceBit && joined) return `${priceBit} · ${joined}`;
  if (priceBit) return priceBit;
  return joined || null;
}

export function sumTenderAmount(
  sales: PosSale[],
  method: PosTenderMethod
): number {
  return roundMoney(
    sales.reduce((sum, sale) => {
      const part = salePayments(sale)
        .filter((line) => line.tenderMethod === method)
        .reduce(
          (s, line) => s + (Number.isFinite(line.amount) ? line.amount : 0),
          0
        );
      return sum + part;
    }, 0)
  );
}

export function flattenDailySalesRows(sales: PosSale[]): DailySalesReportRow[] {
  const sorted = [...sales].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const rows: DailySalesReportRow[] = [];

  for (const sale of sorted) {
    const items = sale.items.length > 0 ? sale.items : [];
    const hasItemPayments = items.some((item) => item.tenderMethod != null);
    const payments = salePayments(sale);
    const bankTransferAmount = roundMoney(
      payments
        .filter((p) => p.tenderMethod === "bank_transfer")
        .reduce((s, p) => s + p.amount, 0)
    );
    const homeCreditAmount = roundMoney(
      payments
        .filter((p) => p.tenderMethod === "home_credit")
        .reduce((s, p) => s + p.amount, 0)
    );

    if (items.length === 0) {
      rows.push({
        key: `${sale.id}-empty`,
        saleId: sale.id,
        amount: sale.amountDue,
        itemLabel: "Sale",
        paymentNote:
          bankTransferAmount > 0
            ? `BANK TRANSFER ${formatCurrencyPlain(bankTransferAmount)}`
            : homeCreditAmount > 0
              ? `HC ${formatCurrencyPlain(homeCreditAmount)}`
              : null,
        tenderMethod: sale.tenderMethod,
      });
      continue;
    }

    items.forEach((item, index) => {
      const amount =
        Number.isFinite(item.lineTotal) && item.lineTotal > 0
          ? item.lineTotal
          : roundMoney(item.unitPrice * item.quantity);

      let paymentNote: string | null = null;
      if (hasItemPayments) {
        paymentNote = itemPaymentNote(item);
      } else if (index === 0) {
        const notes: string[] = [];
        if (bankTransferAmount > 0) {
          notes.push(`BANK TRANSFER ${formatCurrencyPlain(bankTransferAmount)}`);
        }
        if (homeCreditAmount > 0) {
          notes.push(`HC ${formatCurrencyPlain(homeCreditAmount)}`);
        }
        paymentNote = notes.length > 0 ? notes.join(" · ") : null;
      }

      rows.push({
        key: `${sale.id}-${item.variantId}-${index}`,
        saleId: sale.id,
        amount,
        itemLabel: `${item.quantity}× ${item.productName}`,
        paymentNote,
        tenderMethod: item.tenderMethod,
      });
    });
  }

  return rows;
}

function formatCurrencyPlain(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2,
  }).format(amount);
}

export function sumDailyExpenses(expenses: DailyExpense[]): number {
  return roundMoney(
    expenses.reduce(
      (sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0),
      0
    )
  );
}

export function summarizeDailySalesReport(input: {
  sales: PosSale[];
  expenses: DailyExpense[];
  priorCash: number;
}): DailySalesReportSummary {
  const totalSales = roundMoney(
    input.sales.reduce(
      (sum, sale) =>
        sum + (Number.isFinite(sale.amountDue) ? sale.amountDue : 0),
      0
    )
  );
  const bankTransferTotal = sumTenderAmount(input.sales, "bank_transfer");
  const homeCreditTotal = sumTenderAmount(input.sales, "home_credit");
  const expensesTotal = sumDailyExpenses(input.expenses);
  const netCashFromDay = roundMoney(
    totalSales - bankTransferTotal - homeCreditTotal - expensesTotal
  );
  const priorCash = Number.isFinite(input.priorCash) ? input.priorCash : 0;
  const cashOnHand = roundMoney(netCashFromDay + priorCash);

  return {
    totalSales,
    bankTransferTotal,
    homeCreditTotal,
    expensesTotal,
    netCashFromDay,
    cashOnHand,
  };
}
