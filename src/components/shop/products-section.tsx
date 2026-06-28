"use client";

import { ProductCard } from "@/components/shop/product-card";
import { LinkButton } from "@/components/ui/link-button";
import {
  ProductsSectionSkeleton,
  ProductCardSkeleton,
} from "@/components/shop/home-skeletons";
import type { Category, Product } from "@/types";
import type { ProductWithStock } from "@/lib/inventory";

interface ProductsSectionProps {
  products: ProductWithStock[];
  categories: Category[];
  loading?: boolean;
  title?: string;
}

export function ProductsSection({
  products,
  categories,
  loading,
  title = "Featured products",
}: ProductsSectionProps) {
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const inStock = products.filter((p) => p.stock > 0).slice(0, 8);

  if (loading) return <ProductsSectionSkeleton />;

  if (inStock.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Products coming soon — check back shortly.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
        <LinkButton href="/shop" variant="ghost" size="sm">
          Shop all
        </LinkButton>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {inStock.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            stock={product.stock}
            categories={product.categoryIds
              .map((id) => categoryMap[id])
              .filter(Boolean)}
          />
        ))}
      </div>
    </section>
  );
}
