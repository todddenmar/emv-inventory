"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { HomeBanners } from "@/components/shop/home-banners";
import type { HomeBanner } from "@/types";

interface HomeHeroProps {
  banners: HomeBanner[];
}

export function HomeHero({ banners }: HomeHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-b-[1.75rem] bg-brand-yellow text-brand-black sm:rounded-b-[2.5rem]">
      <div className="pointer-events-none absolute -right-16 top-8 h-40 w-40 rounded-full bg-brand-black/5 blur-3xl" />
      <div className="pointer-events-none absolute bottom-24 left-8 h-24 w-24 rounded-full bg-brand-black/5 blur-2xl" />

      <div className="container mx-auto px-4 pb-4 pt-24 sm:pt-28 sm:pb-4">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-black px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-yellow">
              <Sparkles className="h-3.5 w-3.5" />
              Welcome
            </span>

            <div className="flex items-center gap-4">
              <BrandLogo size="lg" showName={false} />
              <div>
                <p className="text-sm font-medium uppercase tracking-wide opacity-70">
                  Est. quality service
                </p>
                <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  El Mio Vicente
                </h1>
              </div>
            </div>

            <p className="max-w-lg text-base leading-relaxed opacity-80 sm:text-lg">
              Quality products delivered to your door. Browse our catalog and pay
              cash on delivery — simple, fast, and convenient.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 rounded-full bg-brand-black px-6 py-3 text-sm font-semibold text-brand-yellow transition-opacity hover:opacity-90"
              >
                Shop now
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 rounded-full border-2 border-brand-black/20 px-6 py-3 text-sm font-semibold transition-colors hover:bg-brand-black/5"
              >
                View categories
              </Link>
            </div>
          </div>

          <div className="min-w-0">
            {banners.length > 0 ? (
              <HomeBanners banners={banners} variant="home" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-3xl border-2 border-brand-black/10 bg-brand-black/5 p-8">
                <BrandLogo size="xl" showName={false} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
