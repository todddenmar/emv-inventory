import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { inviteConverter } from "@/lib/firestore/converters";
import type { Invite } from "@/types";

function invitesRef(): CollectionReference<Invite> {
  return collection(getClientDb(), "invites").withConverter(inviteConverter);
}

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function createInvite(
  createdBy: string,
  createdByName: string,
  email: string | null,
  branchId: string | null,
  branchName: string | null
): Promise<Invite> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const docRef = await addDoc(collection(getClientDb(), "invites"), {
    token,
    email,
    role: "manager",
    branchId,
    branchName,
    createdBy,
    createdByName,
    expiresAt,
    usedAt: null,
    usedBy: null,
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    token,
    email,
    role: "manager",
    branchId,
    branchName,
    createdBy,
    createdByName,
    expiresAt,
    usedAt: null,
    usedBy: null,
    createdAt: new Date(),
  };
}

export async function getInviteByToken(
  token: string
): Promise<Invite | null> {
  const q = query(invitesRef(), where("token", "==", token));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

export async function getInvites(): Promise<Invite[]> {
  const snapshot = await getDocs(
    query(collection(getClientDb(), "invites"), where("role", "==", "manager"))
  );
  return snapshot.docs.map((d) => ({
    id: d.id,
    token: d.data().token,
    email: d.data().email ?? null,
    role: d.data().role,
    branchId: d.data().branchId ?? null,
    branchName: d.data().branchName ?? null,
    createdBy: d.data().createdBy,
    createdByName: d.data().createdByName,
    expiresAt: d.data().expiresAt?.toDate?.() ?? new Date(d.data().expiresAt),
    usedAt: d.data().usedAt
      ? d.data().usedAt?.toDate?.() ?? new Date(d.data().usedAt)
      : null,
    usedBy: d.data().usedBy ?? null,
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(d.data().createdAt),
  }));
}

export async function acceptInvite(
  inviteId: string,
  userId: string
): Promise<void> {
  await updateDoc(doc(getClientDb(), "invites", inviteId), {
    usedAt: serverTimestamp(),
    usedBy: userId,
  });
}

export function isInviteValid(invite: Invite): boolean {
  if (invite.usedAt) return false;
  return invite.expiresAt > new Date();
}
