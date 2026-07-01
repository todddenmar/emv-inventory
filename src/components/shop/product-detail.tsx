"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShoppingCart, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductPrice } from "@/components/shop/product-price";
import {
  getProductThumbnailUrl,
  sortProductImages,
} from "@/lib/products";
import { categoryPath, productVariantPath } from "@/lib/seo";
import { getCategories } from "@/lib/firestore/categories";
import { getOnlineShopBranch } from "@/lib/firestore/branches";
import { getBranchVariantStock } from "@/lib/firestore/inventory";
import { ProductDescription } from "@/components/shop/product-description";
import { useCartStore } from "@/stores/cart-store";
import {
  findVariantById,
  findVariantByOptions,
  formatVariantLabel,
  getDefaultVariant,
} from "@/lib/product-variants";
import { parseSpecsText } from "@/lib/specs";
import { cn } from "@/lib/utils";
import type { Category, Product } from "@/types";

interface ProductDetailViewProps {
  product: Product;
}

export function ProductDetailView({ product }: ProductDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addItem = useCartStore((s) => s.addItem);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockByVariant, setStockByVariant] = useState<Record<string, number>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  const sortedOptions = useMemo(
    () => [...product.options].sort((a, b) => a.position - b.position),
    [product.options]
  );

  const variantFromUrl = findVariantById(product, searchParams.get("variant"));
  const selectedVariant = useMemo(() => {
    if (sortedOptions.length === 0) {
      return getDefaultVariant(product);
    }
    const fromOptions = findVariantByOptions(product, selectedOptions);
    if (fromOptions) return fromOptions;
    if (variantFromUrl) return variantFromUrl;
    return getDefaultVariant(product);
  }, [product, selectedOptions, sortedOptions.length, variantFromUrl]);

  const stock = stockByVariant[selectedVariant.id] ?? 0;
  const specs = parseSpecsText(product.specsText);

  const images = sortProductImages(product.images);
  const variantImageId =
    selectedVariant.imageId ?? product.thumbnailImageId ?? images[0]?.id ?? null;
  const [selectedImageId, setSelectedImageId] = useState(variantImageId);

  useEffect(() => {
    setSelectedImageId(variantImageId);
  }, [variantImageId]);

  const selectedImage =
    images.find((img) => img.id === selectedImageId) ?? images[0];

  const productCategories = categories.filter((c) =>
    product.categoryIds.includes(c.id)
  );

  useEffect(() => {
    if (sortedOptions.length === 0) return;
    const initial =
      variantFromUrl?.optionValues ??
      getDefaultVariant(product).optionValues;
    setSelectedOptions(initial);
  }, [product.id, sortedOptions.length, variantFromUrl]);

  useEffect(() => {
    async function load() {
      const [cats, shopBranch] = await Promise.all([
        getCategories(),
        getOnlineShopBranch(),
      ]);
      setCategories(cats);
      if (!shopBranch) return;

      const entries = await Promise.all(
        product.variants.map(async (variant) => {
          const row = await getBranchVariantStock(shopBranch.id, variant.id);
          return [variant.id, row?.stock ?? 0] as const;
        })
      );
      setStockByVariant(Object.fromEntries(entries));
    }
    load().catch(console.error);
  }, [product.id, product.variants]);

  useEffect(() => {
    if (!selectedVariant) return;
    const path = productVariantPath(product.slug, selectedVariant.id);
    if (typeof window !== "undefined" && window.location.pathname + window.location.search !== path) {
      router.replace(path, { scroll: false });
    }
  }, [selectedVariant, product.slug, router]);

  const outOfStock = stock <= 0;
  const variantLabel = formatVariantLabel(selectedVariant, sortedOptions);
  const displayName =
    variantLabel === "Default"
      ? product.name
      : `${product.name} — ${variantLabel}`;

  const handleOptionSelect = (optionName: string, value: string) => {
    setSelectedOptions((prev) => ({ ...prev, [optionName]: value }));
  };

  const handleAddToCart = () => {
    if (stock <= 0) {
      toast.error("Out of stock");
      return;
    }
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      sku: selectedVariant.sku,
      name: displayName,
      price: selectedVariant.price,
      imageUrl:
        selectedImage?.url ?? getProductThumbnailUrl(product),
      maxStock: stock,
    });
    toast.success(`${displayName} added to cart`);
  };

  return (
    <>
      <div className="container mx-auto px-4 pb-28 pt-24 sm:pt-28">
        <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link href="/shop" className="hover:text-foreground">
            Shop
          </Link>
          {productCategories[0] && (
            <>
              <ChevronRight className="h-4 w-4" />
              <Link
                href={categoryPath(productCategories[0].slug)}
                className="hover:text-foreground"
              >
                {productCategories[0].name}
              </Link>
            </>
          )}
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="aspect-square overflow-hidden rounded-xl border bg-muted">
              {selectedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedImage.url}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedImageId(image.id)}
                    className={`h-20 w-20 shrink-0 overflow-hidden rounded-md border-2 ${
                      selectedImageId === image.id
                        ? "border-primary"
                        : "border-transparent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
              {productCategories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {productCategories.map((category) => (
                    <Link key={category.id} href={categoryPath(category.slug)}>
                      <Badge variant="secondary">{category.name}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {sortedOptions.map((option) => (
              <div key={option.name} className="space-y-2">
                <p className="text-sm font-medium">{option.name}</p>
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const isSelected = selectedOptions[option.name] === value;
                    return (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => handleOptionSelect(option.name, value)}
                      >
                        {value}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="space-y-3">
              <ProductPrice
                price={selectedVariant.price}
                compareAtPrice={selectedVariant.compareAtPrice}
                layout="stacked"
                priceClassName="text-3xl font-semibold"
              />
              {selectedVariant.sku && (
                <p className="text-sm text-muted-foreground">
                  SKU: {selectedVariant.sku}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {outOfStock ? "Out of stock" : `${stock} in stock`}
              </p>
              <Button
                size="lg"
                className={cn(
                  "w-full sm:w-auto",
                  outOfStock && "bg-muted text-muted-foreground hover:bg-muted"
                )}
                onClick={handleAddToCart}
                disabled={outOfStock}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                {outOfStock ? "Out of stock" : "Add to cart"}
              </Button>
            </div>

            <ProductDescription html={product.description} />

            {specs.length > 0 && (
              <dl className="grid gap-2 rounded-lg border p-4 text-sm">
                {specs.map((spec) => (
                  <div key={`${spec.label}-${spec.value}`} className="grid grid-cols-2 gap-2">
                    <dt className="font-medium">{spec.label}</dt>
                    <dd className="text-muted-foreground">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-black/10 bg-brand-yellow text-brand-black shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
        <div className="container mx-auto flex items-center gap-4 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0 flex-1">
            <ProductPrice
              price={selectedVariant.price}
              compareAtPrice={selectedVariant.compareAtPrice}
              layout="stacked"
              priceClassName="text-2xl font-bold text-brand-black"
              compareClassName="text-brand-black/60"
            />
            <p className="text-xs text-brand-black/70">
              {outOfStock ? "Out of stock" : `${stock} in stock`}
            </p>
          </div>
          <Button
            size="lg"
            className={cn(
              "shrink-0 px-6",
              outOfStock
                ? "bg-brand-black/15 text-brand-black/45 hover:bg-brand-black/15"
                : "bg-brand-black text-brand-yellow hover:bg-brand-black/90"
            )}
            onClick={handleAddToCart}
            disabled={outOfStock}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            {outOfStock ? "Out of stock" : "Add to cart"}
          </Button>
        </div>
      </div>
    </>
  );
}
