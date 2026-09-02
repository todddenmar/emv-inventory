import {
  BUILT_IN_PAYMENT_METHODS,
  findPaymentMethod,
  paymentMethodName,
} from "@/lib/payment-methods";
import type {
  PaymentAccount,
  PosPaymentKind,
  PosPaymentLine,
  PosSale,
  PosSaleItem,
  PosSalePaymentAccount,
  PosTenderMethod,
} from "@/types";

export const POS_TENDER_METHODS: PosTenderMethod[] =
  BUILT_IN_PAYMENT_METHODS.map((method) => method.key);

export const POS_PAYMENT_KINDS: PosPaymentKind[] = [
  "full",
  "down_payment",
  "balance",
  "other",
];

export const PAYMENT_AMOUNT_TOLERANCE = 0.01;

export function cartLineMerchandiseTotal(line: {
  unitPrice?: number;
  quantity?: number;
  isFreebie?: boolean;
}): number {
  if (line.isFreebie) return 0;
  return roundMoney(Math.max(0, (line.unitPrice ?? 0) * (line.quantity ?? 0)));
}

/** Regular ₱0 lines (manual freebies) do not need a tender. */
export function cartLineNeedsPayment(line: {
  unitPrice?: number;
  quantity?: number;
  isFreebie?: boolean;
}): boolean {
  return cartLineMerchandiseTotal(line) > PAYMENT_AMOUNT_TOLERANCE;
}

/** Draft line used in checkout UI / session storage. */
export interface PosCheckoutPaymentLine {
  id: string;
  tenderMethod: PosTenderMethod;
  amount: number;
  /** Controlled input text so the field can be cleared while typing. */
  amountText: string;
  paymentAccountId: string | null;
  kind: PosPaymentKind;
  note: string;
}

export function moneyInputText(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  return String(roundMoney(Math.max(0, amount)));
}

export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === ".") return null;
  const next = Number(trimmed);
  if (!Number.isFinite(next) || next < 0) return null;
  return roundMoney(next);
}

export function tenderMethodLabel(method: PosTenderMethod): string {
  return paymentMethodName(method);
}

export function isPosPaymentKind(value: unknown): value is PosPaymentKind {
  return (
    value === "full" ||
    value === "down_payment" ||
    value === "balance" ||
    value === "other"
  );
}

export function parsePosPaymentKind(value: unknown): PosPaymentKind {
  return isPosPaymentKind(value) ? value : "full";
}

export function paymentKindLabel(kind: PosPaymentKind): string {
  switch (kind) {
    case "down_payment":
      return "Down payment";
    case "balance":
      return "Balance";
    case "other":
      return "Other";
    default:
      return "Full payment";
  }
}

/** Short badge text for reports / notes (e.g. DP, BAL). */
export function paymentKindShortLabel(kind: PosPaymentKind): string | null {
  switch (kind) {
    case "down_payment":
      return "DP";
    case "balance":
      return "BAL";
    case "other":
      return "OTHER";
    default:
      return null;
  }
}

export function formatPaymentLineNote(line: {
  kind?: PosPaymentKind | null;
  note?: string | null;
}): string | null {
  const kind = parsePosPaymentKind(line.kind);
  const note = typeof line.note === "string" ? line.note.trim() : "";
  const kindLabel = paymentKindShortLabel(kind);
  if (kindLabel && note) return `${kindLabel}: ${note}`;
  if (kindLabel) return kindLabel;
  if (note) return note;
  return null;
}

export function isPosTenderMethod(value: unknown): value is PosTenderMethod {
  return typeof value === "string" && value.trim().length > 0;
}

export function parsePosTenderMethod(value: unknown): PosTenderMethod {
  if (typeof value !== "string") return "cash";
  const key = value.trim();
  return key || "cash";
}

export function parseOptionalPosTenderMethod(
  value: unknown
): PosTenderMethod | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key || null;
}

export function tenderNeedsPaymentAccount(method: PosTenderMethod): boolean {
  return findPaymentMethod(method)?.needsPaymentAccount === true;
}

export function accountTypeForTender(
  method: PosTenderMethod
): "ewallet" | "bank_transfer" | null {
  return findPaymentMethod(method)?.accountType ?? null;
}

export function createCheckoutPaymentLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function defaultCheckoutPaymentLines(
  amountDue: number
): PosCheckoutPaymentLine[] {
  const amount = Math.max(0, roundMoney(amountDue));
  return [
    {
      id: createCheckoutPaymentLineId(),
      tenderMethod: "cash",
      amount,
      amountText: moneyInputText(amount),
      paymentAccountId: null,
      kind: "full",
      note: "",
    },
  ];
}

export function sumCheckoutPaymentAmounts(
  lines: Array<Pick<PosCheckoutPaymentLine, "amount">>
): number {
  return roundMoney(
    lines.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0)
  );
}

