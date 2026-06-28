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
  writeBatch,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { branchConverter } from "@/lib/firestore/converters";
import type { Branch } from "@/types";

function branchesRef(): CollectionReference<Branch> {
  return collection(getClientDb(), "branches").withConverter(branchConverter);
}

export async function getBranches(activeOnly = false): Promise<Branch[]> {
  const ref = branchesRef();
  const q = activeOnly
    ? query(ref, where("isActive", "==", true), orderBy("name"))
    : query(ref, orderBy("name"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

/** Active branches for public footer / store locator */
export async function getPublicBranches(): Promise<Branch[]> {
  return getBranches(true);
}

export async function getBranch(id: string): Promise<Branch | null> {
  const snap = await getDoc(doc(branchesRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function getOnlineShopBranch(): Promise<Branch | null> {
  const q = query(
    branchesRef(),
    where("isOnlineShop", "==", true),
    where("isActive", "==", true)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

export async function createBranch(
  data: Omit<Branch, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const docRef = await addDoc(collection(getClientDb(), "branches"), {
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
  if (data.isOnlineShop) {
    const all = await getBranches();
    const batch = writeBatch(getClientDb());
    for (const branch of all) {
      if (branch.id !== id && branch.isOnlineShop) {
        batch.update(doc(getClientDb(), "branches", branch.id), {
          isOnlineShop: false,
          updatedAt: serverTimestamp(),
        });
      }
    }
    batch.update(doc(getClientDb(), "branches", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return;
  }

  await updateDoc(doc(getClientDb(), "branches", id), {
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
