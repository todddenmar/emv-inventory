import type { VariantWithStock } from "@/lib/inventory";
import {
  getCatalogImageUrl,
  showCatalogImages,
  type CatalogImageSource,
} from "@/lib/products";
import type { Product } from "@/types";

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
