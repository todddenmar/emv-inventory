"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingCart, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import {
  getProductThumbnailUrl,
  sortProductImages,
} from "@/lib/products";
import { categoryPath } from "@/lib/seo";
import { getCategories } from "@/lib/firestore/categories";
import { getOnlineShopBranch } from "@/lib/firestore/branches";
import { getBranchProductStock } from "@/lib/firestore/inventory";
import { useCartStore } from "@/stores/cart-store";
import type { Category, Product } from "@/types";

interface ProductDetailViewProps {
  product: Product;
}

export function ProductDetailView({ product }: ProductDetailViewProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stock, setStock] = useState(0);
  const [selectedImageId, setSelectedImageId] = useState(
    product.thumbnailImageId ?? product.images[0]?.id ?? null
  );

  const images = sortProductImages(product.images);
  const selectedImage =
    images.find((img) => img.id === selectedImageId) ?? images[0];
  const productCategories = categories.filter((c) =>
    product.categoryIds.includes(c.id)
  );

  useEffect(() => {
    async function load() {
      const [cats, shopBranch] = await Promise.all([
        getCategories(),
        getOnlineShopBranch(),
      ]);
      setCategories(cats);
      if (shopBranch) {
        const row = await getBranchProductStock(shopBranch.id, product.id);
        setStock(row?.stock ?? 0);
      }
    }
    load().catch(console.error);
  }, [product.id]);

  const handleAddToCart = () => {
    if (stock <= 0) {
      toast.error("Out of stock");
      return;
    }
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: getProductThumbnailUrl(product),
      maxStock: stock,
    });
    toast.success(`${product.name} added to cart`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
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

          <p className="text-3xl font-semibold">{formatCurrency(product.price)}</p>
          <p className="text-sm text-muted-foreground">
            {stock > 0 ? `${stock} in stock` : "Out of stock"}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {product.description}
          </p>

          {product.specs.length > 0 && (
            <dl className="grid gap-2 rounded-lg border p-4 text-sm">
              {product.specs.map((spec) => (
                <div key={`${spec.label}-${spec.value}`} className="grid grid-cols-2 gap-2">
                  <dt className="font-medium">{spec.label}</dt>
                  <dd className="text-muted-foreground">{spec.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={handleAddToCart}
            disabled={stock <= 0}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Add to cart
          </Button>
        </div>
      </div>
    </div>
  );
}