export function paymentRemaining(
  amountDue: number,
  lines: Array<Pick<PosCheckoutPaymentLine, "amount">>
): number {
  return roundMoney(Math.max(0, amountDue - sumCheckoutPaymentAmounts(lines)));
}

export function paymentsCoverAmountDue(
  amountDue: number,
  lines: Array<Pick<PosCheckoutPaymentLine, "amount">>
): boolean {
  return (
    Math.abs(sumCheckoutPaymentAmounts(lines) - roundMoney(amountDue)) <=
    PAYMENT_AMOUNT_TOLERANCE
  );
}

export function snapshotPaymentAccount(
  account: PaymentAccount
): PosSalePaymentAccount {
  return {
    id: account.id,
    type: account.type,
    provider: account.provider,
    accountName: account.accountName,
    accountNumber: account.accountNumber,
  };
}

export function createItemPaymentLine(
  amount: number,
  patch?: Partial<PosCheckoutPaymentLine>
): PosCheckoutPaymentLine {
  const nextAmount =
    patch?.amount != null
      ? Math.max(0, roundMoney(patch.amount))
      : Math.max(0, roundMoney(amount));
  const amountText =
    patch?.amountText != null
      ? patch.amountText
      : nextAmount > 0
        ? moneyInputText(nextAmount)
        : "";
  return {
    id: patch?.id || createCheckoutPaymentLineId(),
    tenderMethod: parsePosTenderMethod(patch?.tenderMethod ?? "cash"),
    amount: nextAmount,
    amountText,
    paymentAccountId: patch?.paymentAccountId ?? null,
    kind: parsePosPaymentKind(patch?.kind ?? "full"),
    note: typeof patch?.note === "string" ? patch.note : "",
  };
}

export function defaultItemPayments(lineTotal: number): PosCheckoutPaymentLine[] {
  const total = roundMoney(Math.max(0, lineTotal));
  if (total <= PAYMENT_AMOUNT_TOLERANCE) return [];
  return [createItemPaymentLine(total)];
}

/** Normalize cart line to priceList + payments[] (migrates legacy single-tender fields). */
export function ensureCartLinePaymentFields<
  T extends {
    isFreebie?: boolean;
    quantity?: number;
    unitPrice?: number;
    priceList?: "cash" | "retail";
    payments?: PosCheckoutPaymentLine[];
    tenderMethod?: PosTenderMethod;
    paymentAccountId?: string | null;
    kind?: PosPaymentKind;
    note?: string;
  },
>(line: T, fallbackPriceList: "cash" | "retail" = "cash"): T & {
  priceList: "cash" | "retail";
  payments: PosCheckoutPaymentLine[];
} {
  const lineTotal = cartLineMerchandiseTotal(line);
  const priceList =
    line.priceList === "retail" || line.priceList === "cash"
      ? line.priceList
      : fallbackPriceList;

  if (!cartLineNeedsPayment(line)) {
    return {
      ...line,
      priceList,
      payments: [],
    };
  }

  let payments: PosCheckoutPaymentLine[];
  if (Array.isArray(line.payments) && line.payments.length > 0) {
    payments = line.payments.map((p) => ({
      id: p.id || createCheckoutPaymentLineId(),
      tenderMethod: parsePosTenderMethod(p.tenderMethod),
      amount: Number.isFinite(p.amount) ? roundMoney(p.amount) : 0,
      amountText:
        typeof p.amountText === "string"
          ? p.amountText
          : moneyInputText(Number.isFinite(p.amount) ? p.amount : 0),
      paymentAccountId: p.paymentAccountId ?? null,
      kind: parsePosPaymentKind(p.kind),
      note: typeof p.note === "string" ? p.note : "",
    }));
  } else if (line.tenderMethod) {
    payments = [
      createItemPaymentLine(lineTotal, {
        tenderMethod: parsePosTenderMethod(line.tenderMethod),
        paymentAccountId: line.paymentAccountId ?? null,
        kind: parsePosPaymentKind(line.kind),
        note: typeof line.note === "string" ? line.note : "",
      }),
    ];
  } else {
    payments = defaultItemPayments(lineTotal);
  }

  return {
    ...line,
    priceList,
    payments,
  };
}

/** If exactly one payment, keep it covering the line total. */
export function syncPaymentsToLineTotal(
  payments: PosCheckoutPaymentLine[],
  lineTotal: number
): PosCheckoutPaymentLine[] {
  const total = Math.max(0, roundMoney(lineTotal));
  if (total <= PAYMENT_AMOUNT_TOLERANCE) {
    return [];
  }
  if (payments.length === 0) {
    return defaultItemPayments(total);
  }
  if (payments.length === 1) {
    const only = payments[0];
    return [
      {
        ...only,
        amount: total,
        amountText: moneyInputText(total),
      },
    ];
  }
  return payments;
}

