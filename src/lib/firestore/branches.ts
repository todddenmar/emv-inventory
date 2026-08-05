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
  where,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { branchConverter } from "@/lib/firestore/converters";
import type { Branch } from "@/types";

function branchesRef(): CollectionReference<Branch> {
  return collection(getClientDb(), COLLECTIONS.branches).withConverter(
    branchConverter
  );
}

export async function getBranches(activeOnly = false): Promise<Branch[]> {
  const ref = branchesRef();
  const q = activeOnly
    ? query(ref, where("isActive", "==", true), orderBy("name"))
    : query(ref, orderBy("name"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getBranch(id: string): Promise<Branch | null> {
  const snap = await getDoc(doc(branchesRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function createBranch(
  data: Omit<Branch, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const docRef = await addDoc(collection(getClientDb(), COLLECTIONS.branches), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateBranch(
  id: string,
  data: Partial<Omit<Branch, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.branches, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function assignBranchManager(
  branchId: string,
  managerId: string | null,
  managerName: string | null
): Promise<void> {
  await updateBranch(branchId, { managerId, managerName });
}
