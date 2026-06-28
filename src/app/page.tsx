"use client";

import { useEffect, useState } from "react";
import { Package, Truck, Banknote, Star } from "lucide-react";
import { HomeHero } from "@/components/shop/home-hero";
import { CategoriesSection } from "@/components/shop/categories-section";
import { ProductsSection } from "@/components/shop/products-section";
import { TestimonialsCarousel } from "@/components/shop/testimonials-carousel";
import { HomePageSkeleton } from "@/components/shop/home-skeletons";
import { getActiveBanners, getActiveTestimonials } from "@/lib/firestore/homepage";
import { getProducts } from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getOnlineShopBranch } from "@/lib/firestore/branches";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { mergeProductsWithInventory } from "@/lib/inventory";
import type { Category, HomeBanner, Testimonial } from "@/types";
import type { ProductWithStock } from "@/lib/inventory";

const HIGHLIGHTS = [
  { icon: Package, label: "Quality products", value: "Curated" },
  { icon: Truck, label: "Door delivery", value: "Fast" },
  { icon: Banknote, label: "Cash on delivery", value: "Easy" },
  { icon: Star, label: "Happy customers", value: "Trusted" },
];

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
    return <HomePageSkeleton />;
  }

  return (
    <div className="bg-white text-foreground">
      <HomeHero banners={banners} />

      <section className="bg-white py-12 sm:py-16">
        <div className="container mx-auto px-4">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Why shop with us
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {HIGHLIGHTS.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex flex-col items-center rounded-2xl border border-brand-yellow/25 bg-brand-yellow/10 px-4 py-6 text-center"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-black text-brand-yellow">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-xl font-bold text-brand-black">{value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-12 sm:py-16">
        <div className="container mx-auto px-4">
          <CategoriesSection categories={categories} variant="home" />
        </div>
      </section>

      <section className="bg-white py-12 sm:py-16">
        <div className="container mx-auto px-4">
          <ProductsSection
            products={products}
            categories={categories}
            variant="home"
          />
        </div>
      </section>

      <section className="rounded-t-[2rem] bg-brand-black py-14 text-brand-yellow sm:rounded-t-[2.5rem] sm:py-20">
        <div className="container mx-auto px-4">
          <TestimonialsCarousel
            testimonials={testimonials}
            variant="home"
            dark
          />
        </div>
      </section>
    </div>
  );
}
