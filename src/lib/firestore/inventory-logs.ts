import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
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

const PAGE_SIZE = 500;
/** Safety cap when loading a date range (busy POS days can exceed hundreds). */
const RANGE_FETCH_CAP = 10_000;

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

function logsCollection() {
  return collection(getClientDb(), COLLECTIONS.inventoryLogs).withConverter(
    inventoryLogConverter
  );
}

async function fetchInventoryLogPages(options: {
  branchId?: string | null;
  range: { from: Date; to: Date } | null;
  max: number;
}): Promise<InventoryLog[]> {
  const ref = logsCollection();
  const rows: InventoryLog[] = [];
  let cursor: QueryDocumentSnapshot | null = null;

  while (rows.length < options.max) {
    const pageLimit = Math.min(PAGE_SIZE, options.max - rows.length);
    const constraints: QueryConstraint[] = [];

    if (options.branchId) {
      constraints.push(where("branchId", "==", options.branchId));
    }
    if (options.range) {
      constraints.push(where("createdAt", ">=", options.range.from));
      constraints.push(where("createdAt", "<=", options.range.to));
    }
    constraints.push(orderBy("createdAt", "desc"));
    if (cursor) {
      constraints.push(startAfter(cursor));
    }
    constraints.push(limit(pageLimit));

    const snapshot = await getDocs(query(ref, ...constraints));
    if (snapshot.empty) break;

    for (const docSnap of snapshot.docs) {
      rows.push(docSnap.data());
    }
    cursor = snapshot.docs[snapshot.docs.length - 1] ?? null;
    if (snapshot.docs.length < pageLimit) break;
  }

  return rows;
}

async function fetchInventoryLogsFallback(options: {
  branchId?: string | null;
  range: { from: Date; to: Date } | null;
  max: number;
}): Promise<InventoryLog[]> {
  const ref = logsCollection();
  const rows: InventoryLog[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  // Without a range index, walk recent logs until we fill the date window or hit cap.
  const scanCap = options.range
    ? Math.max(options.max * 4, RANGE_FETCH_CAP)
    : options.max;

  while (rows.length < options.max) {
    const pageLimit = Math.min(PAGE_SIZE, scanCap - rows.length);
    if (pageLimit <= 0) break;

    const constraints: QueryConstraint[] = [];
    if (options.branchId) {
      constraints.push(where("branchId", "==", options.branchId));
    }
    constraints.push(orderBy("createdAt", "desc"));
    if (cursor) {
      constraints.push(startAfter(cursor));
    }
    constraints.push(limit(pageLimit));

    const snapshot = await getDocs(query(ref, ...constraints));
    if (snapshot.empty) break;

    for (const docSnap of snapshot.docs) {
      const log = docSnap.data();
      if (options.range) {
        if (log.createdAt < options.range.from) {
          // Further pages are older; stop scanning.
          return rows.slice(0, options.max);
        }
        if (log.createdAt > options.range.to) {
          continue;
        }
      }
      rows.push(log);
      if (rows.length >= options.max) break;
    }

    cursor = snapshot.docs[snapshot.docs.length - 1] ?? null;
    if (snapshot.docs.length < pageLimit) break;

    if (options.range) {
      const oldest = snapshot.docs[snapshot.docs.length - 1]?.data();
      if (oldest && oldest.createdAt < options.range.from) break;
    }
  }

  return rows.slice(0, options.max);
}

export async function getInventoryLogs(options?: {
  branchId?: string | null;
  max?: number;
  /** Local `YYYY-MM-DD`. When set, only logs on that calendar day are returned. */
  date?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<InventoryLog[]> {
  const range = resolveLogRange(options);
  // Date-scoped pages need all matching rows; uncapped feeds stay small.
  const max = options?.max ?? (range ? RANGE_FETCH_CAP : 50);

  try {
    return await fetchInventoryLogPages({
      branchId: options?.branchId,
      range,
      max,
    });
  } catch (error) {
    // Fallback when a composite index is missing: scan recent + filter locally.
    console.warn("getInventoryLogs date query failed, using fallback", error);
    return fetchInventoryLogsFallback({
      branchId: options?.branchId,
      range,
      max,
    });
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
  const ref = logsCollection();
  const max = options.max ?? 50;
  const range = resolveLogRange(options);

  try {
    const rows: InventoryLog[] = [];
    let cursor: QueryDocumentSnapshot | null = null;

    while (rows.length < max) {
      const pageLimit = Math.min(PAGE_SIZE, max - rows.length);
      const constraints: QueryConstraint[] = [
        where("branchId", "==", options.branchId),
        where("variantId", "==", options.variantId),
      ];
      if (range) {
        constraints.push(where("createdAt", ">=", range.from));
        constraints.push(where("createdAt", "<=", range.to));
      }
      constraints.push(orderBy("createdAt", "desc"));
      if (cursor) {
        constraints.push(startAfter(cursor));
      }
      constraints.push(limit(pageLimit));

      const snapshot = await getDocs(query(ref, ...constraints));
      if (snapshot.empty) break;

      for (const docSnap of snapshot.docs) {
        rows.push(docSnap.data());
      }
      cursor = snapshot.docs[snapshot.docs.length - 1] ?? null;
      if (snapshot.docs.length < pageLimit) break;
    }

    return rows;
  } catch {
    // Fallback when the composite index is not deployed yet.
    const branchLogs = await getInventoryLogs({
      branchId: options.branchId,
      max: Math.max(max * 20, 1000),
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
    case "pos_sale_restock":
      return "Sale restock";
    case "supplier_stock_in":
      return "Supplier stock in";
    case "reseller_transfer_out":
      return "Reseller transfer";
  }
}

export function inventoryLogLinksToSale(reason: InventoryLogReason): boolean {
  return reason === "pos_sale" || reason === "pos_sale_restock";
}
