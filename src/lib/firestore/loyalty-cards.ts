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
import { loyaltyCardConverter } from "@/lib/firestore/converters";
import type { LoyaltyCard } from "@/types";

export type LoyaltyCardInput = {
  name: string;
  birthDate?: string | null;
  address?: string | null;
  contact?: string | null;
  emergencyContactName?: string | null;
  emergencyContactNumber?: string | null;
  familyInfo?: string | null;
  email?: string | null;
  isActive?: boolean;
};

function loyaltyCardsRef(): CollectionReference<LoyaltyCard> {
  return collection(getClientDb(), COLLECTIONS.loyaltyCards).withConverter(
    loyaltyCardConverter
  );
}

function normalizeBirthDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || "";
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Birth date must be a valid date");
  }
  return trimmed;
}

function normalizePayload(input: LoyaltyCardInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  return {
    name,
    birthDate: normalizeBirthDate(input.birthDate),
    address: input.address?.trim() || null,
    contact: input.contact?.trim() || null,
    emergencyContactName: input.emergencyContactName?.trim() || null,
    emergencyContactNumber: input.emergencyContactNumber?.trim() || null,
    familyInfo: input.familyInfo?.trim() || null,
    email: input.email?.trim() || null,
  };
}

/** Ordered by name descending (Z→A). */
export async function getLoyaltyCards(
  activeOnly = false
): Promise<LoyaltyCard[]> {
  const snapshot = await getDocs(
    query(loyaltyCardsRef(), orderBy("name", "desc"))
  );
  const rows = snapshot.docs.map((d) => d.data());
  return activeOnly ? rows.filter((card) => card.isActive) : rows;
}

export async function getLoyaltyCard(id: string): Promise<LoyaltyCard | null> {
  const snap = await getDoc(doc(loyaltyCardsRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function createLoyaltyCard(
  input: LoyaltyCardInput
): Promise<string> {
  const payload = normalizePayload(input);
  const docRef = await addDoc(
    collection(getClientDb(), COLLECTIONS.loyaltyCards),
    {
      ...payload,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
  return docRef.id;
}

export async function updateLoyaltyCard(
  id: string,
  input: LoyaltyCardInput
): Promise<void> {
  const payload = normalizePayload(input);
  await updateDoc(doc(getClientDb(), COLLECTIONS.loyaltyCards, id), {
    ...payload,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setLoyaltyCardActive(
  id: string,
  isActive: boolean
): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.loyaltyCards, id), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}
