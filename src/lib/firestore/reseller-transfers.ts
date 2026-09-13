import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { resellerTransferConverter } from "@/lib/firestore/converters";
import { inventoryDocId } from "@/lib/firestore/inventory";
import type { ResellerTransfer, ResellerTransferItem } from "@/types";

export interface CompleteResellerTransferInput {
  branchId: string;
  branchName: string;
  resellerId: string;
  resellerName: string;
  items: ResellerTransferItem[];
  notes?: string | null;
  createdBy: string;
  createdByName?: string | null;
}

export async function completeResellerTransfer(
  input: CompleteResellerTransferInput
): Promise<string> {
  if (!input.branchId) {
    throw new Error("Select a branch");
  }
  if (!input.resellerId) {
    throw new Error("Select a reseller");
  }
  if (input.items.length === 0) {
    throw new Error("Add at least one variant");
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
  const transferRef = doc(collection(db, COLLECTIONS.resellerTransfers));
  const transferId = transferRef.id;
  const label = `Reseller ${transferId.slice(-6).toUpperCase()} → ${input.resellerName}`;
  const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);

  await runTransaction(db, async (tx) => {
    const rows: Array<{
      item: ResellerTransferItem;
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
        throw new Error(`No stock record for ${item.productName}`);
      }
      const previousStock =
        (snap.data() as { stock?: number })?.stock ?? 0;
      if (previousStock < item.quantity) {
        throw new Error(
          `Insufficient stock for ${item.productName} (have ${previousStock}, need ${item.quantity})`
        );
      }
      rows.push({
        item,
        invRef,
        previousStock,
        newStock: previousStock - item.quantity,
      });
    }

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
        reason: "reseller_transfer_out",
        referenceId: transferId,
        referenceLabel: label,
        performedBy: input.createdBy,
        performedByName: input.createdByName ?? null,
        createdAt: serverTimestamp(),
      });
    }

    tx.set(transferRef, {
      branchId: input.branchId,
      branchName: input.branchName,
      resellerId: input.resellerId,
      resellerName: input.resellerName,
      items: input.items,
      itemCount,
      notes: input.notes ?? null,
      createdBy: input.createdBy,
      createdByName: input.createdByName ?? null,
      createdAt: serverTimestamp(),
    });
  });

  return transferId;
}

export async function getResellerTransfers(options?: {
  branchId?: string | null;
  resellerId?: string | null;
  max?: number;
}): Promise<ResellerTransfer[]> {
  const ref = collection(
    getClientDb(),
    COLLECTIONS.resellerTransfers
  ).withConverter(resellerTransferConverter);
  const max = options?.max ?? 50;

  try {
    let q;
    if (options?.branchId && options?.resellerId) {
      q = query(
        ref,
        where("branchId", "==", options.branchId),
        where("resellerId", "==", options.resellerId),
        orderBy("createdAt", "desc"),
        limit(max)
      );
    } else if (options?.branchId) {
      q = query(
        ref,
        where("branchId", "==", options.branchId),
        orderBy("createdAt", "desc"),
        limit(max)
      );
    } else if (options?.resellerId) {
      q = query(
        ref,
        where("resellerId", "==", options.resellerId),
        orderBy("createdAt", "desc"),
        limit(max)
      );
    } else {
      q = query(ref, orderBy("createdAt", "desc"), limit(max));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data());
  } catch {
    const snapshot = await getDocs(
      query(ref, orderBy("createdAt", "desc"), limit(Math.max(max * 4, 100)))
    );
    let rows = snapshot.docs.map((d) => d.data());
    if (options?.branchId) {
      rows = rows.filter((row) => row.branchId === options.branchId);
    }
    if (options?.resellerId) {
      rows = rows.filter((row) => row.resellerId === options.resellerId);
    }
    return rows.slice(0, max);
  }
}
