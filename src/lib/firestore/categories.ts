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
  setDoc,
  updateDoc,
  where,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { categoryConverter } from "@/lib/firestore/converters";
import {
  getCategoryGroups,
  updateCategoryGroup,
} from "@/lib/firestore/category-groups";
import { getProductsByCategoryId } from "@/lib/firestore/products";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import type { Category } from "@/types";

function categoriesRef(): CollectionReference<Category> {
  return collection(getClientDb(), COLLECTIONS.categories).withConverter(
    categoryConverter
  );
}

async function isCategorySlugTaken(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), COLLECTIONS.categories),
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
  return ensureUniqueSlug(base, (slug) => isCategorySlugTaken(slug, excludeId));
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

export async function getCategory(id: string): Promise<Category | null> {
  const snap = await getDoc(
    doc(getClientDb(), COLLECTIONS.categories, id).withConverter(
      categoryConverter
    )
  );
  return snap.exists() ? snap.data() : null;
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
  data: Pick<Category, "name" | "tags"> & {
    slug?: string;
    id?: string;
    lowStockThreshold?: number;
    freebieVariants?: Category["freebieVariants"];
  }
): Promise<string> {
  const slug = await resolveCategorySlug(data.name, data.slug);
  const payload = {
    name: data.name,
    slug,
    tags: data.tags,
    lowStockThreshold:
      typeof data.lowStockThreshold === "number" && data.lowStockThreshold >= 0
        ? data.lowStockThreshold
        : 5,
    freebieVariants: Array.isArray(data.freebieVariants)
      ? data.freebieVariants
      : [],
    isArchived: false,
    archivedAt: null,
    isLocked: false,
    lockedBy: null,
    lockedByName: null,
    lockedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (data.id?.trim()) {
    const id = data.id.trim();
    await setDoc(doc(getClientDb(), COLLECTIONS.categories, id), payload);
    return id;
  }

  const docRef = await addDoc(
    collection(getClientDb(), COLLECTIONS.categories),
    payload
  );
  return docRef.id;
}

export async function updateCategory(
  id: string,
  data: Partial<
    Pick<
      Category,
      "name" | "tags" | "slug" | "lowStockThreshold" | "freebieVariants"
    >
  >
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.name !== undefined || data.slug !== undefined) {
    const existingSnap = await getDoc(
      doc(getClientDb(), COLLECTIONS.categories, id).withConverter(categoryConverter)
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

  await updateDoc(doc(getClientDb(), COLLECTIONS.categories, id), payload);
}

export async function archiveCategory(id: string): Promise<void> {
  const existingSnap = await getDoc(
    doc(getClientDb(), COLLECTIONS.categories, id).withConverter(
      categoryConverter
    )
  );
  if (!existingSnap.exists()) {
    throw new Error("Category not found");
  }

  const category = existingSnap.data();
  if (category.isLocked) {
    throw new Error("Unlock the category before archiving it");
  }

  const productsUsing = await getProductsByCategoryId(id, true);
  if (productsUsing.length > 0) {
    throw new Error(
      `Cannot archive: ${productsUsing.length} product${productsUsing.length === 1 ? "" : "s"} still assigned to this category`
    );
  }

  await updateDoc(doc(getClientDb(), COLLECTIONS.categories, id), {
    isArchived: true,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function restoreCategory(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.categories, id), {
    isArchived: false,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function setCategoryLocked(
  id: string,
  input: {
    locked: boolean;
    uid: string;
    displayName: string | null;
    /** When unlocking, pass true if actor is master-admin. */
    isMasterAdmin?: boolean;
  }
): Promise<void> {
  const existingSnap = await getDoc(
    doc(getClientDb(), COLLECTIONS.categories, id).withConverter(
      categoryConverter
    )
  );
  if (!existingSnap.exists()) {
    throw new Error("Category not found");
  }

  const category = existingSnap.data();

  if (input.locked) {
    if (category.isLocked) return;
    await updateDoc(doc(getClientDb(), COLLECTIONS.categories, id), {
      isLocked: true,
      lockedBy: input.uid,
      lockedByName: input.displayName?.trim() || null,
      lockedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  if (!category.isLocked) return;

  const canUnlock =
    input.isMasterAdmin === true || category.lockedBy === input.uid;
  if (!canUnlock) {
    throw new Error("Only the admin who locked this category or a master admin can unlock it");
  }

  await updateDoc(doc(getClientDb(), COLLECTIONS.categories, id), {
    isLocked: false,
    lockedBy: null,
    lockedByName: null,
    lockedAt: null,
    updatedAt: serverTimestamp(),
  });
}

async function stripCategoryFromGroups(categoryId: string): Promise<void> {
  const groups = await getCategoryGroups(true);
  await Promise.all(
    groups
      .filter((group) => group.categoryIds.includes(categoryId))
      .map((group) =>
        updateCategoryGroup(group.id, {
          categoryIds: group.categoryIds.filter((id) => id !== categoryId),
        })
      )
  );
}

export async function deleteCategory(id: string): Promise<void> {
  const existingSnap = await getDoc(
    doc(getClientDb(), COLLECTIONS.categories, id).withConverter(
      categoryConverter
    )
  );
  if (!existingSnap.exists()) return;

  const category = existingSnap.data();
  if (!category.isArchived) {
    throw new Error("Archive the category before deleting it permanently");
  }
  if (category.isLocked) {
    throw new Error("Unlock the category before deleting it permanently");
  }

  const productsUsing = await getProductsByCategoryId(id, true);
  if (productsUsing.length > 0) {
    throw new Error(
      `Cannot delete: ${productsUsing.length} product${productsUsing.length === 1 ? "" : "s"} still assigned to this category`
    );
  }

  await stripCategoryFromGroups(id);
  await deleteDoc(doc(getClientDb(), COLLECTIONS.categories, id));
}
