import type { Product, ProductVariant } from "@/types";

export type CatalogImageSource = "product" | "variant" | "none";

export function getProductThumbnailUrl(product: Product): string {
  if (product.thumbnailImageId) {
    const thumb = product.images.find(
      (img) => img.id === product.thumbnailImageId
    );
    if (thumb) return thumb.url;
  }
  const sorted = [...product.images].sort((a, b) => a.order - b.order);
  return sorted[0]?.url ?? "";
}

/** Prefer variant image when setting is "variant"; return empty when "none". */
export function getCatalogImageUrl(
  product: Product,
  variant?: Pick<ProductVariant, "imageId"> | null,
  source: CatalogImageSource = "product"
): string {
  if (source === "none") return "";
  if (source === "variant" && variant?.imageId) {
    const image = product.images.find((img) => img.id === variant.imageId);
    if (image?.url) return image.url;
  }
  return getProductThumbnailUrl(product);
}

export function showCatalogImages(source: CatalogImageSource): boolean {
  return source !== "none";
}

export function sortProductImages(
  images: Product["images"]
): Product["images"] {
  return [...images].sort((a, b) => a.order - b.order);
}

export function normalizeImageOrder(
  images: Product["images"]
): Product["images"] {
  return sortProductImages(images).map((img, index) => ({
    ...img,
    order: index,
  }));
}
