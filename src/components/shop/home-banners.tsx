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
import type { HomeBanner } from "@/types";

interface HomeBannersProps {
  banners: HomeBanner[];
  loading?: boolean;
}

export function HomeBanners({ banners, loading }: HomeBannersProps) {
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    if (!api || banners.length <= 1) return;
    const timer = setInterval(() => api.scrollNext(), 5000);
    return () => clearInterval(timer);
  }, [api, banners.length]);

  if (loading) return <BannerSkeleton />;

  if (banners.length === 0) return null;

  return (
    <section className="relative px-1">
      <Carousel setApi={setApi} opts={{ loop: banners.length > 1 }}>
        <CarouselContent>
          {banners.map((banner) => {
            const content = (
              <div className="relative aspect-[21/9] overflow-hidden rounded-xl sm:aspect-[3/1]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={banner.imageUrl}
                  alt={banner.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-8">
                  <h2 className="max-w-xl text-xl font-bold text-white sm:text-3xl">
                    {banner.title}
                  </h2>
                  {banner.subtitle && (
                    <p className="mt-1 max-w-lg text-sm text-white/90 sm:text-base">
                      {banner.subtitle}
                    </p>
                  )}
                </div>
              </div>
            );

            return (
              <CarouselItem key={banner.id}>
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
            <CarouselPrevious className="left-3 border-0 bg-background/80" />
            <CarouselNext className="right-3 border-0 bg-background/80" />
          </>
        )}
      </Carousel>
    </section>
  );
}
