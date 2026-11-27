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
import { consigneeConverter } from "@/lib/firestore/converters";
import type { Consignee } from "@/types";

function consigneesRef(): CollectionReference<Consignee> {
  return collection(getClientDb(), COLLECTIONS.consignees).withConverter(
    consigneeConverter
  );
}

export async function getConsignees(activeOnly = false): Promise<Consignee[]> {
  const snapshot = await getDocs(query(consigneesRef(), orderBy("name")));
  const rows = snapshot.docs.map((d) => d.data());
  return activeOnly ? rows.filter((row) => row.isActive) : rows;
}

export async function getConsignee(id: string): Promise<Consignee | null> {
  const snap = await getDoc(doc(consigneesRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function createConsignee(input: {
  name: string;
  mobile?: string | null;
  address?: string | null;
  notes?: string | null;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Consignee name is required");

  const docRef = await addDoc(collection(getClientDb(), COLLECTIONS.consignees), {
    name,
    mobile: input.mobile?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateConsignee(
  id: string,
  input: {
    name: string;
    mobile?: string | null;
    address?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Consignee name is required");

  await updateDoc(doc(getClientDb(), COLLECTIONS.consignees, id), {
    name,
    mobile: input.mobile?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    updatedAt: serverTimestamp(),
  });
}
