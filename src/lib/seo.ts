export const SITE_NAME = "El Mio Vicente";

export function productPath(slug: string): string {
  return `/products/${slug}`;
}

export function productVariantPath(slug: string, variantId: string): string {
  return `/products/${slug}?variant=${encodeURIComponent(variantId)}`;
}

export function categoryPath(slug: string): string {
  return `/categories/${slug}`;
}

export function absoluteUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
