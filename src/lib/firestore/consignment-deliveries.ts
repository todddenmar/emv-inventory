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
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { consignmentDeliveryConverter } from "@/lib/firestore/converters";
import { inventoryDocId } from "@/lib/firestore/inventory";
import { endOfLocalDay, startOfLocalDay } from "@/lib/dates";
import type { ConsignmentDelivery, ConsignmentDeliveryItem } from "@/types";

export interface CompleteConsignmentDeliveryInput {
  branchId: string;
  branchName: string;
  consigneeId: string;
  consigneeName: string;
  consigneeMobile?: string | null;
  consigneeAddress?: string | null;
  referenceNumber?: string | null;
  items: ConsignmentDeliveryItem[];
  notes?: string | null;
  createdBy: string;
  createdByName?: string | null;
}

function formatConsignmentDrNumber(id: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `DR-${y}${m}${d}-${id.slice(-4).toUpperCase()}`;
}

export async function completeConsignmentDelivery(
  input: CompleteConsignmentDeliveryInput
): Promise<string> {
  if (!input.branchId) {
    throw new Error("Select a branch");
  }
  if (!input.consigneeId) {
    throw new Error("Select a consignee");
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
    if (!item.unit.trim()) {
      throw new Error(`Enter a unit for ${item.productName}`);
    }
  }

  const db = getClientDb();
  const deliveryRef = doc(collection(db, COLLECTIONS.consignmentDeliveries));
  const deliveryId = deliveryRef.id;
  const drNumber = formatConsignmentDrNumber(deliveryId, new Date());
  const consigneeName = input.consigneeName.trim();
  const label = `Consignment ${drNumber} → ${consigneeName}`;
  const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const items = input.items.map((item) => ({
    ...item,
    unit: item.unit.trim() || "pcs",
  }));

  await runTransaction(db, async (tx) => {
    const rows: Array<{
      item: ConsignmentDeliveryItem;
      invRef: ReturnType<typeof doc>;
      previousStock: number;
      newStock: number;
    }> = [];

    for (const item of items) {
      const invRef = doc(
        db,
        COLLECTIONS.branchInventory,
        inventoryDocId(input.branchId, item.variantId)
      );
      const snap = await tx.get(invRef);
      if (!snap.exists()) {
        throw new Error(`No stock record for ${item.productName}`);
      }
      const previousStock = (snap.data() as { stock?: number })?.stock ?? 0;
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
        reason: "consignment_out",
        referenceId: deliveryId,
        referenceLabel: label,
        performedBy: input.createdBy,
        performedByName: input.createdByName ?? null,
        createdAt: serverTimestamp(),
      });
    }

    tx.set(deliveryRef, {
      drNumber,
      branchId: input.branchId,
      branchName: input.branchName,
      consigneeId: input.consigneeId,
      consigneeName,
      consigneeMobile: input.consigneeMobile?.trim() || null,
      consigneeAddress: input.consigneeAddress?.trim() || null,
      referenceNumber: input.referenceNumber?.trim() || null,
      items,
      itemCount,
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy,
      createdByName: input.createdByName ?? null,
      createdAt: serverTimestamp(),
    });
  });

  return deliveryId;
}

export async function getConsignmentDeliveries(options?: {
  fromDate?: string | null;
  toDate?: string | null;
  max?: number;
}): Promise<ConsignmentDelivery[]> {
  const ref = collection(
    getClientDb(),
    COLLECTIONS.consignmentDeliveries
  ).withConverter(consignmentDeliveryConverter);
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
    console.warn(
      "getConsignmentDeliveries date query failed, using fallback",
      error
    );
    const snapshot = await getDocs(
      query(ref, orderBy("createdAt", "desc"), limit(Math.max(max * 5, 1000)))
    );
    let rows = snapshot.docs.map((d) => d.data());
    if (from || to) {
      rows = rows.filter((delivery) => {
        if (from && delivery.createdAt < from) return false;
        if (to && delivery.createdAt > to) return false;
        return true;
      });
    }
    return rows.slice(0, max);
  }
}
