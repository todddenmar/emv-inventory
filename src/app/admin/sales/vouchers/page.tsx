"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryFilterPanel } from "@/components/admin/category-filter-panel";
import { TablePagination } from "@/components/admin/table-pagination";
import { VoucherSalesTable } from "@/components/admin/voucher-sales-table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { shiftDateInput, toDateInputValue } from "@/lib/dates";
import {
  filterSalesByProducts,
  productIdsForCategoryFilter,
} from "@/lib/category-filters";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import { getProducts } from "@/lib/firestore/products";
import { getResellers } from "@/lib/firestore/resellers";
import {
  clearResellerCommissionSent,
  getVoucherSales,
  markResellerCommissionSent,
} from "@/lib/firestore/pos-sales";
import { getVouchers } from "@/lib/firestore/vouchers";
import { formatCurrency } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { summarizeVoucherCommission } from "@/lib/voucher-sales";
import type {
  Branch,
  Category,
  CategoryGroup,
  PosSale,
  Product,
  Reseller,
  Voucher,
} from "@/types";

type Preset = "last7" | "thisMonth";

function applyPreset(preset: Preset): { fromDate: string; toDate: string } {
  const today = toDateInputValue();
  if (preset === "last7") {
    return { fromDate: shiftDateInput(today, -6), toDate: today };
  }
  const [y, m] = today.split("-").map(Number);
  return {
    fromDate: `${y}-${String(m).padStart(2, "0")}-01`,
    toDate: today,
  };
}

export default function AdminVoucherSalesPage() {
  const user = useAuthStore((s) => s.user);
  const {
    isElevatedAdmin,
    canViewAllBranches,
    assignedBranchId,
    scopedBranchId,
  } = useBranchAccess();
  const [sales, setSales] = useState<PosSale[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [voucherFilter, setVoucherFilter] = useState("all");
  const [resellerFilter, setResellerFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => applyPreset("last7").fromDate);
  const [toDate, setToDate] = useState(() => applyPreset("last7").toDate);
  const [page, setPage] = useState(1);

  const scopeBranchId = canViewAllBranches
    ? selectedBranchId === "all"
      ? null
      : selectedBranchId
    : scopedBranchId ?? assignedBranchId;

  useEffect(() => {
    Promise.all([
      getVouchers(),
      getResellers(),
      getBranches(true),
      getCategories(),
      getCategoryGroups(),
      getProducts(true),
    ])
      .then(([v, r, b, cats, groups, productList]) => {
        setVouchers(v);
        setResellers(r);
        setBranches(b);
        setCategories(cats.filter((c) => !c.isArchived));
        setCategoryGroups(groups);
        setProducts(productList);
        if (!canViewAllBranches && assignedBranchId) {
          setSelectedBranchId(assignedBranchId);
        }
      })
      .catch(console.error);
  }, [assignedBranchId, canViewAllBranches]);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getVoucherSales({
        branchId: scopeBranchId,
        voucherId: voucherFilter === "all" ? null : voucherFilter,
        resellerId: resellerFilter === "all" ? null : resellerFilter,
        fromDate,
        toDate,
      });
      setSales(rows);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load voucher sales");
    } finally {
      setLoading(false);
    }
  }, [scopeBranchId, voucherFilter, resellerFilter, fromDate, toDate]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    setPage(1);
  }, [
    voucherFilter,
    resellerFilter,
    fromDate,
    toDate,
    selectedBranchId,
    selectedCategoryIds,
  ]);

  const categoryProductIds = useMemo(
    () => productIdsForCategoryFilter(products, selectedCategoryIds),
    [products, selectedCategoryIds]
  );

  const filteredSales = useMemo(
    () => filterSalesByProducts(sales, categoryProductIds),
    [sales, categoryProductIds]
  );

  const summary = useMemo(
    () => summarizeVoucherCommission(filteredSales),
    [filteredSales]
  );

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(filteredSales, page),
    [filteredSales, page]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const handleMarkSent = async (saleId: string) => {
    if (!user) return;
    setMarkingId(saleId);
    try {
      await markResellerCommissionSent(saleId, {
        performedBy: user.uid,
        performedByName: user.displayName ?? user.email,
      });
      toast.success("Commission marked sent");
      await loadSales();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setMarkingId(null);
    }
  };

  const handleClearSent = async (saleId: string) => {
    if (!isElevatedAdmin) return;
    setMarkingId(saleId);
    try {
      await clearResellerCommissionSent(saleId);
      toast.success("Commission mark cleared");
      await loadSales();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Voucher sales</h1>
        <p className="text-muted-foreground">
          Sales with a voucher applied — track less amounts and reseller
          commission payouts
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sales</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary.saleCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total less</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(summary.totalLess)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending commission</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(summary.pendingLess)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {summary.pendingCount} sale{summary.pendingCount === 1 ? "" : "s"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sent commission</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(summary.sentLess)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {summary.sentCount} sale{summary.sentCount === 1 ? "" : "s"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter by date, branch, category, voucher, and reseller
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = applyPreset("last7");
                setFromDate(next.fromDate);
                setToDate(next.toDate);
              }}
            >
              Last 7 days
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = applyPreset("thisMonth");
                setFromDate(next.fromDate);
                setToDate(next.toDate);
              }}
            >
              This month
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="from-date">From</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date">To</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            {canViewAllBranches ? (
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={(v) => setSelectedBranchId(v ?? "all")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All branches">
                      {(value) => {
                        if (!value || value === "all") return "All branches";
                        const branch = branches.find((b) => b.id === value);
                        return branch
                          ? `${branch.name} (${branch.code})`
                          : null;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Category</Label>
              <CategoryFilterPanel
                categories={categories}
                groups={categoryGroups}
                selectedCategoryIds={selectedCategoryIds}
                onChange={setSelectedCategoryIds}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voucher-filter">Voucher</Label>
              <Select
                value={voucherFilter}
                onValueChange={(v) => setVoucherFilter(v ?? "all")}
              >
                <SelectTrigger id="voucher-filter">
                  <SelectValue placeholder="All vouchers">
                    {(value) => {
                      if (!value || value === "all") return "All vouchers";
                      const voucher = vouchers.find((v) => v.id === value);
                      if (!voucher) return null;
                      return voucher.name
                        ? `${voucher.name} (${voucher.code})`
                        : voucher.code;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vouchers</SelectItem>
                  {vouchers.map((voucher) => (
                    <SelectItem key={voucher.id} value={voucher.id}>
                      {voucher.name
                        ? `${voucher.name} (${voucher.code})`
                        : voucher.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reseller-filter">Reseller</Label>
              <Select
                value={resellerFilter}
                onValueChange={(v) => setResellerFilter(v ?? "all")}
              >
                <SelectTrigger id="reseller-filter">
                  <SelectValue placeholder="All resellers">
                    {(value) => {
                      if (!value || value === "all") return "All resellers";
                      return (
                        resellers.find((r) => r.id === value)?.name ?? null
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All resellers</SelectItem>
                  {resellers.map((reseller) => (
                    <SelectItem key={reseller.id} value={reseller.id}>
                      {reseller.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voucher sales</CardTitle>
          <CardDescription>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </span>
            ) : (
              `${total} sale${total === 1 ? "" : "s"} · newest first`
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <VoucherSalesTable
            sales={pagedItems}
            loading={loading}
            showBranch={canViewAllBranches && !scopeBranchId}
            canMarkCommission={isElevatedAdmin}
            markingId={markingId}
            onMarkCommissionSent={handleMarkSent}
            onClearCommissionSent={
              isElevatedAdmin ? handleClearSent : undefined
            }
          />
          {total > 0 ? (
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
