import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { posSaleConverter } from "@/lib/firestore/converters";
import { inventoryDocId } from "@/lib/firestore/inventory";
import { endOfLocalDay, saleCreatedAtForDateEdit, startOfLocalDay, toDateInputValue } from "@/lib/dates";
import { isVoucherRedeemable } from "@/lib/firestore/vouchers";
import {
  logPosSaleArchive,
  logPosSaleEdit,
} from "@/lib/firestore/sale-activity-logs";
import {
  isNonRevenueCustomerType,
  parsePosCustomerType,
  requiresPosCustomerName,
} from "@/lib/pos-customer-type";
import { canChangePosSaleDate, canEditPosSale } from "@/lib/pos-sale-edit";
import type {
  PaymentAccount,
  PosCustomerType,
  PosPaymentLine,
  PosPaymentMethod,
  PosSale,
  PosSaleChannel,
  PosSaleCustomer,
  PosSaleItem,
  PosSalePaymentAccount,
  PosTenderMethod,
  UserRole,
  Voucher,
} from "@/types";
import {
  PAYMENT_AMOUNT_TOLERANCE,
  itemPaymentsCoverLineTotal,
  itemStoredPaymentTotal,
  paymentsCoverAmountDue,
  roundMoney,
  snapshotPaymentAccount,
  synthesizePaymentsFromLegacy,
  tenderNeedsPaymentAccount,
  accountTypeForTender,
  parsePosPaymentKind,
  parsePosTenderMethod,
  type PosCheckoutPaymentLine,
} from "@/lib/pos-payments";

export interface CompletePosSaleInput {
  branchId: string;
  branchName: string;
  saleChannel?: PosSaleChannel;
  paymentMethod: PosPaymentMethod;
  /** Prefer `payments`. Kept for callers that still pass a single tender. */
  tenderMethod?: PosTenderMethod;
  paymentAccount?: PosSalePaymentAccount | null;
  payments?: PosPaymentLine[];
  customerType: PosCustomerType;
  customer?: PosSaleCustomer | null;
  resellerId?: string | null;
  resellerName?: string | null;
  voucherId?: string | null;
  /** Manual less amount; clamped to voucher entitlement when provided. */
  voucherAmountApplied?: number | null;
  items: PosSaleItem[];
  createdBy: string;
  createdByName?: string | null;
  /** When set, the sale is dated to this instant instead of the server time. */
  soldAt?: Date | null;
  /**
   * Allow payment amounts that do not equal amount due
   * (e.g. half-paid / partial receipts).
   */
  allowUnequalPayments?: boolean;
}

export async function getPosSale(id: string): Promise<PosSale | null> {
  const snap = await getDoc(
    doc(getClientDb(), COLLECTIONS.posSales, id).withConverter(posSaleConverter)
  );
  return snap.exists() ? snap.data() : null;
}

export function isPosSaleArchived(
  sale: Pick<PosSale, "archivedAt"> | null | undefined
): boolean {
  return sale?.archivedAt != null;
}

export async function getPosSales(options?: {
  branchId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  saleChannel?: PosSaleChannel | null;
  includeArchived?: boolean;
  max?: number;
}): Promise<PosSale[]> {
  const ref = collection(getClientDb(), COLLECTIONS.posSales).withConverter(
    posSaleConverter
  );
  const max = options?.max ?? 500;
  const from = options?.fromDate ? startOfLocalDay(options.fromDate) : null;
  const to = options?.toDate ? endOfLocalDay(options.toDate) : null;
  const constraints: QueryConstraint[] = [];

  if (options?.branchId) {
    constraints.push(where("branchId", "==", options.branchId));
  }
  if (from) constraints.push(where("createdAt", ">=", from));
  if (to) constraints.push(where("createdAt", "<=", to));
  constraints.push(orderBy("createdAt", "desc"), limit(max));

  const applyFilters = (rows: PosSale[]) => {
    let next = rows;
    if (!options?.includeArchived) {
      next = next.filter((sale) => !isPosSaleArchived(sale));
    }
    if (options?.saleChannel) {
      next = next.filter((sale) => sale.saleChannel === options.saleChannel);
    }
    return next;
  };

  try {
    const snapshot = await getDocs(query(ref, ...constraints));
    return applyFilters(snapshot.docs.map((d) => d.data()));
  } catch (error) {
    console.warn("getPosSales date query failed, using fallback", error);
    const fallback: QueryConstraint[] = [];
    if (options?.branchId) {
      fallback.push(where("branchId", "==", options.branchId));
    }
    fallback.push(orderBy("createdAt", "desc"), limit(Math.max(max * 5, 1000)));
    const snapshot = await getDocs(query(ref, ...fallback));
    let rows = snapshot.docs.map((d) => d.data());
    if (from || to) {
      rows = rows.filter((sale) => {
        if (from && sale.createdAt < from) return false;
        if (to && sale.createdAt > to) return false;
        return true;
      });
    }
    return applyFilters(rows).slice(0, max);
  }
}

