import { formatCurrency } from "@/lib/format";

export interface ParsedImportVariant {
  id: string;
  name: string;
  price: number;
}

export interface ParsedImportProduct {
  id: string;
  name: string;
  productType: string;
  categoryName: string;
  vendorName: string;
  groupName: string;
  tags: string[];
  variants: ParsedImportVariant[];
}

export interface ProductJsonImportResult {
  products: ParsedImportProduct[];
  errors: string[];
  /** Categories present in the file with no products yet. */
  emptyCategories: string[];
}

/** Clean nested export shape (title / price). */
export interface CleanImportVariant {
  title: string;
  price: number;
}

export interface CleanImportProduct {
  title: string;
  productType: string;
  variants: CleanImportVariant[];
}

export interface CleanImportCategoryGroup {
  category: string;
  vendor: string;
  products: CleanImportProduct[];
}

function newId(): string {
  return crypto.randomUUID();
}

/** Known motor tokens / patterns in variant names (lowercase). */
const MOTOR_PATTERNS: Array<{ pattern: RegExp; tags: string[] }> = [
  {
    pattern: /\bclick\s*125\s*\/\s*150\b/i,
    tags: ["motor:click 125", "motor:click 150"],
  },
  { pattern: /\bclick\s*150\b/i, tags: ["motor:click 150"] },
  { pattern: /\bclick\s*125\b/i, tags: ["motor:click 125"] },
  { pattern: /\baerox\b/i, tags: ["motor:aerox"] },
  { pattern: /\bnmax\b/i, tags: ["motor:nmax"] },
  { pattern: /\bvario\b/i, tags: ["motor:vario"] },
  { pattern: /\bmio\b/i, tags: ["motor:mio"] },
  { pattern: /\bpcx\b/i, tags: ["motor:pcx"] },
  { pattern: /\badv\b/i, tags: ["motor:adv"] },
  { pattern: /\blexi\b/i, tags: ["motor:lexi"] },
  { pattern: /\bxmax\b/i, tags: ["motor:xmax"] },
  { pattern: /\bfazzio\b/i, tags: ["motor:fazzio"] },
  { pattern: /\bgear\b/i, tags: ["motor:gear"] },
  { pattern: /\bfreego\b/i, tags: ["motor:freego"] },
  { pattern: /\bbeat\b/i, tags: ["motor:beat"] },
  { pattern: /\bgiorno\b/i, tags: ["motor:giorno"] },
];

const COLOR_WORDS = new Set([
  "black",
  "blue",
  "silver",
  "violet",
  "white",
  "red",
  "gold",
  "green",
  "gray",
  "grey",
  "orange",
  "pink",
  "brown",
  "yellow",
  "purple",
  "bronze",
  "titanium",
  "gunmetal",
]);

