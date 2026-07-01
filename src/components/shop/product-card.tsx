"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProductPrice } from "@/components/shop/product-price";
import { getProductThumbnailUrl } from "@/lib/products";
import { categoryPath, productVariantPath } from "@/lib/seo";
import { stripHtml } from "@/lib/html";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import {
  formatVariantLabel,
  getDefaultVariant,
  getProductPriceRange,
} from "@/lib/product-variants";
import type { Category, Product } from "@/types";

interface ProductCardProps {
  product: Product;
  stock: number;
  categories?: Category[];
  /** @deprecated Kept for call sites; card layout is unified. */
  variant?: "default" | "home";
}

export function ProductCard({
  product,
  stock,
  categories = [],
}: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const defaultVariant = getDefaultVariant(product);
  const priceRange = getProductPriceRange(product);
  const showFromPrice = priceRange.min !== priceRange.max;
  const productLink = productVariantPath(product.slug, defaultVariant.id);
  const thumbnail = getProductThumbnailUrl(product);
  const outOfStock = stock <= 0;
  const descriptionPreview = stripHtml(product.description);
  const variantLabel = formatVariantLabel(defaultVariant, product.options);
  const displayName =
    variantLabel === "Default"
      ? product.name
      : `${product.name} — ${variantLabel}`;

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      variantId: defaultVariant.id,
      sku: defaultVariant.sku,
      name: displayName,
      price: defaultVariant.price,
      imageUrl: thumbnail,
      maxStock: stock,
    });
    toast.success(`${displayName} added to cart`);
  };

  const priceDisplay = showFromPrice ? (
    <span className="text-lg font-bold text-brand-black">
      From {formatCurrency(priceRange.min)}
    </span>
  ) : (
    <ProductPrice
      price={defaultVariant.price}
      compareAtPrice={defaultVariant.compareAtPrice}
      layout="inline"
      priceClassName="text-lg font-bold text-brand-black"
      compareClassName="text-sm text-brand-black/50"
    />
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-black/10 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link href={productLink} className="relative block shrink-0">
        <div className="relative aspect-square overflow-hidden bg-brand-black/5">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt={product.name}
              className="absolute inset-0 size-full object-cover transition-opacity hover:opacity-95"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ShoppingCart className="h-12 w-12 text-brand-black/30" />
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="space-y-2">
          <h3 className="line-clamp-2 min-h-10 text-base font-semibold leading-tight text-brand-black">
            <Link href={productLink} className="hover:underline">
              {product.name}
            </Link>
          </h3>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {categories.map((cat) => (
                <Link key={cat.id} href={categoryPath(cat.slug)}>
                  <span className="rounded-full bg-brand-yellow/30 px-2 py-0.5 text-xs font-medium text-brand-black">
                    {cat.name}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <p className="mt-2 line-clamp-2 min-h-10 text-sm text-brand-black/70">
          {descriptionPreview || "\u00A0"}
        </p>

        <div className="mt-3 flex min-h-7 items-baseline">{priceDisplay}</div>

        <div className="mt-auto pt-3">
          <Button
            className={cn(
              "w-full rounded-full",
              outOfStock
                ? "bg-muted text-muted-foreground hover:bg-muted"
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
    </div>
  );
}
