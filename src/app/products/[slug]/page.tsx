import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProductDetailView } from "@/components/shop/product-detail";
import { fetchProductBySlug } from "@/lib/firestore/public-catalog";
import { stripHtml } from "@/lib/html-text";
import { absoluteUrl, productPath, SITE_NAME } from "@/lib/seo";
import { getProductThumbnailUrl } from "@/lib/products";
import { getDefaultVariant } from "@/lib/product-variants";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  let product: Awaited<ReturnType<typeof fetchProductBySlug>> = null;

  try {
    product = await fetchProductBySlug(slug);
  } catch {
    return { title: `Product not found | ${SITE_NAME}` };
  }

  if (!product) {
    return { title: `Product not found | ${SITE_NAME}` };
  }

  const url = absoluteUrl(productPath(product.slug));
  const image = getProductThumbnailUrl(product);

  const description = stripHtml(product.description);

  return {
    title: `${product.name} | ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: product.name,
      description,
      url,
      type: "website",
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  let product: Awaited<ReturnType<typeof fetchProductBySlug>> = null;

  try {
    product = await fetchProductBySlug(slug);
  } catch (error) {
    console.error("[ProductPage] fetchProductBySlug failed:", error);
    notFound();
  }

  if (!product) notFound();

  const defaultVariant = getDefaultVariant(product);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: stripHtml(product.description),
    image: product.images.map((img) => img.url).filter(Boolean),
    offers: {
      "@type": "Offer",
      priceCurrency: "PHP",
      price: defaultVariant.price,
      availability: "https://schema.org/InStock",
      url: absoluteUrl(productPath(product.slug)),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense fallback={null}>
        <ProductDetailView product={product} />
      </Suspense>
    </>
  );
}