const FINISH_WORDS = new Set([
  "chrome",
  "carbon",
  "matte",
  "matt",
  "gloss",
  "glossy",
  "brushed",
  "anodized",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findKey(row: Record<string, unknown>, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const found = keys.find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

function getStringField(
  row: Record<string, unknown>,
  candidates: string[]
): string {
  const key = findKey(row, candidates);
  if (!key) return "";
  const value = row[key];
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function getNumberField(
  row: Record<string, unknown>,
  candidates: string[]
): number | null {
  const key = findKey(row, candidates);
  if (!key) return null;
  const value = row[key];
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function hasKey(row: Record<string, unknown>, candidates: string[]): boolean {
  return findKey(row, candidates) != null;
}

/**
 * Split category title into vendor + productType.
 * e.g. "BOM X MAGS" → { vendor: "BOM X", productType: "MAGS" }
 */
export function splitGroupName(groupName: string): {
  categoryName: string;
  vendorName: string;
  productType: string;
} {
  const trimmed = groupName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { categoryName: "", vendorName: "", productType: "" };
  }
  if (parts.length === 1) {
    return {
      categoryName: parts[0],
      vendorName: parts[0],
      productType: parts[0],
    };
  }
  return {
    categoryName: trimmed,
    vendorName: parts.slice(0, -1).join(" "),
    productType: parts[parts.length - 1],
  };
}

/** Extract motor / color / finish tags from a variant display name. */
export function extractVariantTags(variantName: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  const add = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    tags.push(normalized);
  };

  for (const { pattern, tags: motorTags } of MOTOR_PATTERNS) {
    if (pattern.test(variantName)) {
      motorTags.forEach(add);
    }
  }

  const tokens = variantName.trim().split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1]?.toLowerCase() ?? "";
  if (COLOR_WORDS.has(last)) {
    add(`color:${last}`);
  } else if (FINISH_WORDS.has(last)) {
    add(`finish:${last}`);
  }

  return tags;
}

function uniqueSortedTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
}

type FlatRowKind = "category" | "product" | "variant" | "unknown";

/**
 * Classify a flat EMV export row:
 * - category: title only (ITEMS SOLD)
 * - product: title + FILTER only
 * - variant: has Column15/price (and usually 13 + FILTER)
 */
export function classifyFlatEmvRow(row: Record<string, unknown>): FlatRowKind {
  const title = getStringField(row, ["title", "ITEMS SOLD", "items sold"]);
  if (!title) return "unknown";

  const hasPriceKey = hasKey(row, ["price", "Column15", "column15"]);
  const hasFilterKey = hasKey(row, ["FILTER", "filter"]);
  const hasStockKey = [...Object.keys(row)].some(
    (k) => k === "13" || k === "0" || /^\d+$/.test(k)
  );

  // Variant: has price and/or stock columns (13 / 0 / numeric keys)
  if (hasPriceKey || hasStockKey) return "variant";
  // Product: ITEMS SOLD + FILTER only
  if (hasFilterKey) return "product";
  // Category: ITEMS SOLD only
  return "category";
}

function toParsedProduct(
  name: string,
  productType: string,
  categoryName: string,
  vendorName: string,
  variants: ParsedImportVariant[]
): ParsedImportProduct {
  return {
    id: newId(),
    name,
    productType,
    categoryName,
    vendorName,
    groupName: categoryName,
    tags: uniqueSortedTags(
      variants.flatMap((variant) => extractVariantTags(variant.name))
    ),
    variants,
  };
}

/** Convert flat EMV spreadsheet rows into nested clean groups. */
export function transformFlatEmvToClean(
  rows: unknown[]
): { groups: CleanImportCategoryGroup[]; errors: string[] } {
  const errors: string[] = [];
  const groups: CleanImportCategoryGroup[] = [];

  let currentGroup: CleanImportCategoryGroup | null = null;
  let currentGroupProductType = "";
  let currentProduct: CleanImportProduct | null = null;

  const flushProduct = () => {
    if (currentGroup && currentProduct) {
      currentGroup.products.push(currentProduct);
      currentProduct = null;
    }
  };

  rows.forEach((raw, index) => {
    const path = `[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${path}: expected an object`);
      return;
    }

    const kind = classifyFlatEmvRow(raw);
    const title = getStringField(raw, ["title", "ITEMS SOLD", "items sold"]);

    if (kind === "category") {
      flushProduct();
      const split = splitGroupName(title);
      currentGroupProductType = split.productType;
      currentGroup = {
        category: split.categoryName,
        vendor: split.vendorName,
        products: [],
      };
      groups.push(currentGroup);
      return;
    }

    if (kind === "product") {
      if (!currentGroup) {
        errors.push(`${path}: product "${title}" before any category`);
        return;
      }
      flushProduct();
      currentProduct = {
        title,
        productType: currentGroupProductType,
        variants: [],
      };
      return;
    }

    if (kind === "variant") {
      if (!currentGroup) {
        errors.push(`${path}: variant "${title}" before any category`);
        return;
      }
      if (!currentProduct) {
        errors.push(`${path}: variant "${title}" before any product`);
        return;
      }

      const price = getNumberField(raw, ["price", "Column15", "column15"]);
      if (price == null || price < 0) {
        errors.push(`${path}: variant "${title}" missing/invalid price`);
        return;
      }

      currentProduct.variants.push({ title, price });
      return;
    }

    errors.push(`${path}: unrecognized row shape`);
  });

  flushProduct();
  return { groups, errors };
}

