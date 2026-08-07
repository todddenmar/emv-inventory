import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { inventoryLogConverter } from "@/lib/firestore/converters";
import type { InventoryLog, InventoryLogReason } from "@/types";

export async function getInventoryLogs(options?: {
  branchId?: string | null;
  max?: number;
}): Promise<InventoryLog[]> {
  const ref = collection(getClientDb(), COLLECTIONS.inventoryLogs).withConverter(
    inventoryLogConverter
  );
  const max = options?.max ?? 50;

  const q = options?.branchId
    ? query(
        ref,
        where("branchId", "==", options.branchId),
        orderBy("createdAt", "desc"),
        limit(max)
      )
    : query(ref, orderBy("createdAt", "desc"), limit(max));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

/** Adjustment history for one variant at a branch (Shopify-style). */
export async function getVariantInventoryLogs(options: {
  branchId: string;
  variantId: string;
  max?: number;
}): Promise<InventoryLog[]> {
  const ref = collection(getClientDb(), COLLECTIONS.inventoryLogs).withConverter(
    inventoryLogConverter
  );
  const max = options.max ?? 50;

  try {
    const snapshot = await getDocs(
      query(
        ref,
        where("branchId", "==", options.branchId),
        where("variantId", "==", options.variantId),
        orderBy("createdAt", "desc"),
        limit(max)
      )
    );
    return snapshot.docs.map((d) => d.data());
  } catch {
    // Fallback when the composite index is not deployed yet.
    const branchLogs = await getInventoryLogs({
      branchId: options.branchId,
      max: Math.max(max * 6, 200),
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

