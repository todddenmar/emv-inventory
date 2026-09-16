"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { InventoryActivityFeed } from "@/components/admin/inventory-activity-feed";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { catalogCountsByCategoryGroup } from "@/lib/catalog-stats";
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { getBranch } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import {
  mergeSellingVariantsWithInventory,
  getLowStockVariants,
} from "@/lib/inventory";
import type { Branch, CategoryGroup, Product } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function StaffDashboardPage() {
  const { assignedBranchId } = useBranchAccess();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [sellingVariantCount, setSellingVariantCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const productCount = products.length;
  const catalogVariantCount = useMemo(
    () => products.reduce((sum, product) => sum + product.variants.length, 0),
    [products]
  );

  const groupCatalogRows = useMemo(
    () => catalogCountsByCategoryGroup(products, categoryGroups),
    [products, categoryGroups]
  );

  useEffect(() => {
    async function load() {
      if (!assignedBranchId) {
        setLoading(false);
        return;
      }
      try {
        const [productList, branchDoc, categories, groups, inv] =
          await Promise.all([
            getProducts(),
            getBranch(assignedBranchId),
            getCategories(),
            getCategoryGroups(),
            getBranchInventory(assignedBranchId),
          ]);

        setProducts(productList);
        setCategoryGroups(groups);
        setBranch(branchDoc);

        const activeCategories = categories.filter((c) => !c.isArchived);
        const selling = mergeSellingVariantsWithInventory(
          productList,
          inv,
          activeCategories
        );
        setLowStockCount(getLowStockVariants(selling).length);
        setSellingVariantCount(selling.length);
        setTotalUnits(inv.reduce((sum, row) => sum + (row.stock ?? 0), 0));
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [assignedBranchId]);

  if (!assignedBranchId) {
    return (
      <p className="text-muted-foreground">
        Your account needs a branch assignment.
      </p>
    );
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            {branch
              ? `${branch.name} inventory overview (view only)`
              : "Inventory overview (view only)"}
          </p>
        </div>
        <LinkButton href="/staff/find-stock" variant="outline" size="sm">
          <Search className="mr-1.5 h-4 w-4" />
          Find stock at other branches
        </LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <Card className="gap-0 py-0">
          <CardHeader className="px-3 py-2.5 sm:px-6 sm:py-4 sm:pb-2">
            <CardDescription className="text-xs sm:text-sm">
              Catalog products
            </CardDescription>
            <CardTitle className="text-xl sm:text-3xl">{productCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-3 py-2.5 sm:px-6 sm:py-4 sm:pb-2">
            <CardDescription className="text-xs sm:text-sm">
              Catalog variants
            </CardDescription>
            <CardTitle className="text-xl sm:text-3xl">
              {catalogVariantCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-3 py-2.5 sm:px-6 sm:py-4 sm:pb-2">
            <CardDescription className="text-xs sm:text-sm">
              Selling at branch
            </CardDescription>
            <CardTitle className="text-xl sm:text-3xl">
              {sellingVariantCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-3 py-2.5 sm:px-6 sm:py-4 sm:pb-2">
            <CardDescription className="text-xs sm:text-sm">
              Units on hand
            </CardDescription>
            <CardTitle className="text-xl tabular-nums sm:text-3xl">
              {totalUnits}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        <Card className="gap-0 py-0">
          <CardHeader className="px-3 py-2.5 sm:px-6 sm:py-4 sm:pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Package className="h-3.5 w-3.5" />
              Low stock items
            </CardDescription>
            <CardTitle
              className={`text-xl sm:text-3xl ${lowStockCount > 0 ? "text-amber-600" : ""}`}
            >
              {lowStockCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-3 py-2.5 sm:px-6 sm:py-4 sm:pb-2">
            <CardDescription className="text-xs sm:text-sm">Access</CardDescription>
            <CardTitle className="text-base font-medium sm:text-lg">
              View only
            </CardTitle>
          </CardHeader>
          <CardContent className="hidden px-3 pb-2.5 text-xs text-muted-foreground sm:block sm:px-6 sm:pb-4 sm:text-sm">
            Your branch stock, history, and daily changes. Use Find stock to
            check other branches.
          </CardContent>
        </Card>
      </div>

      {lowStockCount > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Low stock at {branch?.name ?? "your branch"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LinkButton href="/staff/inventory" variant="outline">
              Review inventory
            </LinkButton>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Catalog by group</CardTitle>
            <CardDescription>
              Product and variant counts in the selling catalog
            </CardDescription>
          </CardHeader>
          <CardContent>
            {groupCatalogRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No category groups yet.
              </p>
            ) : (
              <div className="max-h-[28rem] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right">Variants</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupCatalogRows.map((row) => (
                      <TableRow key={row.groupId}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.productCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.variantCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0">
          <InventoryActivityFeed
            branchId={assignedBranchId}
            description={`Stock changes for ${branch?.name ?? "your branch"}`}
            viewAllHref="/staff/inventory/adjustment-history"
            viewAllLabel="History"
          />
        </div>
      </div>
    </div>
  );
}
