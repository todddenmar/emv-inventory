"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import {
  CategoriesSectionSkeleton,
} from "@/components/shop/home-skeletons";
import { categoryPath } from "@/lib/seo";
import type { Category } from "@/types";

interface CategoriesSectionProps {
  categories: Category[];
  loading?: boolean;
}

export function CategoriesSection({
  categories,
  loading,
}: CategoriesSectionProps) {
  if (loading) return <CategoriesSectionSkeleton />;

  if (categories.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold sm:text-2xl">Shop by category</h2>
        <LinkButton href="/shop" variant="ghost" size="sm">
          View all
        </LinkButton>
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-thin">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={categoryPath(category.slug)}
            className="group min-w-[140px] shrink-0 sm:min-w-[160px]"
          >
            <div className="flex aspect-square items-center justify-center rounded-xl border bg-muted/40 p-4 transition-colors group-hover:bg-muted">
              <span className="text-center text-lg font-semibold">
                {category.name}
              </span>
            </div>
            {category.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {category.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
