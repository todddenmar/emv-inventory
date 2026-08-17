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

export type InviteRole = Invite["role"];

function invitesRef(): CollectionReference<Invite> {
  return collection(getClientDb(), "invites").withConverter(inviteConverter);
}

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function normalizeInviteRole(role: unknown): InviteRole {
  if (role === "admin") return "admin";
  if (role === "cashier") return "cashier";
  return "manager";
}

export async function createInvite(input: {
  createdBy: string;
  createdByName: string;
  email: string | null;
  role: InviteRole;
  branchId: string | null;
  branchName: string | null;
}): Promise<Invite> {
  const role = normalizeInviteRole(input.role);
  if ((role === "manager" || role === "cashier") && !input.branchId) {
    throw new Error(
      role === "cashier"
        ? "Cashiers must be assigned to a branch"
        : "Managers must be assigned to a branch"
    );
  }

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const needsBranch = role === "manager" || role === "cashier";
  const branchId = needsBranch ? input.branchId : null;
  const branchName = needsBranch ? input.branchName : null;

  const docRef = await addDoc(collection(getClientDb(), "invites"), {
    token,
    email: input.email,
    role,
    branchId,
    branchName,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    expiresAt,
    usedAt: null,
    usedBy: null,
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    token,
    email: input.email,
    role,
    branchId,
    branchName,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
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
    query(
      collection(getClientDb(), "invites"),
      where("role", "in", ["manager", "admin", "cashier"])
    )
  );
  return snapshot.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        token: data.token,
        email: data.email ?? null,
        role: normalizeInviteRole(data.role),
        branchId: data.branchId ?? null,
        branchName: data.branchName ?? null,
        createdBy: data.createdBy,
        createdByName: data.createdByName,
        expiresAt: data.expiresAt?.toDate?.() ?? new Date(data.expiresAt),
        usedAt: data.usedAt
          ? (data.usedAt?.toDate?.() ?? new Date(data.usedAt))
          : null,
        usedBy: data.usedBy ?? null,
        createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
      } satisfies Invite;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
