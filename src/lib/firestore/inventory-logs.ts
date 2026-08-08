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
import {
  endOfLocalDay,
  startOfLocalDay,
} from "@/lib/dates";
import type { InventoryLog, InventoryLogReason } from "@/types";

export {
  toDateInputValue,
  startOfLocalDay,
  endOfLocalDay,
} from "@/lib/dates";

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

function resolveLogRange(options?: {
  date?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}): { from: Date; to: Date } | null {
  if (options?.fromDate && options?.toDate) {
    return {
      from: startOfLocalDay(options.fromDate),
      to: endOfLocalDay(options.toDate),
    };
  }
  if (options?.date) {
    return {
      from: startOfLocalDay(options.date),
      to: endOfLocalDay(options.date),
    };
  }
  return null;
}

export async function getInventoryLogs(options?: {
  branchId?: string | null;
  max?: number;
  /** Local `YYYY-MM-DD`. When set, only logs on that calendar day are returned. */
  date?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<InventoryLog[]> {
  const ref = collection(getClientDb(), COLLECTIONS.inventoryLogs).withConverter(
    inventoryLogConverter
  );
  const max = options?.max ?? 50;
  const range = resolveLogRange(options);
  const constraints: QueryConstraint[] = [];

  if (options?.branchId) {
    constraints.push(where("branchId", "==", options.branchId));
  }

  if (range) {
    constraints.push(where("createdAt", ">=", range.from));
    constraints.push(where("createdAt", "<=", range.to));
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
      limit(range ? Math.max(max * 10, 500) : max)
    );
    const snapshot = await getDocs(query(ref, ...fallbackConstraints));
    let rows = snapshot.docs.map((d) => d.data());
    if (range) {
      rows = rows.filter(
        (log) =>
          log.createdAt >= range.from && log.createdAt <= range.to
      );
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
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<InventoryLog[]> {
  const ref = collection(getClientDb(), COLLECTIONS.inventoryLogs).withConverter(
    inventoryLogConverter
  );
  const max = options.max ?? 50;
  const range = resolveLogRange(options);

  try {
    const constraints: QueryConstraint[] = [
      where("branchId", "==", options.branchId),
      where("variantId", "==", options.variantId),
    ];
    if (range) {
      constraints.push(where("createdAt", ">=", range.from));
      constraints.push(where("createdAt", "<=", range.to));
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
      fromDate: options.fromDate,
      toDate: options.toDate,
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
