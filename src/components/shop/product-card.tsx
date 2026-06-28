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
import { useCartStore } from "@/stores/cart-store";
import type { Category, Product } from "@/types";

interface ProductCardProps {
  product: Product;
  stock: number;
  categories?: Category[];
}

export function ProductCard({ product, stock, categories = [] }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const thumbnail = getProductThumbnailUrl(product);

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
