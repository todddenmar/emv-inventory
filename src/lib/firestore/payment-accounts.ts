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
import { paymentAccountConverter } from "@/lib/firestore/converters";
import type { PaymentAccount, PaymentAccountType } from "@/types";

function paymentAccountsRef(): CollectionReference<PaymentAccount> {
  return collection(getClientDb(), COLLECTIONS.paymentAccounts).withConverter(
    paymentAccountConverter
  );
}

export function paymentAccountTypeLabel(type: PaymentAccountType): string {
  return type === "bank_transfer" ? "Bank transfer" : "E-wallet";
}

export async function getPaymentAccounts(
  activeOnly = false,
  type?: PaymentAccountType | null
): Promise<PaymentAccount[]> {
  const snapshot = await getDocs(
    query(paymentAccountsRef(), orderBy("provider"))
  );
  let rows = snapshot.docs.map((d) => d.data());
  if (type) {
    rows = rows.filter((a) => a.type === type);
  }
  if (activeOnly) {
    rows = rows.filter((a) => a.isActive);
  }
  return rows;
}

export async function getPaymentAccount(
  id: string
): Promise<PaymentAccount | null> {
  const snap = await getDoc(doc(paymentAccountsRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function createPaymentAccount(input: {
  type: PaymentAccountType;
  provider: string;
  accountName: string;
  accountNumber: string;
}): Promise<string> {
  const provider = input.provider.trim();
  const accountName = input.accountName.trim();
  const accountNumber = input.accountNumber.trim();
  if (!provider) throw new Error("Provider is required");
  if (!accountName) throw new Error("Account name is required");
  if (!accountNumber) throw new Error("Account number is required");

  const docRef = await addDoc(
    collection(getClientDb(), COLLECTIONS.paymentAccounts),
    {
      type: input.type,
      provider,
      accountName,
      accountNumber,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
  return docRef.id;
}

export async function updatePaymentAccount(
  id: string,
  input: {
    type: PaymentAccountType;
    provider: string;
    accountName: string;
    accountNumber: string;
    isActive?: boolean;
  }
): Promise<void> {
  const provider = input.provider.trim();
  const accountName = input.accountName.trim();
  const accountNumber = input.accountNumber.trim();
  if (!provider) throw new Error("Provider is required");
  if (!accountName) throw new Error("Account name is required");
  if (!accountNumber) throw new Error("Account number is required");

  await updateDoc(doc(getClientDb(), COLLECTIONS.paymentAccounts, id), {
    type: input.type,
    provider,
    accountName,
    accountNumber,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setPaymentAccountActive(
  id: string,
  isActive: boolean
): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.paymentAccounts, id), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}
