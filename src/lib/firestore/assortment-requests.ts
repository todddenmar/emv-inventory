import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type CollectionReference,
  type Unsubscribe,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { assortmentRequestConverter } from "@/lib/firestore/converters";
import type { AssortmentRequest, AssortmentRequestStatus } from "@/types";

function requestsRef(): CollectionReference<AssortmentRequest> {
  return collection(getClientDb(), COLLECTIONS.assortmentRequests).withConverter(
    assortmentRequestConverter
  );
}

export interface CreateAssortmentRequestInput {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  sku?: string | null;
  requestedBranchId: string;
  requestedBranchName: string;
  requestedBy: string;
  requestedByName?: string | null;
}

export async function getPendingAssortmentRequestForVariant(
  variantId: string
): Promise<AssortmentRequest | null> {
  if (!variantId) return null;
  const snapshot = await getDocs(
    query(requestsRef(), where("variantId", "==", variantId))
  );
  return (
    snapshot.docs
      .map((docSnap) => docSnap.data())
      .find((row) => row.status === "requested") ?? null
  );
}

export async function createAssortmentRequest(
  input: CreateAssortmentRequestInput
): Promise<string> {
  if (!input.variantId) {
    throw new Error("Variant is required");
  }
  if (!input.productId) {
    throw new Error("Product is required");
  }
  if (!input.requestedBranchId) {
    throw new Error("Branch is required");
  }

  const pending = await getPendingAssortmentRequestForVariant(input.variantId);
  if (pending) {
    throw new Error("An assignment request is already pending for this variant");
  }

  const ref = await addDoc(collection(getClientDb(), COLLECTIONS.assortmentRequests), {
    productId: input.productId,
    productName: input.productName,
    variantId: input.variantId,
    variantLabel: input.variantLabel,
    sku: input.sku?.trim() || "",
    requestedBranchId: input.requestedBranchId,
    requestedBranchName: input.requestedBranchName,
    status: "requested",
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName ?? null,
    requestedAt: serverTimestamp(),
    assignedBy: null,
    assignedByName: null,
    assignedAt: null,
    assignedBranchIds: [],
    declinedBy: null,
    declinedByName: null,
    declinedAt: null,
    cancelledBy: null,
    cancelledByName: null,
    cancelledAt: null,
  });
  return ref.id;
}

export function subscribeAssortmentRequests(
  onData: (rows: AssortmentRequest[]) => void,
  onError?: (error: Error) => void,
  status?: AssortmentRequestStatus
): Unsubscribe {
  const q = query(requestsRef(), orderBy("requestedAt", "desc"));

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data());
      onData(status ? rows.filter((row) => row.status === status) : rows);
    },
    (err) => onError?.(err)
  );
}

export async function markAssortmentRequestAssigned(input: {
  requestId: string;
  assignedBy: string;
  assignedByName?: string | null;
  assignedBranchIds: string[];
}): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.assortmentRequests, input.requestId), {
    status: "assigned",
    assignedBy: input.assignedBy,
    assignedByName: input.assignedByName ?? null,
    assignedAt: serverTimestamp(),
    assignedBranchIds: input.assignedBranchIds,
  });
}

export async function declineAssortmentRequest(input: {
  requestId: string;
  declinedBy: string;
  declinedByName?: string | null;
}): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.assortmentRequests, input.requestId), {
    status: "declined",
    declinedBy: input.declinedBy,
    declinedByName: input.declinedByName ?? null,
    declinedAt: serverTimestamp(),
  });
}

export async function cancelAssortmentRequest(input: {
  requestId: string;
  cancelledBy: string;
  cancelledByName?: string | null;
}): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.assortmentRequests, input.requestId), {
    status: "cancelled",
    cancelledBy: input.cancelledBy,
    cancelledByName: input.cancelledByName ?? null,
    cancelledAt: serverTimestamp(),
  });
}
