export const SITE_NAME = "El Mio Vicente";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/** Canonical site origin for SEO, sitemap, and Open Graph URLs. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return trimTrailingSlash(explicit);

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${trimTrailingSlash(production)}`;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${trimTrailingSlash(vercel)}`;

  return "http://localhost:3000";
}

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
  const base = getSiteUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
