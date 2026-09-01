import {
  formatPaymentLineNote,
  roundMoney,
  tenderMethodLabel,
} from "@/lib/pos-payments";
import type {
  DailyCashRecord,
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
  skyroTotal: number;
  salmonTotal: number;
  expensesTotal: number;
  netCashFromDay: number;
  cashAddsTotal: number;
  cashOnHand: number;
  closingCash: number;
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
    const saleTenderNotes = nonCashTenderNotes(payments);

    if (items.length === 0) {
      rows.push({
        key: `${sale.id}-empty`,
        saleId: sale.id,
        amount: sale.amountDue,
        itemLabel: "Sale",
        paymentNote: saleTenderNotes,
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
        paymentNote = saleTenderNotes;
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

function nonCashTenderNotes(
  payments: Array<{ tenderMethod: PosTenderMethod; amount: number }>
): string | null {
  const notes: string[] = [];
  const add = (method: PosTenderMethod, label: string) => {
    const amount = roundMoney(
      payments
        .filter((p) => p.tenderMethod === method)
        .reduce((s, p) => s + p.amount, 0)
    );
    if (amount > 0) notes.push(`${label} ${formatCurrencyPlain(amount)}`);
  };
  add("bank_transfer", "BANK TRANSFER");
  add("home_credit", "HC");
  add("skyro", "SKYRO");
  add("salmon", "SALMON");
  return notes.length > 0 ? notes.join(" · ") : null;
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

export function sumDailyCashAdds(
  additions: Array<{ amount: number }>
): number {
  return roundMoney(
    additions.reduce(
      (sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0),
      0
    )
  );
}

export function summarizeDailySalesReport(input: {
  sales: PosSale[];
  expenses: DailyExpense[];
  cashAddsTotal: number;
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
  const skyroTotal = sumTenderAmount(input.sales, "skyro");
  const salmonTotal = sumTenderAmount(input.sales, "salmon");
  const expensesTotal = sumDailyExpenses(input.expenses);
  const netCashFromDay = roundMoney(
    totalSales -
      bankTransferTotal -
      homeCreditTotal -
      skyroTotal -
      salmonTotal -
      expensesTotal
  );
  const cashAddsTotal = Number.isFinite(input.cashAddsTotal)
    ? roundMoney(Math.max(0, input.cashAddsTotal))
    : 0;
  const cashOnHand = roundMoney(cashAddsTotal + netCashFromDay);

  return {
    totalSales,
    bankTransferTotal,
    homeCreditTotal,
    skyroTotal,
    salmonTotal,
    expensesTotal,
    netCashFromDay,
    cashAddsTotal,
    cashOnHand,
    closingCash: cashOnHand,
  };
}

export function sumClosingCash(input: {
  branchIds: string[];
  sales: PosSale[];
  expenses: DailyExpense[];
  cashRecords: DailyCashRecord[];
}): number {
  if (input.branchIds.length === 0) return 0;
  return roundMoney(
    input.branchIds.reduce((sum, branchId) => {
      const record = input.cashRecords.find((row) => row.branchId === branchId);
      const summary = summarizeDailySalesReport({
        sales: input.sales.filter((sale) => sale.branchId === branchId),
        expenses: input.expenses.filter((row) => row.branchId === branchId),
        cashAddsTotal: sumDailyCashAdds(record?.additions ?? []),
      });
      return sum + summary.closingCash;
    }, 0)
  );
}
