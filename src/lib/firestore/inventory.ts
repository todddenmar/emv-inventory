import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { branchInventoryConverter } from "@/lib/firestore/converters";
import type { BranchInventory, InventoryLogReason, Order } from "@/types";

export function inventoryDocId(branchId: string, productId: string): string {
  return `${branchId}_${productId}`;
}

function inventoryRef(branchId: string, productId: string) {
  return doc(
    getClientDb(),
    "branchInventory",
    inventoryDocId(branchId, productId)
  ).withConverter(branchInventoryConverter);
}

export interface StockChangeContext {
  branchId: string;
  productId: string;
  productName?: string | null;
  branchName?: string | null;
  reason: InventoryLogReason;
  referenceId?: string | null;
  referenceLabel?: string | null;
  performedBy: string;
  performedByName?: string | null;
}

export async function getBranchInventory(
  branchId: string
): Promise<BranchInventory[]> {
  const q = query(
    collection(getClientDb(), "branchInventory").withConverter(
      branchInventoryConverter
    ),
    where("branchId", "==", branchId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getAllBranchInventory(): Promise<BranchInventory[]> {
  const snapshot = await getDocs(
    collection(getClientDb(), "branchInventory").withConverter(
      branchInventoryConverter
    )
  );
  return snapshot.docs.map((d) => d.data());
}

export async function getBranchProductStock(
  branchId: string,
  productId: string
): Promise<BranchInventory | null> {
  const snap = await getDoc(inventoryRef(branchId, productId));
  return snap.exists() ? snap.data() : null;
}

async function applyStockDelta(
  delta: number,
  lowStockThreshold: number | undefined,
  ctx: StockChangeContext
): Promise<void> {
  if (delta === 0) return;

  const db = getClientDb();
  const invId = inventoryDocId(ctx.branchId, ctx.productId);
  const invRef = doc(db, "branchInventory", invId);
  const logRef = doc(collection(db, "inventoryLogs"));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(invRef);
    const previousStock = snap.exists() ? (snap.data()?.stock ?? 0) : 0;
    const threshold = snap.exists()
      ? (snap.data()?.lowStockThreshold ?? 5)
      : (lowStockThreshold ?? 5);
    const newStock = previousStock + delta;

    if (newStock < 0) {
      throw new Error("Insufficient stock");
    }

    if (snap.exists()) {
      tx.update(invRef, {
        stock: newStock,
        ...(lowStockThreshold !== undefined
          ? { lowStockThreshold }
          : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(invRef, {
        branchId: ctx.branchId,
        productId: ctx.productId,
        stock: newStock,
        lowStockThreshold: threshold,
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(logRef, {
      branchId: ctx.branchId,
      branchName: ctx.branchName ?? null,
      productId: ctx.productId,
      productName: ctx.productName ?? null,
      delta,
      previousStock,
      newStock,
      reason: ctx.reason,
      referenceId: ctx.referenceId ?? null,
      referenceLabel: ctx.referenceLabel ?? null,
      performedBy: ctx.performedBy,
      performedByName: ctx.performedByName ?? null,
      createdAt: serverTimestamp(),
    });
  });
}

export async function setBranchStockWithLog(
  branchId: string,
  productId: string,
  stock: number,
  lowStockThreshold: number,
  ctx: Omit<StockChangeContext, "branchId" | "productId" | "reason"> & {
    reason?: InventoryLogReason;
  }
): Promise<void> {
  const current = await getBranchProductStock(branchId, productId);
  const previousStock = current?.stock ?? 0;
  const delta = stock - previousStock;

  if (delta === 0 && current?.lowStockThreshold === lowStockThreshold) {
    return;
  }

  if (delta === 0) {
    const db = getClientDb();
    const invRef = doc(
      db,
      "branchInventory",
      inventoryDocId(branchId, productId)
    );
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(invRef);
      if (snap.exists()) {
        tx.update(invRef, {
          lowStockThreshold,
          updatedAt: serverTimestamp(),
        });
      }
    });
    return;
  }

  await applyStockDelta(delta, lowStockThreshold, {
    branchId,
    productId,
    reason: ctx.reason ?? "manual_adjustment",
    ...ctx,
  });
}

export async function decrementBranchStock(
  branchId: string,
  productId: string,
  quantity: number,
  ctx: Omit<StockChangeContext, "branchId" | "productId" | "reason"> & {
    reason?: InventoryLogReason;
  }
): Promise<void> {
  await applyStockDelta(-quantity, undefined, {
    branchId,
    productId,
    reason: ctx.reason ?? "order_sale",
    ...ctx,
  });
}

export async function incrementBranchStock(
  branchId: string,
  productId: string,
  quantity: number,
  ctx: Omit<StockChangeContext, "branchId" | "productId" | "reason"> & {
    reason?: InventoryLogReason;
  }
): Promise<void> {
  await applyStockDelta(quantity, undefined, {
    branchId,
    productId,
    reason: ctx.reason ?? "order_cancelled",
    ...ctx,
  });
}

export async function restockCancelledOrder(
  order: Order,
  performedBy: string,
  performedByName?: string | null,
  branchName?: string | null
): Promise<void> {
  if (!order.branchId) return;

  for (const item of order.items) {
    await incrementBranchStock(order.branchId, item.productId, item.quantity, {
      productName: item.name,
      branchName: branchName ?? null,
      referenceId: order.id,
      referenceLabel: `Order #${order.id.slice(-6).toUpperCase()} cancelled`,
      performedBy,
      performedByName,
      reason: "order_cancelled",
    });
  }
}

export function buildStockMap(
  inventory: BranchInventory[]
): Record<string, number> {
  return Object.fromEntries(inventory.map((i) => [i.productId, i.stock]));
}

/** @deprecated Use setBranchStockWithLog */
export async function upsertBranchStock(
  branchId: string,
  productId: string,
  stock: number,
  lowStockThreshold = 5
): Promise<void> {
  await setBranchStockWithLog(branchId, productId, stock, lowStockThreshold, {
    performedBy: "system",
    performedByName: "System",
  });
}