export function itemPaymentsCoverLineTotal(
  payments: Array<Pick<PosCheckoutPaymentLine, "amount">>,
  lineTotal: number
): boolean {
  return (
    Math.abs(sumCheckoutPaymentAmounts(payments) - roundMoney(lineTotal)) <=
    PAYMENT_AMOUNT_TOLERANCE
  );
}

type CartLineForPayment = {
  variantId: string;
  quantity: number;
  unitPrice: number;
  isFreebie?: boolean;
  payments: PosCheckoutPaymentLine[];
};

/**
 * Flatten per-item payment splits into sale-level payments.
 * If a voucher reduces amountDue, every split is scaled proportionally.
 */
export function resolvePaymentsFromCartLines(
  lines: CartLineForPayment[],
  accounts: PaymentAccount[],
  amountDue: number
): PosPaymentLine[] {
  const paid = lines.filter((line) => cartLineNeedsPayment(line));
  if (amountDue <= PAYMENT_AMOUNT_TOLERANCE) {
    return [];
  }
  if (paid.length === 0) {
    throw new Error("Add at least one paid item");
  }

  const merchandise = roundMoney(
    paid.reduce((sum, line) => sum + cartLineMerchandiseTotal(line), 0)
  );
  if (merchandise <= PAYMENT_AMOUNT_TOLERANCE) {
    throw new Error("Merchandise total must be greater than 0");
  }

  type Draft = {
    tenderMethod: PosTenderMethod;
    amount: number;
    paymentAccountId: string | null;
    kind: PosPaymentKind;
    note: string;
  };
  const drafts: Draft[] = [];

  for (const line of paid) {
    const lineTotal = cartLineMerchandiseTotal(line);
    if (!line.payments || line.payments.length === 0) {
      throw new Error("Add at least one payment for each item");
    }
    for (const pay of line.payments) {
      if (!Number.isFinite(pay.amount) || pay.amount <= 0) {
        throw new Error("Each payment amount must be greater than 0");
      }
    }
    if (!itemPaymentsCoverLineTotal(line.payments, lineTotal)) {
      throw new Error("Each item's payments must equal that item's line total");
    }
    for (const pay of line.payments) {
      drafts.push({
        tenderMethod: pay.tenderMethod,
        amount: pay.amount,
        paymentAccountId: pay.paymentAccountId,
        kind: parsePosPaymentKind(pay.kind),
        note: pay.note.trim(),
      });
    }
  }

  const scale = amountDue / merchandise;
  const resolved: PosPaymentLine[] = [];
  let allocated = 0;

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const needsAccount = tenderNeedsPaymentAccount(draft.tenderMethod);
    const expectedType = accountTypeForTender(draft.tenderMethod);
    let paymentAccount: PosSalePaymentAccount | null = null;
    if (needsAccount) {
      const account = accounts.find(
        (a) =>
          a.id === draft.paymentAccountId &&
          a.isActive &&
          expectedType != null &&
          a.type === expectedType
      );
      if (!account) {
        throw new Error(
          expectedType === "bank_transfer"
            ? "Select a bank transfer account for every bank transfer payment"
            : "Select an e-wallet account for every e-wallet payment"
        );
      }
      paymentAccount = snapshotPaymentAccount(account);
    }

    let amount: number;
    if (i === drafts.length - 1) {
      amount = roundMoney(amountDue - allocated);
    } else {
      amount = roundMoney(draft.amount * scale);
      allocated = roundMoney(allocated + amount);
    }

    if (amount <= 0) {
      throw new Error("Each payment amount must be greater than 0");
    }

    resolved.push({
      tenderMethod: draft.tenderMethod,
      amount,
      paymentAccount,
      kind: draft.kind,
      note: draft.note ? draft.note : null,
    });
  }

  if (!paymentsCoverAmountDue(amountDue, resolved)) {
    throw new Error("Payment amounts must equal the amount due");
  }

  return resolved;
}

/** @deprecated Prefer defaultItemPayments / ensureCartLinePaymentFields. */
export function defaultCartLinePayment(): {
  tenderMethod: PosTenderMethod;
  paymentAccountId: string | null;
  kind: PosPaymentKind;
  note: string;
  priceList: "cash" | "retail";
  payments: PosCheckoutPaymentLine[];
} {
  return {
    tenderMethod: "cash",
    paymentAccountId: null,
    kind: "full",
    note: "",
    priceList: "cash",
    payments: defaultItemPayments(0),
  };
}

