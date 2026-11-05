import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { posSaleActivityLogConverter } from "@/lib/firestore/converters";
import { toDateInputValue } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import {
  paymentKindLabel,
  tenderMethodLabel,
} from "@/lib/pos-payments";
import type {
  PosPaymentLine,
  PosSale,
  PosSaleActivityAction,
  PosSaleActivityLog,
  PosSaleCustomer,
  PosSaleItem,
} from "@/types";

export function summarizePosPayments(payments: PosPaymentLine[]): string {
  if (payments.length === 0) return "No payments";
  return payments
    .map((line) => {
      const account = line.paymentAccount
        ? ` · ${line.paymentAccount.provider}`
        : "";
      const kind =
        line.kind && line.kind !== "full"
          ? ` (${paymentKindLabel(line.kind)})`
          : "";
      return `${tenderMethodLabel(line.tenderMethod)} ${formatCurrency(line.amount)}${kind}${account}`;
    })
    .join("; ");
}

export function summarizePosItems(items: PosSaleItem[]): string {
  if (items.length === 0) return "No items";
  return items
    .map(
      (item) =>
        `${item.productName} ×${item.quantity} @ ${formatCurrency(item.unitPrice)}`
    )
    .join("; ");
}

function summarizeCustomer(customer: PosSaleCustomer | null): string {
  if (!customer) return "No customer";
  const parts = [
    customer.name,
    customer.mobile,
    customer.email,
    customer.address,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No customer";
}

export async function createPosSaleActivityLog(
  input: Omit<PosSaleActivityLog, "id" | "createdAt">
): Promise<void> {
  await addDoc(collection(getClientDb(), COLLECTIONS.posSaleActivityLogs), {
    ...input,
    createdAt: serverTimestamp(),
  });
}

export async function logPosSalePaymentEdit(options: {
  previous: PosSale;
  next: PosSale;
  previousSaleDate: string;
  nextSaleDate: string;
  performedBy: string;
  performedByName?: string | null;
  performedByRole?: string | null;
}): Promise<void> {
  await logPosSaleEdit({
    previous: options.previous,
    next: options.next,
    performedBy: options.performedBy,
    performedByName: options.performedByName,
    performedByRole: options.performedByRole,
  });
}

export async function logPosSaleEdit(options: {
  previous: PosSale;
  next: PosSale;
  performedBy: string;
  performedByName?: string | null;
  performedByRole?: string | null;
}): Promise<void> {
  const previousSaleDate = toDateInputValue(options.previous.createdAt);
  const nextSaleDate = toDateInputValue(options.next.createdAt);
  const previousPayments = summarizePosPayments(options.previous.payments);
  const nextPayments = summarizePosPayments(options.next.payments);
  const previousItems = summarizePosItems(options.previous.items);
  const nextItems = summarizePosItems(options.next.items);
  const previousDetails = [
    options.previous.customerType,
    summarizeCustomer(options.previous.customer),
  ].join(" · ");
  const nextDetails = [
    options.next.customerType,
    summarizeCustomer(options.next.customer),
  ].join(" · ");

  const paymentsChanged = previousPayments !== nextPayments;
  const dateChanged = previousSaleDate !== nextSaleDate;
  const itemsChanged = previousItems !== nextItems;
  const detailsChanged = previousDetails !== nextDetails;

  if (!paymentsChanged && !dateChanged && !itemsChanged && !detailsChanged) {
    return;
  }

  const changeCount = [
    paymentsChanged,
    dateChanged,
    itemsChanged,
    detailsChanged,
  ].filter(Boolean).length;

  let action: PosSaleActivityAction = "sale_edited";
  if (changeCount === 1) {
    if (paymentsChanged) action = "payments_updated";
    else if (dateChanged) action = "sale_date_updated";
    else if (itemsChanged) action = "items_updated";
    else action = "details_updated";
  }

  const parts: string[] = [];
  if (itemsChanged) parts.push("updated items");
  if (paymentsChanged) parts.push("updated payments");
  if (detailsChanged) parts.push("updated details");
  if (dateChanged) {
    parts.push(`moved date ${previousSaleDate} → ${nextSaleDate}`);
  }

  await createPosSaleActivityLog({
    saleId: options.next.id,
    branchId: options.next.branchId,
    branchName: options.next.branchName,
    action,
    summary: parts.join("; ") || "Sale edited",
    previousPaymentsSummary: paymentsChanged ? previousPayments : null,
    nextPaymentsSummary: paymentsChanged ? nextPayments : null,
    previousItemsSummary: itemsChanged ? previousItems : null,
    nextItemsSummary: itemsChanged ? nextItems : null,
    previousSaleDate: dateChanged ? previousSaleDate : null,
    nextSaleDate: dateChanged ? nextSaleDate : null,
    performedBy: options.performedBy,
    performedByName: options.performedByName ?? null,
    performedByRole: options.performedByRole ?? null,
  });
}

export async function logPosSaleArchive(options: {
  sale: PosSale;
  restocked: boolean;
  performedBy: string;
  performedByName?: string | null;
  performedByRole?: string | null;
}): Promise<void> {
  await createPosSaleActivityLog({
    saleId: options.sale.id,
    branchId: options.sale.branchId,
    branchName: options.sale.branchName,
    action: "sale_archived",
    summary: options.restocked
      ? "Archived sale and restocked items"
      : "Archived sale (stock unchanged)",
    previousPaymentsSummary: summarizePosPayments(options.sale.payments),
    nextPaymentsSummary: null,
    previousItemsSummary: summarizePosItems(options.sale.items),
    nextItemsSummary: null,
    previousSaleDate: toDateInputValue(options.sale.createdAt),
    nextSaleDate: null,
    performedBy: options.performedBy,
    performedByName: options.performedByName ?? null,
    performedByRole: options.performedByRole ?? null,
  });
}

export async function getPosSaleActivityLogs(options?: {
  saleId?: string | null;
  branchId?: string | null;
  max?: number;
}): Promise<PosSaleActivityLog[]> {
  const ref = collection(
    getClientDb(),
    COLLECTIONS.posSaleActivityLogs
  ).withConverter(posSaleActivityLogConverter);
  const max = options?.max ?? 100;

  try {
    const constraints: QueryConstraint[] = [];
    if (options?.saleId) {
      constraints.push(where("saleId", "==", options.saleId));
    } else if (options?.branchId) {
      constraints.push(where("branchId", "==", options.branchId));
    }
    constraints.push(orderBy("createdAt", "desc"), limit(max));
    const snapshot = await getDocs(query(ref, ...constraints));
    return snapshot.docs.map((d) => d.data());
  } catch (error) {
    console.warn("getPosSaleActivityLogs query failed, using fallback", error);
    const snapshot = await getDocs(
      query(ref, orderBy("createdAt", "desc"), limit(Math.max(max * 5, 200)))
    );
    let rows = snapshot.docs.map((d) => d.data());
    if (options?.saleId) {
      rows = rows.filter((row) => row.saleId === options.saleId);
    }
    if (options?.branchId) {
      rows = rows.filter((row) => row.branchId === options.branchId);
    }
    return rows.slice(0, max);
  }
}
