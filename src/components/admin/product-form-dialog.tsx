"use client";

import { useCallback, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CategoryMultiSelect } from "@/components/admin/category-multi-select";
import { ProductSpecsEditor } from "@/components/admin/product-specs-editor";
import {
  ProductImageGallery,
  type GalleryItem,
} from "@/components/admin/product-image-gallery";
import { getCategories } from "@/lib/firestore/categories";
import {
  createProduct,
  resolveProductSlug,
  updateProduct,
} from "@/lib/firestore/products";
import {
  deleteProductImage,
  uploadProductImage,
} from "@/lib/storage/products";
import { normalizeImageOrder } from "@/lib/products";
import { slugify } from "@/lib/slug";
import { useSlugField } from "@/hooks/use-slug-field";
import type { Category, Product, ProductImage, ProductSpec } from "@/types";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  price: z.number().min(0, "Price must be positive"),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
}

function productToGalleryItems(product: Product): GalleryItem[] {
  return product.images.map((img) => ({
    id: img.id,
    url: img.url,
    storagePath: img.storagePath,
    isPending: false,
  }));
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: ProductFormDialogProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [specs, setSpecs] = useState<ProductSpec[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [thumbnailId, setThumbnailId] = useState<string | null>(null);
  const resolveSlug = useCallback(
    (name: string, preferredSlug?: string) =>
      resolveProductSlug(name, preferredSlug, product?.id),
    [product?.id]
  );
  const { slug, setSlug, syncSlugFromName, resetSlugField } =
    useSlugField(resolveSlug);
  const [removedStoragePaths, setRemovedStoragePaths] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
    },
  });

  useEffect(() => {
    if (open) {
      getCategories().then(setCategories).catch(console.error);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (product) {
      form.reset({
        name: product.name,
        description: product.description,
        price: product.price,
      });
      setCategoryIds(product.categoryIds);
      setSpecs(product.specs);
      resetSlugField(product.slug, true);
      setGalleryItems(productToGalleryItems(product));
      setThumbnailId(product.thumbnailImageId);
    } else {
      form.reset({ name: "", description: "", price: 0 });
      setCategoryIds([]);
      setSpecs([]);
      resetSlugField("", false);
      setGalleryItems([]);
      setThumbnailId(null);
    }
    setRemovedStoragePaths([]);
  }, [open, product, form, resetSlugField]);

  const trackRemovedItem = (item: GalleryItem) => {
    if (item.storagePath) {
      setRemovedStoragePaths((prev) => [...prev, item.storagePath]);
    }
  };

  const handleGalleryChange = (items: GalleryItem[]) => {
    const removed = galleryItems.filter(
      (prev) => !items.find((next) => next.id === prev.id)
    );
    removed.forEach(trackRemovedItem);
    setGalleryItems(items);
  };

  const buildImages = async (productId: string): Promise<ProductImage[]> => {
    const uploaded: ProductImage[] = [];

    for (let index = 0; index < galleryItems.length; index++) {
      const item = galleryItems[index];
      if (item.file) {
        const { url, storagePath } = await uploadProductImage(
          productId,
          item.id,
          item.file
        );
        uploaded.push({
          id: item.id,
          url,
          storagePath,
          order: index,
        });
      } else {
        uploaded.push({
          id: item.id,
          url: item.url,
          storagePath: item.storagePath,
          order: index,
        });
      }
    }

    return normalizeImageOrder(uploaded);
  };

  const onSubmit = async (data: ProductFormValues) => {
    if (categoryIds.length === 0) {
      toast.error("Select at least one category");
      return;
    }

    setSubmitting(true);
    try {
      const cleanedSpecs = specs.filter((s) => s.label.trim() && s.value.trim());
      let productId = product?.id;

      if (product) {
        await updateProduct(product.id, {
          name: data.name,
          slug: slug.trim() || slugify(data.name),
          description: data.description,
          price: data.price,
          categoryIds,
          specs: cleanedSpecs,
        });
      } else {
        productId = await createProduct({
          name: data.name,
          slug: slug.trim() || slugify(data.name),
          description: data.description,
          price: data.price,
          categoryIds,
          specs: cleanedSpecs,
          images: [],
          thumbnailImageId: null,
          isActive: true,
        });
      }

      if (!productId) throw new Error("Failed to save product");

      for (const path of removedStoragePaths) {
        await deleteProductImage(path).catch(console.error);
      }

      const images = await buildImages(productId);
      const resolvedThumbnail =
        thumbnailId && images.some((img) => img.id === thumbnailId)
          ? thumbnailId
          : images[0]?.id ?? null;

      await updateProduct(productId, {
        images,
        thumbnailImageId: resolvedThumbnail,
      });

      toast.success(product ? "Product updated" : "Product created");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSubmitting(false);
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                {...register("name", {
                  onChange: (e) => {
                    if (!product) syncSlugFromName(e.target.value);
                  },
                })}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="slug">URL slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. house-blend-coffee"
              />
              <p className="text-xs text-muted-foreground">
                Used in /products/{slug || "your-slug"}
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={3} {...register("description")} />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                {...register("price", { valueAsNumber: true })}
              />
              {errors.price && (
                <p className="text-sm text-destructive">{errors.price.message}</p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                Stock is managed per branch in Inventory.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categories</Label>
            <CategoryMultiSelect
              categories={categories}
              selectedIds={categoryIds}
              onChange={setCategoryIds}
            />
          </div>

          <ProductSpecsEditor specs={specs} onChange={setSpecs} />

          <ProductImageGallery
            items={galleryItems}
            thumbnailId={thumbnailId}
            onChange={handleGalleryChange}
            onThumbnailChange={setThumbnailId}
          />

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {product ? "Update product" : "Create product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
