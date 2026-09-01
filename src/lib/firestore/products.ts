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
import {
  normalizeRetailPrice,
  normalizeWholesalePrice,
} from "@/lib/product-pricing";
import { getDefaultVariant } from "@/lib/product-variants";
import { roundMoney } from "@/lib/pos-payments";
import type { Category, Product, ProductVariant } from "@/types";

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

export async function addProductToCategory(
  productId: string,
  categoryId: string
): Promise<Product | null> {
  const product = await getProduct(productId);
  if (!product) return null;

  if (product.categoryIds.includes(categoryId)) {
    return product;
  }

  const nextCategoryIds = [...product.categoryIds, categoryId];
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
    productType: "",
    tags: [],
    vendorId: null,
    price: 0,
    categoryIds: [],
    options: [],
    variants: [
      {
        id: crypto.randomUUID(),
        sku: "",
        price: 0,
        retailPrice: null,
        wholesalePrice: null,
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
    | "id"
    | "createdAt"
    | "updatedAt"
    | "isArchived"
    | "archivedAt"
    | "isLocked"
    | "lockedBy"
    | "lockedByName"
    | "lockedAt"
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
    isLocked: false,
    lockedBy: null,
    lockedByName: null,
    lockedAt: null,
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

  if (data.variants) {
    const variants: ProductVariant[] = data.variants.map((variant) => ({
      ...variant,
      price: roundMoney(Math.max(0, Number(variant.price) || 0)),
      retailPrice: normalizeRetailPrice(variant.retailPrice),
      wholesalePrice: normalizeWholesalePrice(variant.wholesalePrice),
    }));
    payload.variants = variants;
    payload.price = getDefaultVariant({ variants }).price;
  }

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
      payload.variants as ProductVariant[],
      data.options,
      data.name,
      actor
    ).catch(console.error);
  }
}

/** Persist retail prices entered at POS onto product variants. */
export async function setVariantRetailPrices(
  updates: Array<{
    productId: string;
    variantId: string;
    retailPrice: number;
  }>
): Promise<void> {
  const byProduct = new Map<string, Array<{ variantId: string; retailPrice: number }>>();
  for (const update of updates) {
    const list = byProduct.get(update.productId) ?? [];
    list.push({
      variantId: update.variantId,
      retailPrice: update.retailPrice,
    });
    byProduct.set(update.productId, list);
  }

  await Promise.all(
    [...byProduct.entries()].map(async ([productId, variantUpdates]) => {
      const product = await getProduct(productId);
      if (!product) return;

      let changed = false;
      const variants = product.variants.map((variant) => {
        const match = variantUpdates.find((u) => u.variantId === variant.id);
        if (!match) return variant;
        if (variant.retailPrice === match.retailPrice) return variant;
        changed = true;
        return { ...variant, retailPrice: match.retailPrice };
      });

      if (!changed) return;
      await updateProduct(productId, { variants });
    })
  );
}

export async function archiveProduct(id: string): Promise<void> {
  const product = await getProduct(id);
  if (!product) {
    throw new Error("Product not found");
  }
  if (product.isLocked) {
    throw new Error("Unlock the product before archiving it");
  }

  const stockUnits = await getProductStockTotal(id);
  if (stockUnits > 0) {
    throw new Error(
      `Cannot archive: ${stockUnits} unit${stockUnits === 1 ? "" : "s"} still in stock across branches`
    );
  }

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

export async function setProductLocked(
  id: string,
  input: {
    locked: boolean;
    uid: string;
    displayName: string | null;
    isMasterAdmin?: boolean;
  }
): Promise<void> {
  const product = await getProduct(id);
  if (!product) {
    throw new Error("Product not found");
  }

  if (input.locked) {
    if (product.isLocked) return;
    await updateDoc(doc(getClientDb(), COLLECTIONS.products, id), {
      isLocked: true,
      lockedBy: input.uid,
      lockedByName: input.displayName?.trim() || null,
      lockedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  if (!product.isLocked) return;

  const canUnlock =
    input.isMasterAdmin === true || product.lockedBy === input.uid;
  if (!canUnlock) {
    throw new Error(
      "Only the admin who locked this product or a master admin can unlock it"
    );
  }

  await updateDoc(doc(getClientDb(), COLLECTIONS.products, id), {
    isLocked: false,
    lockedBy: null,
    lockedByName: null,
    lockedAt: null,
    updatedAt: serverTimestamp(),
  });
}

async function getProductStockTotal(productId: string): Promise<number> {
  const snapshot = await getDocs(
    query(
      collection(getClientDb(), COLLECTIONS.branchInventory),
      where("productId", "==", productId)
    )
  );
  return snapshot.docs.reduce((sum, d) => {
    const stock = Number(d.data().stock ?? 0);
    return sum + (Number.isFinite(stock) ? stock : 0);
  }, 0);
}

async function stripProductFromCategoryFreebies(
  productId: string
): Promise<void> {
  const snapshot = await getDocs(
    collection(getClientDb(), COLLECTIONS.categories)
  );
  await Promise.all(
    snapshot.docs.map(async (categoryDoc) => {
      const data = categoryDoc.data();
      const freebies = Array.isArray(data.freebieVariants)
        ? (data.freebieVariants as Category["freebieVariants"])
        : [];
      if (!freebies.some((f) => f.productId === productId)) return;
      await updateDoc(categoryDoc.ref, {
        freebieVariants: freebies.filter((f) => f.productId !== productId),
        updatedAt: serverTimestamp(),
      });
    })
  );
}

export async function deleteProduct(id: string): Promise<void> {
  const product = await getProduct(id);
  if (!product) return;
  if (!product.isArchived) {
    throw new Error("Archive the product before deleting it permanently");
  }
  if (product.isLocked) {
    throw new Error("Unlock the product before deleting it permanently");
  }

  const stockUnits = await getProductStockTotal(id);
  if (stockUnits > 0) {
    throw new Error(
      `Cannot delete: ${stockUnits} unit${stockUnits === 1 ? "" : "s"} still in stock across branches`
    );
  }

  for (const image of product.images) {
    if (image.storagePath) {
      await deleteProductImage(image.storagePath).catch(console.error);
    }
  }

  await stripProductFromCategoryFreebies(id);
  await deleteDoc(doc(getClientDb(), COLLECTIONS.products, id));
}
