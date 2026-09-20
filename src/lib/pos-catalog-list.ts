import type { VariantWithStock } from "@/lib/inventory";
import {
  getCatalogImageUrl,
  showCatalogImages,
  type CatalogImageSource,
} from "@/lib/products";
import type { Product } from "@/types";

export type PosCatalogListItem =
  | { kind: "single"; row: VariantWithStock }
  | {
      kind: "group";
      productId: string;
      productName: string;
      imageUrl: string;
      variants: VariantWithStock[];
    };

/** Same thumb resolution the POS grid uses for each variant card. */
export function resolvePosCatalogThumb(
  product: Product | undefined,
  row: Pick<VariantWithStock, "imageId">,
  catalogImageSource: CatalogImageSource
): string | null {
  if (!product || !showCatalogImages(catalogImageSource)) return null;
  const url = getCatalogImageUrl(
    product,
    row,
    catalogImageSource === "none"
      ? "none"
      : row.imageId
        ? "variant"
        : catalogImageSource
  );
  return url || null;
}

/**
 * Collapse selling variants that share the same selected product image into one
 * list card. Only variants with a matching non-null `imageId` (2+) are grouped;
 * everything else stays as a single card.
 */
export function buildPosCatalogListItems(
  rows: VariantWithStock[],
  productsById: Map<string, Product>,
  catalogImageSource: CatalogImageSource
): PosCatalogListItem[] {
  type Bucket = {
    productId: string;
    productName: string;
    imageUrl: string | null;
    variants: VariantWithStock[];
  };

  const buckets = new Map<string, Bucket>();
  const order: string[] = [];

  for (const row of rows) {
    const product = productsById.get(row.productId);
    const thumb = resolvePosCatalogThumb(product, row, catalogImageSource);
    const canGroup =
      row.imageId != null && row.imageId !== "" && thumb != null;
    const key = canGroup
      ? `group:${row.productId}:${row.imageId}`
      : `single:${row.id}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        productId: row.productId,
        productName: row.productName,
        imageUrl: thumb,
        variants: [],
      };
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.variants.push(row);
  }

  return order.map((key) => {
    const bucket = buckets.get(key)!;
    if (bucket.imageUrl != null && bucket.variants.length > 1) {
      return {
        kind: "group" as const,
        productId: bucket.productId,
        productName: bucket.productName,
        imageUrl: bucket.imageUrl,
        variants: bucket.variants,
      };
    }
    return { kind: "single" as const, row: bucket.variants[0]! };
  });
}
