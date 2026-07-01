"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/shop/product-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductsSectionSkeleton } from "@/components/shop/home-skeletons";
import { getProducts } from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getOnlineShopBranch } from "@/lib/firestore/branches";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { mergeProductsWithInventory } from "@/lib/inventory";
import { stripHtml } from "@/lib/html";
import { specsTextMatchesSearch } from "@/lib/specs";
import { categoryPath } from "@/lib/seo";
import type { Category } from "@/types";
import { Search } from "lucide-react";

interface ShopCatalogProps {
  categorySlug?: string | null;
  title?: string;
  description?: string;
}

function ShopCatalogInner({
  categorySlug = null,
  title = "Shop",
  description = "Browse our products and order with cash on delivery.",
}: ShopCatalogProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyCategoryId = searchParams.get("category");

  const [products, setProducts] = useState<
    ReturnType<typeof mergeProductsWithInventory>
  >([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [shopBranchName, setShopBranchName] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [catalog, cats, shopBranch] = await Promise.all([
        getProducts(true),
        getCategories(),
        getOnlineShopBranch(),
      ]);

      setCategories(cats);
      setShopBranchName(shopBranch?.name ?? null);

      if (categorySlug) {
        const activeCategory = cats.find((c) => c.slug === categorySlug);
        setCategoryId(activeCategory?.id ?? "all");
      }

      if (!shopBranch) {
        setProducts([]);
        return;
      }

      const inventory = await getBranchInventory(shopBranch.id);
      setProducts(
        mergeProductsWithInventory(catalog, inventory)
      );
    }

    load().catch(console.error).finally(() => setLoading(false));
  }, [categorySlug]);

  useEffect(() => {
    if (!legacyCategoryId || categories.length === 0) return;
    const category = categories.find((c) => c.id === legacyCategoryId);
    if (category) {
      router.replace(categoryPath(category.slug));
    }
  }, [legacyCategoryId, categories, router]);

  const filtered = products.filter((p) => {
    const plainDescription = stripHtml(p.description);
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      plainDescription.toLowerCase().includes(search.toLowerCase()) ||
      specsTextMatchesSearch(p.specsText, search);
    const matchesCategory =
      categoryId === "all" || p.categoryIds.includes(categoryId);
    return matchesSearch && matchesCategory;
  });

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const activeCategory = categories.find((c) => c.id === categoryId);

  const handleCategoryChange = (value: string | null) => {
    if (!value || value === "all") {
      router.push("/shop");
      return;
    }
    const category = categories.find((c) => c.id === value);
    if (category) {
      router.push(categoryPath(category.slug));
    }
  };

  return (
    <div className="container mx-auto px-4 pb-8 pt-24 sm:pt-28">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-muted-foreground">
          {description}
          {shopBranchName && <> Fulfilled from {shopBranchName}.</>}
        </p>
        {activeCategory && categorySlug && (
          <p className="mt-2 text-sm text-muted-foreground">
            Showing products in {activeCategory.name}
          </p>
        )}
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryId} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <ProductsSectionSkeleton />
      ) : !shopBranchName ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Online shop is not configured yet.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No products available yet.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              stock={product.stock}
              categories={product.categoryIds
                .map((id) => categoryMap[id])
                .filter(Boolean)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ShopCatalog(props: ShopCatalogProps) {
  return (
    <Suspense
      fallback={
        <div className="container px-4 py-8">
          <ProductsSectionSkeleton />
        </div>
      }
    >
      <ShopCatalogInner {...props} />
    </Suspense>
  );
}