export function resolveCheckoutPayments(
  lines: PosCheckoutPaymentLine[],
  accounts: PaymentAccount[],
  amountDue: number
): PosPaymentLine[] {
  if (lines.length === 0) {
    throw new Error("Add at least one payment");
  }

  const resolved: PosPaymentLine[] = [];
  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      throw new Error("Each payment amount must be greater than 0");
    }
    const needsAccount = tenderNeedsPaymentAccount(line.tenderMethod);
    const expectedType = accountTypeForTender(line.tenderMethod);
    let paymentAccount: PosSalePaymentAccount | null = null;
    if (needsAccount) {
      const account = accounts.find(
        (a) =>
          a.id === line.paymentAccountId &&
          a.isActive &&
          expectedType != null &&
          a.type === expectedType
      );
      if (!account) {
        throw new Error(
          expectedType === "bank_transfer"
            ? "Select a bank transfer account for each bank transfer payment"
            : "Select an e-wallet account for each e-wallet payment"
        );
      }
      paymentAccount = snapshotPaymentAccount(account);
    }
    resolved.push({
      tenderMethod: line.tenderMethod,
      amount: roundMoney(line.amount),
      paymentAccount,
      kind: parsePosPaymentKind(line.kind),
      note: line.note.trim() ? line.note.trim() : null,
    });
  }

  if (!paymentsCoverAmountDue(amountDue, resolved)) {
    throw new Error("Payment amounts must equal the amount due");
  }

  return resolved;
}

export function synthesizePaymentsFromLegacy(
  tenderMethod: PosTenderMethod,
  paymentAccount: PosSalePaymentAccount | null,
  amountDue: number
): PosPaymentLine[] {
  return [
    {
      tenderMethod,
      amount: roundMoney(Math.max(0, amountDue)),
      paymentAccount:
        tenderNeedsPaymentAccount(tenderMethod) ? paymentAccount : null,
      kind: "full",
      note: null,
    },
  ];
}

export function salePaymentLineToCheckout(
  line: PosPaymentLine
): PosCheckoutPaymentLine {
  const amount = roundMoney(Math.max(0, Number(line.amount) || 0));
  return {
    id: createCheckoutPaymentLineId(),
    tenderMethod: parsePosTenderMethod(line.tenderMethod),
    amount,
    amountText: moneyInputText(amount),
    paymentAccountId: line.paymentAccount?.id ?? null,
    kind: parsePosPaymentKind(line.kind),
    note: typeof line.note === "string" ? line.note : "",
  };
}

export function itemStoredPaymentTotal(item: PosSaleItem): number {
  if (Array.isArray(item.payments) && item.payments.length > 0) {
    return roundMoney(
      item.payments.reduce(
        (sum, pay) => sum + (Number.isFinite(pay.amount) ? pay.amount : 0),
        0
      )
    );
  }
  if (item.tenderMethod) {
    return roundMoney(Math.max(0, item.lineTotal));
  }
  return 0;
}

/** True when per-item tenders already cover amount due and should be edited in place. */
export function shouldEditSalePaymentsByItem(sale: PosSale): boolean {
  const paid = sale.items.filter(
    (item) => itemStoredPaymentTotal(item) > PAYMENT_AMOUNT_TOLERANCE
  );
  if (paid.length === 0) return false;
  const sum = roundMoney(
    paid.reduce((total, item) => total + itemStoredPaymentTotal(item), 0)
  );
  const amountDue = roundMoney(sale.amountDue ?? sale.total);
  return Math.abs(sum - amountDue) <= PAYMENT_AMOUNT_TOLERANCE;
}

export function saleAmountDue(sale: Pick<PosSale, "amountDue" | "total">): number {
  return roundMoney(sale.amountDue ?? sale.total);
}

export function migrateDraftPaymentLines(raw: {
  paymentLines?: PosCheckoutPaymentLine[] | null;
  tenderMethod?: unknown;
  selectedPaymentAccountId?: string | null;
  amountDue?: number;
}): PosCheckoutPaymentLine[] {
  if (Array.isArray(raw.paymentLines) && raw.paymentLines.length > 0) {
    return raw.paymentLines.map((line) => {
      const amount = Number.isFinite(line.amount) ? roundMoney(line.amount) : 0;
      const amountText =
        typeof line.amountText === "string"
          ? line.amountText
          : moneyInputText(amount);
      return {
        id: line.id || createCheckoutPaymentLineId(),
        tenderMethod: parsePosTenderMethod(line.tenderMethod),
        amount,
        amountText,
        paymentAccountId: line.paymentAccountId ?? null,
        kind: parsePosPaymentKind(line.kind),
        note: typeof line.note === "string" ? line.note : "",
      };
    });
  }
  const amount = roundMoney(Math.max(0, raw.amountDue ?? 0));
  return [
    {
      id: createCheckoutPaymentLineId(),
      tenderMethod: parsePosTenderMethod(raw.tenderMethod),
      amount,
      amountText: moneyInputText(amount),
      paymentAccountId: raw.selectedPaymentAccountId ?? null,
      kind: "full",
      note: "",
    },
  ];
}
