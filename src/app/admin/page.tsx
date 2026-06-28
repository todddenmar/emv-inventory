"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, ShoppingBag, AlertTriangle, Warehouse } from "lucide-react";
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
import { getOrders } from "@/lib/firestore/orders";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { getBranch, getBranches } from "@/lib/firestore/branches";
import { mergeProductsWithInventory, getLowStockItems } from "@/lib/inventory";
import { formatCurrency } from "@/lib/format";
import type { Branch, Order } from "@/types";

export default function AdminDashboardPage() {
  const { isMasterAdmin, assignedBranchId } = useBranchAccess();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchCount, setBranchCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [products, allOrders, branches] = await Promise.all([
        getProducts(),
        getOrders(),
        getBranches(true),
      ]);

      setProductCount(products.length);
      setBranchCount(branches.length);

      const scopeBranchId = isMasterAdmin ? null : assignedBranchId;
      const scopedOrders = scopeBranchId
        ? allOrders.filter((o) => o.branchId === scopeBranchId)
        : allOrders;
      setOrders(scopedOrders);

      if (scopeBranchId) {
        const [inv, b] = await Promise.all([
          getBranchInventory(scopeBranchId),
          getBranch(scopeBranchId),
        ]);
        setBranch(b);
        const withStock = mergeProductsWithInventory(products, inv);
        setLowStockCount(getLowStockItems(withStock).length);
      } else {
        setLowStockCount(0);
      }
    }

    load().catch(console.error).finally(() => setLoading(false));
  }, [isMasterAdmin, assignedBranchId]);

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const revenue = orders
    .filter((o) => o.status === "delivered")
    .reduce((sum, o) => sum + o.total, 0);

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
            <CardDescription>Pending orders</CardDescription>
            <CardTitle className="text-3xl">{pendingOrders.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {isMasterAdmin ? "Delivered revenue" : "Low stock items"}
            </CardDescription>
            <CardTitle
              className={`text-3xl ${!isMasterAdmin && lowStockCount > 0 ? "text-amber-600" : ""}`}
            >
              {isMasterAdmin ? formatCurrency(revenue) : lowStockCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {!isMasterAdmin && lowStockCount > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Low stock at {branch?.name}
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
              <ShoppingBag className="h-5 w-5" />
              Orders
            </CardTitle>
            <CardDescription>View and update order status</CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton href="/admin/orders">View orders</LinkButton>
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
            ? "Sales, adjustments, and transfers across all branches"
            : "Sales and stock changes for your branch"
        }
      />
    </div>
  );
}
