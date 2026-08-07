"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TagsInput } from "@/components/admin/product-specs-editor";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useSlugField } from "@/hooks/use-slug-field";
import { formatCurrency } from "@/lib/format";
import {
  getCategory,
  resolveCategorySlug,
  updateCategory,
} from "@/lib/firestore/categories";
import {
  getProductsByCategoryId,
  removeProductFromCategory,
} from "@/lib/firestore/products";
import { getDefaultVariant, getProductPriceRange } from "@/lib/product-variants";
import { getProductThumbnailUrl } from "@/lib/products";
import {
  isProductPublished,
  productStatusLabel,
} from "@/lib/products-catalog";
import { slugify } from "@/lib/slug";
import type { Category, Product } from "@/types";

export default function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { isMasterAdmin } = useBranchAccess();

  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingProductId, setRemovingProductId] = useState<string | null>(
    null
  );

  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const resolveSlug = useCallback(
    (categoryName: string, preferredSlug?: string) =>
      resolveCategorySlug(categoryName, preferredSlug, id),
    [id]
  );
  const { slug, setSlug, syncSlugFromName, resetSlugField } =
    useSlugField(resolveSlug);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedCategory, categoryProducts] = await Promise.all([
        getCategory(id),
        getProductsByCategoryId(id, true),
      ]);

      if (!loadedCategory) {
        toast.error("Category not found");
        router.replace("/admin/categories");
        return;
      }

      setCategory(loadedCategory);
      setName(loadedCategory.name);
      resetSlugField(loadedCategory.slug, true);
      setTags(loadedCategory.tags);
      setProducts(categoryProducts);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load category");
    } finally {
      setLoading(false);
    }
  }, [id, resetSlugField, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isMasterAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only the master-admin can manage categories.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }

    setSaving(true);
    try {
      await updateCategory(id, {
        name: name.trim(),
        slug: slug.trim() || slugify(name),
        tags,
      });
      const refreshed = await getCategory(id);
      if (refreshed) {
        setCategory(refreshed);
        setName(refreshed.name);
        resetSlugField(refreshed.slug, true);
        setTags(refreshed.tags);
      }
      toast.success("Category updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update category");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveProduct = async (product: Product) => {
    setRemovingProductId(product.id);
    try {
      await removeProductFromCategory(product.id, id);
      setProducts((prev) => prev.filter((item) => item.id !== product.id));
      toast.success(`Removed “${product.name || "Untitled draft"}” from category`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to remove product from category");
    } finally {
      setRemovingProductId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading category…
      </div>
    );
  }

  if (!category) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <LinkButton href="/admin/categories" variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to categories</span>
            </LinkButton>
            <h1 className="text-2xl font-bold">Edit category</h1>
          </div>
          <p className="text-muted-foreground">
            Update category details and manage products assigned to it.
          </p>
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category details</CardTitle>
          <CardDescription>
            {category.isArchived ? (
              <Badge variant="secondary">Archived</Badge>
            ) : (
              "Name, URL slug, and tags"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => {
                const nextName = e.target.value;
                setName(nextName);
                syncSlugFromName(nextName);
              }}
              placeholder="e.g. Beverages"
              disabled={saving || category.isArchived}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-slug">URL slug</Label>
            <Input
              id="category-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. beverages"
              disabled={saving || category.isArchived}
            />
            <p className="text-xs text-muted-foreground">
              Used in /categories/{slug || "your-slug"}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagsInput tags={tags} onChange={setTags} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products in this category</CardTitle>
          <CardDescription>
            {products.length} product{products.length === 1 ? "" : "s"}. Remove
            a product to unlink it from this category (the product itself is
            kept).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No products are assigned to this category yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const thumb = getProductThumbnailUrl(product);
                  const range = getProductPriceRange(product);
                  const removing = removingProductId === product.id;

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {product.name.trim() || "Untitled draft"}
                            </p>
                            {product.productType ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {product.productType}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {range.min !== range.max
                          ? `${formatCurrency(range.min)} – ${formatCurrency(range.max)}`
                          : formatCurrency(getDefaultVariant(product).price)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            isProductPublished(product) ? "default" : "secondary"
                          }
                        >
                          {productStatusLabel(product)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <LinkButton
                            href={`/admin/products/${product.id}`}
                            variant="ghost"
                            size="icon"
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span className="sr-only">Open product</span>
                          </LinkButton>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={removing || category.isArchived}
                            onClick={() => void handleRemoveProduct(product)}
                          >
                            {removing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4 text-destructive" />
                            )}
                            <span className="sr-only">
                              Remove from category
                            </span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