function parseCleanNested(raw: unknown[]): ProductJsonImportResult {
  const errors: string[] = [];
  const products: ParsedImportProduct[] = [];
  const emptyCategories: string[] = [];

  raw.forEach((groupRaw, gi) => {
    const path = `[${gi}]`;
    if (!isRecord(groupRaw)) {
      errors.push(`${path}: expected a group object`);
      return;
    }

    const categoryName =
      getStringField(groupRaw, ["category", "categoryName", "name"]) || "";
    const split = splitGroupName(categoryName);
    const groupProductType =
      getStringField(groupRaw, ["productType"]) || split.productType;
    const vendorName =
      getStringField(groupRaw, ["vendor", "vendorName"]) || split.vendorName;

    if (!categoryName) {
      errors.push(`${path}: missing category`);
      return;
    }

    const productList = groupRaw.products;
    if (!Array.isArray(productList)) {
      errors.push(`${path}: products must be an array`);
      return;
    }

    if (productList.length === 0) {
      emptyCategories.push(categoryName);
      return;
    }

    productList.forEach((productRaw, pi) => {
      const pPath = `${path}.products[${pi}]`;
      if (!isRecord(productRaw)) {
        errors.push(`${pPath}: expected a product object`);
        return;
      }

      const productTitle = getStringField(productRaw, ["title", "name"]);
      if (!productTitle) {
        errors.push(`${pPath}: missing title`);
        return;
      }

      // Prefer product-level productType (download format); fall back to group.
      const productType = hasKey(productRaw, ["productType"])
        ? getStringField(productRaw, ["productType"]) || groupProductType
        : groupProductType;

      const variantList = Array.isArray(productRaw.variants)
        ? productRaw.variants
        : [];
      if (productRaw.variants != null && !Array.isArray(productRaw.variants)) {
        errors.push(`${pPath}: variants must be an array`);
        return;
      }

      const variants: ParsedImportVariant[] = [];
      variantList.forEach((variantRaw, vi) => {
        const vPath = `${pPath}.variants[${vi}]`;
        if (!isRecord(variantRaw)) {
          errors.push(`${vPath}: expected a variant object`);
          return;
        }
        const variantTitle = getStringField(variantRaw, ["title", "name"]);
        const price = getNumberField(variantRaw, [
          "price",
          "Column15",
          "column15",
        ]);
        if (!variantTitle) {
          errors.push(`${vPath}: missing title`);
          return;
        }
        if (price == null || price < 0) {
          errors.push(`${vPath}: missing/invalid price`);
          return;
        }
        variants.push({ id: newId(), name: variantTitle, price });
      });

      products.push(
        toParsedProduct(
          productTitle,
          productType,
          categoryName,
          vendorName,
          variants
        )
      );
    });
  });

  return { products, errors, emptyCategories };
}

function isFlatEmvArray(raw: unknown[]): boolean {
  if (raw.length === 0) return false;
  const first = raw.find((row) => isRecord(row));
  if (!isRecord(first)) return false;
  return (
    hasKey(first, ["ITEMS SOLD", "items sold"]) ||
    (hasKey(first, ["title"]) &&
      (hasKey(first, ["FILTER", "filter"]) ||
        hasKey(first, ["Column15", "column15", "price"]) ||
        Object.keys(first).length === 1))
  );
}

function looksLikeCleanNested(raw: unknown[]): boolean {
  const first = raw.find((row) => isRecord(row));
  if (!isRecord(first)) return false;
  return (
    Array.isArray(first.products) &&
    (hasKey(first, ["category", "categoryName"]) ||
      hasKey(first, ["vendor", "vendorName"]) ||
      hasKey(first, ["productType"]))
  );
}

/** Accept download array, single group, or wrapped `{ categories | groups | data }`. */
function normalizeImportRoot(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return null;

  for (const key of ["categories", "groups", "data", "items"] as const) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
  }

  // Single category group object
  if (
    Array.isArray(raw.products) &&
    hasKey(raw, ["category", "categoryName", "name"])
  ) {
    return [raw];
  }

  return null;
}

