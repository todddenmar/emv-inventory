"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { LinkButton } from "@/components/ui/link-button";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryMultiSelect } from "@/components/admin/category-multi-select";
import { ProductOptionsEditor } from "@/components/admin/product-options-editor";
import { ProductVariantsEditor } from "@/components/admin/product-variants-editor";
import {
  ProductImageGallery,
  type GalleryItem,
} from "@/components/admin/product-image-gallery";
import { getCategories } from "@/lib/firestore/categories";
import { getVendors } from "@/lib/firestore/vendors";
import {
  getProduct,
  publishProduct,
  resolveProductSlug,
  updateProduct,
} from "@/lib/firestore/products";
import {
  deleteProductImage,
  uploadProductImage,
} from "@/lib/storage/products";
import { normalizeImageOrder } from "@/lib/products";
import { canPublishProduct, productStatusLabel } from "@/lib/products-catalog";
import { formatProductTags, parseProductTags } from "@/lib/product-tags";
import { slugify } from "@/lib/slug";
import { mergeVariantsOnOptionChange } from "@/lib/product-variants";
import { parseSpecsText } from "@/lib/specs";
import { useSlugField } from "@/hooks/use-slug-field";
import { useAuthStore } from "@/stores/auth-store";
import type {
  Category,
  Product,
  ProductImage,
  ProductOption,
  ProductVariant,
  Vendor,
} from "@/types";

const publishSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type ProductFormValues = z.infer<typeof publishSchema>;

function productToGalleryItems(product: Product): GalleryItem[] {
  return product.images.map((img) => ({
    id: img.id,
    url: img.url,
    storagePath: img.storagePath,
    isPending: false,
  }));
}

interface ProductFormPageProps {
  productId: string;
}

