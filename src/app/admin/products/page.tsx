"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Archive, ArchiveRestore } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProductFormDialog } from "@/components/admin/product-form-dialog";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  archiveProduct,
  getProducts,
  restoreProduct,
  updateProduct,
} from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getProductThumbnailUrl } from "@/lib/products";
import { formatCurrency } from "@/lib/format";
import type { Category, Product } from "@/types";

export default function AdminProductsPage() {
  const { isMasterAdmin } = useBranchAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setDialogOpen(true);
  };

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

  const toggleActive = async (product: Product) => {
    try {
      await updateProduct(product.id, { isActive: !product.isActive });
      loadData();
    } catch {
      toast.error("Failed to update product");
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
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add product
            </Button>
          )}
        </div>
      </div>

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        onSaved={loadData}
      />

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProducts.map((product) => {
                  const thumb = getProductThumbnailUrl(product);
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
                          <span className="font-medium">{product.name}</span>
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
                      <TableCell>{formatCurrency(product.price)}</TableCell>
                      <TableCell>
                        {product.isArchived ? (
                          <Badge variant="secondary">Archived</Badge>
                        ) : (
                          <Badge
                            variant={product.isActive ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={() => toggleActive(product)}
                          >
                            {product.isActive ? "Active" : "Hidden"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!product.isArchived && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(product)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {product.isArchived ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRestore(product.id)}
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(product.id)}
                          >
                            <Archive className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
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
    </div>
  );
}