/**
 * Parse uploaded product JSON (flat EMV rows or clean nested title/price groups).
 * Accepts the download format with product-level productType.
 */
export function parseProductJsonImport(raw: unknown): ProductJsonImportResult {
  const root = normalizeImportRoot(raw);
  if (!root) {
    return {
      products: [],
      errors: [
        "JSON root must be an array of category groups (download format), or a flat EMV export",
      ],
      emptyCategories: [],
    };
  }

  if (looksLikeCleanNested(root) && !isFlatEmvArray(root)) {
    return parseCleanNested(root);
  }

  // Flat EMV export: category / product / variant rows
  if (
    isFlatEmvArray(root) ||
    root.some(
      (row) => isRecord(row) && hasKey(row, ["ITEMS SOLD", "Column15"])
    )
  ) {
    const { groups, errors } = transformFlatEmvToClean(root);
    const nested = parseCleanNested(groups);
    return {
      products: nested.products,
      errors: [...errors, ...nested.errors],
      emptyCategories: nested.emptyCategories,
    };
  }

  // Legacy nested: { name, products: [{ name, variants: [{ name, price }] }] }
  return parseLegacyNested(root);
}

function parseLegacyNested(raw: unknown[]): ProductJsonImportResult {
  const errors: string[] = [];
  const products: ParsedImportProduct[] = [];

  raw.forEach((group, gi) => {
    const path = `[${gi}]`;
    if (!isRecord(group)) {
      errors.push(`${path}: expected a group object`);
      return;
    }

    const groupName = getStringField(group, ["name", "category"]);
    if (!groupName) {
      errors.push(`${path}: missing group name`);
      return;
    }

    const split = splitGroupName(groupName);
    if (!Array.isArray(group.products)) {
      errors.push(`${path}: products must be an array`);
      return;
    }

    group.products.forEach((productRaw, pi) => {
      const pPath = `${path}.products[${pi}]`;
      if (!isRecord(productRaw)) {
        errors.push(`${pPath}: expected product object`);
        return;
      }
      const productName = getStringField(productRaw, ["name", "title"]);
      if (!productName) {
        errors.push(`${pPath}: missing name`);
        return;
      }
      if (!Array.isArray(productRaw.variants)) {
        errors.push(`${pPath}: variants must be an array`);
        return;
      }

      const variants: ParsedImportVariant[] = [];
      productRaw.variants.forEach((variantRaw, vi) => {
        const vPath = `${pPath}.variants[${vi}]`;
        if (!isRecord(variantRaw)) {
          errors.push(`${vPath}: expected variant object`);
          return;
        }
        const variantName = getStringField(variantRaw, ["name", "title"]);
        const price = getNumberField(variantRaw, ["price"]);
        if (!variantName || price == null || price < 0) {
          errors.push(`${vPath}: invalid variant`);
          return;
        }
        variants.push({ id: newId(), name: variantName, price });
      });

      products.push(
        toParsedProduct(
          productName,
          split.productType,
          split.categoryName,
          split.vendorName,
          variants
        )
      );
    });
  });

  return { products, errors, emptyCategories: [] };
}

export interface ImportVendorGroup {
  id: string;
  vendorName: string;
  products: ParsedImportProduct[];
}

export interface ImportCategoryGroup {
  id: string;
  categoryName: string;
  vendors: ImportVendorGroup[];
}

export interface ImportProductTypeGroup {
  id: string;
  productType: string;
  categories: ImportCategoryGroup[];
}

