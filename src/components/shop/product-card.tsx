"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { parseSpecsText } from "@/lib/specs";
import type { Category, Product } from "@/types";

interface ProductCardProps {
  product: Product;
  stock: number;
  categories?: Category[];
  variant?: "default" | "home";
}

export function ProductCard({
  product,
  stock,
  categories = [],
  variant = "default",
}: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const defaultVariant = getDefaultVariant(product);
  const priceRange = getProductPriceRange(product);
  const showFromPrice = priceRange.min !== priceRange.max;
  const productLink = productVariantPath(product.slug, defaultVariant.id);
  const thumbnail = getProductThumbnailUrl(product);
  const isHome = variant === "home";
  const outOfStock = stock <= 0;
  const descriptionPreview = stripHtml(product.description);
  const specs = parseSpecsText(product.specsText);
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
    <span className={cn("font-semibold", isHome ? "text-lg font-bold text-brand-black" : "text-lg")}>
      From {formatCurrency(priceRange.min)}
    </span>
  ) : (
    <ProductPrice
      price={defaultVariant.price}
      compareAtPrice={defaultVariant.compareAtPrice}
      layout="stacked"
      priceClassName={isHome ? "text-lg font-bold text-brand-black" : "text-lg"}
      compareClassName={isHome ? "text-brand-black/50" : undefined}
    />
  );

  if (isHome) {
    return (
      <div className="flex flex-col overflow-hidden rounded-2xl border border-brand-black/10 bg-white shadow-sm transition-shadow hover:shadow-md">
        <Link href={productLink} className="relative block">
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
          {outOfStock && (
            <Badge className="absolute left-3 top-3 bg-muted-foreground text-background">
              Out of stock
            </Badge>
          )}
        </Link>
        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-tight text-brand-black">
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
          <p className="mt-2 line-clamp-2 text-sm text-brand-black/70">
            {descriptionPreview}
          </p>
          {priceDisplay}
          <p className="text-xs text-brand-black/60">
            {stock > 0 ? `${stock} in stock` : "Out of stock"}
          </p>
          <Button
            className={cn(
              "mt-3 w-full rounded-full",
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
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <Link href={productLink} className="relative block">
        <div className="relative aspect-square overflow-hidden bg-muted">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt={product.name}
              className="absolute inset-0 size-full object-cover transition-opacity hover:opacity-95"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/40" />
            </div>
          )}
        </div>
        {outOfStock && (
          <Badge className="absolute left-3 top-3 bg-muted-foreground text-background">
            Out of stock
          </Badge>
        )}
      </Link>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">
            <Link href={productLink} className="hover:underline">
              {product.name}
            </Link>
          </CardTitle>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {categories.map((cat) => (
                <Link key={cat.id} href={categoryPath(cat.slug)}>
                  <Badge variant="secondary" className="text-xs">
                    {cat.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-2">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {descriptionPreview}
        </p>
        {specs.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {specs.slice(0, 2).map((spec, i) => (
              <li key={i}>
                {spec.label}: {spec.value}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2">{priceDisplay}</div>
        <p className="text-xs text-muted-foreground">
          {outOfStock ? "Out of stock" : `${stock} in stock`}
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          className={cn(
            "flex-1",
            outOfStock && "bg-muted text-muted-foreground hover:bg-muted"
          )}
          onClick={handleAddToCart}
          disabled={outOfStock}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          {outOfStock ? "Out of stock" : "Add to cart"}
        </Button>
      </CardFooter>
    </Card>
  );
}
