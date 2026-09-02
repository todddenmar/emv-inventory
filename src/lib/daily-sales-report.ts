import {
  formatPaymentLineNote,
  roundMoney,
} from "@/lib/pos-payments";
import {
  isCashTender,
  paymentMethodName,
  paymentMethodShortLabel,
  sortPaymentMethods,
} from "@/lib/payment-methods";
import type {
  DailyCashRecord,
  DailyExpense,
  PaymentMethod,
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

export interface CashDeductionRow {
  key: string;
  label: string;
  amount: number;
}

export interface DailySalesReportSummary {
  totalSales: number;
  deductions: CashDeductionRow[];
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

function itemPaymentNote(
  item: PosSaleItem,
  methods?: PaymentMethod[] | null
): string | null {
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
    const methodLabel = isCashTender(pay.tenderMethod, methods)
      ? null
      : paymentMethodShortLabel(pay.tenderMethod, methods);
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

export function sumCashTenderAmount(
  sales: PosSale[],
  methods?: PaymentMethod[] | null
): number {
  return roundMoney(
    sales.reduce((sum, sale) => {
      const part = salePayments(sale)
        .filter((line) => isCashTender(line.tenderMethod, methods))
        .reduce(
          (s, line) => s + (Number.isFinite(line.amount) ? line.amount : 0),
          0
        );
      return sum + part;
    }, 0)
  );
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

export function flattenDailySalesRows(
  sales: PosSale[],
  methods?: PaymentMethod[] | null
): DailySalesReportRow[] {
  const sorted = [...sales].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const rows: DailySalesReportRow[] = [];

  for (const sale of sorted) {
    const items = sale.items.length > 0 ? sale.items : [];
    const hasItemPayments = items.some((item) => item.tenderMethod != null);
    const payments = salePayments(sale);
    const saleTenderNotes = nonCashTenderNotes(payments, methods);

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
        paymentNote = itemPaymentNote(item, methods);
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
  payments: Array<{ tenderMethod: PosTenderMethod; amount: number }>,
  methods?: PaymentMethod[] | null
): string | null {
  const byKey = new Map<string, number>();
  for (const pay of payments) {
    if (isCashTender(pay.tenderMethod, methods)) continue;
    const amount = Number.isFinite(pay.amount) ? pay.amount : 0;
    if (amount <= 0) continue;
    byKey.set(pay.tenderMethod, (byKey.get(pay.tenderMethod) ?? 0) + amount);
  }
  const notes = [...byKey.entries()].map(([key, amount]) => {
    const label = paymentMethodShortLabel(key, methods);
    return `${label} ${formatCurrencyPlain(roundMoney(amount))}`;
  });
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
  paymentMethods?: PaymentMethod[] | null;
}): DailySalesReportSummary {
  const methods = input.paymentMethods ?? null;
  const totalSales = roundMoney(
    input.sales.reduce(
      (sum, sale) =>
        sum + (Number.isFinite(sale.amountDue) ? sale.amountDue : 0),
      0
    )
  );

  const amounts = new Map<string, number>();
  for (const sale of input.sales) {
    for (const line of salePayments(sale)) {
      if (isCashTender(line.tenderMethod, methods)) continue;
      const amount = Number.isFinite(line.amount) ? line.amount : 0;
      if (amount <= 0) continue;
      amounts.set(
        line.tenderMethod,
        (amounts.get(line.tenderMethod) ?? 0) + amount
      );
    }
  }

  const keys = new Set<string>(amounts.keys());
  for (const method of methods ?? []) {
    if (!method.isCash && method.isActive) keys.add(method.key);
  }
  if (keys.size === 0) {
    for (const method of ["bank_transfer", "home_credit", "skyro", "salmon", "card_swipe", "ewallet"]) {
      keys.add(method);
    }
  }

  const orderedKeys = sortPaymentMethods(
    [...keys].map((key) => {
      const match = methods?.find((row) => row.key === key);
      return {
        key,
        position: match?.position ?? 50,
        name: paymentMethodName(key, methods),
      };
    })
  ).map((row) => row.key);

  const tenderDeductions: CashDeductionRow[] = orderedKeys.map((key) => {
    const amount = roundMoney(amounts.get(key) ?? 0);
    const short = paymentMethodShortLabel(key, methods);
    const name = paymentMethodName(key, methods);
    return {
      key,
      label: `${short} (${name})`,
      amount,
    };
  });

  const expensesTotal = sumDailyExpenses(input.expenses);
  const nonCashTotal = roundMoney(
    tenderDeductions.reduce((sum, row) => sum + row.amount, 0)
  );
  const netCashFromDay = roundMoney(totalSales - nonCashTotal - expensesTotal);
  const cashAddsTotal = Number.isFinite(input.cashAddsTotal)
    ? roundMoney(Math.max(0, input.cashAddsTotal))
    : 0;
  const cashOnHand = roundMoney(cashAddsTotal + netCashFromDay);

  return {
    totalSales,
    deductions: [
      ...tenderDeductions,
      {
        key: "expenses",
        label: "EX (Expenses)",
        amount: expensesTotal,
      },
    ],
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
  paymentMethods?: PaymentMethod[] | null;
}): number {
  if (input.branchIds.length === 0) return 0;
  return roundMoney(
    input.branchIds.reduce((sum, branchId) => {
      const record = input.cashRecords.find((row) => row.branchId === branchId);
      const summary = summarizeDailySalesReport({
        sales: input.sales.filter((sale) => sale.branchId === branchId),
        expenses: input.expenses.filter((row) => row.branchId === branchId),
        cashAddsTotal: sumDailyCashAdds(record?.additions ?? []),
        paymentMethods: input.paymentMethods,
      });
      return sum + summary.closingCash;
    }, 0)
  );
}
