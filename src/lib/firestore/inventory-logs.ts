import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { inventoryLogConverter } from "@/lib/firestore/converters";
import type { InventoryLog, InventoryLogReason } from "@/types";

/** Local calendar date as `YYYY-MM-DD` for `<input type="date">`. */
export function toDateInputValue(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(dateInput: string): Date {
  const [y, m, d] = dateInput.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function endOfLocalDay(dateInput: string): Date {
  const [y, m, d] = dateInput.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

export function isInventoryLogOnDate(
  log: InventoryLog,
  dateInput: string
): boolean {
  const created = log.createdAt;
  if (!(created instanceof Date) || Number.isNaN(created.getTime())) {
    return false;
  }
  return (
    created >= startOfLocalDay(dateInput) && created <= endOfLocalDay(dateInput)
  );
}

export async function getInventoryLogs(options?: {
  branchId?: string | null;
  max?: number;
  /** Local `YYYY-MM-DD`. When set, only logs on that calendar day are returned. */
  date?: string | null;
}): Promise<InventoryLog[]> {
  const ref = collection(getClientDb(), COLLECTIONS.inventoryLogs).withConverter(
    inventoryLogConverter
  );
  const max = options?.max ?? 50;
  const constraints: QueryConstraint[] = [];

  if (options?.branchId) {
    constraints.push(where("branchId", "==", options.branchId));
  }

  if (options?.date) {
    constraints.push(where("createdAt", ">=", startOfLocalDay(options.date)));
    constraints.push(where("createdAt", "<=", endOfLocalDay(options.date)));
  }

  constraints.push(orderBy("createdAt", "desc"), limit(max));

  try {
    const snapshot = await getDocs(query(ref, ...constraints));
    return snapshot.docs.map((d) => d.data());
  } catch (error) {
    // Fallback when a composite index is missing: fetch recent + filter locally.
    console.warn("getInventoryLogs date query failed, using fallback", error);
    const fallbackConstraints: QueryConstraint[] = [];
    if (options?.branchId) {
      fallbackConstraints.push(where("branchId", "==", options.branchId));
    }
    fallbackConstraints.push(
      orderBy("createdAt", "desc"),
      limit(options?.date ? Math.max(max * 10, 500) : max)
    );
    const snapshot = await getDocs(query(ref, ...fallbackConstraints));
    let rows = snapshot.docs.map((d) => d.data());
    if (options?.date) {
      rows = rows.filter((log) => isInventoryLogOnDate(log, options.date!));
    }
    return rows.slice(0, max);
  }
}

/** Adjustment history for one variant at a branch (Shopify-style). */
export async function getVariantInventoryLogs(options: {
  branchId: string;
  variantId: string;
  max?: number;
  date?: string | null;
}): Promise<InventoryLog[]> {
  const ref = collection(getClientDb(), COLLECTIONS.inventoryLogs).withConverter(
    inventoryLogConverter
  );
  const max = options.max ?? 50;

  try {
    const constraints: QueryConstraint[] = [
      where("branchId", "==", options.branchId),
      where("variantId", "==", options.variantId),
    ];
    if (options.date) {
      constraints.push(where("createdAt", ">=", startOfLocalDay(options.date)));
      constraints.push(where("createdAt", "<=", endOfLocalDay(options.date)));
    }
    constraints.push(orderBy("createdAt", "desc"), limit(max));

    const snapshot = await getDocs(query(ref, ...constraints));
    return snapshot.docs.map((d) => d.data());
  } catch {
    // Fallback when the composite index is not deployed yet.
    const branchLogs = await getInventoryLogs({
      branchId: options.branchId,
      max: Math.max(max * 6, 200),
      date: options.date,
    });
    return branchLogs
      .filter((log) => log.variantId === options.variantId)
      .slice(0, max);
  }
}

export function inventoryLogReasonLabel(reason: InventoryLogReason): string {
  switch (reason) {
    case "manual_adjustment":
      return "Manual adjustment";
    case "transfer_out":
      return "Transfer out";
    case "transfer_in":
      return "Transfer in";
    case "pos_sale":
      return "Sale";
    case "supplier_stock_in":
      return "Supplier stock in";
  }
}
