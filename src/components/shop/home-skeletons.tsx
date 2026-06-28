"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function BannerSkeleton() {
  return (
    <Skeleton className="aspect-[21/9] w-full rounded-xl sm:aspect-[3/1]" />
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className="min-w-[140px] space-y-3 sm:min-w-[160px]">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function CategoriesSectionSkeleton() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <CategoryCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}

export function ProductsSectionSkeleton() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function TestimonialSkeleton() {
  return (
    <div className="flex min-w-0 flex-col items-center gap-4 rounded-xl border p-6 sm:flex-row sm:items-start">
      <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
      <div className="flex-1 space-y-3 w-full">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-24 rounded-lg" />
      </div>
    </div>
  );
}

export function TestimonialsSectionSkeleton() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-7 w-44" />
      <TestimonialSkeleton />
    </section>
  );
}

export function HomePageSkeleton() {
  return (
    <div className="space-y-10 py-6">
      <BannerSkeleton />
      <CategoriesSectionSkeleton />
      <ProductsSectionSkeleton />
      <TestimonialsSectionSkeleton />
    </div>
  );
}
