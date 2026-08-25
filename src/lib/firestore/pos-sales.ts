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
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { posSaleConverter } from "@/lib/firestore/converters";
import { inventoryDocId } from "@/lib/firestore/inventory";
import { endOfLocalDay, startOfLocalDay } from "@/lib/dates";
import { isVoucherRedeemable } from "@/lib/firestore/vouchers";
import type {
  PosCustomerType,
  PosPaymentLine,
  PosPaymentMethod,
  PosSale,
  PosSaleChannel,
  PosSaleCustomer,
  PosSaleItem,
  PosSalePaymentAccount,
  PosTenderMethod,
  Voucher,
} from "@/types";
import {
  PAYMENT_AMOUNT_TOLERANCE,
  paymentsCoverAmountDue,
  roundMoney,
  synthesizePaymentsFromLegacy,
  tenderNeedsPaymentAccount,
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
  items: PosSaleItem[];
  createdBy: string;
  createdByName?: string | null;
}

export async function getPosSale(id: string): Promise<PosSale | null> {
  const snap = await getDoc(
    doc(getClientDb(), COLLECTIONS.posSales, id).withConverter(posSaleConverter)
  );
  return snap.exists() ? snap.data() : null;
}

export async function getPosSales(options?: {
  branchId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  saleChannel?: PosSaleChannel | null;
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

  const applyChannelFilter = (rows: PosSale[]) => {
    if (!options?.saleChannel) return rows;
    return rows.filter((sale) => sale.saleChannel === options.saleChannel);
  };

  try {
    const snapshot = await getDocs(query(ref, ...constraints));
    return applyChannelFilter(snapshot.docs.map((d) => d.data()));
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
    return applyChannelFilter(rows).slice(0, max);
  }
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

  const customerType = input.customerType ?? "walk_in";
  if (customerType === "reservation" || customerType === "delivery") {
    if (!input.customer?.name?.trim()) {
      throw new Error("Customer name is required");
    }
  }

  for (const item of input.items) {
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
  const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const total = input.items.reduce((sum, item) => sum + item.lineTotal, 0);

  await runTransaction(db, async (tx) => {
    const rows: Array<{
      item: PosSaleItem;
      invRef: ReturnType<typeof doc>;
      previousStock: number;
      newStock: number;
    }> = [];

    for (const item of input.items) {
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
    let nextRemaining = 0;
    let nextStatus: Voucher["status"] = "active";

    if (input.voucherId) {
      voucherRef = doc(db, COLLECTIONS.vouchers, input.voucherId);
      const voucherSnap = await tx.get(voucherRef);
      if (!voucherSnap.exists()) {
        throw new Error("Voucher not found");
      }
      const voucherData = voucherSnap.data() as {
        code?: string;
        resellerId?: string | null;
        remainingAmount?: number;
        status?: string;
        expiresAt?: { toDate?: () => Date } | Date | null;
      };

      const expiresAt = voucherData.expiresAt
        ? typeof (voucherData.expiresAt as { toDate?: () => Date }).toDate ===
          "function"
          ? (voucherData.expiresAt as { toDate: () => Date }).toDate()
          : new Date(voucherData.expiresAt as Date)
        : null;

      const voucherLike: Voucher = {
        id: voucherSnap.id,
        code: String(voucherData.code ?? "").toUpperCase(),
        name: "",
        description: "",
        resellerId: voucherData.resellerId ?? null,
        resellerName: null,
        initialAmount: 0,
        remainingAmount: Number(voucherData.remainingAmount ?? 0),
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
        throw new Error("Voucher is not redeemable");
      }
      if (
        input.resellerId &&
        voucherLike.resellerId &&
        voucherLike.resellerId !== input.resellerId
      ) {
        throw new Error("Voucher does not belong to the selected reseller");
      }

      voucherAmountApplied = Math.min(voucherLike.remainingAmount, total);
      voucherId = voucherSnap.id;
      voucherCode = voucherLike.code;
      nextRemaining = Math.max(
        0,
        voucherLike.remainingAmount - voucherAmountApplied
      );
      nextStatus = nextRemaining <= 0 ? "depleted" : "active";
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
        throw new Error("Payment amounts must equal the amount due");
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
      tx.update(voucherRef, {
        remainingAmount: nextRemaining,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
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
        customerType === "walk_in" ? null : (input.customer ?? null),
      resellerId: input.resellerId ?? null,
      resellerName: input.resellerName ?? null,
      voucherId,
      voucherCode,
      voucherAmountApplied,
      total,
      amountDue,
      items: input.items,
      itemCount,
      createdBy: input.createdBy,
      createdByName: input.createdByName ?? null,
      createdAt: serverTimestamp(),
    });
  });

  return saleId;
}
