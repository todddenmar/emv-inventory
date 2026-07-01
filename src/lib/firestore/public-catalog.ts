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
import { isProductPublished } from "@/lib/products-catalog";
import { migrateLegacyProductVariants, getDefaultVariant } from "@/lib/product-variants";
import { specsToText } from "@/lib/specs";
import type { Category, Product, ProductOption, ProductSpec, ProductVariant } from "@/types";

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
  const legacySpecs = (data.specs as ProductSpec[]) ?? [];
  const { options, variants } = migrateLegacyProductVariants(id, {
    price: Number(data.price ?? 0),
    compareAtPrice: data.compareAtPrice as number | null | undefined,
    variants: data.variants as ProductVariant[] | undefined,
    options: data.options as ProductOption[] | undefined,
  });
  const defaultVariant = getDefaultVariant({ variants });
  const specsText =
    typeof data.specsText === "string" && data.specsText.trim()
      ? data.specsText
      : specsToText(legacySpecs);

  return {
    id,
    name,
    slug: resolveSlug(data.slug as string | undefined, name, id),
    description: String(data.description ?? ""),
    price: defaultVariant.price,
    compareAtPrice: defaultVariant.compareAtPrice,
    categoryIds: (data.categoryIds as string[]) ?? [],
    options,
    variants,
    specsText,
    specs: legacySpecs,
    images: (data.images as Product["images"]) ?? [],
    thumbnailImageId: (data.thumbnailImageId as string | null) ?? null,
    status:
      data.status === "draft" || data.status === "published"
        ? data.status
        : data.isActive === false
          ? "draft"
          : "published",
    isActive: data.isActive !== false,
    isArchived: Boolean(data.isArchived),
    archivedAt: data.archivedAt ? toDate(data.archivedAt) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

async function fetchProductBySlugWithAdmin(
  slug: string
): Promise<Product | null> {
  const { getAdminDb } = await import("@/lib/firebase-admin");
  const db = getAdminDb();
  const bySlug = await db
    .collection("products")
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (!bySlug.empty) {
    const doc = bySlug.docs[0];
    const product = mapProduct(doc.id, doc.data() as Record<string, unknown>);
    if (isProductPublished(product)) return product;
  }

  const all = await db.collection("products").orderBy("name").get();
  for (const doc of all.docs) {
    const product = mapProduct(doc.id, doc.data() as Record<string, unknown>);
    if (isProductPublished(product) && product.slug === slug) {
      return product;
    }
  }
  return null;
}

async function fetchProductBySlugWithClient(
  slug: string
): Promise<Product | null> {
  const db = getPublicDb();
  const bySlug = await getDocs(
    query(collection(db, "products"), where("slug", "==", slug), limit(1))
  );

  if (!bySlug.empty) {
    const doc = bySlug.docs[0];
    const product = mapProduct(doc.id, doc.data() as Record<string, unknown>);
    if (isProductPublished(product)) return product;
  }

  const all = await getDocs(query(collection(db, "products"), orderBy("name")));
  for (const doc of all.docs) {
    const product = mapProduct(doc.id, doc.data() as Record<string, unknown>);
    if (isProductPublished(product) && product.slug === slug) {
      return product;
    }
  }
  return null;
}

async function fetchCategoryBySlugWithAdmin(
  slug: string
): Promise<Category | null> {
  const { getAdminDb } = await import("@/lib/firebase-admin");
  const db = getAdminDb();
  const bySlug = await db
    .collection("categories")
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (!bySlug.empty) {
    const doc = bySlug.docs[0];
    const category = mapCategory(doc.id, doc.data() as Record<string, unknown>);
    if (!category.isArchived) return category;
  }

  const all = await db.collection("categories").orderBy("name").get();
  for (const doc of all.docs) {
    const category = mapCategory(doc.id, doc.data() as Record<string, unknown>);
    if (!category.isArchived && category.slug === slug) return category;
  }
  return null;
}

async function fetchCategoryBySlugWithClient(
  slug: string
): Promise<Category | null> {
  const db = getPublicDb();
  const bySlug = await getDocs(
    query(collection(db, "categories"), where("slug", "==", slug), limit(1))
  );

  if (!bySlug.empty) {
    const doc = bySlug.docs[0];
    const category = mapCategory(doc.id, doc.data() as Record<string, unknown>);
    if (!category.isArchived) return category;
  }

  const all = await getDocs(query(collection(db, "categories"), orderBy("name")));
  for (const doc of all.docs) {
    const category = mapCategory(doc.id, doc.data() as Record<string, unknown>);
    if (!category.isArchived && category.slug === slug) return category;
  }
  return null;
}

async function withCatalogFallback<T>(
  label: string,
  adminFn: () => Promise<T>,
  clientFn: () => Promise<T>
): Promise<T> {
  try {
    return await adminFn();
  } catch (adminError) {
    console.error(`[public-catalog] Admin ${label} failed:`, adminError);
  }

  try {
    return await clientFn();
  } catch (clientError) {
    console.error(`[public-catalog] Client ${label} failed:`, clientError);
    throw clientError;
  }
}

export async function fetchCategoryBySlug(
  slug: string
): Promise<Category | null> {
  return withCatalogFallback(
    "fetchCategoryBySlug",
    () => fetchCategoryBySlugWithAdmin(slug),
    () => fetchCategoryBySlugWithClient(slug)
  );
}

export async function fetchProductBySlug(
  slug: string
): Promise<Product | null> {
  return withCatalogFallback(
    "fetchProductBySlug",
    () => fetchProductBySlugWithAdmin(slug),
    () => fetchProductBySlugWithClient(slug)
  );
}

export async function fetchPublicCategories(): Promise<Category[]> {
  return withCatalogFallback(
    "fetchPublicCategories",
    async () => {
      const { getAdminDb } = await import("@/lib/firebase-admin");
      const snap = await getAdminDb().collection("categories").orderBy("name").get();
      return snap.docs
        .map((doc) => mapCategory(doc.id, doc.data() as Record<string, unknown>))
        .filter((c) => !c.isArchived);
    },
    async () => {
      const snap = await getDocs(
        query(collection(getPublicDb(), "categories"), orderBy("name"))
      );
      return snap.docs
        .map((doc) => mapCategory(doc.id, doc.data() as Record<string, unknown>))
        .filter((c) => !c.isArchived);
    }
  );
}

export async function fetchPublicProducts(): Promise<Product[]> {
  return withCatalogFallback(
    "fetchPublicProducts",
    async () => {
      const { getAdminDb } = await import("@/lib/firebase-admin");
      const snap = await getAdminDb().collection("products").orderBy("name").get();
      return snap.docs
        .map((doc) => mapProduct(doc.id, doc.data() as Record<string, unknown>))
        .filter((p) => isProductPublished(p));
    },
    async () => {
      const snap = await getDocs(
        query(collection(getPublicDb(), "products"), orderBy("name"))
      );
      return snap.docs
        .map((doc) => mapProduct(doc.id, doc.data() as Record<string, unknown>))
        .filter((p) => isProductPublished(p));
    }
  );
}
