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
  type QueryConstraint,
  type Transaction,
  type DocumentReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { branchTransferConverter } from "@/lib/firestore/converters";
import { inventoryDocId } from "@/lib/firestore/inventory";
import { endOfLocalDay, startOfLocalDay } from "@/lib/dates";
import type { BranchTransfer, BranchTransferItem } from "@/types";

export interface CreateTransferInput {
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  items: BranchTransferItem[];
  notes?: string | null;
  createdBy: string;
  createdByName?: string | null;
}

/** Apply stock deltas + logs + transfer doc inside an existing transaction. */
export async function applyBranchTransferInTransaction(
  tx: Transaction,
  db: ReturnType<typeof getClientDb>,
  transferRef: DocumentReference,
  input: CreateTransferInput
): Promise<void> {
  if (input.fromBranchId === input.toBranchId) {
    throw new Error("Source and destination branches must be different");
  }
  if (input.items.length === 0) {
    throw new Error("Add at least one product to transfer");
  }

  const transferId = transferRef.id;
  const transferLabel = `Transfer ${transferId.slice(-6).toUpperCase()}`;

  const rows: Array<{
    item: BranchTransferItem;
    sourceRef: DocumentReference;
    destRef: DocumentReference;
    sourceStock: number;
    destStock: number;
    destThreshold: number;
    destExists: boolean;
  }> = [];

  for (const item of input.items) {
    if (item.quantity <= 0) {
      throw new Error("Transfer quantity must be greater than zero");
    }
    if (!item.variantId) {
      throw new Error(`Missing variant for ${item.productName}`);
    }

    const sourceRef = doc(
      db,
      COLLECTIONS.branchInventory,
      inventoryDocId(input.fromBranchId, item.variantId)
    );
    const destRef = doc(
      db,
      COLLECTIONS.branchInventory,
      inventoryDocId(input.toBranchId, item.variantId)
    );

    const [sourceSnap, destSnap] = await Promise.all([
      tx.get(sourceRef),
      tx.get(destRef),
    ]);

    const sourceStock = sourceSnap.exists()
      ? (sourceSnap.data()?.stock ?? 0)
      : 0;

    if (!sourceSnap.exists() || sourceStock < item.quantity) {
      throw new Error(`Insufficient stock for ${item.productName}`);
    }

    rows.push({
      item,
      sourceRef,
      destRef,
      sourceStock,
      destStock: destSnap.exists() ? (destSnap.data()?.stock ?? 0) : 0,
      destThreshold: destSnap.exists()
        ? (destSnap.data()?.lowStockThreshold ?? 5)
        : 5,
      destExists: destSnap.exists(),
    });
  }

  for (const row of rows) {
    const sourceNew = row.sourceStock - row.item.quantity;
    const destNew = row.destStock + row.item.quantity;

    tx.update(row.sourceRef, {
      stock: sourceNew,
      updatedAt: serverTimestamp(),
    });

    if (row.destExists) {
      tx.update(row.destRef, {
        stock: destNew,
        isSelling: true,
        variantId: row.item.variantId,
        productId: row.item.productId,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(row.destRef, {
        branchId: input.toBranchId,
        productId: row.item.productId,
        variantId: row.item.variantId,
        stock: destNew,
        lowStockThreshold: row.destThreshold,
        isSelling: true,
        cashPrice: null,
        retailPrice: null,
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(doc(collection(db, COLLECTIONS.inventoryLogs)), {
      branchId: input.fromBranchId,
      branchName: input.fromBranchName,
      productId: row.item.productId,
      variantId: row.item.variantId,
      productName: row.item.productName,
      delta: -row.item.quantity,
      previousStock: row.sourceStock,
      newStock: sourceNew,
      reason: "transfer_out",
      referenceId: transferId,
      referenceLabel: `${transferLabel} → ${input.toBranchName}`,
      performedBy: input.createdBy,
      performedByName: input.createdByName ?? null,
      createdAt: serverTimestamp(),
    });

    tx.set(doc(collection(db, COLLECTIONS.inventoryLogs)), {
      branchId: input.toBranchId,
      branchName: input.toBranchName,
      productId: row.item.productId,
      variantId: row.item.variantId,
      productName: row.item.productName,
      delta: row.item.quantity,
      previousStock: row.destStock,
      newStock: destNew,
      reason: "transfer_in",
      referenceId: transferId,
      referenceLabel: `${transferLabel} ← ${input.fromBranchName}`,
      performedBy: input.createdBy,
      performedByName: input.createdByName ?? null,
      createdAt: serverTimestamp(),
    });
  }

  tx.set(transferRef, {
    fromBranchId: input.fromBranchId,
    fromBranchName: input.fromBranchName,
    toBranchId: input.toBranchId,
    toBranchName: input.toBranchName,
    items: input.items,
    notes: input.notes ?? null,
    createdBy: input.createdBy,
    createdByName: input.createdByName ?? null,
    createdAt: serverTimestamp(),
  });
}

export async function createBranchTransfer(
  input: CreateTransferInput
): Promise<string> {
  const db = getClientDb();
  const transferRef = doc(collection(db, COLLECTIONS.branchTransfers));

  await runTransaction(db, async (tx) => {
    await applyBranchTransferInTransaction(tx, db, transferRef, input);
  });

  return transferRef.id;
}

export async function getBranchTransfers(options?: {
  fromDate?: string | null;
  toDate?: string | null;
  max?: number;
}): Promise<BranchTransfer[]> {
  const ref = collection(
    getClientDb(),
    COLLECTIONS.branchTransfers
  ).withConverter(branchTransferConverter);
  const max = options?.max ?? 500;
  const from = options?.fromDate ? startOfLocalDay(options.fromDate) : null;
  const to = options?.toDate ? endOfLocalDay(options.toDate) : null;
  const constraints: QueryConstraint[] = [];
  if (from) constraints.push(where("createdAt", ">=", from));
  if (to) constraints.push(where("createdAt", "<=", to));
  constraints.push(orderBy("createdAt", "desc"), limit(max));

  try {
    const snapshot = await getDocs(query(ref, ...constraints));
    return snapshot.docs.map((d) => d.data());
  } catch (error) {
    console.warn("getBranchTransfers date query failed, using fallback", error);
    const snapshot = await getDocs(
      query(ref, orderBy("createdAt", "desc"), limit(Math.max(max * 5, 1000)))
    );
    let rows = snapshot.docs.map((d) => d.data());
    if (from || to) {
      rows = rows.filter((transfer) => {
        if (from && transfer.createdAt < from) return false;
        if (to && transfer.createdAt > to) return false;
        return true;
      });
    }
    return rows.slice(0, max);
  }
}
