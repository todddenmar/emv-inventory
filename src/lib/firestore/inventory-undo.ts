import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { inventoryDocId } from "@/lib/firestore/inventory";
import { inventoryLogReasonLabel } from "@/lib/firestore/inventory-logs";
import { defaultVariantId } from "@/lib/product-variants";
import type { InventoryLogReason } from "@/types";

export interface UndoActor {
  uid: string;
  name: string | null;
}

interface RawLog {
  branchId: string;
  branchName?: string | null;
  productId: string;
  variantId?: string | null;
  productName?: string | null;
  delta: number;
  reason: InventoryLogReason;
  referenceId?: string | null;
  referenceLabel?: string | null;
  undoneAt?: unknown;
}

function logVariantId(log: RawLog): string {
  return log.variantId ?? defaultVariantId(log.productId);
}

function undoLabel(log: RawLog): string {
  const base = inventoryLogReasonLabel(log.reason);
  return log.referenceLabel ? `Undo · ${log.referenceLabel}` : `Undo · ${base}`;
}

/** Reverses one manual adjustment: opposite delta + "undo" log; original is stamped undone. */
export async function undoManualAdjustment(
  logId: string,
  actor: UndoActor
): Promise<void> {
  const db = getClientDb();
  const logRef = doc(db, COLLECTIONS.inventoryLogs, logId);
  const undoRef = doc(collection(db, COLLECTIONS.inventoryLogs));

  await runTransaction(db, async (tx) => {
    const logSnap = await tx.get(logRef);
    if (!logSnap.exists()) throw new Error("Movement not found");
    const log = logSnap.data() as RawLog;
    if (log.reason !== "manual_adjustment") {
      throw new Error("Only manual adjustments can be undone here");
    }
    if (log.undoneAt) throw new Error("This movement was already undone");

    const variantId = logVariantId(log);
    const invRef = doc(
      db,
      COLLECTIONS.branchInventory,
      inventoryDocId(log.branchId, variantId)
    );
    const invSnap = await tx.get(invRef);
    const previousStock = invSnap.exists()
      ? Number((invSnap.data() as { stock?: number }).stock ?? 0)
      : 0;
    const delta = -Number(log.delta || 0);
    const newStock = previousStock + delta;
    if (newStock < 0) {
      throw new Error(
        `Not enough stock to undo: ${log.productName ?? "item"} has ${previousStock}, needs ${-delta}`
      );
    }

    if (invSnap.exists()) {
      tx.update(invRef, { stock: newStock, updatedAt: serverTimestamp() });
    } else {
      tx.set(invRef, {
        branchId: log.branchId,
        productId: log.productId,
        variantId,
        stock: newStock,
        lowStockThreshold: 5,
        isSelling: true,
        cashPrice: null,
        retailPrice: null,
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(undoRef, {
      branchId: log.branchId,
      branchName: log.branchName ?? null,
      productId: log.productId,
      variantId,
      productName: log.productName ?? null,
      delta,
      previousStock,
      newStock,
      reason: "undo" satisfies InventoryLogReason,
      referenceId: logId,
      referenceLabel: undoLabel(log),
      undoOfLogId: logId,
      performedBy: actor.uid,
      performedByName: actor.name,
      createdAt: serverTimestamp(),
    });

    tx.update(logRef, {
      undoneAt: serverTimestamp(),
      undoneBy: actor.uid,
      undoneByName: actor.name,
      undoLogId: undoRef.id,
    });
  });
}

/** Reverses a whole supplier stock-in receipt (every variant line) in one transaction. */
export async function undoSupplierStockIn(
  stockInId: string,
  actor: UndoActor
): Promise<number> {
  const db = getClientDb();
  const logsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.inventoryLogs),
      where("referenceId", "==", stockInId)
    )
  );
  const logRefs = logsSnap.docs
    .filter((d) => (d.data() as RawLog).reason === "supplier_stock_in")
    .map((d) => d.ref);
  if (logRefs.length === 0) {
    throw new Error("No stock movements found for this stock-in");
  }
  const stockInRef = doc(db, COLLECTIONS.supplierStockIns, stockInId);

  await runTransaction(db, async (tx) => {
    const logs: Array<{ ref: DocumentReference; data: RawLog }> = [];
    for (const ref of logRefs) {
      const snap = await tx.get(ref);
      if (!snap.exists()) continue;
      const data = snap.data() as RawLog;
      if (data.undoneAt) {
        throw new Error("This stock-in was already undone");
      }
      logs.push({ ref, data });
    }

    const stockInSnap = await tx.get(stockInRef);
    if (
      stockInSnap.exists() &&
      (stockInSnap.data() as { undoneAt?: unknown }).undoneAt
    ) {
      throw new Error("This stock-in was already undone");
    }

    const invByVariant = new Map<
      string,
      {
        ref: DocumentReference;
        exists: boolean;
        stock: number;
        productName: string | null;
      }
    >();
    for (const { data } of logs) {
      const variantId = logVariantId(data);
      if (invByVariant.has(variantId)) continue;
      const ref = doc(
        db,
        COLLECTIONS.branchInventory,
        inventoryDocId(data.branchId, variantId)
      );
      const snap = await tx.get(ref);
      invByVariant.set(variantId, {
        ref,
        exists: snap.exists(),
        stock: snap.exists()
          ? Number((snap.data() as { stock?: number }).stock ?? 0)
          : 0,
        productName: data.productName ?? null,
      });
    }

    const needed = new Map<string, number>();
    for (const { data } of logs) {
      const variantId = logVariantId(data);
      needed.set(variantId, (needed.get(variantId) ?? 0) + Number(data.delta || 0));
    }
    for (const [variantId, qty] of needed) {
      const inv = invByVariant.get(variantId)!;
      if (inv.stock - qty < 0) {
        throw new Error(
          `Not enough stock to undo: ${inv.productName ?? "item"} has ${inv.stock}, needs ${qty}`
        );
      }
    }

    for (const { ref, data } of logs) {
      const variantId = logVariantId(data);
      const inv = invByVariant.get(variantId)!;
      const delta = -Number(data.delta || 0);
      const previousStock = inv.stock;
      const newStock = previousStock + delta;
      inv.stock = newStock;

      const undoRef = doc(collection(db, COLLECTIONS.inventoryLogs));
      tx.set(undoRef, {
        branchId: data.branchId,
        branchName: data.branchName ?? null,
        productId: data.productId,
        variantId,
        productName: data.productName ?? null,
        delta,
        previousStock,
        newStock,
        reason: "undo" satisfies InventoryLogReason,
        referenceId: ref.id,
        referenceLabel: undoLabel(data),
        undoOfLogId: ref.id,
        performedBy: actor.uid,
        performedByName: actor.name,
        createdAt: serverTimestamp(),
      });
      tx.update(ref, {
        undoneAt: serverTimestamp(),
        undoneBy: actor.uid,
        undoneByName: actor.name,
        undoLogId: undoRef.id,
      });
    }

    for (const inv of invByVariant.values()) {
      if (inv.exists) {
        tx.update(inv.ref, { stock: inv.stock, updatedAt: serverTimestamp() });
      }
    }

    if (stockInSnap.exists()) {
      tx.update(stockInRef, {
        undoneAt: serverTimestamp(),
        undoneBy: actor.uid,
        undoneByName: actor.name,
      });
    }
  });

  return logRefs.length;
}
