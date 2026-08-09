"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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
import {
  firstDayMonthsAgo,
  toDateInputValue,
  toMonthKey,
} from "@/lib/dates";
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { getBranch, getBranches } from "@/lib/firestore/branches";
import { getPosSales } from "@/lib/firestore/pos-sales";
import {
  mergeSellingVariantsWithInventory,
  getLowStockVariants,
} from "@/lib/inventory";
import { formatCurrency } from "@/lib/format";
import {
  percentChange,
  salesByMonth,
  type SalesMonthRow,
} from "@/lib/reports";
import { cn } from "@/lib/utils";
import type { Branch, PosSale } from "@/types";

function MonthChangeBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const change = percentChange(current, previous);
  if (change === null) {
    return (
      <span className="text-xs text-muted-foreground">vs last month: new</span>
    );
  }
  if (change === 0) {
    return (
      <span className="text-xs text-muted-foreground">vs last month: 0%</span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        up ? "text-emerald-700" : "text-red-700"
      )}
    >
      {up ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      )}
      {up ? "+" : ""}
      {change.toFixed(1)}% vs last month
    </span>
  );
}

function MonthlySalesChart({ rows }: { rows: SalesMonthRow[] }) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 0);

  return (
    <div className="flex h-52 items-end gap-1.5 sm:gap-2">
      {rows.map((row) => {
        const height =
          maxRevenue > 0
            ? Math.max((row.revenue / maxRevenue) * 100, row.revenue > 0 ? 4 : 0)
            : 0;
        return (
          <div
            key={row.month}
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
            title={`${row.label}: ${formatCurrency(row.revenue)} · ${row.receipts} receipt${row.receipts === 1 ? "" : "s"}`}
          >
            <div className="flex h-40 w-full items-end justify-center">
              <div
                className="w-full max-w-8 rounded-t-md bg-primary/80 transition-[height]"
                style={{ height: `${height}%` }}
              />
            </div>
            <p className="w-full truncate text-center text-[10px] text-muted-foreground sm:text-xs">
              {row.label.replace(/ (\d{4})$/, (_, year: string) =>
                ` '${year.slice(2)}`
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchCount, setBranchCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [products, branches] = await Promise.all([
        getProducts(),
        getBranches(true),
      ]);

      setProductCount(products.length);
      setBranchCount(branches.length);

      const scopeBranchId = isElevatedAdmin ? null : assignedBranchId;

      if (scopeBranchId) {
        const [inv, b] = await Promise.all([
          getBranchInventory(scopeBranchId),
          getBranch(scopeBranchId),
        ]);
        setBranch(b);
        const selling = mergeSellingVariantsWithInventory(products, inv);
        setLowStockCount(getLowStockVariants(selling).length);
      } else if (isElevatedAdmin && branches.length > 0) {
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
  }, [isElevatedAdmin, assignedBranchId]);

  useEffect(() => {
    async function loadSales() {
      if (!isElevatedAdmin && !assignedBranchId) {
        setSales([]);
        setSalesLoading(false);
        return;
      }

      setSalesLoading(true);
      try {
        const fromDate = firstDayMonthsAgo(11);
        const toDate = toDateInputValue();
        const rows = await getPosSales({
          branchId: isElevatedAdmin ? null : assignedBranchId,
          fromDate,
          toDate,
          max: 5000,
        });
        setSales(rows);
      } catch (error) {
        console.error(error);
        setSales([]);
      } finally {
        setSalesLoading(false);
      }
    }

    void loadSales();
  }, [isElevatedAdmin, assignedBranchId]);

  const monthRows = useMemo(() => {
    const toMonth = toMonthKey();
    const fromMonth = firstDayMonthsAgo(11).slice(0, 7);
    return salesByMonth(sales, fromMonth, toMonth);
  }, [sales]);

  const thisMonth = monthRows[monthRows.length - 1];
  const priorMonth = monthRows[monthRows.length - 2];

  if (loading) {
    return <p className="text-muted-foreground">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {!isElevatedAdmin && branch && (
          <p className="text-muted-foreground">{branch.name} branch overview</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isElevatedAdmin && (
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
              {isElevatedAdmin
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

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Monthly sales
            </CardTitle>
            <CardDescription>
              Last 12 months ·{" "}
              {isElevatedAdmin
                ? "all branches"
                : (branch?.name ?? "your branch")}
            </CardDescription>
          </div>
          <LinkButton href="/admin/reports" variant="outline" size="sm">
            Open reports
          </LinkButton>
        </CardHeader>
        <CardContent className="space-y-5">
          {salesLoading ? (
            <div className="flex items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sales…
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">This month</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatCurrency(thisMonth?.revenue ?? 0)}
                  </p>
                  <div className="mt-1">
                    <MonthChangeBadge
                      current={thisMonth?.revenue ?? 0}
                      previous={priorMonth?.revenue ?? 0}
                    />
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Receipts</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {thisMonth?.receipts ?? 0}
                  </p>
                  <div className="mt-1">
                    <MonthChangeBadge
                      current={thisMonth?.receipts ?? 0}
                      previous={priorMonth?.receipts ?? 0}
                    />
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Items sold</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {thisMonth?.itemsSold ?? 0}
                  </p>
                  <div className="mt-1">
                    <MonthChangeBadge
                      current={thisMonth?.itemsSold ?? 0}
                      previous={priorMonth?.itemsSold ?? 0}
                    />
                  </div>
                </div>
              </div>

              {monthRows.every((row) => row.receipts === 0) ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No POS sales in the last 12 months yet.
                </p>
              ) : (
                <MonthlySalesChart rows={monthRows} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <InventoryActivityFeed
        branchId={isElevatedAdmin ? null : assignedBranchId}
        description={
          isElevatedAdmin
            ? "Adjustments and transfers across all branches"
            : "Stock changes for your branch"
        }
      />
    </div>
  );
}
