"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { TablePagination } from "@/components/admin/table-pagination";
import { CategoryFilterPanel } from "@/components/admin/category-filter-panel";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  formatDateInputLabel,
  toDateInputValue,
} from "@/lib/dates";
import {
  filterInventoryLogsByProducts,
  productIdsForCategoryFilter,
} from "@/lib/category-filters";
import {
  buildDailyStockChanges,
  summarizeDailyStockChanges,
} from "@/lib/daily-stock-changes";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import { getInventoryLogs } from "@/lib/firestore/inventory-logs";
import { getProducts } from "@/lib/firestore/products";
import { paginateItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type {
  Branch,
  Category,
  CategoryGroup,
  InventoryLog,
  Product,
} from "@/types";

export default function AdminDailyStockChangesPage() {
  const { canViewAllBranches, assignedBranchId } = useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [date, setDate] = useState(() => toDateInputValue());
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const scopeBranchId = canViewAllBranches
    ? selectedBranchId === "all"
      ? null
      : selectedBranchId
    : assignedBranchId;

  useEffect(() => {
    Promise.all([
      getBranches(true),
      getCategories(),
      getCategoryGroups(),
      getProducts(),
    ])
      .then(([branchList, categoryList, groupList, productList]) => {
        setBranches(branchList);
        setCategories(categoryList.filter((category) => !category.isArchived));
        setCategoryGroups(groupList);
        setProducts(productList);
        if (!canViewAllBranches && assignedBranchId) {
          setSelectedBranchId(assignedBranchId);
        }
      })
      .catch(console.error);
  }, [canViewAllBranches, assignedBranchId]);

  const load = useCallback(async () => {
    if (!canViewAllBranches && !assignedBranchId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await getInventoryLogs({
        branchId: scopeBranchId,
        date,
        max: 5000,
      });
      setLogs(rows);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load daily stock changes");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [assignedBranchId, canViewAllBranches, date, scopeBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [date, scopeBranchId, selectedCategoryIds]);

  const filteredLogs = useMemo(() => {
    const allowedProductIds = productIdsForCategoryFilter(
      products,
      selectedCategoryIds
    );
    return filterInventoryLogsByProducts(logs, allowedProductIds);
  }, [logs, products, selectedCategoryIds]);

  const changeRows = useMemo(
    () => buildDailyStockChanges(filteredLogs, products, categories),
    [filteredLogs, products, categories]
  );

  const summary = useMemo(
    () => summarizeDailyStockChanges(changeRows),
    [changeRows]
  );

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(changeRows, page), [changeRows, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const branchSelectLabel = (value: string | null) => {
    if (!value || value === "all") return "All branches";
    const branch = branches.find((item) => item.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Daily stock changes</h1>
        <p className="text-muted-foreground">
          Read-only comparison of opening and closing stock for{" "}
          {formatDateInputLabel(date)}. Values come from existing inventory
          activity — nothing is recorded here.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Pick a date to load that day’s opening and closing stock from
            inventory logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="daily-stock-date">Date</Label>
              <Input
                id="daily-stock-date"
                type="date"
                value={date}
                onChange={(e) =>
                  setDate(e.target.value || toDateInputValue())
                }
                className="w-full sm:w-44"
              />
            </div>
            {canViewAllBranches ? (
              <div className="flex min-w-0 flex-col gap-2">
                <Label>Branch</Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={(value) =>
                    setSelectedBranchId(value ?? "all")
                  }
                >
                  <SelectTrigger size="sm" className="w-full sm:w-56">
                    <SelectValue placeholder="All branches">
                      {(value) => branchSelectLabel(value as string | null)}
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
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Categories</Label>
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

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading daily stock changes…
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Products changed</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {summary.productsChanged}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total stock added</CardDescription>
                <CardTitle className="text-3xl tabular-nums text-emerald-700">
                  +{summary.totalStockAdded}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total stock reduced</CardDescription>
                <CardTitle className="text-3xl tabular-nums text-red-700">
                  −{summary.totalStockReduced}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily stock changes</CardTitle>
              <CardDescription>
                Only products where opening and closing stock differ
              </CardDescription>
            </CardHeader>
            <CardContent>
              {changeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No stock changes for this date
                  {scopeBranchId ? " and branch" : ""}.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Category</TableHead>
                          {canViewAllBranches && selectedBranchId === "all" ? (
                            <TableHead>Branch</TableHead>
                          ) : null}
                          <TableHead className="text-right">
                            Opening stock
                          </TableHead>
                          <TableHead className="text-right">
                            Closing stock
                          </TableHead>
                          <TableHead className="text-right">Change</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedItems.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium">
                              {row.productLabel}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {row.categoryLabel}
                            </TableCell>
                            {canViewAllBranches &&
                            selectedBranchId === "all" ? (
                              <TableCell className="text-sm">
                                {row.branchName ?? row.branchId}
                              </TableCell>
                            ) : null}
                            <TableCell className="text-right tabular-nums">
                              {row.openingStock}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.closingStock}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-medium tabular-nums",
                                row.change > 0
                                  ? "text-emerald-700"
                                  : "text-red-700"
                              )}
                            >
                              {row.change > 0 ? "+" : ""}
                              {row.change}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  row.status === "Added"
                                    ? "default"
                                    : "secondary"
                                }
                                className={
                                  row.status === "Added"
                                    ? "bg-emerald-700 text-white"
                                    : "bg-red-700 text-white"
                                }
                              >
                                {row.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination
                    page={safePage}
                    totalPages={totalPages}
                    total={total}
                    onPageChange={setPage}
                    className="mt-4"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
