"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/shop/product-card";
import {
  ProductsSectionSkeleton,
  ProductCardSkeleton,
} from "@/components/shop/home-skeletons";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";
import type { ProductWithStock } from "@/lib/inventory";

interface ProductsSectionProps {
  products: ProductWithStock[];
  categories: Category[];
  loading?: boolean;
  title?: string;
  variant?: "default" | "home";
  /** Dark background (homepage products block) */
  dark?: boolean;
}

function sortFeaturedProducts(products: ProductWithStock[]) {
  return [...products]
    .sort((a, b) => {
      if (a.anyInStock && !b.anyInStock) return -1;
      if (!a.anyInStock && b.anyInStock) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 8);
}

function FeaturedProductsMobileCarousel({
  products,
  categoryMap,
  variant,
}: {
  products: ProductWithStock[];
  categoryMap: Record<string, Category>;
  variant: "default" | "home";
}) {
  return (
    <div className="-mx-4 px-4 md:hidden">
      <Carousel
        opts={{
          align: "start",
          containScroll: "trimSnaps",
          loop: products.length > 1,
        }}
      >
        <CarouselContent className="-ml-3">
          {products.map((product) => (
            <CarouselItem key={product.id} className="basis-[84%] pl-3 sm:basis-[72%]">
              <ProductCard
                product={product}
                stock={product.stock}
                variant={variant}
                categories={product.categoryIds
                  .map((id) => categoryMap[id])
                  .filter(Boolean)}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}

export function ProductsSection({
  products,
  categories,
  loading,
  title = "Featured products",
  variant = "default",
  dark = false,
}: ProductsSectionProps) {
  const isHome = variant === "home";
  const isDark = isHome && dark;
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const featured = sortFeaturedProducts(products);

  if (loading) {
    return <ProductsSectionSkeleton variant={variant} dark={dark} />;
  }

  if (featured.length === 0) {
    return (
      <section className="space-y-4">
        <h2
          className={cn(
            "text-xl font-semibold sm:text-2xl",
            isDark ? "text-brand-yellow" : isHome && "text-brand-black"
          )}
        >
          {title}
        </h2>
        <div className="flex gap-3 overflow-hidden md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-4">
          <div className="w-[84%] shrink-0 md:w-auto">
            <ProductCardSkeleton variant={variant} />
          </div>
          <div className="w-[84%] shrink-0 md:w-auto">
            <ProductCardSkeleton variant={variant} />
          </div>
          <div className="hidden md:block">
            <ProductCardSkeleton variant={variant} />
          </div>
          <div className="hidden lg:block">
            <ProductCardSkeleton variant={variant} />
          </div>
        </div>
        <p
          className={cn(
            "text-center text-sm",
            isDark
              ? "text-brand-yellow/70"
              : isHome
                ? "text-muted-foreground"
                : "text-muted-foreground"
          )}
        >
          Products coming soon — check back shortly.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          {isHome && (
            <p
              className={cn(
                "mb-2 text-xs font-semibold uppercase tracking-widest",
                isDark ? "text-brand-yellow/70" : "text-brand-yellow"
              )}
            >
              Popular picks
            </p>
          )}
          <h2
            className={cn(
              "text-2xl font-bold sm:text-3xl",
              isDark ? "text-brand-yellow" : isHome && "text-brand-black"
            )}
          >
            {title}
          </h2>
        </div>
        {isHome ? (
          <Link
            href="/shop"
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90",
              isDark
                ? "bg-brand-yellow text-brand-black"
                : "bg-brand-black text-brand-yellow"
            )}
          >
            Shop all
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {isHome ? (
        <>
          <FeaturedProductsMobileCarousel
            products={featured}
            categoryMap={categoryMap}
            variant={variant}
          />
          <div className="hidden items-stretch gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                stock={product.stock}
                variant={variant}
                categories={product.categoryIds
                  .map((id) => categoryMap[id])
                  .filter(Boolean)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 items-stretch gap-4 lg:grid-cols-4">
          {featured.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              stock={product.stock}
              variant={variant}
              categories={product.categoryIds
                .map((id) => categoryMap[id])
                .filter(Boolean)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
