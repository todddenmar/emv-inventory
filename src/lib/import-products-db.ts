import { createProduct } from "@/lib/firestore/products";
import { createVendor } from "@/lib/firestore/vendors";
import type { ParsedImportProduct } from "@/lib/product-json-import";
import { slugify } from "@/lib/slug";
import type {
  Category,
  Product,
  ProductOption,
  ProductVariant,
  Vendor,
} from "@/types";

export type ImportProductDbMatch = {
  productId: string;
  productSlug: string;
  productName: string;
};

export type ImportProductDbStatus =
  | { kind: "in_database"; match: ImportProductDbMatch }
  | { kind: "ready" };

const VARIANT_OPTION_NAME = "Title";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveImportCategoryId(
  categoryName: string,
  categories: Category[]
): string | null {
  const key = normalizeLabel(categoryName);
  if (!key) return null;
  const match = categories.find((category) => normalizeLabel(category.name) === key);
  return match?.id ?? null;
}

export function resolveImportVendorId(
  vendorName: string,
  vendors: Vendor[]
): string | null {
  const key = normalizeLabel(vendorName);
  if (!key) return null;
  const match = vendors.find((vendor) => normalizeLabel(vendor.name) === key);
  return match?.id ?? null;
}

export function preferredImportProductSlug(product: ParsedImportProduct): string {
  return slugify(product.name) || "product";
}

/** Find an existing DB product that matches this import row. */
export function findMatchingDbProduct(
  importProduct: ParsedImportProduct,
  dbProducts: Product[],
  categoryId: string | null,
  vendorId: string | null
): Product | null {
  const nameKey = normalizeLabel(importProduct.name);
  if (!nameKey) return null;

  const preferredSlug = preferredImportProductSlug(importProduct);
  const nameMatches = dbProducts.filter(
    (product) =>
      !product.isArchived && normalizeLabel(product.name) === nameKey
  );

  if (nameMatches.length === 0) {
    const bySlug = dbProducts.find(
      (product) =>
        !product.isArchived && product.slug === preferredSlug
    );
    return bySlug ?? null;
  }

  if (categoryId) {
    const withCategory = nameMatches.filter((product) =>
      product.categoryIds.includes(categoryId)
    );
    if (withCategory.length === 1) return withCategory[0];
    if (withCategory.length > 1 && vendorId) {
      const withVendor = withCategory.find(
        (product) => product.vendorId === vendorId
      );
      if (withVendor) return withVendor;
    }
    if (withCategory.length > 0) return withCategory[0];
  }

  if (vendorId) {
    const withVendor = nameMatches.filter(
      (product) => product.vendorId === vendorId
    );
    if (withVendor.length === 1) return withVendor[0];
    if (withVendor.length > 0) return withVendor[0];
  }

  const bySlug = nameMatches.find((product) => product.slug === preferredSlug);
  return bySlug ?? nameMatches[0];
}

export function getImportProductDbStatus(
  importProduct: ParsedImportProduct,
  dbProducts: Product[],
  categories: Category[],
  vendors: Vendor[]
): ImportProductDbStatus {
  const categoryId = resolveImportCategoryId(
    importProduct.categoryName,
    categories
  );
  const vendorId = resolveImportVendorId(importProduct.vendorName, vendors);
  const match = findMatchingDbProduct(
    importProduct,
    dbProducts,
    categoryId,
    vendorId
  );

  if (match) {
    return {
      kind: "in_database",
      match: {
        productId: match.id,
        productSlug: match.slug,
        productName: match.name,
      },
    };
  }

  return { kind: "ready" };
}

function uniquifyVariantTitles(titles: string[]): string[] {
  const counts = new Map<string, number>();
  return titles.map((title) => {
    const base = title.trim() || "Variant";
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base} (${seen + 1})`;
  });
}

export function buildVariantsFromImport(
  importProduct: ParsedImportProduct
): { options: ProductOption[]; variants: ProductVariant[] } {
  const source = importProduct.variants;

  if (source.length === 0) {
    return {
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
    };
  }

  if (source.length === 1) {
    return {
      options: [],
      variants: [
        {
          id: crypto.randomUUID(),
          sku: "",
          price: source[0].price,
          retailPrice: null,
          wholesalePrice: null,
          optionValues: {},
          imageId: null,
          position: 0,
        },
      ],
    };
  }

  const titles = uniquifyVariantTitles(source.map((variant) => variant.name));
  const options: ProductOption[] = [
    {
      name: VARIANT_OPTION_NAME,
      values: titles,
      position: 0,
    },
  ];

  const variants: ProductVariant[] = source.map((variant, index) => ({
    id: crypto.randomUUID(),
    sku: "",
    price: variant.price,
    retailPrice: null,
    wholesalePrice: null,
    optionValues: { [VARIANT_OPTION_NAME]: titles[index] },
    imageId: null,
    position: index,
  }));

  return { options, variants };
}

export function buildCreateProductPayload(
  importProduct: ParsedImportProduct,
  categoryId: string | null,
  vendorId: string | null
): Parameters<typeof createProduct>[0] {
  const { options, variants } = buildVariantsFromImport(importProduct);
  const defaultPrice = variants[0]?.price ?? 0;

  return {
    name: importProduct.name.trim(),
    slug: preferredImportProductSlug(importProduct),
    productType: importProduct.productType.trim(),
    tags: importProduct.tags,
    vendorId,
    price: defaultPrice,
    categoryIds: categoryId ? [categoryId] : [],
    options,
    variants,
    specsText: "",
    specs: [],
    images: [],
    thumbnailImageId: null,
    status: "draft",
    isActive: false,
  };
}

export async function ensureVendorId(
  vendorName: string,
  vendors: Vendor[]
): Promise<{ vendorId: string | null; created: Vendor | null }> {
  const trimmed = vendorName.trim();
  if (!trimmed) return { vendorId: null, created: null };

  const existingId = resolveImportVendorId(trimmed, vendors);
  if (existingId) return { vendorId: existingId, created: null };

  const id = await createVendor(trimmed);
  const created: Vendor = {
    id,
    name: trimmed,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { vendorId: id, created };
}

export async function importProductToDatabase(
  importProduct: ParsedImportProduct,
  categories: Category[],
  vendors: Vendor[],
  dbProducts: Product[],
  options: {
    createMissingVendor?: boolean;
    categoryId?: string | null;
  } = {}
): Promise<{
  productId: string;
  created: boolean;
  vendorCreated: Vendor | null;
  product: Product;
}> {
  const categoryId =
    options.categoryId !== undefined
      ? options.categoryId
      : resolveImportCategoryId(importProduct.categoryName, categories);

  let vendorId = resolveImportVendorId(importProduct.vendorName, vendors);
  let vendorCreated: Vendor | null = null;

  if (!vendorId && options.createMissingVendor !== false) {
    const ensured = await ensureVendorId(importProduct.vendorName, vendors);
    vendorId = ensured.vendorId;
    vendorCreated = ensured.created;
  }

  const existing = findMatchingDbProduct(
    importProduct,
    dbProducts,
    categoryId,
    vendorId
  );
  if (existing) {
    return {
      productId: existing.id,
      created: false,
      vendorCreated,
      product: existing,
    };
  }

  const payload = buildCreateProductPayload(
    importProduct,
    categoryId,
    vendorId
  );
  const productId = await createProduct(payload);
  const product: Product = {
    id: productId,
    ...payload,
    isArchived: false,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    productId,
    created: true,
    vendorCreated,
    product,
  };
}
