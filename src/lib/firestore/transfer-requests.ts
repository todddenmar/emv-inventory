import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type CollectionReference,
  type Unsubscribe,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { transferRequestConverter } from "@/lib/firestore/converters";
import { applyBranchTransferInTransaction } from "@/lib/firestore/transfers";
import type { TransferRequest } from "@/types";

function requestsRef(): CollectionReference<TransferRequest> {
  return collection(getClientDb(), COLLECTIONS.transferRequests).withConverter(
    transferRequestConverter
  );
}

export interface CreateTransferRequestInput {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  quantity: number;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  notes?: string | null;
  requestedBy: string;
  requestedByName?: string | null;
  batchId?: string | null;
}

export async function createTransferRequest(
  input: CreateTransferRequestInput
): Promise<string> {
  if (input.fromBranchId === input.toBranchId) {
    throw new Error("Cannot request a transfer from your own branch");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantity must be greater than zero");
  }
  if (!input.variantId) {
    throw new Error("Variant is required");
  }

  const ref = await addDoc(collection(getClientDb(), COLLECTIONS.transferRequests), {
    batchId: input.batchId ?? null,
    productId: input.productId,
    productName: input.productName,
    variantId: input.variantId,
    variantLabel: input.variantLabel,
    quantity: Math.floor(input.quantity),
    fromBranchId: input.fromBranchId,
    fromBranchName: input.fromBranchName,
    toBranchId: input.toBranchId,
    toBranchName: input.toBranchName,
    status: "requested",
    notes: input.notes?.trim() || null,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName ?? null,
    requestedAt: serverTimestamp(),
    releasedBy: null,
    releasedByName: null,
    releasedAt: null,
    receivedBy: null,
    receivedByName: null,
    receivedAt: null,
    completedTransferId: null,
    cancelledBy: null,
    cancelledByName: null,
    cancelledAt: null,
    declinedBy: null,
    declinedByName: null,
    declinedAt: null,
  });
  return ref.id;
}

/** Create one request per cart line, all sharing a batchId so they can be handled together. */
export async function createTransferRequests(
  inputs: CreateTransferRequestInput[]
): Promise<string[]> {
  if (inputs.length === 0) {
    throw new Error("Add at least one item to request");
  }
  const batchId = doc(
    collection(getClientDb(), COLLECTIONS.transferRequests)
  ).id;
  const ids: string[] = [];
  for (const input of inputs) {
    ids.push(await createTransferRequest({ ...input, batchId }));
  }
  return ids;
}

export type TransferRequestGroup = {
  key: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  requestedByName: string | null;
  requestedAt: Date;
  rows: TransferRequest[];
};

/** Requests made before batchId existed: same requester + route within this window count as one group. */
const LEGACY_GROUP_WINDOW_MS = 2 * 60_000;

/**
 * Group requests by the cart submission they came from, split per source
 * branch (each source releases its own lines). Input order is preserved.
 */
export function groupTransferRequests(
  rows: TransferRequest[]
): TransferRequestGroup[] {
  const groups: TransferRequestGroup[] = [];
  const byKey = new Map<string, TransferRequestGroup>();
  const legacyAnchors = new Map<string, TransferRequestGroup[]>();

  for (const row of rows) {
    const route = `${row.fromBranchId}:${row.toBranchId}`;
    let group: TransferRequestGroup | undefined;

    if (row.batchId) {
      const key = `batch:${row.batchId}:${route}`;
      group = byKey.get(key);
      if (!group) {
        group = newGroup(key, row);
        byKey.set(key, group);
        groups.push(group);
      }
    } else {
      const legacyKey = `legacy:${row.requestedBy}:${route}`;
      const candidates = legacyAnchors.get(legacyKey) ?? [];
      group = candidates.find(
        (candidate) =>
          Math.abs(
            candidate.requestedAt.getTime() - row.requestedAt.getTime()
          ) <= LEGACY_GROUP_WINDOW_MS
      );
      if (!group) {
        group = newGroup(`${legacyKey}:${row.id}`, row);
        candidates.push(group);
        legacyAnchors.set(legacyKey, candidates);
        groups.push(group);
      }
    }

    group.rows.push(row);
  }

  return groups;
}

function newGroup(key: string, row: TransferRequest): TransferRequestGroup {
  return {
    key,
    fromBranchId: row.fromBranchId,
    fromBranchName: row.fromBranchName,
    toBranchId: row.toBranchId,
    toBranchName: row.toBranchName,
    requestedByName: row.requestedByName,
    requestedAt: row.requestedAt,
    rows: [],
  };
}

/** Update every request in `requestIds` that is currently `fromStatus`; others are skipped. */
async function transitionRequests(
  requestIds: string[],
  fromStatus: TransferRequest["status"],
  patch: Record<string, unknown>,
  emptyMessage: string
): Promise<number> {
  if (requestIds.length === 0) throw new Error(emptyMessage);
  const db = getClientDb();
  const refs = requestIds.map((id) =>
    doc(db, COLLECTIONS.transferRequests, id)
  );

  return runTransaction(db, async (tx) => {
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const eligible = snaps.filter(
      (snap) => snap.exists() && snap.data().status === fromStatus
    );
    if (eligible.length === 0) throw new Error(emptyMessage);
    for (const snap of eligible) tx.update(snap.ref, patch);
    return eligible.length;
  });
}

