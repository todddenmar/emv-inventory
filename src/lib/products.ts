import type { Product, ProductImage } from "@/types";

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

export function sortProductImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => a.order - b.order);
}

export function normalizeImageOrder(images: ProductImage[]): ProductImage[] {
  return sortProductImages(images).map((img, index) => ({
    ...img,
    order: index,
  }));
}
