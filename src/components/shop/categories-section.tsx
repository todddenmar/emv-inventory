"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  CategoriesSectionSkeleton,
} from "@/components/shop/home-skeletons";
import { categoryPath } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

interface CategoriesSectionProps {
  categories: Category[];
  loading?: boolean;
  variant?: "default" | "home";
}

export function CategoriesSection({
  categories,
  loading,
  variant = "default",
}: CategoriesSectionProps) {
  const isHome = variant === "home";

  if (loading) return <CategoriesSectionSkeleton variant={variant} />;

  if (categories.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          {isHome && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-yellow">
              Browse
            </p>
          )}
          <h2
            className={cn(
              "text-2xl font-bold sm:text-3xl",
              isHome && "text-brand-black"
            )}
          >
            Shop by category
          </h2>
        </div>
        {isHome ? (
          <Link
            href="/shop"
            className="inline-flex items-center gap-1 rounded-full bg-brand-black px-4 py-2 text-sm font-semibold text-brand-yellow transition-opacity hover:opacity-90"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-thin">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={categoryPath(category.slug)}
            className="group min-w-[140px] shrink-0 sm:min-w-[170px]"
          >
            <div
              className={cn(
                "flex aspect-square items-center justify-center rounded-2xl p-4 transition-all",
                isHome
                  ? "border border-brand-yellow/40 bg-brand-yellow/10 group-hover:border-brand-yellow group-hover:bg-brand-yellow/20"
                  : "rounded-xl border bg-muted/40 group-hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "text-center text-lg font-semibold",
                  isHome && "text-brand-black"
                )}
              >
                {category.name}
              </span>
            </div>
            {category.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {category.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      isHome
                        ? "bg-brand-yellow/20 text-brand-black/70"
                        : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
