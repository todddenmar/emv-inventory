import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getPublicDb } from "@/lib/firebase-public";
import { resolveSlug } from "@/lib/slug";
import type { Category, Product } from "@/types";

function toDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(String(value));
}

function mapCategory(id: string, data: Record<string, unknown>): Category {
  const name = String(data.name ?? "");
  return {
    id,
    name,
    slug: resolveSlug(data.slug as string | undefined, name, id),
    tags: (data.tags as string[]) ?? [],
    isArchived: Boolean(data.isArchived),
    archivedAt: data.archivedAt ? toDate(data.archivedAt) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function mapProduct(id: string, data: Record<string, unknown>): Product {
  const name = String(data.name ?? "");
  return {
    id,
    name,
    slug: resolveSlug(data.slug as string | undefined, name, id),
    description: String(data.description ?? ""),
    price: Number(data.price ?? 0),
    categoryIds: (data.categoryIds as string[]) ?? [],
    specs: (data.specs as Product["specs"]) ?? [],
    images: (data.images as Product["images"]) ?? [],
    thumbnailImageId: (data.thumbnailImageId as string | null) ?? null,
    isActive: data.isActive !== false,
    isArchived: Boolean(data.isArchived),
    archivedAt: data.archivedAt ? toDate(data.archivedAt) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function fetchCategoryBySlug(
  slug: string
): Promise<Category | null> {
  const db = getPublicDb();
  const bySlug = query(
    collection(db, "categories"),
    where("slug", "==", slug),
    limit(1)
  );
  const snap = await getDocs(bySlug);
  if (!snap.empty) {
    const doc = snap.docs[0];
    const category = mapCategory(doc.id, doc.data());
    if (!category.isArchived) return category;
  }

  const all = await getDocs(query(collection(db, "categories"), orderBy("name")));
  for (const doc of all.docs) {
    const category = mapCategory(doc.id, doc.data());
    if (!category.isArchived && category.slug === slug) return category;
  }
  return null;
}

export async function fetchProductBySlug(
  slug: string
): Promise<Product | null> {
  const db = getPublicDb();
  const bySlug = query(
    collection(db, "products"),
    where("slug", "==", slug),
    limit(1)
  );
  const snap = await getDocs(bySlug);
  if (!snap.empty) {
    const doc = snap.docs[0];
    const product = mapProduct(doc.id, doc.data());
    if (product.isActive && !product.isArchived) return product;
  }

  const all = await getDocs(query(collection(db, "products"), orderBy("name")));
  for (const doc of all.docs) {
    const product = mapProduct(doc.id, doc.data());
    if (product.isActive && !product.isArchived && product.slug === slug) {
      return product;
    }
  }
  return null;
}

export async function fetchPublicCategories(): Promise<Category[]> {
  const snap = await getDocs(
    query(collection(getPublicDb(), "categories"), orderBy("name"))
  );
  return snap.docs
    .map((doc) => mapCategory(doc.id, doc.data()))
    .filter((c) => !c.isArchived);
}

export async function fetchPublicProducts(): Promise<Product[]> {
  const snap = await getDocs(
    query(collection(getPublicDb(), "products"), orderBy("name"))
  );
  return snap.docs
    .map((doc) => mapProduct(doc.id, doc.data()))
    .filter((p) => p.isActive && !p.isArchived);
}
