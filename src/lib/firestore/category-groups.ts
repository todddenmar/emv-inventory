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
import { COLLECTIONS } from "@/lib/firestore/collections";
import { categoryGroupConverter } from "@/lib/firestore/converters";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import type { CategoryGroup } from "@/types";

function categoryGroupsRef(): CollectionReference<CategoryGroup> {
  return collection(getClientDb(), COLLECTIONS.categoryGroups).withConverter(
    categoryGroupConverter
  );
}

async function isCategoryGroupSlugTaken(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), COLLECTIONS.categoryGroups),
      where("slug", "==", slug),
      limit(5)
    )
  );
  return snap.docs.some((d) => d.id !== excludeId);
}

export async function resolveCategoryGroupSlug(
  name: string,
  preferredSlug?: string,
  excludeId?: string
): Promise<string> {
  const base = preferredSlug?.trim() ? slugify(preferredSlug) : slugify(name);
  return ensureUniqueSlug(base, (slug) =>
    isCategoryGroupSlugTaken(slug, excludeId)
  );
}

export async function getCategoryGroups(
  includeArchived = false
): Promise<CategoryGroup[]> {
  const snapshot = await getDocs(query(categoryGroupsRef(), orderBy("name")));
  const groups = snapshot.docs.map((d) => d.data());
  return includeArchived
    ? groups
    : groups.filter((group) => !group.isArchived);
}

export async function getCategoryGroup(
  id: string
): Promise<CategoryGroup | null> {
  const snap = await getDoc(
    doc(getClientDb(), COLLECTIONS.categoryGroups, id).withConverter(
      categoryGroupConverter
    )
  );
  return snap.exists() ? snap.data() : null;
}

export async function createCategoryGroup(data: {
  name: string;
  slug?: string;
  categoryIds: string[];
}): Promise<string> {
  const slug = await resolveCategoryGroupSlug(data.name, data.slug);
  const docRef = await addDoc(
    collection(getClientDb(), COLLECTIONS.categoryGroups),
    {
      name: data.name.trim(),
      slug,
      categoryIds: data.categoryIds,
      isArchived: false,
      archivedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
  return docRef.id;
}

export async function updateCategoryGroup(
  id: string,
  data: Partial<Pick<CategoryGroup, "name" | "slug" | "categoryIds">>
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.name !== undefined || data.slug !== undefined) {
    const existingSnap = await getDoc(
      doc(getClientDb(), COLLECTIONS.categoryGroups, id).withConverter(
        categoryGroupConverter
      )
    );
    if (existingSnap.exists()) {
      const existing = existingSnap.data();
      payload.slug = await resolveCategoryGroupSlug(
        data.name ?? existing.name,
        data.slug ?? existing.slug,
        id
      );
    }
  }

  if (data.name !== undefined) {
    payload.name = data.name.trim();
  }

  await updateDoc(doc(getClientDb(), COLLECTIONS.categoryGroups, id), payload);
}

export async function archiveCategoryGroup(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.categoryGroups, id), {
    isArchived: true,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function restoreCategoryGroup(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.categoryGroups, id), {
    isArchived: false,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCategoryGroup(id: string): Promise<void> {
  const existingSnap = await getDoc(
    doc(getClientDb(), COLLECTIONS.categoryGroups, id).withConverter(
      categoryGroupConverter
    )
  );
  if (!existingSnap.exists()) return;

  const group = existingSnap.data();
  if (!group.isArchived) {
    throw new Error("Archive the category group before deleting it permanently");
  }

  await deleteDoc(doc(getClientDb(), COLLECTIONS.categoryGroups, id));
}
