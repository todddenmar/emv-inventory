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
import { formatCurrency } from "@/lib/format";
import { getProductThumbnailUrl } from "@/lib/products";
import { categoryPath, productPath } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
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
  const thumbnail = getProductThumbnailUrl(product);
  const isHome = variant === "home";

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: thumbnail,
      maxStock: stock,
    });
    toast.success(`${product.name} added to cart`);
  };

  if (isHome) {
    return (
      <div className="flex flex-col overflow-hidden rounded-2xl border border-brand-black/10 bg-white shadow-sm transition-shadow hover:shadow-md">
        <Link href={productPath(product.slug)} className="block">
          <div className="flex aspect-square items-center justify-center bg-brand-black/5">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnail}
                alt={product.name}
                className="h-full w-full object-cover transition-opacity hover:opacity-95"
              />
            ) : (
              <ShoppingCart className="h-12 w-12 text-brand-black/30" />
            )}
          </div>
        </Link>
        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-tight text-brand-black">
              <Link
                href={productPath(product.slug)}
                className="hover:underline"
              >
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
            {product.description}
          </p>
          <p className="mt-2 text-lg font-bold text-brand-black">
            {formatCurrency(product.price)}
          </p>
          <p className="text-xs text-brand-black/60">{stock} in stock</p>
          <Button
            className="mt-3 w-full rounded-full bg-brand-black text-brand-yellow hover:bg-brand-black/90"
            onClick={handleAddToCart}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Add to cart
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <Link href={productPath(product.slug)} className="block">
        <div className="aspect-square flex items-center justify-center bg-muted">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt={product.name}
              className="h-full w-full object-cover transition-opacity hover:opacity-95"
            />
          ) : (
            <ShoppingCart className="h-12 w-12 text-muted-foreground/40" />
          )}
        </div>
      </Link>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">
            <Link
              href={productPath(product.slug)}
              className="hover:underline"
            >
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
          {product.description}
        </p>
        {product.specs.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {product.specs.slice(0, 2).map((spec, i) => (
              <li key={i}>
                {spec.label}: {spec.value}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-lg font-semibold">
          {formatCurrency(product.price)}
        </p>
        <p className="text-xs text-muted-foreground">{stock} in stock</p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button className="flex-1" onClick={handleAddToCart}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          Add to cart
        </Button>
      </CardFooter>
    </Card>
  );
}
