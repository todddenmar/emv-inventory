"use client";

import { useEffect, useState } from "react";
import { HomeBanners } from "@/components/shop/home-banners";
import { CategoriesSection } from "@/components/shop/categories-section";
import { ProductsSection } from "@/components/shop/products-section";
import { TestimonialsCarousel } from "@/components/shop/testimonials-carousel";
import { HomePageSkeleton } from "@/components/shop/home-skeletons";
import { LinkButton } from "@/components/ui/link-button";
import { getActiveBanners, getActiveTestimonials } from "@/lib/firestore/homepage";
import { getProducts } from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getOnlineShopBranch } from "@/lib/firestore/branches";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { mergeProductsWithInventory } from "@/lib/inventory";
import type { Category, HomeBanner, Testimonial } from "@/types";
import type { ProductWithStock } from "@/lib/inventory";

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    async function load() {
      const [bannerData, categoryData, testimonialData, shopBranch] =
        await Promise.all([
          getActiveBanners().catch(() => [] as HomeBanner[]),
          getCategories().catch(() => [] as Category[]),
          getActiveTestimonials().catch(() => [] as Testimonial[]),
          getOnlineShopBranch().catch(() => null),
        ]);

      setBanners(bannerData);
      setCategories(categoryData);
      setTestimonials(testimonialData);

      if (shopBranch) {
        const [catalog, inventory] = await Promise.all([
          getProducts(true),
          getBranchInventory(shopBranch.id),
        ]);
        setProducts(
          mergeProductsWithInventory(catalog, inventory).filter(
            (p) => p.isActive
          )
        );
      }
    }

    load().catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <HomePageSkeleton />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-10 px-4 py-6">
      <HomeBanners banners={banners} />

      <section className="rounded-xl border bg-muted/30 p-6 text-center sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome to El Mio Vicente
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
          Quality products delivered to your door. Pay cash on delivery — simple
          and convenient.
        </p>
        <LinkButton href="/shop" className="mt-4">
          Browse all products
        </LinkButton>
      </section>

      <CategoriesSection categories={categories} />
      <ProductsSection products={products} categories={categories} />
      <TestimonialsCarousel testimonials={testimonials} />
    </div>
  );
}