export async function releaseTransferRequests(input: {
  requestIds: string[];
  releasedBy: string;
  releasedByName?: string | null;
}): Promise<number> {
  return transitionRequests(
    input.requestIds,
    "requested",
    {
      status: "released",
      releasedBy: input.releasedBy,
      releasedByName: input.releasedByName ?? null,
      releasedAt: serverTimestamp(),
    },
    "No pending requests to release"
  );
}

export async function declineTransferRequests(input: {
  requestIds: string[];
  declinedBy: string;
  declinedByName?: string | null;
}): Promise<number> {
  return transitionRequests(
    input.requestIds,
    "requested",
    {
      status: "declined",
      declinedBy: input.declinedBy,
      declinedByName: input.declinedByName ?? null,
      declinedAt: serverTimestamp(),
    },
    "No pending requests to decline"
  );
}

/**
 * Receive every released request in the group as one branch transfer.
 * All requests must share the same source and destination branch.
 */
export async function receiveTransferRequests(input: {
  requestIds: string[];
  receivedBy: string;
  receivedByName?: string | null;
}): Promise<{ transferId: string; count: number }> {
  if (input.requestIds.length === 0) {
    throw new Error("No released requests to receive");
  }
  const db = getClientDb();
  const refs = input.requestIds.map((id) =>
    doc(db, COLLECTIONS.transferRequests, id)
  );
  const transferRef = doc(collection(db, COLLECTIONS.branchTransfers));

  const count = await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const released = snaps.filter(
      (snap) => snap.exists() && snap.data().status === "released"
    );
    if (released.length === 0) {
      throw new Error("No released requests to receive");
    }

    const first = released[0].data()!;
    const mixedRoute = released.some((snap) => {
      const data = snap.data()!;
      return (
        data.fromBranchId !== first.fromBranchId ||
        data.toBranchId !== first.toBranchId
      );
    });
    if (mixedRoute) {
      throw new Error("Requests in a group must share the same branches");
    }

    // Stock is read once per variant, so duplicate lines must be merged.
    const itemsByVariant = new Map<
      string,
      { productId: string; productName: string; variantId: string; quantity: number }
    >();
    for (const snap of released) {
      const data = snap.data()!;
      const existing = itemsByVariant.get(data.variantId);
      if (existing) {
        existing.quantity += data.quantity;
        continue;
      }
      itemsByVariant.set(data.variantId, {
        productId: data.productId,
        productName:
          data.variantLabel && data.variantLabel !== "Default"
            ? `${data.productName} — ${data.variantLabel}`
            : data.productName,
        variantId: data.variantId,
        quantity: data.quantity,
      });
    }

    await applyBranchTransferInTransaction(tx, db, transferRef, {
      fromBranchId: first.fromBranchId,
      fromBranchName: first.fromBranchName,
      toBranchId: first.toBranchId,
      toBranchName: first.toBranchName,
      items: [...itemsByVariant.values()],
      notes: `Transfer request group (${released.length} items)`,
      createdBy: input.receivedBy,
      createdByName: input.receivedByName ?? null,
    });

    for (const snap of released) {
      tx.update(snap.ref, {
        status: "completed",
        receivedBy: input.receivedBy,
        receivedByName: input.receivedByName ?? null,
        receivedAt: serverTimestamp(),
        completedTransferId: transferRef.id,
      });
    }
    return released.length;
  });

  return { transferId: transferRef.id, count };
}

async function fetchBranchSide(
  branchId: string,
  field: "fromBranchId" | "toBranchId"
): Promise<TransferRequest[]> {
  // Single-field equality only — no composite index required.
  const snapshot = await getDocs(
    query(requestsRef(), where(field, "==", branchId))
  );
  return snapshot.docs
    .map((d) => d.data())
    .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
}