export function isVoucherSale(
  sale: Pick<PosSale, "voucherId" | "voucherAmountApplied">
): boolean {
  return Boolean(sale.voucherId) && (sale.voucherAmountApplied ?? 0) > 0;
}

export async function getVoucherSales(options?: {
  branchId?: string | null;
  voucherId?: string | null;
  resellerId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  includeArchived?: boolean;
  max?: number;
}): Promise<PosSale[]> {
  const rows = await getPosSales({
    branchId: options?.branchId,
    fromDate: options?.fromDate,
    toDate: options?.toDate,
    includeArchived: options?.includeArchived,
    max: options?.max ?? 1000,
  });
  return rows.filter((sale) => {
    if (!isVoucherSale(sale)) return false;
    if (options?.voucherId && sale.voucherId !== options.voucherId) return false;
    if (options?.resellerId && sale.resellerId !== options.resellerId) {
      return false;
    }
    return true;
  });
}

export async function markResellerCommissionSent(
  saleId: string,
  input: { performedBy: string; performedByName?: string | null }
): Promise<void> {
  if (!input.performedBy) {
    throw new Error("Sign in to mark commission sent");
  }
  const sale = await getPosSale(saleId);
  if (!sale) throw new Error("Sale not found");
  if (!isVoucherSale(sale)) throw new Error("Not a voucher sale");
  if (!sale.resellerId) {
    throw new Error("This sale has no linked reseller");
  }
  if (sale.resellerCommissionSentAt) return;

  await updateDoc(doc(getClientDb(), COLLECTIONS.posSales, saleId), {
    resellerCommissionSentAt: serverTimestamp(),
    resellerCommissionSentBy: input.performedBy,
    resellerCommissionSentByName: input.performedByName ?? null,
  });
}

export async function clearResellerCommissionSent(saleId: string): Promise<void> {
  const sale = await getPosSale(saleId);
  if (!sale) throw new Error("Sale not found");
  if (!sale.resellerCommissionSentAt) return;

  await updateDoc(doc(getClientDb(), COLLECTIONS.posSales, saleId), {
    resellerCommissionSentAt: null,
    resellerCommissionSentBy: null,
    resellerCommissionSentByName: null,
  });
}

function resolveSaleCreatedAt(soldAt?: Date | null) {
  if (!(soldAt instanceof Date) || Number.isNaN(soldAt.getTime())) {
    return serverTimestamp();
  }
  if (soldAt.getTime() > Date.now() + 60_000) {
    throw new Error("Sale date cannot be in the future");
  }
  return Timestamp.fromDate(soldAt);
}

