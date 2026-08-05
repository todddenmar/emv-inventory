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

export function inventoryLogReasonLabel(reason: InventoryLogReason): string {
  switch (reason) {
    case "manual_adjustment":
      return "Manual adjustment";
    case "transfer_out":
      return "Transfer out";
    case "transfer_in":
      return "Transfer in";
  }
}