function compareLabel(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Nest products: productType → category → vendor → products. */
export function groupImportProducts(
  products: ParsedImportProduct[],
  extraProductTypes: string[] = []
): ImportProductTypeGroup[] {
  const byType = new Map<string, ParsedImportProduct[]>();

  for (const product of products) {
    const typeKey = product.productType || "Untitled type";
    const list = byType.get(typeKey) ?? [];
    list.push(product);
    byType.set(typeKey, list);
  }

  for (const typeName of extraProductTypes) {
    const trimmed = typeName.trim();
    if (!trimmed || byType.has(trimmed)) continue;
    byType.set(trimmed, []);
  }

  return [...byType.entries()]
    .sort(([a], [b]) => compareLabel(a, b))
    .map(([productType, typeProducts]) => {
      const byCategory = new Map<string, ParsedImportProduct[]>();
      for (const product of typeProducts) {
        const categoryKey = product.categoryName || "Untitled category";
        const list = byCategory.get(categoryKey) ?? [];
        list.push(product);
        byCategory.set(categoryKey, list);
      }

      const categories: ImportCategoryGroup[] = [...byCategory.entries()]
        .sort(([a], [b]) => compareLabel(a, b))
        .map(([categoryName, categoryProducts]) => {
          const byVendor = new Map<string, ParsedImportProduct[]>();
          for (const product of categoryProducts) {
            const vendorKey = product.vendorName || "Untitled vendor";
            const list = byVendor.get(vendorKey) ?? [];
            list.push(product);
            byVendor.set(vendorKey, list);
          }

          const vendors: ImportVendorGroup[] = [...byVendor.entries()]
            .sort(([a], [b]) => compareLabel(a, b))
            .map(([vendorName, vendorProducts]) => ({
              id: newId(),
              vendorName,
              products: [...vendorProducts].sort((a, b) =>
                compareLabel(a.name, b.name)
              ),
            }));

          return {
            id: newId(),
            categoryName,
            vendors,
          };
        });

      return {
        id: newId(),
        productType,
        categories,
      };
    });
}

/** Flatten working list back to clean nested JSON (download / re-upload format). */
export function serializeImportProducts(
  products: ParsedImportProduct[],
  emptyCategories: string[] = []
): CleanImportCategoryGroup[] {
  type GroupBucket = {
    category: string;
    vendor: string;
    products: Map<string, CleanImportProduct>;
  };

  const groups = new Map<string, GroupBucket>();

  for (const product of products) {
    const productType = product.productType.trim() || "Untitled type";
    const category = product.categoryName.trim() || "Untitled category";
    const vendor = product.vendorName.trim() || "Untitled vendor";
    const key = `${category}\0${vendor}`;

    let bucket = groups.get(key);
    if (!bucket) {
      bucket = {
        category,
        vendor,
        products: new Map(),
      };
      groups.set(key, bucket);
    }

    const existing = bucket.products.get(`${productType}\0${product.name}`);
    const variants = product.variants.map((v) => ({
      title: v.name,
      price: v.price,
    }));

    if (existing) {
      existing.variants.push(...variants);
    } else {
      bucket.products.set(`${productType}\0${product.name}`, {
        title: product.name,
        productType,
        variants,
      });
    }
  }

  const usedCategories = new Set(
    [...groups.values()].map((bucket) => bucket.category)
  );

  for (const categoryName of emptyCategories) {
    const trimmed = categoryName.trim();
    if (!trimmed || usedCategories.has(trimmed)) continue;
    groups.set(`${trimmed}\0`, {
      category: trimmed,
      vendor: "",
      products: new Map(),
    });
  }

  return [...groups.values()]
    .sort((a, b) => {
      const byCategory = compareLabel(a.category, b.category);
      if (byCategory !== 0) return byCategory;
      return compareLabel(a.vendor, b.vendor);
    })
    .map((bucket) => ({
      category: bucket.category,
      vendor: bucket.vendor,
      products: [...bucket.products.values()].sort((a, b) =>
        compareLabel(a.title, b.title)
      ),
    }));
}

/** Move every product in a category from one product type to another. */
export function transferCategoryToProductType(
  products: ParsedImportProduct[],
  categoryName: string,
  fromProductType: string,
  toProductType: string
): ParsedImportProduct[] {
  const target = toProductType.trim();
  if (!target) return products;

  return products.map((product) => {
    if (
      product.categoryName !== categoryName ||
      product.productType !== fromProductType
    ) {
      return product;
    }
    return { ...product, productType: target };
  });
}

export function listCategoryOptions(
  products: ParsedImportProduct[]
): Array<{ productType: string; categoryName: string; productCount: number }> {
  const counts = new Map<string, number>();
  for (const product of products) {
    const key = `${product.productType}\0${product.categoryName}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, productCount]) => {
      const [productType, categoryName] = key.split("\0");
      return { productType, categoryName, productCount };
    })
    .sort((a, b) => {
      const byType = compareLabel(a.productType, b.productType);
      if (byType !== 0) return byType;
      return compareLabel(a.categoryName, b.categoryName);
    });
}

/** Unique categories for tabs. */
export function listCategoryTabs(
  products: ParsedImportProduct[],
  extraCategories: string[] = []
): Array<{
  categoryName: string;
  productCount: number;
  variantCount: number;
}> {
  const counts = new Map<
    string,
    { productCount: number; variantCount: number }
  >();

  for (const product of products) {
    const categoryName = product.categoryName || "Untitled category";
    const current = counts.get(categoryName) ?? {
      productCount: 0,
      variantCount: 0,
    };
    counts.set(categoryName, {
      productCount: current.productCount + 1,
      variantCount: current.variantCount + product.variants.length,
    });
  }

  for (const extra of extraCategories) {
    const categoryName = extra.trim();
    if (!categoryName || counts.has(categoryName)) continue;
    counts.set(categoryName, { productCount: 0, variantCount: 0 });
  }

  return [...counts.entries()]
    .map(([categoryName, countsForCategory]) => ({
      categoryName,
      productCount: countsForCategory.productCount,
      variantCount: countsForCategory.variantCount,
    }))
    .sort((a, b) => compareLabel(a.categoryName, b.categoryName));
}

/** Move selected products into a category (keeps each product's type). */
export function assignProductsToCategory(
  products: ParsedImportProduct[],
  productIds: Iterable<string>,
  categoryName: string
): ParsedImportProduct[] {
  const ids = new Set(productIds);
  const targetCategory = categoryName.trim();
  if (!targetCategory || ids.size === 0) return products;

  return products.map((product) => {
    if (!ids.has(product.id)) return product;
    return {
      ...product,
      categoryName: targetCategory,
      groupName: targetCategory,
    };
  });
}

/** Assign selected products to a product type. */
export function assignProductsToProductType(
  products: ParsedImportProduct[],
  productIds: Iterable<string>,
  productType: string
): ParsedImportProduct[] {
  const ids = new Set(productIds);
  const target = productType.trim();
  if (!target || ids.size === 0) return products;

  return products.map((product) => {
    if (!ids.has(product.id)) return product;
    if (product.productType === target) return product;
    return { ...product, productType: target };
  });
}

/** Create a new product in a category. */
export function createImportProduct(input: {
  name: string;
  productType: string;
  categoryName: string;
  vendorName?: string;
}): ParsedImportProduct | null {
  const name = input.name.trim();
  const productType = input.productType.trim();
  const categoryName = input.categoryName.trim();
  if (!name || !productType || !categoryName) return null;

  return toParsedProduct(
    name,
    productType,
    categoryName,
    input.vendorName?.trim() || "",
    []
  );
}

/** Add a variant to an existing product. */
export function addImportVariant(
  products: ParsedImportProduct[],
  productId: string,
  input: { name: string; price: number }
): ParsedImportProduct[] {
  const name = input.name.trim();
  if (!name || !Number.isFinite(input.price) || input.price < 0) {
    return products;
  }

  return products.map((product) => {
    if (product.id !== productId) return product;
    const variant: ParsedImportVariant = {
      id: newId(),
      name,
      price: input.price,
    };
    return {
      ...product,
      variants: [...product.variants, variant],
      tags: uniqueSortedTags([
        ...product.tags,
        ...extractVariantTags(name),
      ]),
    };
  });
}

/** Update an existing variant name and/or price. */
export function updateImportVariant(
  products: ParsedImportProduct[],
  productId: string,
  variantId: string,
  input: { name: string; price: number }
): ParsedImportProduct[] {
  const name = input.name.trim();
  if (!name || !Number.isFinite(input.price) || input.price < 0) {
    return products;
  }

  return products.map((product) => {
    if (product.id !== productId) return product;

    const variants = product.variants.map((variant) =>
      variant.id === variantId
        ? { ...variant, name, price: input.price }
        : variant
    );

    return {
      ...product,
      variants,
      tags: uniqueSortedTags(
        variants.flatMap((variant) => extractVariantTags(variant.name))
      ),
    };
  });
}

/** Rename a category across all products that use it. */
export function renameImportCategory(
  products: ParsedImportProduct[],
  fromCategoryName: string,
  toCategoryName: string
): ParsedImportProduct[] {
  const from = fromCategoryName.trim();
  const to = toCategoryName.trim();
  if (!from || !to || from === to) return products;

  return products.map((product) => {
    if (product.categoryName !== from) return product;
    return {
      ...product,
      categoryName: to,
      groupName: to,
    };
  });
}

/** Update a single import product's name, type, category, and/or vendor. */
export function updateImportProduct(
  products: ParsedImportProduct[],
  productId: string,
  updates: {
    name?: string;
    productType?: string;
    categoryName?: string;
    vendorName?: string;
  }
): ParsedImportProduct[] {
  return products.map((product) => {
    if (product.id !== productId) return product;

    const name = updates.name?.trim();
    const productType = updates.productType?.trim();
    const categoryName = updates.categoryName?.trim();

    return {
      ...product,
      ...(name ? { name } : {}),
      ...(productType ? { productType } : {}),
      ...(categoryName
        ? { categoryName, groupName: categoryName }
        : {}),
      ...(updates.vendorName !== undefined
        ? { vendorName: updates.vendorName.trim() }
        : {}),
    };
  });
}

export function listProductTypeNames(
  products: ParsedImportProduct[],
  extraProductTypes: string[] = []
): string[] {
  const names = new Set<string>();
  for (const product of products) {
    const trimmed = product.productType.trim();
    if (trimmed) names.add(trimmed);
  }
  for (const typeName of extraProductTypes) {
    const trimmed = typeName.trim();
    if (trimmed) names.add(trimmed);
  }
  return [...names].sort(compareLabel);
}

export function summarizeImport(products: ParsedImportProduct[]): {
  productCount: number;
  variantCount: number;
  categoryCount: number;
  productTypeCount: number;
  vendorCount: number;
  zeroPriceVariantCount: number;
} {
  const zeroPriceVariantCount = products.reduce(
    (sum, product) =>
      sum + product.variants.filter((variant) => variant.price === 0).length,
    0
  );

  return {
    productCount: products.length,
    variantCount: products.reduce((sum, p) => sum + p.variants.length, 0),
    categoryCount: new Set(products.map((p) => p.categoryName)).size,
    productTypeCount: new Set(products.map((p) => p.productType)).size,
    vendorCount: new Set(products.map((p) => p.vendorName).filter(Boolean)).size,
    zeroPriceVariantCount,
  };
}

export interface ZeroPriceVariantRow {
  productId: string;
  productName: string;
  categoryName: string;
  productType: string;
  variantId: string;
  variantName: string;
  price: number;
}

/** List all variants priced at exactly 0. */
export function listZeroPriceVariants(
  products: ParsedImportProduct[]
): ZeroPriceVariantRow[] {
  const rows: ZeroPriceVariantRow[] = [];

  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.price !== 0) continue;
      rows.push({
        productId: product.id,
        productName: product.name,
        categoryName: product.categoryName,
        productType: product.productType,
        variantId: variant.id,
        variantName: variant.name,
        price: variant.price,
      });
    }
  }

  return rows.sort((a, b) => {
    const byCategory = compareLabel(a.categoryName, b.categoryName);
    if (byCategory !== 0) return byCategory;
    const byProduct = compareLabel(a.productName, b.productName);
    if (byProduct !== 0) return byProduct;
    return compareLabel(a.variantName, b.variantName);
  });
}

export function formatImportPrice(price: number): string {
  return formatCurrency(price);
}
