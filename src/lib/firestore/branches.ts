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
import {
  cachedRead,
  invalidateReadCache,
  READ_CACHE_TTL,
} from "@/lib/firestore/read-cache";
import type { Branch } from "@/types";

function branchesRef(): CollectionReference<Branch> {
  return collection(getClientDb(), COLLECTIONS.branches).withConverter(
    branchConverter
  );
}

export async function getBranches(activeOnly = false): Promise<Branch[]> {
  return cachedRead(
    `branches:${activeOnly ? "1" : "0"}`,
    READ_CACHE_TTL.branches,
    async () => {
      const ref = branchesRef();
      try {
        const q = activeOnly
          ? query(ref, where("isActive", "==", true), orderBy("name"))
          : query(ref, orderBy("name"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => d.data());
      } catch (error) {
        console.warn("getBranches indexed query failed, using fallback", error);
        const snapshot = await getDocs(query(ref, orderBy("name")));
        const rows = snapshot.docs.map((d) => d.data());
        return activeOnly ? rows.filter((b) => b.isActive) : rows;
      }
    }
  );
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
  invalidateReadCache("branches");
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
  invalidateReadCache("branches");
}

export async function assignBranchManager(
  branchId: string,
  managerId: string | null,
  managerName: string | null
): Promise<void> {
  await updateBranch(branchId, { managerId, managerName });
}

/** Soft-hide a branch from pickers and operational lists (`isActive: false`). */
export async function archiveBranch(id: string): Promise<void> {
  const existing = await getBranch(id);
  if (!existing) {
    throw new Error("Branch not found");
  }
  if (!existing.isActive) {
    return;
  }
  await updateBranch(id, { isActive: false });
}

/** Restore an archived branch so it appears in branch selection fields again. */
export async function restoreBranch(id: string): Promise<void> {
  const existing = await getBranch(id);
  if (!existing) {
    throw new Error("Branch not found");
  }
  if (existing.isActive) {
    return;
  }
  await updateBranch(id, { isActive: true });
}
