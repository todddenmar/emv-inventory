"use client";

import { useEffect, useState } from "react";
import { Package, AlertTriangle, Warehouse, ArrowRightLeft } from "lucide-react";
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
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { getBranch, getBranches } from "@/lib/firestore/branches";
import { mergeSellingVariantsWithInventory, getLowStockVariants } from "@/lib/inventory";
import type { Branch } from "@/types";

export default function AdminDashboardPage() {
  const { isMasterAdmin, assignedBranchId } = useBranchAccess();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchCount, setBranchCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [products, branches] = await Promise.all([
        getProducts(),
        getBranches(true),
      ]);

      setProductCount(products.length);
      setBranchCount(branches.length);

      const scopeBranchId = isMasterAdmin ? null : assignedBranchId;

      if (scopeBranchId) {
        const [inv, b] = await Promise.all([
          getBranchInventory(scopeBranchId),
          getBranch(scopeBranchId),
        ]);
        setBranch(b);
        const selling = mergeSellingVariantsWithInventory(products, inv);
        setLowStockCount(getLowStockVariants(selling).length);
      } else if (isMasterAdmin && branches.length > 0) {
        let totalLow = 0;
        const inventories = await Promise.all(
          branches.map((b) => getBranchInventory(b.id))
        );
        for (const inv of inventories) {
          totalLow += getLowStockVariants(
            mergeSellingVariantsWithInventory(products, inv)
          ).length;
        }
        setLowStockCount(totalLow);
      } else {
        setLowStockCount(0);
      }
    }

    load().catch(console.error).finally(() => setLoading(false));
  }, [isMasterAdmin, assignedBranchId]);

  if (loading) {
    return <p className="text-muted-foreground">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {!isMasterAdmin && branch && (
          <p className="text-muted-foreground">{branch.name} branch overview</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isMasterAdmin && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active branches</CardDescription>
              <CardTitle className="text-3xl">{branchCount}</CardTitle>
            </CardHeader>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Catalog products</CardDescription>
            <CardTitle className="text-3xl">{productCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Low stock items</CardDescription>
            <CardTitle
              className={`text-3xl ${lowStockCount > 0 ? "text-amber-600" : ""}`}
            >
              {lowStockCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {lowStockCount > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              {isMasterAdmin
                ? "Low stock across branches"
                : `Low stock at ${branch?.name}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LinkButton href="/admin/inventory" variant="outline">
              Review inventory
            </LinkButton>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5" />
              Inventory
            </CardTitle>
            <CardDescription>Branch stock levels</CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton href="/admin/inventory">Manage inventory</LinkButton>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transfers
            </CardTitle>
            <CardDescription>Move stock between branches</CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton href="/admin/transfers">Manage transfers</LinkButton>
          </CardContent>
        </Card>
        {isMasterAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Products
              </CardTitle>
              <CardDescription>Manage product catalog</CardDescription>
            </CardHeader>
            <CardContent>
              <LinkButton href="/admin/products">Manage products</LinkButton>
            </CardContent>
          </Card>
        )}
      </div>

      <InventoryActivityFeed
        branchId={isMasterAdmin ? null : assignedBranchId}
        description={
          isMasterAdmin
            ? "Adjustments and transfers across all branches"
            : "Stock changes for your branch"
        }
      />
    </div>
  );
}
