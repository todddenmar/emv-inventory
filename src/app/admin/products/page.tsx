"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/link-button";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  archiveProduct,
  deleteProduct,
  getProducts,
  publishProduct,
  restoreProduct,
  unpublishProduct,
} from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getProductThumbnailUrl } from "@/lib/products";
import {
  canPublishProduct,
  isProductPublished,
} from "@/lib/products-catalog";
import { getProductPriceRange, getDefaultVariant } from "@/lib/product-variants";
import { formatCurrency } from "@/lib/format";
import type { Category, Product } from "@/types";

export default function AdminProductsPage() {
  const { isMasterAdmin } = useBranchAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const categoryMap = Object.fromEntries(
    categories.map((c) => [c.id, c])
  );

  const loadData = () => {
    Promise.all([getProducts(false, true), getCategories()])
      .then(([p, c]) => {
        setProducts(p);
        setCategories(c);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleArchive = async () => {
    if (!deleteId) return;
    try {
      await archiveProduct(deleteId);
      toast.success("Product archived");
      loadData();
    } catch {
      toast.error("Failed to archive product");
    } finally {
      setDeleteId(null);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreProduct(id);
      toast.success("Product restored");
      loadData();
    } catch {
      toast.error("Failed to restore product");
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    try {
      await deleteProduct(permanentDeleteId);
      toast.success("Product permanently deleted");
      loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete product"
      );
    } finally {
      setPermanentDeleteId(null);
    }
  };

  const handleStatusToggle = async (product: Product, publish: boolean) => {
    if (product.isArchived) return;

    if (publish) {
      const check = canPublishProduct(product);
      if (!check.ok) {
        toast.error(check.reason ?? "Complete the product before publishing");
        return;
      }
    }

    setTogglingId(product.id);
    try {
      if (publish) {
        await publishProduct(product.id);
        toast.success("Product published");
      } else {
        await unpublishProduct(product.id);
        toast.success("Product moved to drafts");
      }
      loadData();
    } catch {
      toast.error(
        publish ? "Failed to publish product" : "Failed to unpublish product"
      );
    } finally {
      setTogglingId(null);
    }
  };

  if (!isMasterAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only the master-admin can manage the product catalog.
          </p>
        </CardContent>
      </Card>
    );
  }

  const visibleProducts = products.filter((p) =>
    showArchived ? p.isArchived : !p.isArchived
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground">Manage product catalog</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          {!showArchived && (
            <LinkButton href="/admin/products/new">
              <Plus className="mr-2 h-4 w-4" />
              Add product
            </LinkButton>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>
            {visibleProducts.length}{" "}
            {showArchived ? "archived" : "active"} products
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : visibleProducts.length === 0 ? (
            <p className="text-muted-foreground">
              {showArchived ? "No archived products." : "No products yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProducts.map((product) => {
                  const thumb = getProductThumbnailUrl(product);
                  const published = isProductPublished(product);

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
                          <span className="font-medium">
                            {product.name.trim() || "Untitled draft"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {product.categoryIds.map((id) => (
                            <Badge key={id} variant="secondary" className="text-xs">
                              {categoryMap[id]?.name ?? "Unknown"}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const range = getProductPriceRange(product);
                          if (range.min !== range.max) {
                            return `${formatCurrency(range.min)} – ${formatCurrency(range.max)}`;
                          }
                          return formatCurrency(getDefaultVariant(product).price);
                        })()}
                      </TableCell>
                      <TableCell>
                        {product.isArchived ? (
                          <Badge variant="secondary">Archived</Badge>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={published}
                              disabled={togglingId === product.id}
                              onCheckedChange={(checked) =>
                                handleStatusToggle(product, checked)
                              }
                              aria-label={
                                published
                                  ? "Published — switch to draft"
                                  : "Draft — switch to published"
                              }
                            />
                            <span className="text-sm text-muted-foreground">
                              {published ? "Published" : "Draft"}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            {!product.isArchived && (
                              <DropdownMenuItem
                                render={
                                  <Link href={`/admin/products/${product.id}`}>
                                    <Pencil className="h-4 w-4" />
                                    Edit
                                  </Link>
                                }
                              />
                            )}
                            {product.isArchived ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleRestore(product.id)}
                                >
                                  <ArchiveRestore className="h-4 w-4" />
                                  Restore
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    setPermanentDeleteId(product.id)
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete permanently
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteId(product.id)}
                              >
                                <Archive className="h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive product?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived products are hidden from the shop and catalog lists. You
              can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!permanentDeleteId}
        onOpenChange={() => setPermanentDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The product and its images will be removed
              from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handlePermanentDelete}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