export async function completePosSale(
  input: CompletePosSaleInput
): Promise<string> {
  if (!input.branchId) {
    throw new Error("Select a branch");
  }
  if (input.items.length === 0) {
    throw new Error("Cart is empty");
  }

  const providedPayments =
    input.payments && input.payments.length > 0
      ? input.payments.map((line) => ({
          tenderMethod: line.tenderMethod,
          amount: roundMoney(line.amount),
          paymentAccount: tenderNeedsPaymentAccount(line.tenderMethod)
            ? line.paymentAccount
            : null,
          kind: line.kind ?? "full",
          note:
            typeof line.note === "string" && line.note.trim()
              ? line.note.trim()
              : null,
        }))
      : null;

  if (providedPayments) {
    for (const line of providedPayments) {
      if (!Number.isFinite(line.amount) || line.amount <= 0) {
        throw new Error("Each payment amount must be greater than 0");
      }
      if (tenderNeedsPaymentAccount(line.tenderMethod)) {
        const account = line.paymentAccount;
        const expectedType =
          line.tenderMethod === "bank_transfer" ? "bank_transfer" : "ewallet";
        if (
          !account?.id ||
          !account.provider ||
          !account.accountName ||
          !account.accountNumber ||
          account.type !== expectedType
        ) {
          throw new Error(
            expectedType === "bank_transfer"
              ? "Select a bank transfer account for each bank transfer payment"
              : "Select an e-wallet account for each e-wallet payment"
          );
        }
      }
    }
  }

  const customerType = parsePosCustomerType(input.customerType);
  const noCharge = isNonRevenueCustomerType(customerType);
  if (requiresPosCustomerName(customerType)) {
    if (!input.customer?.name?.trim()) {
      throw new Error(
        customerType === "co_owner"
          ? "Owner note is required for C/O Owner"
          : "Customer name is required"
      );
    }
  }

  const items = noCharge
    ? input.items.map((item) => ({
        ...item,
        unitPrice: 0,
        lineTotal: 0,
        payments: [],
        tenderMethod: null,
        paymentAccount: null,
        kind: null,
        note: null,
      }))
    : input.items;

  for (const item of items) {
    if (item.quantity <= 0) {
      throw new Error(`Invalid quantity for ${item.productName}`);
    }
    if (!item.variantId) {
      throw new Error(`Missing variant for ${item.productName}`);
    }
  }

  const db = getClientDb();
  const saleRef = doc(collection(db, COLLECTIONS.posSales));
  const saleId = saleRef.id;
  const saleLabel = `Sale ${saleId.slice(-6).toUpperCase()}`;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  await runTransaction(db, async (tx) => {
    const rows: Array<{
      item: PosSaleItem;
      invRef: ReturnType<typeof doc>;
      previousStock: number;
      newStock: number;
    }> = [];

    for (const item of items) {
      const invRef = doc(
        db,
        COLLECTIONS.branchInventory,
        inventoryDocId(input.branchId, item.variantId)
      );
      const snap = await tx.get(invRef);

      if (!snap.exists()) {
        throw new Error(`No inventory for ${item.productName}`);
      }

      const data = snap.data() as {
        stock?: number;
        isSelling?: boolean;
        productId?: string;
      };

      if (data.isSelling === false) {
        throw new Error(`${item.productName} is not selling at this branch`);
      }

      const previousStock = data.stock ?? 0;
      if (previousStock < item.quantity) {
        throw new Error(
          `Insufficient stock for ${item.productName} (${previousStock} available)`
        );
      }

      rows.push({
        item,
        invRef,
        previousStock,
        newStock: previousStock - item.quantity,
      });
    }

    let voucherAmountApplied = 0;
    let voucherId: string | null = null;
    let voucherCode: string | null = null;
    let voucherRef: ReturnType<typeof doc> | null = null;
    let voucherSingleUse = false;

    if (!noCharge && input.voucherId) {
      if (!input.customer?.name?.trim()) {
        throw new Error("Customer name is required when using a voucher");
      }
      voucherRef = doc(db, COLLECTIONS.vouchers, input.voucherId);
      const voucherSnap = await tx.get(voucherRef);
      if (!voucherSnap.exists()) {
        throw new Error("Voucher not found");
      }
      const voucherData = voucherSnap.data() as {
        code?: string;
        resellerId?: string | null;
        remainingAmount?: number;
        discountType?: string;
        discountValue?: number;
        singleUse?: boolean;
        status?: string;
        expiresAt?: { toDate?: () => Date } | Date | null;
      };

      const expiresAt = voucherData.expiresAt
        ? typeof (voucherData.expiresAt as { toDate?: () => Date }).toDate ===
          "function"
          ? (voucherData.expiresAt as { toDate: () => Date }).toDate()
          : new Date(voucherData.expiresAt as Date)
        : null;

      const discountType =
        voucherData.discountType === "percent" ? "percent" : "amount";
      const discountValue = Number(
        voucherData.discountValue ??
          (discountType === "amount"
            ? voucherData.remainingAmount ?? 0
            : 0)
      );

      const voucherLike: Voucher = {
        id: voucherSnap.id,
        code: String(voucherData.code ?? "").toUpperCase(),
        name: "",
        description: "",
        resellerId: voucherData.resellerId ?? null,
        resellerName: null,
        discountType,
        discountValue,
        initialAmount: 0,
        remainingAmount: Number(voucherData.remainingAmount ?? 0),
        singleUse: voucherData.singleUse === true,
        groupId: null,
        status:
          voucherData.status === "void" || voucherData.status === "depleted"
            ? voucherData.status
            : "active",
        expiresAt,
        createdBy: "",
        createdByName: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (!isVoucherRedeemable(voucherLike)) {
        throw new Error(
          voucherLike.singleUse && voucherLike.status === "depleted"
            ? "This single-use voucher has already been used"
            : "Voucher is not redeemable"
        );
      }
      voucherSingleUse = voucherLike.singleUse;
      if (
        input.resellerId &&
        voucherLike.resellerId &&
        voucherLike.resellerId !== input.resellerId
      ) {
        throw new Error("Voucher does not belong to the selected reseller");
      }

      if (discountType === "percent") {
        const pct = Math.min(100, Math.max(0, discountValue));
        const maxApplied = roundMoney((total * pct) / 100);
        const requested = input.voucherAmountApplied;
        voucherAmountApplied =
          requested != null && Number.isFinite(requested)
            ? roundMoney(Math.min(maxApplied, Math.max(0, requested)))
            : maxApplied;
      } else {
        const maxApplied = Math.min(
          Math.max(0, discountValue),
          total
        );
        const requested = input.voucherAmountApplied;
        voucherAmountApplied =
          requested != null && Number.isFinite(requested)
            ? roundMoney(Math.min(maxApplied, Math.max(0, requested)))
            : roundMoney(maxApplied);
      }
      voucherId = voucherSnap.id;
      voucherCode = voucherLike.code;
    }

    const amountDue = Math.max(0, total - voucherAmountApplied);

    let payments: PosPaymentLine[] = [];
    if (amountDue > PAYMENT_AMOUNT_TOLERANCE) {
      payments =
        providedPayments ??
        synthesizePaymentsFromLegacy(
          input.tenderMethod ?? "cash",
          input.paymentAccount ?? null,
          amountDue
        );
      if (!paymentsCoverAmountDue(amountDue, payments)) {
        if (!input.allowUnequalPayments) {
          throw new Error("Payment amounts must equal the amount due");
        }
      }
    }

    const primaryTender = payments[0]?.tenderMethod ?? "cash";
    const primaryAccount = payments[0]?.paymentAccount ?? null;

    for (const row of rows) {
      tx.update(row.invRef, {
        stock: row.newStock,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(collection(db, COLLECTIONS.inventoryLogs)), {
        branchId: input.branchId,
        branchName: input.branchName,
        productId: row.item.productId,
        variantId: row.item.variantId,
        productName: row.item.productName,
        delta: -row.item.quantity,
        previousStock: row.previousStock,
        newStock: row.newStock,
        reason: "pos_sale",
        referenceId: saleId,
        referenceLabel: saleLabel,
        performedBy: input.createdBy,
        performedByName: input.createdByName ?? null,
        createdAt: serverTimestamp(),
      });
    }

    if (voucherRef && voucherAmountApplied > 0) {
      const customer = input.customer;
      tx.set(doc(collection(db, COLLECTIONS.voucherRedemptions)), {
        voucherId,
        voucherCode,
        saleId,
        branchId: input.branchId,
        branchName: input.branchName,
        amountApplied: voucherAmountApplied,
        customerName: customer?.name?.trim() || null,
        customerMobile: customer?.mobile?.trim() || null,
        customerEmail: customer?.email?.trim() || null,
        customerAddress: customer?.address?.trim() || null,
        redeemedBy: input.createdBy,
        redeemedByName: input.createdByName ?? null,
        createdAt: serverTimestamp(),
      });
      if (voucherSingleUse) {
        tx.update(voucherRef, {
          status: "depleted",
          updatedAt: serverTimestamp(),
        });
      }
    }

    tx.set(saleRef, {
      branchId: input.branchId,
      branchName: input.branchName,
      saleChannel: input.saleChannel === "wholesale" ? "wholesale" : "shop",
      paymentMethod: input.paymentMethod,
      tenderMethod: primaryTender,
      paymentAccount: primaryAccount,
      payments,
      customerType,
      customer:
        requiresPosCustomerName(customerType) || voucherId
          ? (input.customer ?? null)
          : null,
      resellerId: noCharge ? null : (input.resellerId ?? null),
      resellerName: noCharge ? null : (input.resellerName ?? null),
      voucherId,
      voucherCode,
      voucherAmountApplied,
      total,
      amountDue,
      items,
      itemCount,
      createdBy: input.createdBy,
      createdByName: input.createdByName ?? null,
      createdAt: resolveSaleCreatedAt(input.soldAt),
      archivedAt: null,
      archivedBy: null,
      archivedByName: null,
      restockedOnArchive: false,
    });
  });

  return saleId;
}

function serializePaymentLine(line: PosPaymentLine): PosPaymentLine {
  return {
    tenderMethod: parsePosTenderMethod(line.tenderMethod),
    amount: roundMoney(line.amount),
    paymentAccount: tenderNeedsPaymentAccount(line.tenderMethod)
      ? line.paymentAccount
      : null,
    kind: parsePosPaymentKind(line.kind),
    note:
      typeof line.note === "string" && line.note.trim()
        ? line.note.trim()
        : null,
  };
}

function resolveEditPaymentLine(
  draft: PosCheckoutPaymentLine,
  accounts: PaymentAccount[],
  fallbackAccount: PosSalePaymentAccount | null
): PosPaymentLine {
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    throw new Error("Each payment amount must be greater than 0");
  }
  const tenderMethod = parsePosTenderMethod(draft.tenderMethod);
  const needsAccount = tenderNeedsPaymentAccount(tenderMethod);
  const expectedType = accountTypeForTender(tenderMethod);
  let paymentAccount: PosSalePaymentAccount | null = null;
  if (needsAccount) {
    const account = accounts.find(
      (row) =>
        row.id === draft.paymentAccountId &&
        expectedType != null &&
        row.type === expectedType
    );
    if (account) {
      paymentAccount = snapshotPaymentAccount(account);
    } else if (
      fallbackAccount?.id === draft.paymentAccountId &&
      fallbackAccount.type === expectedType
    ) {
      paymentAccount = fallbackAccount;
    } else {
      throw new Error(
        expectedType === "bank_transfer"
          ? "Select a bank transfer account for each bank transfer payment"
          : "Select an e-wallet account for each e-wallet payment"
      );
    }
  }
  return serializePaymentLine({
    tenderMethod,
    amount: draft.amount,
    paymentAccount,
    kind: parsePosPaymentKind(draft.kind),
    note: draft.note.trim() ? draft.note.trim() : null,
  });
}

function itemsUnchangedForPaymentEdit(
  existing: PosSaleItem[],
  next: PosSaleItem[]
): boolean {
  if (existing.length !== next.length) return false;
  return existing.every((item, index) => {
    const row = next[index];
    return (
      row.productId === item.productId &&
      row.variantId === item.variantId &&
      row.quantity === item.quantity &&
      roundMoney(row.unitPrice) === roundMoney(item.unitPrice) &&
      roundMoney(row.lineTotal) === roundMoney(item.lineTotal)
    );
  });
}

export interface UpdatePosSaleActor {
  userId: string;
  role: UserRole | null | undefined;
  assignedBranchId?: string | null;
  name?: string | null;
}

export interface UpdatePosSalePaymentsInput {
  payments: PosPaymentLine[];
  items?: PosSaleItem[];
  /** Local `YYYY-MM-DD` — moves the sale onto that day's sales report. */
  saleDate?: string | null;
  /**
   * Keep partial / half payments that do not equal amount due.
   */
  allowUnequalPayments?: boolean;
  actor?: UpdatePosSaleActor;
}

export interface UpdatePosSaleInput {
  items: PosSaleItem[];
  payments: PosPaymentLine[];
  customerType?: PosCustomerType;
  customer?: PosSaleCustomer | null;
  /** Local `YYYY-MM-DD` — admin only. */
  saleDate?: string | null;
  allowUnequalPayments?: boolean;
  actor: UpdatePosSaleActor;
}

function assertCanEditSale(sale: PosSale, actor?: UpdatePosSaleActor) {
  if (!actor) return;
  if (
    !canEditPosSale({
      sale,
      role: actor.role,
      userId: actor.userId,
      assignedBranchId: actor.assignedBranchId,
    })
  ) {
    throw new Error("You cannot edit this sale");
  }
}

function qtyByVariant(items: PosSaleItem[]) {
  const map = new Map<
    string,
    { productId: string; productName: string; quantity: number }
  >();
  for (const item of items) {
    if (!item.variantId || item.quantity <= 0) continue;
    const current = map.get(item.variantId);
    if (current) {
      current.quantity += item.quantity;
    } else {
      map.set(item.variantId, {
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
      });
    }
  }
  return map;
}

function validatePaymentLines(
  payments: PosPaymentLine[],
  amountDue: number,
  allowUnequalPayments?: boolean
) {
  for (const line of payments) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      throw new Error("Each payment amount must be greater than 0");
    }
    if (tenderNeedsPaymentAccount(line.tenderMethod)) {
      const account = line.paymentAccount;
      const expectedType =
        line.tenderMethod === "bank_transfer" ? "bank_transfer" : "ewallet";
      if (
        !account?.id ||
        !account.provider ||
        !account.accountName ||
        !account.accountNumber ||
        account.type !== expectedType
      ) {
        throw new Error(
          expectedType === "bank_transfer"
            ? "Select a bank transfer account for each bank transfer payment"
            : "Select an e-wallet account for each e-wallet payment"
        );
      }
    }
  }

  if (amountDue > PAYMENT_AMOUNT_TOLERANCE) {
    if (payments.length === 0) {
      throw new Error("Add at least one payment");
    }
    if (
      !allowUnequalPayments &&
      !paymentsCoverAmountDue(amountDue, payments)
    ) {
      throw new Error("Payment amounts must equal the amount due");
    }
  } else if (payments.length > 0) {
    throw new Error("This receipt has no amount due");
  }
}

