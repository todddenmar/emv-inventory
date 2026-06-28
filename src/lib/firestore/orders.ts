import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { orderConverter } from "@/lib/firestore/converters";
import type { Order, OrderStatus } from "@/types";

function ordersRef(): CollectionReference<Order> {
  return collection(getClientDb(), "orders").withConverter(orderConverter);
}

export async function createOrder(
  data: Omit<Order, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const docRef = await addDoc(collection(getClientDb(), "orders"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getOrders(): Promise<Order[]> {
  const q = query(ordersRef(), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getCustomerOrders(customerId: string): Promise<Order[]> {
  const q = query(
    ordersRef(),
    where("customerId", "==", customerId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export function subscribeToOrders(
  callback: (orders: Order[]) => void
): () => void {
  const q = query(ordersRef(), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => d.data()));
  });
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus
): Promise<void> {
  await updateDoc(doc(getClientDb(), "orders", id), {
    status,
    updatedAt: serverTimestamp(),
  });
}
