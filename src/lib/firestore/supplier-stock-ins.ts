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
import { supplierStockInConverter } from "@/lib/firestore/converters";
import { inventoryDocId } from "@/lib/firestore/inventory";
import type { SupplierStockIn, SupplierStockInItem } from "@/types";

export interface CompleteSupplierStockInInput {
  branchId: string;
  branchName: string;
  vendorId: string;
  vendorName: string;
  items: SupplierStockInItem[];
  notes?: string | null;
  createdBy: string;
  createdByName?: string | null;
}

export async function completeSupplierStockIn(
  input: CompleteSupplierStockInInput
): Promise<string> {
  if (!input.branchId) {
    throw new Error("Select a branch");
  }
  if (!input.vendorId) {
    throw new Error("Select a supplier");
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
  const stockInRef = doc(collection(db, COLLECTIONS.supplierStockIns));
  const stockInId = stockInRef.id;
  const label = `Stock in ${stockInId.slice(-6).toUpperCase()} ← ${input.vendorName}`;
  const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);

  await runTransaction(db, async (tx) => {
    const rows: Array<{
      item: SupplierStockInItem;
      invRef: ReturnType<typeof doc>;
      previousStock: number;
      newStock: number;
      exists: boolean;
      threshold: number;
    }> = [];

    for (const item of input.items) {
      const invRef = doc(
        db,
        COLLECTIONS.branchInventory,
        inventoryDocId(input.branchId, item.variantId)
      );
      const snap = await tx.get(invRef);
      const previousStock = snap.exists()
        ? ((snap.data() as { stock?: number })?.stock ?? 0)
        : 0;
      const threshold = snap.exists()
        ? ((snap.data() as { lowStockThreshold?: number })?.lowStockThreshold ??
          5)
        : 5;

      rows.push({
        item,
        invRef,
        previousStock,
        newStock: previousStock + item.quantity,
        exists: snap.exists(),
        threshold,
      });
    }

    for (const row of rows) {
      if (row.exists) {
        tx.update(row.invRef, {
          stock: row.newStock,
          isSelling: true,
          productId: row.item.productId,
          variantId: row.item.variantId,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(row.invRef, {
          branchId: input.branchId,
          productId: row.item.productId,
          variantId: row.item.variantId,
          stock: row.newStock,
          lowStockThreshold: row.threshold,
          isSelling: true,
          cashPrice: null,
          retailPrice: null,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(doc(collection(db, COLLECTIONS.inventoryLogs)), {
        branchId: input.branchId,
        branchName: input.branchName,
        productId: row.item.productId,
        variantId: row.item.variantId,
        productName: row.item.productName,
        delta: row.item.quantity,
        previousStock: row.previousStock,
        newStock: row.newStock,
        reason: "supplier_stock_in",
        referenceId: stockInId,
        referenceLabel: label,
        performedBy: input.createdBy,
        performedByName: input.createdByName ?? null,
        createdAt: serverTimestamp(),
      });
    }

    tx.set(stockInRef, {
      branchId: input.branchId,
      branchName: input.branchName,
      vendorId: input.vendorId,
      vendorName: input.vendorName,
      items: input.items,
      itemCount,
      notes: input.notes ?? null,
      createdBy: input.createdBy,
      createdByName: input.createdByName ?? null,
      createdAt: serverTimestamp(),
    });
  });

  return stockInId;
}

export async function getSupplierStockIns(options?: {
  branchId?: string | null;
  max?: number;
}): Promise<SupplierStockIn[]> {
  const ref = collection(
    getClientDb(),
    COLLECTIONS.supplierStockIns
  ).withConverter(supplierStockInConverter);
  const max = options?.max ?? 50;

  try {
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
  } catch {
    const snapshot = await getDocs(
      query(ref, orderBy("createdAt", "desc"), limit(Math.max(max * 4, 100)))
    );
    const rows = snapshot.docs.map((d) => d.data());
    if (!options?.branchId) return rows.slice(0, max);
    return rows
      .filter((row) => row.branchId === options.branchId)
      .slice(0, max);
  }
}
