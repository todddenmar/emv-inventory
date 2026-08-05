import {
  addDoc,
  collection,
  deleteDoc,
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
import { vendorConverter } from "@/lib/firestore/converters";
import type { Vendor } from "@/types";

function vendorsRef(): CollectionReference<Vendor> {
  return collection(getClientDb(), COLLECTIONS.vendors).withConverter(
    vendorConverter
  );
}

export async function getVendors(): Promise<Vendor[]> {
  const snapshot = await getDocs(query(vendorsRef(), orderBy("name")));
  return snapshot.docs.map((d) => d.data());
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const snap = await getDoc(doc(vendorsRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function createVendor(name: string): Promise<string> {
  const docRef = await addDoc(collection(getClientDb(), COLLECTIONS.vendors), {
    name: name.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateVendor(id: string, name: string): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.vendors, id), {
    name: name.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteVendor(id: string): Promise<void> {
  await deleteDoc(doc(getClientDb(), COLLECTIONS.vendors, id));
}
