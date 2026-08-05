import { formatCurrency } from "@/lib/format";

export interface ImportJsonVariant {
  name: string;
  price: number;
}

export interface ImportJsonProduct {
  name: string;
  variants: ImportJsonVariant[];
}

export interface ImportJsonGroup {
  name: string;
  products: ImportJsonProduct[];
}

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

/**
 * Split a top-level group name into category + productType.
 * e.g. "BOM X MAGS" → { categoryName: "BOM X", productType: "MAGS" }
 */
export function splitGroupName(groupName: string): {
  categoryName: string;
  productType: string;
} {
  const trimmed = groupName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { categoryName: "", productType: "" };
  }
  if (parts.length === 1) {
    return { categoryName: parts[0], productType: parts[0] };
  }
  return {
    categoryName: parts.slice(0, -1).join(" "),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseVariant(
  raw: unknown,
  path: string,
  errors: string[]
): ParsedImportVariant | null {
  if (!isRecord(raw)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const price = typeof raw.price === "number" ? raw.price : Number(raw.price);
  if (!name) {
    errors.push(`${path}: missing name`);
    return null;
  }
  if (!Number.isFinite(price) || price < 0) {
    errors.push(`${path}: invalid price`);
    return null;
  }
  return { id: newId(), name, price };
}

function parseProduct(
  raw: unknown,
  path: string,
  errors: string[]
): { name: string; variants: ParsedImportVariant[] } | null {
  if (!isRecord(raw)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) {
    errors.push(`${path}: missing name`);
    return null;
  }
  if (!Array.isArray(raw.variants)) {
    errors.push(`${path}: variants must be an array`);
    return null;
  }
  const variants = raw.variants
    .map((v, i) => parseVariant(v, `${path}.variants[${i}]`, errors))
    .filter((v): v is ParsedImportVariant => v !== null);

  return { name, variants };
}

/**
 * Parse uploaded product JSON into a flat product list for preview.
 * Top-level group name → category/vendor (all but last word) + productType (last word).
 * Tags are derived from variant names (motors + color/finish).
 */
export function parseProductJsonImport(raw: unknown): ProductJsonImportResult {
  const errors: string[] = [];
  const products: ParsedImportProduct[] = [];

  if (!Array.isArray(raw)) {
    return { products: [], errors: ["JSON root must be an array"] };
  }

  raw.forEach((group, gi) => {
    const path = `[${gi}]`;
    if (!isRecord(group)) {
      errors.push(`${path}: expected a group object`);
      return;
    }

    const groupName = typeof group.name === "string" ? group.name.trim() : "";
    if (!groupName) {
      errors.push(`${path}: missing group name`);
      return;
    }

    const { categoryName, productType } = splitGroupName(groupName);
    const vendorName = categoryName;

    if (!Array.isArray(group.products)) {
      errors.push(`${path}: products must be an array`);
      return;
    }

    group.products.forEach((productRaw, pi) => {
      const product = parseProduct(productRaw, `${path}.products[${pi}]`, errors);
      if (!product) return;

      const tags = uniqueSortedTags(
        product.variants.flatMap((variant) => extractVariantTags(variant.name))
      );

      products.push({
        id: newId(),
        name: product.name,
        productType,
        categoryName,
        vendorName,
        groupName,
        tags,
        variants: product.variants,
      });
    });
  });

  return { products, errors };
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
  products: ParsedImportProduct[]
): ImportProductTypeGroup[] {
  const byType = new Map<string, ParsedImportProduct[]>();

  for (const product of products) {
    const typeKey = product.productType || "Untitled type";
    const list = byType.get(typeKey) ?? [];
    list.push(product);
    byType.set(typeKey, list);
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

export function summarizeImport(products: ParsedImportProduct[]): {
  productCount: number;
  variantCount: number;
  categoryCount: number;
  productTypeCount: number;
  vendorCount: number;
} {
  return {
    productCount: products.length,
    variantCount: products.reduce((sum, p) => sum + p.variants.length, 0),
    categoryCount: new Set(products.map((p) => p.categoryName)).size,
    productTypeCount: new Set(products.map((p) => p.productType)).size,
    vendorCount: new Set(products.map((p) => p.vendorName).filter(Boolean)).size,
  };
}

export function formatImportPrice(price: number): string {
  return formatCurrency(price);
}
