import {
  addDoc,
  collection,
  deleteDoc,
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
import { categoryConverter } from "@/lib/firestore/converters";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import type { Category } from "@/types";

function categoriesRef(): CollectionReference<Category> {
  return collection(getClientDb(), "categories").withConverter(
    categoryConverter
  );
}

async function isCategorySlugTaken(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), "categories"),
      where("slug", "==", slug),
      limit(5)
    )
  );
  return snap.docs.some((d) => d.id !== excludeId);
}

export async function resolveCategorySlug(
  name: string,
  preferredSlug?: string,
  excludeId?: string
): Promise<string> {
  const base = preferredSlug?.trim() ? slugify(preferredSlug) : slugify(name);
  return ensureUniqueSlug(base || "category", isCategorySlugTaken, excludeId);
}

export async function getCategories(
  includeArchived = false
): Promise<Category[]> {
  const snapshot = await getDocs(query(categoriesRef(), orderBy("name")));
  const categories = snapshot.docs.map((d) => d.data());
  return includeArchived
    ? categories
    : categories.filter((c) => !c.isArchived);
}

export async function getCategoryBySlug(
  slug: string
): Promise<Category | null> {
  const snap = await getDocs(
    query(categoriesRef(), where("slug", "==", slug), limit(1))
  );
  if (!snap.empty) return snap.docs[0].data();

  const all = await getCategories();
  return all.find((c) => c.slug === slug) ?? null;
}

export async function createCategory(
  data: Pick<Category, "name" | "tags"> & { slug?: string }
): Promise<string> {
  const slug = await resolveCategorySlug(data.name, data.slug);
  const docRef = await addDoc(collection(getClientDb(), "categories"), {
    name: data.name,
    slug,
    tags: data.tags,
    isArchived: false,
    archivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateCategory(
  id: string,
  data: Partial<Pick<Category, "name" | "tags" | "slug">>
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.name !== undefined || data.slug !== undefined) {
    const existingSnap = await getDoc(
      doc(getClientDb(), "categories", id).withConverter(categoryConverter)
    );
    if (existingSnap.exists()) {
      const existing = existingSnap.data();
      payload.slug = await resolveCategorySlug(
        data.name ?? existing.name,
        data.slug ?? existing.slug,
        id
      );
    }
  }

  await updateDoc(doc(getClientDb(), "categories", id), payload);
}

export async function archiveCategory(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), "categories", id), {
    isArchived: true,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function restoreCategory(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), "categories", id), {
    isArchived: false,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  const existingSnap = await getDoc(
    doc(getClientDb(), "categories", id).withConverter(categoryConverter)
  );
  if (!existingSnap.exists()) return;

  const category = existingSnap.data();
  if (!category.isArchived) {
    throw new Error("Archive the category before deleting it permanently");
  }

  await deleteDoc(doc(getClientDb(), "categories", id));
}
