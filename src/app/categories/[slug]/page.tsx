import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopCatalog } from "@/components/shop/shop-catalog";
import { fetchCategoryBySlug } from "@/lib/firestore/public-catalog";
import { absoluteUrl, categoryPath, SITE_NAME } from "@/lib/seo";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await fetchCategoryBySlug(slug);
  if (!category) {
    return { title: `Category not found | ${SITE_NAME}` };
  }

  const description = `Browse ${category.name} products at ${SITE_NAME}. Order with cash on delivery.`;

  return {
    title: `${category.name} | ${SITE_NAME}`,
    description,
    alternates: { canonical: absoluteUrl(categoryPath(category.slug)) },
    openGraph: {
      title: `${category.name} | ${SITE_NAME}`,
      description,
      url: absoluteUrl(categoryPath(category.slug)),
      type: "website",
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = await fetchCategoryBySlug(slug);
  if (!category) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    description: `Products in the ${category.name} category`,
    url: absoluteUrl(categoryPath(category.slug)),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ShopCatalog
        categorySlug={category.slug}
        title={category.name}
        description={`Browse ${category.name.toLowerCase()} and order with cash on delivery.`}
      />
    </>
  );
}
