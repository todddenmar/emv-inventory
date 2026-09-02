import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { paymentMethodConverter } from "@/lib/firestore/converters";
import {
  BUILT_IN_PAYMENT_METHODS,
  paymentMethodKeyFromName,
  sortPaymentMethods,
} from "@/lib/payment-methods";
import type { PaymentMethod } from "@/types";

function paymentMethodsRef(): CollectionReference<PaymentMethod> {
  return collection(getClientDb(), COLLECTIONS.paymentMethods).withConverter(
    paymentMethodConverter
  );
}

function methodDoc(key: string) {
  return doc(paymentMethodsRef(), key);
}

async function ensureBuiltInPaymentMethods(): Promise<void> {
  await Promise.all(
    BUILT_IN_PAYMENT_METHODS.map(async (method) => {
      const ref = methodDoc(method.key);
      const snap = await getDoc(ref);
      if (snap.exists()) return;
      await setDoc(ref, {
        id: method.key,
        key: method.key,
        name: method.name,
        shortLabel: method.shortLabel,
        isCash: method.isCash,
        isActive: true,
        isBuiltIn: true,
        needsPaymentAccount: method.needsPaymentAccount,
        accountType: method.accountType,
        position: method.position,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    })
  );
}

export async function getPaymentMethods(options?: {
  activeOnly?: boolean;
}): Promise<PaymentMethod[]> {
  try {
    await ensureBuiltInPaymentMethods();
  } catch (error) {
    console.error(error);
  }
  const snapshot = await getDocs(paymentMethodsRef());
  let rows = sortPaymentMethods(snapshot.docs.map((d) => d.data()));
  if (options?.activeOnly) {
    rows = rows.filter((row) => row.isActive);
  }
  return rows;
}

export async function createPaymentMethod(input: {
  name: string;
  shortLabel: string;
  isCash: boolean;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const shortLabel = input.shortLabel.trim().toUpperCase() || name.slice(0, 4).toUpperCase();
  const baseKey = paymentMethodKeyFromName(name);
  const existing = await getPaymentMethods();
  const taken = new Set(existing.map((row) => row.key));
  let key = baseKey;
  let n = 2;
  while (taken.has(key)) {
    key = `${baseKey}_${n}`;
    n += 1;
    if (n > 50) throw new Error("Could not create a unique payment key");
  }

  const position =
    existing.reduce((max, row) => Math.max(max, row.position), 0) + 1;

  await setDoc(methodDoc(key), {
    id: key,
    key,
    name,
    shortLabel,
    isCash: input.isCash,
    isActive: true,
    isBuiltIn: false,
    needsPaymentAccount: false,
    accountType: null,
    position,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return key;
}

export async function updatePaymentMethod(
  id: string,
  input: {
    name: string;
    shortLabel: string;
    isCash: boolean;
    isActive?: boolean;
  }
): Promise<void> {
  const existing = await getDoc(methodDoc(id));
  if (!existing.exists()) throw new Error("Payment method not found");
  const row = existing.data();
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const shortLabel =
    input.shortLabel.trim().toUpperCase() || name.slice(0, 4).toUpperCase();
  const isCash = row.key === "cash" ? true : input.isCash;

  await updateDoc(doc(getClientDb(), COLLECTIONS.paymentMethods, id), {
    name,
    shortLabel,
    isCash,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setPaymentMethodActive(
  id: string,
  isActive: boolean
): Promise<void> {
  const existing = await getDoc(methodDoc(id));
  if (!existing.exists()) throw new Error("Payment method not found");
  const row = existing.data();
  if (row.key === "cash" && !isActive) {
    throw new Error("Cash cannot be deactivated");
  }
  await updateDoc(doc(getClientDb(), COLLECTIONS.paymentMethods, id), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}
