"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryFilterPanel } from "@/components/admin/category-filter-panel";
import { SaleInvoiceButton } from "@/components/admin/sale-invoice-dialog";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { shiftDateInput, toDateInputValue } from "@/lib/dates";
import {
  filterSalesByProducts,
  productIdsForCategoryFilter,
} from "@/lib/category-filters";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { getProducts } from "@/lib/firestore/products";
import { formatCurrency, formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { posCustomerTypeLabel } from "@/lib/pos-customer-type";
import {
  formatSaleItemsSummary,
  saleMatchesItemNameSearch,
} from "@/lib/voucher-sales";
import type {
  Branch,
  Category,
  CategoryGroup,
  PosCustomerType,
  PosSale,
  Product,
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

export function CustomerTypeSalesPage({
  customerType,
  title,
  description,
}: {
  customerType: PosCustomerType;
  title: string;
  description: string;
}) {
  const { canViewAllBranches, assignedBranchId, scopedBranchId } =
    useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [fromDate, setFromDate] = useState(() => applyPreset("last7").fromDate);
  const [toDate, setToDate] = useState(() => applyPreset("last7").toDate);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [itemSearch, setItemSearch] = useState("");

  const scopeBranchId = canViewAllBranches
    ? selectedBranchId === "all"
      ? null
      : selectedBranchId
    : scopedBranchId ?? assignedBranchId;

  useEffect(() => {
    Promise.all([
      getBranches(true),
      getCategories(),
      getCategoryGroups(),
      getProducts(true),
    ])
      .then(([branchList, categoryList, groupList, productList]) => {
        setBranches(branchList);
        setCategories(categoryList.filter((c) => !c.isArchived));
        setCategoryGroups(groupList);
        setProducts(productList);
        if (!canViewAllBranches && assignedBranchId) {
          setSelectedBranchId(assignedBranchId);
        }
      })
      .catch(console.error);
  }, [canViewAllBranches, assignedBranchId]);

  const loadSales = useCallback(async () => {
    if (!canViewAllBranches && !assignedBranchId) {
      setSales([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await getPosSales({
        branchId: scopeBranchId,
        fromDate,
        toDate,
        max: 1000,
      });
      setSales(rows.filter((sale) => sale.customerType === customerType));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load sales");
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [
    assignedBranchId,
    canViewAllBranches,
    customerType,
    fromDate,
    scopeBranchId,
    toDate,
  ]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    setPage(1);
  }, [
    fromDate,
    toDate,
    selectedBranchId,
    selectedCategoryIds,
    customerType,
    itemSearch,
  ]);

  const categoryProductIds = useMemo(
    () => productIdsForCategoryFilter(products, selectedCategoryIds),
    [products, selectedCategoryIds]
  );

  const filteredSales = useMemo(() => {
    const byCategory = filterSalesByProducts(sales, categoryProductIds);
    return byCategory.filter((sale) =>
      saleMatchesItemNameSearch(sale, itemSearch)
    );
  }, [sales, categoryProductIds, itemSearch]);

  const totalAmount = useMemo(
    () =>
      filteredSales.reduce(
        (sum, sale) => sum + (sale.amountDue ?? sale.total ?? 0),
        0
      ),
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

  const showCustomer = customerType !== "walk_in";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sales</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Amount due</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(totalAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter by date range, branch, category, or item name
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <Label htmlFor={`${customerType}-item-search`}>Item name</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={`${customerType}-item-search`}
                  className="pl-9"
                  placeholder="Search product name…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${customerType}-from`}>From</Label>
              <Input
                id={`${customerType}-from`}
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${customerType}-to`}>To</Label>
              <Input
                id={`${customerType}-to`}
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{posCustomerTypeLabel(customerType)} sales</CardTitle>
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
          {loading ? (
            <p className="text-muted-foreground">Loading sales…</p>
          ) : filteredSales.length === 0 ? (
            <p className="text-muted-foreground">No sales in this range.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {canViewAllBranches ? <TableHead>Branch</TableHead> : null}
                    {showCustomer ? <TableHead>Customer</TableHead> : null}
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Amount due</TableHead>
                    <TableHead className="w-20 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(sale.createdAt)}
                      </TableCell>
                      {canViewAllBranches ? (
                        <TableCell className="text-sm">
                          {sale.branchName || sale.branchId}
                        </TableCell>
                      ) : null}
                      {showCustomer ? (
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {sale.customer?.name?.trim() || "—"}
                            </p>
                            {sale.customer?.mobile ? (
                              <p className="text-xs text-muted-foreground">
                                {sale.customer.mobile}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="max-w-xs text-sm">
                        {formatSaleItemsSummary(sale)}
                        {sale.voucherCode ? (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {sale.voucherCode}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(sale.amountDue ?? sale.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <SaleInvoiceButton sale={sale} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
