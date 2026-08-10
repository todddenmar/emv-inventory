import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { resellerConverter } from "@/lib/firestore/converters";
import type { Reseller } from "@/types";

function resellersRef(): CollectionReference<Reseller> {
  return collection(getClientDb(), COLLECTIONS.resellers).withConverter(
    resellerConverter
  );
}

export async function getResellers(activeOnly = false): Promise<Reseller[]> {
  const snapshot = await getDocs(query(resellersRef(), orderBy("name")));
  const rows = snapshot.docs.map((d) => d.data());
  return activeOnly ? rows.filter((r) => r.isActive) : rows;
}

export async function getReseller(id: string): Promise<Reseller | null> {
  const snap = await getDoc(doc(resellersRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function createReseller(input: {
  name: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Reseller name is required");

  const docRef = await addDoc(collection(getClientDb(), COLLECTIONS.resellers), {
    name,
    mobile: input.mobile?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateReseller(
  id: string,
  input: {
    name: string;
    mobile?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Reseller name is required");

  await updateDoc(doc(getClientDb(), COLLECTIONS.resellers, id), {
    name,
    mobile: input.mobile?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setResellerActive(
  id: string,
  isActive: boolean
): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.resellers, id), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

export async function searchResellers(queryText: string): Promise<Reseller[]> {
  const q = queryText.trim().toLowerCase();
  const all = await getResellers(true);
  if (!q) return all;
  return all.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      (r.mobile?.toLowerCase().includes(q) ?? false) ||
      (r.email?.toLowerCase().includes(q) ?? false)
  );
}

/** Soft-disable only — hard delete reserved for elevated admins if needed. */
export async function deactivateReseller(id: string): Promise<void> {
  await setResellerActive(id, false);
}