/** Full sale correction: items, payments, and details, with inventory diffs. */
export async function updatePosSale(
  saleId: string,
  input: UpdatePosSaleInput
): Promise<PosSale> {
  const existing = await getPosSale(saleId);
  if (!existing) {
    throw new Error("Sale not found");
  }
  if (isPosSaleArchived(existing)) {
    throw new Error("Archived sales cannot be edited");
  }
  assertCanEditSale(existing, input.actor);

  if (
    input.saleDate != null &&
    input.saleDate !== "" &&
    input.saleDate !== toDateInputValue(existing.createdAt) &&
    !canChangePosSaleDate(input.actor.role)
  ) {
    throw new Error("Only admins can change the sale date");
  }

  const customerType = parsePosCustomerType(
    input.customerType ?? existing.customerType
  );
  const noCharge = isNonRevenueCustomerType(customerType);
  if (requiresPosCustomerName(customerType)) {
    if (!input.customer?.name?.trim() && !existing.customer?.name?.trim()) {
      throw new Error(
        customerType === "co_owner"
          ? "Owner note is required for C/O Owner"
          : "Customer name is required"
      );
    }
  }

  const customer =
    input.customer === undefined
      ? existing.customer
      : input.customer
        ? {
            name: input.customer.name?.trim() || null,
            mobile: input.customer.mobile?.trim() || null,
            email: input.customer.email?.trim() || null,
            address: input.customer.address?.trim() || null,
          }
        : null;

  const rawItems = input.items.map((item) => {
    const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
    const unitPrice = noCharge
      ? 0
      : roundMoney(Math.max(0, Number(item.unitPrice) || 0));
    const lineTotal = noCharge ? 0 : roundMoney(unitPrice * quantity);
    const itemPayments = noCharge
      ? []
      : (item.payments ?? []).map(serializePaymentLine);
    const primary = itemPayments[0] ?? null;
    return {
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      quantity,
      unitPrice,
      lineTotal,
      priceList: item.priceList ?? null,
      payments: itemPayments,
      tenderMethod: primary?.tenderMethod ?? null,
      paymentAccount: primary?.paymentAccount ?? null,
      kind: primary?.kind ?? null,
      note: primary?.note ?? null,
    } satisfies PosSaleItem;
  });

  if (rawItems.length === 0) {
    throw new Error("Add at least one item");
  }
  for (const item of rawItems) {
    if (item.quantity <= 0) {
      throw new Error(`Invalid quantity for ${item.productName}`);
    }
    if (!item.variantId) {
      throw new Error(`Missing variant for ${item.productName}`);
    }
  }

  const total = roundMoney(
    rawItems.reduce((sum, item) => sum + item.lineTotal, 0)
  );
  const voucherAmountApplied = Math.min(
    existing.voucherAmountApplied ?? 0,
    total
  );
  const amountDue = noCharge
    ? 0
    : Math.max(0, roundMoney(total - voucherAmountApplied));
  const payments = noCharge
    ? []
    : input.payments.map(serializePaymentLine);

  validatePaymentLines(payments, amountDue, input.allowUnequalPayments);

  const prevQty = qtyByVariant(existing.items);
  const nextQty = qtyByVariant(rawItems);
  const variantIds = new Set([...prevQty.keys(), ...nextQty.keys()]);
  const stockDeltas: Array<{
    variantId: string;
    productId: string;
    productName: string;
    delta: number;
  }> = [];
  for (const variantId of variantIds) {
    const before = prevQty.get(variantId)?.quantity ?? 0;
    const after = nextQty.get(variantId)?.quantity ?? 0;
    const delta = after - before;
    if (delta === 0) continue;
    const meta = nextQty.get(variantId) ?? prevQty.get(variantId);
    if (!meta) continue;
    stockDeltas.push({
      variantId,
      productId: meta.productId,
      productName: meta.productName,
      delta,
    });
  }

  const db = getClientDb();
  const saleDoc = doc(db, COLLECTIONS.posSales, saleId);
  const saleLabel = `Sale ${saleId.slice(-6).toUpperCase()}`;

  await runTransaction(db, async (tx) => {
    const invRows: Array<{
      invRef: ReturnType<typeof doc>;
      variantId: string;
      productId: string;
      productName: string;
      stockDelta: number;
      previousStock: number;
      newStock: number;
      exists: boolean;
    }> = [];

    for (const row of stockDeltas) {
      const invRef = doc(
        db,
        COLLECTIONS.branchInventory,
        inventoryDocId(existing.branchId, row.variantId)
      );
      const snap = await tx.get(invRef);
      const previousStock = snap.exists()
        ? Number((snap.data() as { stock?: number }).stock ?? 0)
        : 0;
      const newStock = previousStock - row.delta;
      if (row.delta > 0) {
        if (!snap.exists()) {
          throw new Error(`No inventory for ${row.productName}`);
        }
        const data = snap.data() as { isSelling?: boolean };
        if (data.isSelling === false) {
          throw new Error(`${row.productName} is not selling at this branch`);
        }
        if (newStock < 0) {
          throw new Error(`Insufficient stock for ${row.productName}`);
        }
      }
      invRows.push({
        invRef,
        variantId: row.variantId,
        productId: row.productId,
        productName: row.productName,
        stockDelta: -row.delta,
        previousStock,
        newStock: Math.max(0, newStock),
        exists: snap.exists(),
      });
    }

    for (const row of invRows) {
      if (row.exists) {
        tx.update(row.invRef, {
          stock: row.newStock,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(row.invRef, {
          branchId: existing.branchId,
          productId: row.productId,
          variantId: row.variantId,
          stock: row.newStock,
          lowStockThreshold: 5,
          isSelling: true,
          cashPrice: null,
          retailPrice: null,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(doc(collection(db, COLLECTIONS.inventoryLogs)), {
        branchId: existing.branchId,
        branchName: existing.branchName,
        productId: row.productId,
        variantId: row.variantId,
        productName: row.productName,
        delta: row.stockDelta,
        previousStock: row.previousStock,
        newStock: row.newStock,
        reason: row.stockDelta >= 0 ? "pos_sale_restock" : "pos_sale",
        referenceId: saleId,
        referenceLabel: `${saleLabel} edit`,
        performedBy: input.actor.userId,
        performedByName: input.actor.name ?? null,
        createdAt: serverTimestamp(),
      });
    }

    const primary = payments[0] ?? null;
    const patch: Record<string, unknown> = {
      items: rawItems,
      itemCount: rawItems.reduce((sum, item) => sum + item.quantity, 0),
      total,
      amountDue,
      voucherAmountApplied,
      payments,
      tenderMethod: primary?.tenderMethod ?? existing.tenderMethod,
      paymentAccount: primary?.paymentAccount ?? null,
      customerType,
      customer,
    };

    if (input.saleDate != null && input.saleDate !== "") {
      const nextCreatedAt = saleCreatedAtForDateEdit(
        input.saleDate,
        existing.createdAt
      );
      if (toDateInputValue(existing.createdAt) !== input.saleDate) {
        patch.createdAt = Timestamp.fromDate(nextCreatedAt);
      }
    }

    tx.update(saleDoc, patch);
  });

  const updated = await getPosSale(saleId);
  if (!updated) {
    throw new Error("Sale not found after update");
  }

  await logPosSaleEdit({
    previous: existing,
    next: updated,
    performedBy: input.actor.userId,
    performedByName: input.actor.name,
    performedByRole: input.actor.role ?? null,
  });

  return updated;
}

/** Correction of tender methods / accounts. Totals stay the same unless items are unchanged payment-only. */
export async function updatePosSalePayments(
  saleId: string,
  input: UpdatePosSalePaymentsInput
): Promise<PosSale> {
  const existing = await getPosSale(saleId);
  if (!existing) {
    throw new Error("Sale not found");
  }
  if (isPosSaleArchived(existing)) {
    throw new Error("Archived sales cannot be edited");
  }
  assertCanEditSale(existing, input.actor);

  if (
    input.saleDate != null &&
    input.saleDate !== "" &&
    input.saleDate !== toDateInputValue(existing.createdAt) &&
    input.actor &&
    !canChangePosSaleDate(input.actor.role)
  ) {
    throw new Error("Only admins can change the sale date");
  }

  const amountDue = roundMoney(existing.amountDue ?? existing.total);
  const payments = input.payments.map(serializePaymentLine);
  const items =
    input.items?.map((item, index) => {
      const current = existing.items[index];
      if (!current) {
        throw new Error("Sale items cannot be added or removed");
      }
      const itemPayments = (item.payments ?? []).map(serializePaymentLine);
      const primary = itemPayments[0] ?? null;
      return {
        ...current,
        payments: itemPayments,
        tenderMethod: primary?.tenderMethod ?? null,
        paymentAccount: primary?.paymentAccount ?? null,
        kind: primary?.kind ?? null,
        note: primary?.note ?? null,
      };
    }) ?? null;

  if (items && !itemsUnchangedForPaymentEdit(existing.items, items)) {
    throw new Error("Line items and totals cannot be changed");
  }

  validatePaymentLines(payments, amountDue, input.allowUnequalPayments);

  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const target = itemStoredPaymentTotal(existing.items[i]);
      if (target <= PAYMENT_AMOUNT_TOLERANCE) {
        if (item.payments.length > 0) {
          throw new Error("Free or unpaid items cannot have payments");
        }
        continue;
      }
      if (item.payments.length === 0) {
        throw new Error("Add at least one payment for each paid item");
      }
      if (
        !input.allowUnequalPayments &&
        !itemPaymentsCoverLineTotal(item.payments, target)
      ) {
        throw new Error("Each item's payments must keep that item's paid amount");
      }
    }
  }

  const primary = payments[0] ?? null;
  const nextItems =
    items ??
    existing.items.map((item) => ({
      ...item,
      payments: [] as PosPaymentLine[],
      tenderMethod: null,
      paymentAccount: null,
      kind: null,
      note: null,
    }));

  const patch: Record<string, unknown> = {
    payments,
    tenderMethod: primary?.tenderMethod ?? existing.tenderMethod,
    paymentAccount: primary?.paymentAccount ?? null,
    items: nextItems,
  };

  if (input.saleDate != null && input.saleDate !== "") {
    const nextCreatedAt = saleCreatedAtForDateEdit(
      input.saleDate,
      existing.createdAt
    );
    if (toDateInputValue(existing.createdAt) !== input.saleDate) {
      patch.createdAt = Timestamp.fromDate(nextCreatedAt);
    }
  }

  await updateDoc(doc(getClientDb(), COLLECTIONS.posSales, saleId), patch);

  const updated = await getPosSale(saleId);
  if (!updated) {
    throw new Error("Sale not found after update");
  }

  if (input.actor) {
    await logPosSaleEdit({
      previous: existing,
      next: updated,
      performedBy: input.actor.userId,
      performedByName: input.actor.name,
      performedByRole: input.actor.role ?? null,
    });
  }

  return updated;
}

/** Move a sale onto another calendar day for daily sales reports. */
export async function updatePosSaleDate(
  saleId: string,
  saleDate: string,
  actor?: UpdatePosSaleActor
): Promise<PosSale> {
  const existing = await getPosSale(saleId);
  if (!existing) {
    throw new Error("Sale not found");
  }
  if (isPosSaleArchived(existing)) {
    throw new Error("Archived sales cannot be edited");
  }
  if (actor && !canChangePosSaleDate(actor.role)) {
    throw new Error("Only admins can change the sale date");
  }

  if (toDateInputValue(existing.createdAt) === saleDate) {
    return existing;
  }

  const nextCreatedAt = saleCreatedAtForDateEdit(
    saleDate,
    existing.createdAt
  );

  await updateDoc(doc(getClientDb(), COLLECTIONS.posSales, saleId), {
    createdAt: Timestamp.fromDate(nextCreatedAt),
  });

  const updated = await getPosSale(saleId);
  if (!updated) {
    throw new Error("Sale not found after update");
  }

  if (actor) {
    await logPosSaleEdit({
      previous: existing,
      next: updated,
      performedBy: actor.userId,
      performedByName: actor.name,
      performedByRole: actor.role ?? null,
    });
  }

  return updated;
}

export function resolveSalePaymentDrafts(options: {
  drafts: PosCheckoutPaymentLine[];
  accounts: PaymentAccount[];
  fallbackAccounts: Array<PosSalePaymentAccount | null>;
}): PosPaymentLine[] {
  return options.drafts.map((draft, index) =>
    resolveEditPaymentLine(
      draft,
      options.accounts,
      options.fallbackAccounts[index] ?? null
    )
  );
}

export interface ArchivePosSaleInput {
  restock: boolean;
  performedBy: string;
  performedByName?: string | null;
  performedByRole?: UserRole | null;
  assignedBranchId?: string | null;
}

/** Soft-void a completed sale. Optionally return sold units to branch stock. */
export async function archivePosSale(
  saleId: string,
  input: ArchivePosSaleInput
): Promise<void> {
  if (!input.performedBy) {
    throw new Error("Sign in to archive a sale");
  }

  const db = getClientDb();
  const saleDoc = doc(db, COLLECTIONS.posSales, saleId);
  const saleRef = saleDoc.withConverter(posSaleConverter);
  let archivedSale: PosSale | null = null;

  await runTransaction(db, async (tx) => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) {
      throw new Error("Sale not found");
    }
    const sale = saleSnap.data();
    if (isPosSaleArchived(sale)) {
      throw new Error("Sale is already archived");
    }
    assertCanEditSale(sale, {
      userId: input.performedBy,
      role: input.performedByRole,
      assignedBranchId: input.assignedBranchId,
      name: input.performedByName,
    });
    archivedSale = sale;

    const restockRows: Array<{
      invRef: ReturnType<typeof doc>;
      productId: string;
      variantId: string;
      productName: string;
      quantity: number;
      previousStock: number;
      newStock: number;
      exists: boolean;
    }> = [];

    if (input.restock) {
      const qtyByVariant = new Map<
        string,
        { productId: string; productName: string; quantity: number }
      >();
      for (const item of sale.items) {
        if (!item.variantId || item.quantity <= 0) continue;
        const current = qtyByVariant.get(item.variantId);
        if (current) {
          current.quantity += item.quantity;
        } else {
          qtyByVariant.set(item.variantId, {
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
          });
        }
      }

      for (const [variantId, row] of qtyByVariant) {
        const invRef = doc(
          db,
          COLLECTIONS.branchInventory,
          inventoryDocId(sale.branchId, variantId)
        );
        const snap = await tx.get(invRef);
        const previousStock = snap.exists()
          ? Number((snap.data() as { stock?: number }).stock ?? 0)
          : 0;
        restockRows.push({
          invRef,
          productId: row.productId,
          variantId,
          productName: row.productName,
          quantity: row.quantity,
          previousStock,
          newStock: previousStock + row.quantity,
          exists: snap.exists(),
        });
      }
    }

    const saleLabel = `Sale ${sale.id.slice(-6).toUpperCase()}`;

    for (const row of restockRows) {
      if (row.exists) {
        tx.update(row.invRef, {
          stock: row.newStock,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(row.invRef, {
          branchId: sale.branchId,
          productId: row.productId,
          variantId: row.variantId,
          stock: row.newStock,
          lowStockThreshold: 5,
          isSelling: true,
          cashPrice: null,
          retailPrice: null,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(doc(collection(db, COLLECTIONS.inventoryLogs)), {
        branchId: sale.branchId,
        branchName: sale.branchName,
        productId: row.productId,
        variantId: row.variantId,
        productName: row.productName,
        delta: row.quantity,
        previousStock: row.previousStock,
        newStock: row.newStock,
        reason: "pos_sale_restock",
        referenceId: sale.id,
        referenceLabel: `${saleLabel} restock`,
        performedBy: input.performedBy,
        performedByName: input.performedByName ?? null,
        createdAt: serverTimestamp(),
      });
    }

    tx.update(saleDoc, {
      archivedAt: serverTimestamp(),
      archivedBy: input.performedBy,
      archivedByName: input.performedByName ?? null,
      restockedOnArchive: input.restock,
    });
  });

  if (archivedSale) {
    await logPosSaleArchive({
      sale: archivedSale,
      restocked: input.restock,
      performedBy: input.performedBy,
      performedByName: input.performedByName,
      performedByRole: input.performedByRole ?? null,
    });
  }
}