/** Incoming + outgoing requests for a branch, newest first. */
export async function getTransferRequestsForBranch(
  branchId: string
): Promise<TransferRequest[]> {
  const [incoming, outgoing] = await Promise.all([
    fetchBranchSide(branchId, "fromBranchId"),
    fetchBranchSide(branchId, "toBranchId"),
  ]);
  const byId = new Map<string, TransferRequest>();
  for (const row of [...incoming, ...outgoing]) {
    byId.set(row.id, row);
  }
  return [...byId.values()].sort(
    (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime()
  );
}

/** Live updates for requests involving a branch (banner + pages). */
export function subscribeTransferRequestsForBranch(
  branchId: string,
  onData: (rows: TransferRequest[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const incomingQ = query(requestsRef(), where("fromBranchId", "==", branchId));
  const outgoingQ = query(requestsRef(), where("toBranchId", "==", branchId));

  let incoming: TransferRequest[] = [];
  let outgoing: TransferRequest[] = [];
  let incomingReady = false;
  let outgoingReady = false;

  const emit = () => {
    if (!incomingReady || !outgoingReady) return;
    const byId = new Map<string, TransferRequest>();
    for (const row of [...incoming, ...outgoing]) {
      byId.set(row.id, row);
    }
    onData(
      [...byId.values()].sort(
        (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime()
      )
    );
  };

  const unsubIn = onSnapshot(
    incomingQ,
    (snap) => {
      incoming = snap.docs.map((d) => d.data());
      incomingReady = true;
      emit();
    },
    (err) => onError?.(err)
  );
  const unsubOut = onSnapshot(
    outgoingQ,
    (snap) => {
      outgoing = snap.docs.map((d) => d.data());
      outgoingReady = true;
      emit();
    },
    (err) => onError?.(err)
  );

  return () => {
    unsubIn();
    unsubOut();
  };
}

export async function releaseTransferRequest(input: {
  requestId: string;
  releasedBy: string;
  releasedByName?: string | null;
}): Promise<void> {
  const db = getClientDb();
  const ref = doc(db, COLLECTIONS.transferRequests, input.requestId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Request not found");
    const data = snap.data();
    if (data.status !== "requested") {
      throw new Error("Only pending requests can be released");
    }
    tx.update(ref, {
      status: "released",
      releasedBy: input.releasedBy,
      releasedByName: input.releasedByName ?? null,
      releasedAt: serverTimestamp(),
    });
  });
}

export async function declineTransferRequest(input: {
  requestId: string;
  declinedBy: string;
  declinedByName?: string | null;
}): Promise<void> {
  const db = getClientDb();
  const ref = doc(db, COLLECTIONS.transferRequests, input.requestId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Request not found");
    const data = snap.data();
    if (data.status !== "requested") {
      throw new Error("Only pending requests can be declined");
    }
    tx.update(ref, {
      status: "declined",
      declinedBy: input.declinedBy,
      declinedByName: input.declinedByName ?? null,
      declinedAt: serverTimestamp(),
    });
  });
}

export async function cancelTransferRequest(input: {
  requestId: string;
  cancelledBy: string;
  cancelledByName?: string | null;
}): Promise<void> {
  const db = getClientDb();
  const ref = doc(db, COLLECTIONS.transferRequests, input.requestId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Request not found");
    const data = snap.data();
    if (data.status !== "requested") {
      throw new Error("Only pending requests can be cancelled");
    }
    tx.update(ref, {
      status: "cancelled",
      cancelledBy: input.cancelledBy,
      cancelledByName: input.cancelledByName ?? null,
      cancelledAt: serverTimestamp(),
    });
  });
}

/** Source branch undoes a release → back to requested. */
export async function undoReleaseTransferRequest(
  requestId: string
): Promise<void> {
  const db = getClientDb();
  const ref = doc(db, COLLECTIONS.transferRequests, requestId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Request not found");
    const data = snap.data();
    if (data.status !== "released") {
      throw new Error("Only released requests can be undone");
    }
    tx.update(ref, {
      status: "requested",
      releasedBy: null,
      releasedByName: null,
      releasedAt: null,
    });
  });
}

/** Source branch undoes a decline → back to requested. */
export async function undoDeclineTransferRequest(
  requestId: string
): Promise<void> {
  const db = getClientDb();
  const ref = doc(db, COLLECTIONS.transferRequests, requestId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Request not found");
    const data = snap.data();
    if (data.status !== "declined") {
      throw new Error("Only declined requests can be undone");
    }
    tx.update(ref, {
      status: "requested",
      declinedBy: null,
      declinedByName: null,
      declinedAt: null,
    });
  });
}

/** Mark received and move stock atomically (creates BranchTransfer). */
export async function receiveTransferRequest(input: {
  requestId: string;
  receivedBy: string;
  receivedByName?: string | null;
}): Promise<string> {
  const db = getClientDb();
  const requestRef = doc(db, COLLECTIONS.transferRequests, input.requestId);
  const transferRef = doc(collection(db, COLLECTIONS.branchTransfers));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists()) throw new Error("Request not found");
    const data = snap.data()!;
    if (data.status !== "released") {
      throw new Error("Request must be released before it can be received");
    }

    const productName =
      data.variantLabel && data.variantLabel !== "Default"
        ? `${data.productName} — ${data.variantLabel}`
        : data.productName;

    await applyBranchTransferInTransaction(tx, db, transferRef, {
      fromBranchId: data.fromBranchId,
      fromBranchName: data.fromBranchName,
      toBranchId: data.toBranchId,
      toBranchName: data.toBranchName,
      items: [
        {
          productId: data.productId,
          productName,
          variantId: data.variantId,
          quantity: data.quantity,
        },
      ],
      notes: data.notes ?? `Transfer request ${input.requestId.slice(-6).toUpperCase()}`,
      createdBy: input.receivedBy,
      createdByName: input.receivedByName ?? null,
    });

    tx.update(requestRef, {
      status: "completed",
      receivedBy: input.receivedBy,
      receivedByName: input.receivedByName ?? null,
      receivedAt: serverTimestamp(),
      completedTransferId: transferRef.id,
    });
  });

  return transferRef.id;
}
