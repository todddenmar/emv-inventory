"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { homeHeroVisualClass } from "@/components/shop/home-hero-visual";

type HomeVariant = "default" | "home";

function skeletonTone(variant: HomeVariant) {
  return variant === "home" ? "bg-brand-yellow/20" : undefined;
}

export function BannerSkeleton({ variant = "default" }: { variant?: HomeVariant }) {
  return (
    <Skeleton
      className={cn(
        "w-full",
        variant === "home"
          ? cn(homeHeroVisualClass, "rounded-3xl")
          : "aspect-[21/9] rounded-xl sm:aspect-[3/1]",
        skeletonTone(variant)
      )}
    />
  );
}

export function CategoryCardSkeleton({ variant = "default" }: { variant?: HomeVariant }) {
  return (
    <div className="min-w-[140px] space-y-3 sm:min-w-[160px]">
      <Skeleton
        className={cn(
          "aspect-square w-full rounded-2xl",
          skeletonTone(variant)
        )}
      />
      <Skeleton className={cn("h-4 w-3/4", skeletonTone(variant))} />
      <Skeleton className={cn("h-3 w-1/2", skeletonTone(variant))} />
    </div>
  );
}

export function CategoriesSectionSkeleton({
  variant = "default",
}: {
  variant?: HomeVariant;
}) {
  return (
    <section className="space-y-4">
      <Skeleton className={cn("h-7 w-40", skeletonTone(variant))} />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <CategoryCardSkeleton key={i} variant={variant} />
        ))}
      </div>
    </section>
  );
}

export function ProductCardSkeleton({
  variant: _variant = "default",
}: {
  variant?: HomeVariant;
}) {
  return (
    <div className="flex h-full flex-col space-y-3 rounded-2xl border border-brand-black/10 bg-white p-0 shadow-sm">
      <Skeleton className="aspect-square w-full rounded-none bg-brand-black/10" />
      <div className="space-y-3 px-4 pb-4">
        <Skeleton className="h-4 w-3/4 bg-brand-black/10" />
        <Skeleton className="h-4 w-full bg-brand-black/10" />
        <Skeleton className="h-7 w-1/2 bg-brand-black/10" />
        <Skeleton className="h-9 w-full rounded-full bg-brand-black/10" />
      </div>
    </div>
  );
}

export function ProductsSectionSkeleton({
  variant = "default",
  dark = false,
}: {
  variant?: HomeVariant;
  dark?: boolean;
}) {
  const isHome = variant === "home";

  return (
    <section className="space-y-4">
      <Skeleton
        className={cn(
          "h-7 w-48",
          dark ? "bg-brand-yellow/20" : skeletonTone(variant)
        )}
      />
      {isHome ? (
        <>
          <div className="flex gap-3 overflow-hidden md:hidden">
            <div className="w-[84%] shrink-0">
              <ProductCardSkeleton variant={variant} />
            </div>
            <div className="w-[84%] shrink-0 opacity-60">
              <ProductCardSkeleton variant={variant} />
            </div>
          </div>
          <div className="hidden items-stretch gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} variant={variant} />
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 items-stretch gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProductCardSkeleton key={i} variant={variant} />
          ))}
        </div>
      )}
    </section>
  );
}

export function TestimonialSkeleton({
  variant = "default",
  dark = false,
}: {
  variant?: HomeVariant;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-4 rounded-2xl p-6 sm:flex-row sm:items-start",
        variant === "home" &&
          (dark
            ? "border border-brand-yellow/20"
            : "border border-brand-yellow/20")
      )}
    >
      <Skeleton
        className={cn(
          "h-20 w-20 shrink-0 rounded-full",
          dark ? "bg-brand-yellow/20" : skeletonTone(variant)
        )}
      />
      <div className="w-full flex-1 space-y-3">
        <Skeleton
          className={cn(
            "h-4 w-32",
            dark ? "bg-brand-yellow/20" : skeletonTone(variant)
          )}
        />
        <Skeleton
          className={cn(
            "h-16 w-full",
            dark ? "bg-brand-yellow/20" : skeletonTone(variant)
          )}
        />
        <Skeleton
          className={cn(
            "h-24 w-24 rounded-lg",
            dark ? "bg-brand-yellow/20" : skeletonTone(variant)
          )}
        />
      </div>
    </div>
  );
}

export function TestimonialsSectionSkeleton({
  variant = "default",
  dark = false,
}: {
  variant?: HomeVariant;
  dark?: boolean;
}) {
  return (
    <section className="space-y-4">
      <Skeleton
        className={cn(
          "h-7 w-44",
          dark ? "bg-brand-yellow/20" : skeletonTone(variant)
        )}
      />
      <TestimonialSkeleton variant={variant} dark={dark} />
    </section>
  );
}

export function HomePageSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-brand-yellow px-4 py-12">
        <div className="container mx-auto space-y-4">
          <Skeleton className="h-6 w-24 rounded-full bg-brand-black/10" />
          <Skeleton className="h-12 w-2/3 max-w-md bg-brand-black/10" />
          <Skeleton className="h-20 w-full max-w-lg bg-brand-black/10" />
        </div>
      </div>
      <div className="container mx-auto space-y-16 px-4 py-16">
        <CategoriesSectionSkeleton variant="home" />
        <ProductsSectionSkeleton variant="home" />
        <div className="rounded-t-[2rem] bg-brand-black p-8">
          <TestimonialsSectionSkeleton variant="home" dark />
        </div>
      </div>
    </div>
  );
}
