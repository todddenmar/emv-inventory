import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { productConverter } from "@/lib/firestore/converters";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import type { Product } from "@/types";

function productsRef(): CollectionReference<Product> {
  return collection(getClientDb(), "products").withConverter(productConverter);
}

async function isProductSlugTaken(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const snap = await getDocs(
    query(collection(getClientDb(), "products"), where("slug", "==", slug), limit(5))
  );
  return snap.docs.some((d) => d.id !== excludeId);
}

export async function resolveProductSlug(
  name: string,
  preferredSlug?: string,
  excludeId?: string
): Promise<string> {
  const base = preferredSlug?.trim() ? slugify(preferredSlug) : slugify(name);
  return ensureUniqueSlug(base || "product", isProductSlugTaken, excludeId);
}

export async function getProducts(
  activeOnly = false,
  includeArchived = false
): Promise<Product[]> {
  const ref = productsRef();
  const snapshot = await getDocs(query(ref, orderBy("name")));
  let products = snapshot.docs.map((d) => d.data());

  if (!includeArchived) {
    products = products.filter((p) => !p.isArchived);
  }
  if (activeOnly) {
    products = products.filter((p) => p.isActive && !p.isArchived);
  }
  return products;
}

export async function getProduct(id: string): Promise<Product | null> {
  const snap = await getDoc(doc(productsRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const snap = await getDocs(
    query(productsRef(), where("slug", "==", slug), limit(1))
  );
  if (!snap.empty) return snap.docs[0].data();

  const all = await getProducts(true);
  return all.find((p) => p.slug === slug) ?? null;
}

export async function createProduct(
  data: Omit<
    Product,
    "id" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt"
  > & { slug?: string }
): Promise<string> {
  const slug = await resolveProductSlug(data.name, data.slug);
  const docRef = await addDoc(collection(getClientDb(), "products"), {
    ...data,
    slug,
    isArchived: false,
    archivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProduct(
  id: string,
  data: Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.name !== undefined || data.slug !== undefined) {
    const existing = await getProduct(id);
    if (existing) {
      payload.slug = await resolveProductSlug(
        data.name ?? existing.name,
        data.slug ?? existing.slug,
        id
      );
    }
  }

  await updateDoc(doc(getClientDb(), "products", id), payload);
}

export async function archiveProduct(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), "products", id), {
    isArchived: true,
    isActive: false,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function restoreProduct(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), "products", id), {
    isArchived: false,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await archiveProduct(id);
}
