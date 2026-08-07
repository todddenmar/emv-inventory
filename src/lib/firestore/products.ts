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
import { productConverter } from "@/lib/firestore/converters";
import {
  logProductPriceChangesFromUpdate,
  type PriceChangeActor,
} from "@/lib/firestore/price-logs";
import { deleteProductImage } from "@/lib/storage/products";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import { isProductPublished } from "@/lib/products-catalog";
import type { Product } from "@/types";

function productsRef(): CollectionReference<Product> {
  return collection(getClientDb(), COLLECTIONS.products).withConverter(
    productConverter
  );
}

async function isProductSlugTaken(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), COLLECTIONS.products),
      where("slug", "==", slug),
      limit(5)
    )
  );
  return snap.docs.some((d) => d.id !== excludeId);
}

export async function resolveProductSlug(
  name: string,
  preferredSlug?: string,
  excludeId?: string
): Promise<string> {
  const existing = excludeId ? await getProduct(excludeId) : null;
  const normalizedPreferred = preferredSlug?.trim()
    ? slugify(preferredSlug)
    : "";
  const normalizedName = slugify(name);

  if (
    existing &&
    normalizedPreferred &&
    normalizedPreferred === existing.slug
  ) {
    return existing.slug;
  }

  const base = normalizedPreferred || normalizedName || "product";
  return ensureUniqueSlug(base, (slug) => isProductSlugTaken(slug, excludeId));
}

/** Always slugify from the product name (ignores the current slug field). */
export async function resolveProductSlugFromName(
  name: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(name) || "product";
  return ensureUniqueSlug(base, (slug) => isProductSlugTaken(slug, excludeId));
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
    products = products.filter((p) => isProductPublished(p));
  }
  return products;
}

export async function getProductsByCategoryId(
  categoryId: string,
  includeArchived = false
): Promise<Product[]> {
  const trimmed = categoryId.trim();
  if (!trimmed) return [];

  const snapshot = await getDocs(
    query(productsRef(), where("categoryIds", "array-contains", trimmed))
  );
  let products = snapshot.docs.map((d) => d.data());

  if (!includeArchived) {
    products = products.filter((p) => !p.isArchived);
  }

  return products.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export async function removeProductFromCategory(
  productId: string,
  categoryId: string
): Promise<Product | null> {
  const product = await getProduct(productId);
  if (!product) return null;

  const nextCategoryIds = product.categoryIds.filter((id) => id !== categoryId);
  if (nextCategoryIds.length === product.categoryIds.length) {
    return product;
  }

  await updateProduct(productId, { categoryIds: nextCategoryIds });
  return { ...product, categoryIds: nextCategoryIds };
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

export async function createDraftProduct(): Promise<string> {
  const draftKey = `draft-${Date.now()}`;
  const slug = await resolveProductSlug(draftKey, draftKey);
  return createProduct({
    name: "",
    slug,
    description: "",
    productType: "",
    tags: [],
    vendorId: null,
    price: 0,
    compareAtPrice: null,
    categoryIds: [],
    options: [],
    variants: [
      {
        id: crypto.randomUUID(),
        sku: "",
        price: 0,
        compareAtPrice: null,
        optionValues: {},
        imageId: null,
        position: 0,
      },
    ],
    specsText: "",
    specs: [],
    images: [],
    thumbnailImageId: null,
    status: "draft",
    isActive: false,
  });
}

export async function publishProduct(id: string): Promise<void> {
  await updateProduct(id, {
    status: "published",
    isActive: true,
  });
}

export async function unpublishProduct(id: string): Promise<void> {
  await updateProduct(id, {
    status: "draft",
    isActive: false,
  });
}

export async function createProduct(
  data: Omit<
    Product,
    "id" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt"
  > & { slug?: string }
): Promise<string> {
  const slug = await resolveProductSlug(data.name, data.slug);
  const docRef = await addDoc(collection(getClientDb(), COLLECTIONS.products), {
    ...data,
    slug,
    status: data.status ?? "draft",
    isActive: data.isActive ?? data.status === "published",
    isArchived: false,
    archivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProduct(
  id: string,
  data: Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>,
  actor?: PriceChangeActor
): Promise<void> {
  const existing = await getProduct(id);
  const payload: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.name !== undefined || data.slug !== undefined) {
    if (existing) {
      payload.slug = await resolveProductSlug(
        data.name ?? existing.name,
        data.slug ?? existing.slug,
        id
      );
    }
  }

  await updateDoc(doc(getClientDb(), COLLECTIONS.products, id), payload);

  if (existing && actor && data.variants) {
    await logProductPriceChangesFromUpdate(
      existing,
      data.variants,
      data.options,
      data.name,
      actor
    ).catch(console.error);
  }
}

export async function archiveProduct(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.products, id), {
    isArchived: true,
    isActive: false,
    status: "draft",
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function restoreProduct(id: string): Promise<void> {
  await updateDoc(doc(getClientDb(), COLLECTIONS.products, id), {
    isArchived: false,
    archivedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  const product = await getProduct(id);
  if (!product) return;
  if (!product.isArchived) {
    throw new Error("Archive the product before deleting it permanently");
  }

  for (const image of product.images) {
    if (image.storagePath) {
      await deleteProductImage(image.storagePath).catch(console.error);
    }
  }

  await deleteDoc(doc(getClientDb(), COLLECTIONS.products, id));
}
