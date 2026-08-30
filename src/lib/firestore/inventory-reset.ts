import {
  FieldValue,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/firestore/collections";

const BATCH_SIZE = 500;
const IN_QUERY_LIMIT = 30;

export type InventoryResetAction =
  | "inventory-logs"
  | "transfers"
  | "stock-levels"
  | "sales";

export type InventoryResetResult = {
  deleted: number;
  updated: number;
};

export const INVENTORY_RESET_ACTIONS: InventoryResetAction[] = [
  "inventory-logs",
  "transfers",
  "stock-levels",
  "sales",
];

export function isInventoryResetAction(
  value: unknown
): value is InventoryResetAction {
  return (
    value === "inventory-logs" ||
    value === "transfers" ||
    value === "stock-levels" ||
    value === "sales"
  );
}

export async function runInventoryReset(
  db: Firestore,
  action: InventoryResetAction,
  branchId: string | null
): Promise<InventoryResetResult> {
  if (action === "inventory-logs") {
    const deleted = await resetInventoryLogs(db, branchId);
    return { deleted, updated: 0 };
  }
  if (action === "transfers") {
    const deleted = await resetTransfers(db, branchId);
    return { deleted, updated: 0 };
  }
  if (action === "sales") {
    const deleted = await resetSales(db, branchId);
    return { deleted, updated: 0 };
  }
  const updated = await resetStockLevels(db, branchId);
  return { deleted: 0, updated };
}

async function deleteQueryInBatches(
  db: Firestore,
  query: Query
): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await query.limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

async function deleteAllInCollection(
  db: Firestore,
  collectionName: string
): Promise<number> {
  return deleteQueryInBatches(db, db.collection(collectionName));
}

async function deleteWhereEquals(
  db: Firestore,
  collectionName: string,
  field: string,
  value: string
): Promise<number> {
  return deleteQueryInBatches(
    db,
    db.collection(collectionName).where(field, "==", value)
  );
}

async function collectIdsWhereEquals(
  db: Firestore,
  collectionName: string,
  field: string,
  value: string
): Promise<string[]> {
  const ids: string[] = [];
  let last: QueryDocumentSnapshot | undefined;
  const col = db.collection(collectionName);
  while (true) {
    let query: Query = col.where(field, "==", value).limit(BATCH_SIZE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) ids.push(doc.id);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_SIZE) break;
  }
  return ids;
}

async function deleteByIds(
  db: Firestore,
  collectionName: string,
  ids: string[]
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of chunk) {
      batch.delete(db.collection(collectionName).doc(id));
    }
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function deleteLogsByReferenceIds(
  db: Firestore,
  referenceIds: string[]
): Promise<number> {
  if (referenceIds.length === 0) return 0;
  let deleted = 0;
  const logs = db.collection(COLLECTIONS.inventoryLogs);
  for (let i = 0; i < referenceIds.length; i += IN_QUERY_LIMIT) {
    const chunk = referenceIds.slice(i, i + IN_QUERY_LIMIT);
    deleted += await deleteQueryInBatches(
      db,
      logs.where("referenceId", "in", chunk)
    );
  }
  return deleted;
}

async function resetInventoryLogs(
  db: Firestore,
  branchId: string | null
): Promise<number> {
  if (!branchId) {
    return deleteAllInCollection(db, COLLECTIONS.inventoryLogs);
  }
  return deleteWhereEquals(
    db,
    COLLECTIONS.inventoryLogs,
    "branchId",
    branchId
  );
}

async function resetTransfers(
  db: Firestore,
  branchId: string | null
): Promise<number> {
  if (!branchId) {
    const transfers = await deleteAllInCollection(
      db,
      COLLECTIONS.branchTransfers
    );
    const requests = await deleteAllInCollection(
      db,
      COLLECTIONS.transferRequests
    );
    const outLogs = await deleteWhereEquals(
      db,
      COLLECTIONS.inventoryLogs,
      "reason",
      "transfer_out"
    );
    const inLogs = await deleteWhereEquals(
      db,
      COLLECTIONS.inventoryLogs,
      "reason",
      "transfer_in"
    );
    return transfers + requests + outLogs + inLogs;
  }

  const transferIds = [
    ...new Set([
      ...(await collectIdsWhereEquals(
        db,
        COLLECTIONS.branchTransfers,
        "fromBranchId",
        branchId
      )),
      ...(await collectIdsWhereEquals(
        db,
        COLLECTIONS.branchTransfers,
        "toBranchId",
        branchId
      )),
    ]),
  ];
  const requestIds = [
    ...new Set([
      ...(await collectIdsWhereEquals(
        db,
        COLLECTIONS.transferRequests,
        "fromBranchId",
        branchId
      )),
      ...(await collectIdsWhereEquals(
        db,
        COLLECTIONS.transferRequests,
        "toBranchId",
        branchId
      )),
    ]),
  ];

  const transfers = await deleteByIds(
    db,
    COLLECTIONS.branchTransfers,
    transferIds
  );
  const requests = await deleteByIds(
    db,
    COLLECTIONS.transferRequests,
    requestIds
  );
  const relatedLogs = await deleteLogsByReferenceIds(db, transferIds);

  return transfers + requests + relatedLogs;
}

async function resetSales(
  db: Firestore,
  branchId: string | null
): Promise<number> {
  if (!branchId) {
    const sales = await deleteAllInCollection(db, COLLECTIONS.posSales);
    const saleLogs = await deleteWhereEquals(
      db,
      COLLECTIONS.inventoryLogs,
      "reason",
      "pos_sale"
    );
    return sales + saleLogs;
  }

  const saleIds = await collectIdsWhereEquals(
    db,
    COLLECTIONS.posSales,
    "branchId",
    branchId
  );
  const sales = await deleteByIds(db, COLLECTIONS.posSales, saleIds);
  const relatedLogs = await deleteLogsByReferenceIds(db, saleIds);
  return sales + relatedLogs;
}

async function resetStockLevels(
  db: Firestore,
  branchId: string | null
): Promise<number> {
  let updated = 0;
  let last: QueryDocumentSnapshot | undefined;
  const col = db.collection(COLLECTIONS.branchInventory);

  while (true) {
    let query: Query = branchId
      ? col.where("branchId", "==", branchId)
      : col;
    query = query.limit(BATCH_SIZE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, {
        stock: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    updated += snap.size;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_SIZE) break;
  }

  return updated;
}