export function ProductFormPage({ productId }: ProductFormPageProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [productType, setProductType] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [specsText, setSpecsText] = useState("");
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [thumbnailId, setThumbnailId] = useState<string | null>(null);
  const [removedStoragePaths, setRemovedStoragePaths] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const initializedRef = useRef(false);

  const resolveSlug = useCallback(
    (name: string, preferredSlug?: string) =>
      resolveProductSlug(name || "draft", preferredSlug, productId),
    [productId]
  );
  const { slug, setSlug, syncSlugFromName, applySlugFromName, resetSlugField } =
    useSlugField(resolveSlug);

  const form = useForm<ProductFormValues>({
    defaultValues: { name: "" },
  });

  const { register, getValues } = form;

  const handleOptionsChange = (next: ProductOption[]) => {
    setOptions(next);
    setVariants((prev) => mergeVariantsOnOptionChange(prev, next));
  };

  useEffect(() => {
    Promise.all([getProduct(productId), getCategories(), getVendors()])
      .then(([loaded, cats, vendorList]) => {
        if (!loaded) {
          toast.error("Product not found");
          router.replace("/admin/products");
          return;
        }
        setProduct(loaded);
        setCategories(cats);
        setVendors(vendorList);
        form.reset({
          name: loaded.name,
        });
        setCategoryIds(loaded.categoryIds);
        setProductType(loaded.productType ?? "");
        setTagsText(formatProductTags(loaded.tags ?? []));
        setVendorId(loaded.vendorId ?? null);
        setOptions(loaded.options);
        setVariants(loaded.variants);
        setSpecsText(loaded.specsText);
        resetSlugField(
          loaded.slug,
          loaded.status === "published" || Boolean(loaded.name.trim())
        );
        setGalleryItems(productToGalleryItems(loaded));
        setThumbnailId(loaded.thumbnailImageId);
        initializedRef.current = true;
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [productId, form, resetSlugField, router]);

  const isPublished = product?.status === "published";
  const isDraft = product?.status === "draft";

  const buildImages = async (): Promise<ProductImage[]> => {
    const uploaded: ProductImage[] = [];

    for (let index = 0; index < galleryItems.length; index++) {
      const item = galleryItems[index];
      if (item.file) {
        const { url, storagePath } = await uploadProductImage(
          productId,
          item.id,
          item.file
        );
        uploaded.push({ id: item.id, url, storagePath, order: index });
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

  const saveProduct = async (saveOptions: {
    publish?: boolean;
    stayOnPage?: boolean;
  }) => {
    if (!initializedRef.current) return;

    const values = getValues();
    const parsedSpecs = parseSpecsText(specsText);
    const tags = parseProductTags(tagsText);

    if (saveOptions.publish) {
      const parsed = publishSchema.safeParse(values);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        toast.error(first?.message ?? "Please complete all required fields");
        return;
      }
    }

    const draftProduct: Product = {
      ...(product as Product),
      name: values.name.trim(),
      productType: productType.trim(),
      tags,
      vendorId,
      categoryIds,
      options,
      variants,
      specsText,
      specs: parsedSpecs,
    };

    if (saveOptions.publish) {
      const check = canPublishProduct(draftProduct);
      if (!check.ok) {
        toast.error(check.reason ?? "Cannot publish product");
        return;
      }
    }

    if (saveOptions.publish) {
      setPublishing(true);
    } else {
      setSaving(true);
    }

    try {
      for (const path of removedStoragePaths) {
        await deleteProductImage(path).catch(console.error);
      }
      if (removedStoragePaths.length > 0) {
        setRemovedStoragePaths([]);
      }

      const images = await buildImages();
      const resolvedThumbnail =
        thumbnailId && images.some((img) => img.id === thumbnailId)
          ? thumbnailId
          : images[0]?.id ?? null;

      const name = values.name.trim();
      const preferredSlug = slug.trim() || slugify(name || "draft");

      await updateProduct(
        productId,
        {
          name,
          slug: preferredSlug,
          productType: productType.trim(),
          tags,
          vendorId,
          categoryIds,
          options,
          variants,
          specsText,
          specs: parsedSpecs,
          images,
          thumbnailImageId: resolvedThumbnail,
          ...(saveOptions.publish || isPublished
            ? { status: "published" as const, isActive: true }
            : { status: "draft" as const, isActive: false }),
        },
        user
          ? {
              performedBy: user.uid,
              performedByName: user.displayName || user.email || null,
            }
          : undefined
      );

      if (saveOptions.publish) {
        await publishProduct(productId);
      }

      setGalleryItems(
        images.map((img) => ({
          id: img.id,
          url: img.url,
          storagePath: img.storagePath,
          isPending: false,
        }))
      );
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              name,
              slug: preferredSlug,
              productType: productType.trim(),
              tags,
              vendorId,
              categoryIds,
              options,
              variants,
              specsText,
              specs: parsedSpecs,
              images,
              thumbnailImageId: resolvedThumbnail,
              status: saveOptions.publish || isPublished ? "published" : "draft",
            }
          : prev
      );

      if (saveOptions.publish) {
        toast.success("Product published");
        router.push("/admin/products");
      } else {
        toast.success("Draft saved");
        if (!saveOptions.stayOnPage) {
          router.push("/admin/products");
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save product"
      );
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

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

  if (loading || !product) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading product...
      </div>
    );
  }

  const statusLabel = productStatusLabel(product);
  const galleryImages = galleryItems.map((item, index) => ({
    id: item.id,
    url: item.url,
    storagePath: item.storagePath,
    order: index,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <LinkButton
            href="/admin/products"
            variant="ghost"
            size="icon"
            aria-label="Back to products"
          >
            <ArrowLeft className="h-4 w-4" />
          </LinkButton>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">
                {product.name.trim() || "New product"}
              </h1>
              <Badge variant={isDraft ? "secondary" : "default"}>
                {statusLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {isDraft
                ? "Draft created — use Save draft or Publish when ready"
                : "Update and publish when ready"}
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveProduct({ publish: true });
        }}
        className="space-y-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              {...register("name", {
                onChange: (e) => {
                  if (isDraft) syncSlugFromName(e.target.value);
                },
              })}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="slug">URL slug</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. apple-ball"
                className="sm:flex-1"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={saving || publishing}
                onClick={() => {
                  const name = getValues("name").trim();
                  if (!name) {
                    toast.error("Enter a product name first");
                    return;
                  }
                  void applySlugFromName(name);
                }}
              >
                Use name as slug
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Stable product key for imports and search. Example: Apple Ball →
              apple-ball (adds -2, -3… if already taken).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="productType">Product type</Label>
            <Input
              id="productType"
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              placeholder="e.g. Shirt, Accessory"
              disabled={saving || publishing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor</Label>
            <Select
              value={vendorId ?? "none"}
              onValueChange={(v) =>
                setVendorId(!v || v === "none" ? null : v)
              }
            >
              <SelectTrigger id="vendor" disabled={saving || publishing}>
                <SelectValue placeholder="Select vendor">
                  {(value) => {
                    if (!value || value === "none") return "No vendor";
                    return (
                      vendors.find((vendor) => vendor.id === value)?.name ??
                      "Select vendor"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No vendor</SelectItem>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="size:large, color:black"
              disabled={saving || publishing}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated tags, e.g. size:large, color:black
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

        <ProductOptionsEditor
          options={options}
          onChange={handleOptionsChange}
          disabled={saving || publishing}
        />

        <ProductVariantsEditor
          variants={variants}
          options={options}
          images={galleryImages}
          onChange={setVariants}
          disabled={saving || publishing}
        />

        <div className="space-y-2">
          <Label htmlFor="specsText">Specifications</Label>
          <Textarea
            id="specsText"
            value={specsText}
            onChange={(e) => setSpecsText(e.target.value)}
            placeholder="Material: Cotton, Weight: 200g"
            rows={4}
            disabled={saving || publishing}
          />
          <p className="text-xs text-muted-foreground">
            Format: Label: value, Label: value
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Stock is managed per variant in Inventory.
        </p>

        <ProductImageGallery
          items={galleryItems}
          thumbnailId={thumbnailId}
          onChange={handleGalleryChange}
          onThumbnailChange={setThumbnailId}
        />

        <div className="flex flex-col gap-2 border-t pt-6 sm:flex-row sm:justify-end">
          <LinkButton href="/admin/products" variant="outline">
            Back to list
          </LinkButton>
          <Button
            type="button"
            variant="secondary"
            disabled={saving || publishing}
            onClick={() => saveProduct({ stayOnPage: true })}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save draft
          </Button>
          <Button type="submit" disabled={saving || publishing}>
            {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isDraft ? "Publish product" : "Save & publish"}
          </Button>
        </div>
      </form>
    </div>
  );
}
