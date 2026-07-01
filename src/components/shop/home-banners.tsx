"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { BannerSkeleton } from "@/components/shop/home-skeletons";
import { homeHeroVisualClass } from "@/components/shop/home-hero-visual";
import { BrandLogo } from "@/components/layout/brand-logo";
import { cn } from "@/lib/utils";
import type { HomeBanner } from "@/types";

interface HomeBannersProps {
  banners: HomeBanner[];
  loading?: boolean;
  variant?: "default" | "home";
}

export function HomeBanners({
  banners,
  loading,
  variant = "default",
}: HomeBannersProps) {
  const [api, setApi] = useState<CarouselApi>();
  const isHome = variant === "home";

  useEffect(() => {
    if (!api || banners.length <= 1) return;
    const timer = setInterval(() => api.scrollNext(), 5000);
    return () => clearInterval(timer);
  }, [api, banners.length]);

  if (loading) return <BannerSkeleton variant={variant} />;

  if (banners.length === 0) return null;

  const homeBannerFrame = cn(
    homeHeroVisualClass,
    "overflow-hidden rounded-3xl border-2 border-brand-black/15 shadow-xl"
  );

  return (
    <section className={cn("relative w-full max-w-lg lg:max-w-none", !isHome && "px-1")}>
      <Carousel setApi={setApi} opts={{ loop: banners.length > 1 }}>
        <CarouselContent className={cn(isHome && "ml-0")}>
          {banners.map((banner) => {
            const content = (
              <div
                className={cn(
                  "relative",
                  isHome
                    ? homeBannerFrame
                    : "aspect-[21/9] overflow-hidden rounded-xl sm:aspect-[3/1]"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={banner.imageUrl}
                  alt={banner.title}
                  className="h-full w-full object-cover"
                />
                <div
                  className={cn(
                    "absolute inset-0",
                    isHome
                      ? "bg-gradient-to-t from-brand-black/80 via-brand-black/20 to-transparent"
                      : "bg-gradient-to-r from-black/60 via-black/30 to-transparent"
                  )}
                />
                {!isHome && (
                  <div className="absolute left-4 top-4 sm:left-6 sm:top-6">
                    <BrandLogo size="md" showName={false} className="drop-shadow-lg" />
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-8">
                  <h2
                    className={cn(
                      "max-w-xl font-bold",
                      isHome
                        ? "text-xl text-brand-yellow sm:text-2xl"
                        : "text-xl text-white sm:text-3xl"
                    )}
                  >
                    {banner.title}
                  </h2>
                  {banner.subtitle && (
                    <p
                      className={cn(
                        "mt-1 max-w-lg text-sm sm:text-base",
                        isHome ? "text-brand-yellow/80" : "text-white/90"
                      )}
                    >
                      {banner.subtitle}
                    </p>
                  )}
                </div>
              </div>
            );

            return (
              <CarouselItem
                key={banner.id}
                className={cn(isHome && "basis-full pl-0")}
              >
                {banner.linkUrl ? (
                  <Link href={banner.linkUrl} className="block">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </CarouselItem>
            );
          })}
        </CarouselContent>
        {banners.length > 1 && (
          <>
            <CarouselPrevious
              className={cn(
                "left-3 border-0",
                isHome
                  ? "bg-brand-black/80 text-brand-yellow hover:bg-brand-black"
                  : "bg-background/80"
              )}
            />
            <CarouselNext
              className={cn(
                "right-3 border-0",
                isHome
                  ? "bg-brand-black/80 text-brand-yellow hover:bg-brand-black"
                  : "bg-background/80"
              )}
            />
          </>
        )}
      </Carousel>
    </section>
  );
}
