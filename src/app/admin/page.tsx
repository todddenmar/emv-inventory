"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Loader2,
  Package,
  Trophy,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InventoryActivityFeed } from "@/components/admin/inventory-activity-feed";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { catalogCountsByCategoryGroup } from "@/lib/catalog-stats";
import {
  eachMonthInRange,
  firstDayMonthsAgo,
  formatMonthLabel,
  toDateInputValue,
  toMonthKey,
} from "@/lib/dates";
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { getBranch, getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import { getPosSales } from "@/lib/firestore/pos-sales";
import {
  mergeSellingVariantsWithInventory,
  getLowStockVariants,
} from "@/lib/inventory";
import { formatCurrency } from "@/lib/format";
import {
  percentChange,
  salesByMonth,
  topProducts,
  type SalesMonthRow,
} from "@/lib/reports";
import { cn } from "@/lib/utils";
import type { Branch, CategoryGroup, PosSale, Product } from "@/types";

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
      <span className="text-xs text-muted-foreground">vs prior month: new</span>
    );
  }
  if (change === 0) {
    return (
      <span className="text-xs text-muted-foreground">vs prior month: 0%</span>
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
      {change.toFixed(1)}% vs prior month
    </span>
  );
}

function MonthlySalesChart({
  rows,
  selectedMonth,
  onSelectMonth,
}: {
  rows: SalesMonthRow[];
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 0);

  return (
    <div className="flex h-52 items-end gap-1.5 sm:gap-2">
      {rows.map((row) => {
        const height =
          maxRevenue > 0
            ? Math.max((row.revenue / maxRevenue) * 100, row.revenue > 0 ? 4 : 0)
            : 0;
        const selected = row.month === selectedMonth;
        return (
          <button
            key={row.month}
            type="button"
            onClick={() => onSelectMonth(row.month)}
            className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`${row.label}: ${formatCurrency(row.revenue)} · ${row.receipts} receipt${row.receipts === 1 ? "" : "s"}`}
          >
            <div className="flex h-40 w-full items-end justify-center">
              <div
                className={cn(
                  "w-full max-w-8 rounded-t-md transition-[height,background-color]",
                  selected ? "bg-primary" : "bg-primary/50 hover:bg-primary/70"
                )}
                style={{ height: `${height}%` }}
              />
            </div>
            <p
              className={cn(
                "w-full truncate text-center text-[10px] sm:text-xs",
                selected
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {row.label.replace(/ (\d{4})$/, (_, year: string) =>
                ` '${year.slice(2)}`
              )}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { canViewAllBranches, assignedBranchId } = useBranchAccess();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchCount, setBranchCount] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(toMonthKey());

  const productCount = products.length;
  const variantCount = useMemo(
    () => products.reduce((sum, product) => sum + product.variants.length, 0),
    [products]
  );

  useEffect(() => {
    async function load() {
      const [productList, branches, categories, groups] = await Promise.all([
        getProducts(),
        getBranches(true),
        getCategories(),
        getCategoryGroups(),
      ]);

      setProducts(productList);
      setCategoryGroups(groups);
      setBranchCount(branches.length);

      const activeCategories = categories.filter((c) => !c.isArchived);
      const scopeBranchId = canViewAllBranches ? null : assignedBranchId;

      if (scopeBranchId) {
        const [inv, b] = await Promise.all([
          getBranchInventory(scopeBranchId),
          getBranch(scopeBranchId),
        ]);
        setBranch(b);
        const selling = mergeSellingVariantsWithInventory(
          productList,
          inv,
          activeCategories
        );
        setLowStockCount(getLowStockVariants(selling).length);
      } else if (canViewAllBranches && branches.length > 0) {
        let totalLow = 0;
        const inventories = await Promise.all(
          branches.map((b) => getBranchInventory(b.id))
        );
        for (const inv of inventories) {
          totalLow += getLowStockVariants(
            mergeSellingVariantsWithInventory(productList, inv, activeCategories)
          ).length;
        }
        setLowStockCount(totalLow);
      } else {
        setLowStockCount(0);
      }
    }

    load().catch(console.error).finally(() => setLoading(false));
  }, [canViewAllBranches, assignedBranchId]);

  useEffect(() => {
    async function loadSales() {
      if (!canViewAllBranches && !assignedBranchId) {
        setSales([]);
        setSalesLoading(false);
        return;
      }

      setSalesLoading(true);
      try {
        const fromDate = firstDayMonthsAgo(11);
        const toDate = toDateInputValue();
        const rows = await getPosSales({
          branchId: canViewAllBranches ? null : assignedBranchId,
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
  }, [canViewAllBranches, assignedBranchId]);

  const monthOptions = useMemo(() => {
    const toMonth = toMonthKey();
    const fromMonth = firstDayMonthsAgo(11).slice(0, 7);
    return eachMonthInRange(fromMonth, toMonth).reverse();
  }, []);

  const monthRows = useMemo(() => {
    const toMonth = toMonthKey();
    const fromMonth = firstDayMonthsAgo(11).slice(0, 7);
    return salesByMonth(sales, fromMonth, toMonth);
  }, [sales]);

  const selectedMonthRow = useMemo(
    () => monthRows.find((row) => row.month === selectedMonth),
    [monthRows, selectedMonth]
  );

  const priorMonthKey = useMemo(() => {
    const idx = monthRows.findIndex((row) => row.month === selectedMonth);
    if (idx <= 0) return null;
    return monthRows[idx - 1]?.month ?? null;
  }, [monthRows, selectedMonth]);

  const priorMonthRow = useMemo(
    () =>
      priorMonthKey
        ? monthRows.find((row) => row.month === priorMonthKey)
        : undefined,
    [monthRows, priorMonthKey]
  );

  const selectedMonthSales = useMemo(
    () => sales.filter((sale) => toMonthKey(sale.createdAt) === selectedMonth),
    [sales, selectedMonth]
  );

  const topSellers = useMemo(
    () => topProducts(selectedMonthSales, 10),
    [selectedMonthSales]
  );

  const groupCatalogRows = useMemo(
    () => catalogCountsByCategoryGroup(products, categoryGroups),
    [products, categoryGroups]
  );

  if (loading) {
    return <p className="text-muted-foreground">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {!canViewAllBranches && branch && (
          <p className="text-muted-foreground">{branch.name} branch overview</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canViewAllBranches && (
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
            <CardDescription>Product variants</CardDescription>
            <CardTitle className="text-3xl">{variantCount}</CardTitle>
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
              {canViewAllBranches
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

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 shrink-0" />
                Monthly sales
              </CardTitle>
              <CardDescription>
                Last 12 months ·{" "}
                {canViewAllBranches
                  ? "all branches"
                  : (branch?.name ?? "your branch")}
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Select
                value={selectedMonth}
                onValueChange={(value) => {
                  if (typeof value === "string" && value) {
                    setSelectedMonth(value);
                  }
                }}
              >
                <SelectTrigger className="w-full sm:w-[160px]" size="sm">
                  <SelectValue placeholder="Month">
                    {(value) =>
                      typeof value === "string" && value
                        ? formatMonthLabel(value)
                        : "Month"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonthLabel(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <LinkButton
                href="/admin/reports"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                Open reports
              </LinkButton>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {salesLoading ? (
              <div className="flex items-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sales…
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Revenue · {formatMonthLabel(selectedMonth)}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">
                      {formatCurrency(selectedMonthRow?.revenue ?? 0)}
                    </p>
                    <div className="mt-1">
                      <MonthChangeBadge
                        current={selectedMonthRow?.revenue ?? 0}
                        previous={priorMonthRow?.revenue ?? 0}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Receipts</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">
                      {selectedMonthRow?.receipts ?? 0}
                    </p>
                    <div className="mt-1">
                      <MonthChangeBadge
                        current={selectedMonthRow?.receipts ?? 0}
                        previous={priorMonthRow?.receipts ?? 0}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Items sold</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">
                      {selectedMonthRow?.itemsSold ?? 0}
                    </p>
                    <div className="mt-1">
                      <MonthChangeBadge
                        current={selectedMonthRow?.itemsSold ?? 0}
                        previous={priorMonthRow?.itemsSold ?? 0}
                      />
                    </div>
                  </div>
                </div>

                {monthRows.every((row) => row.receipts === 0) ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No POS sales in the last 12 months yet.
                  </p>
                ) : (
                  <MonthlySalesChart
                    rows={monthRows}
                    selectedMonth={selectedMonth}
                    onSelectMonth={setSelectedMonth}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 shrink-0" />
              Top sellers
            </CardTitle>
            <CardDescription>
              Ranked by revenue for {formatMonthLabel(selectedMonth)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading top sellers…
              </div>
            ) : topSellers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No product sales in {formatMonthLabel(selectedMonth)}.
              </p>
            ) : (
              <div className="max-h-[28rem] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topSellers.map((row, index) => (
                      <TableRow key={row.key}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {index + 1}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate font-medium sm:max-w-none">
                          {row.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 shrink-0" />
                Products by category group
              </CardTitle>
              <CardDescription>
                Catalog totals per group (products can appear in more than one)
              </CardDescription>
            </div>
            <LinkButton
              href="/admin/settings/category-groups"
              variant="outline"
              size="sm"
              className="w-full shrink-0 sm:w-auto"
            >
              Manage groups
            </LinkButton>
          </CardHeader>
          <CardContent>
            {groupCatalogRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No category groups yet. Create groups in Settings to break down
                catalog counts.
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
            branchId={canViewAllBranches ? null : assignedBranchId}
            description={
              canViewAllBranches
                ? "Adjustments and transfers across all branches"
                : "Stock changes for your branch"
            }
          />
        </div>
      </div>
    </div>
  );
}
