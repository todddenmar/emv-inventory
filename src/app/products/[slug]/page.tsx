import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailView } from "@/components/shop/product-detail";
import { fetchProductBySlug } from "@/lib/firestore/public-catalog";
import { absoluteUrl, productPath, SITE_NAME } from "@/lib/seo";
import { getProductThumbnailUrl } from "@/lib/products";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  if (!product) {
    return { title: `Product not found | ${SITE_NAME}` };
  }

  const url = absoluteUrl(productPath(product.slug));
  const image = getProductThumbnailUrl(product);

  return {
    title: `${product.name} | ${SITE_NAME}`,
    description: product.description,
    alternates: { canonical: url },
    openGraph: {
      title: product.name,
      description: product.description,
      url,
      type: "website",
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  if (!product) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((img) => img.url).filter(Boolean),
    offers: {
      "@type": "Offer",
      priceCurrency: "PHP",
      price: product.price,
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
      <ProductDetailView product={product} />
    </>
  );
}
