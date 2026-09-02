"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TablePagination } from "@/components/admin/table-pagination";
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
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import { getAllBranchInventory } from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { paginateItems } from "@/lib/pagination";
import {
  UNCATEGORIZED_CATEGORY_ID,
  buildRemainingStockGroups,
  filterRemainingStockGroups,
  flattenRemainingStockProducts,
  regroupRemainingStockProducts,
  type RemainingStockCategoryGroup,
} from "@/lib/remaining-stock";
import { cn } from "@/lib/utils";
import type {
  Branch,
  BranchInventory,
  Category,
  CategoryGroup,
  Product,
} from "@/types";

function StockCell({
  amount,
  assigned,
  lowStockThreshold,
}: {
  amount: number;
  assigned: boolean;
  lowStockThreshold: number;
}) {
  if (!assigned) {
    return (
      <TableCell className="text-right">
        <Badge variant="outline" className="text-muted-foreground">
          Unassigned
        </Badge>
      </TableCell>
    );
  }
  const isZero = amount <= 0;
  const isLow = amount > 0 && amount <= lowStockThreshold;
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums",
        isZero && "text-muted-foreground",
        isLow && "font-medium text-amber-700"
      )}
    >
      {amount}
    </TableCell>
  );
}

function CategoryBlock({
  group,
  branches,
  colCount,
}: {
  group: RemainingStockCategoryGroup;
  branches: Branch[];
  colCount: number;
}) {
  return (
    <>
      <TableRow className="border-primary/20 bg-primary hover:bg-primary">
        <TableCell
          colSpan={colCount}
          className="sticky left-0 bg-primary py-2.5 text-sm font-semibold tracking-wide text-primary-foreground"
        >
          {group.categoryName}
        </TableCell>
      </TableRow>
      {group.products.map((product) => (
        <Fragment key={product.productId}>
          <TableRow className="bg-accent hover:bg-accent">
            <TableCell
              colSpan={colCount}
              className="sticky left-0 bg-accent py-2 pl-4 text-sm font-medium text-accent-foreground"
            >
              {product.productName}
            </TableCell>
          </TableRow>
          {product.variants.map((variant) => (
            <TableRow key={variant.variantId}>
              <TableCell className="sticky left-0 z-10 bg-background font-medium">
                {variant.label}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {variant.sku || "—"}
              </TableCell>
              {branches.map((branch) => (
                <StockCell
                  key={branch.id}
                  amount={variant.stocks[branch.id] ?? 0}
                  assigned={variant.assigned[branch.id] === true}
                  lowStockThreshold={variant.lowStockThreshold}
                />
              ))}
              <TableCell className="text-right font-medium tabular-nums">
                {variant.total}
              </TableCell>
            </TableRow>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export default function RemainingStocksPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [search, setSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([
      getBranches(true),
      getCategories(),
      getCategoryGroups(),
      getProducts(true),
      getAllBranchInventory(),
    ])
      .then(([branchList, categoryList, groupList, productList, inventoryList]) => {
        setBranches(branchList);
        setCategories(categoryList.filter((category) => !category.isArchived));
        setCategoryGroups(groupList);
        setProducts(productList);
        setInventory(inventoryList);
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load remaining stocks");
      })
      .finally(() => setLoading(false));
  }, []);

  const activeGroups = useMemo(
    () => categoryGroups.filter((group) => !group.isArchived),
    [categoryGroups]
  );

  const categoryIdsInGroup = useMemo(() => {
    if (selectedGroupId === "all") return null;
    const group = activeGroups.find((item) => item.id === selectedGroupId);
    if (!group) return [];
    const activeIds = new Set(categories.map((category) => category.id));
    return group.categoryIds.filter((id) => activeIds.has(id));
  }, [activeGroups, categories, selectedGroupId]);

  const categoryOptions = useMemo(() => {
    if (categoryIdsInGroup == null) return categories;
    const allowed = new Set(categoryIdsInGroup);
    return categories.filter((category) => allowed.has(category.id));
  }, [categories, categoryIdsInGroup]);

  const selectedCategoryIds = useMemo(() => {
    if (selectedCategoryId !== "all") return [selectedCategoryId];
    if (categoryIdsInGroup == null) return [];
    return categoryIdsInGroup;
  }, [selectedCategoryId, categoryIdsInGroup]);

  const groups = useMemo(
    () =>
      buildRemainingStockGroups({
        products,
        categories,
        branches,
        inventory,
      }),
    [products, categories, branches, inventory]
  );

  const filteredGroups = useMemo(() => {
    if (
      categoryIdsInGroup != null &&
      selectedCategoryIds.length === 0
    ) {
      return [];
    }
    return filterRemainingStockGroups(groups, {
      search,
      selectedCategoryIds,
      categories,
    });
  }, [
    groups,
    search,
    selectedCategoryIds,
    categories,
    categoryIdsInGroup,
  ]);

  const productEntries = useMemo(
    () => flattenRemainingStockProducts(filteredGroups),
    [filteredGroups]
  );

  useEffect(() => {
    setPage(1);
  }, [search, selectedGroupId, selectedCategoryId]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(productEntries, page),
    [productEntries, page]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pagedGroups = useMemo(
    () => regroupRemainingStockProducts(pagedItems),
    [pagedItems]
  );

  const colCount = 2 + branches.length + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Remaining stocks</h1>
        <p className="text-muted-foreground">
          Current quantity on hand for each selling variant, by branch.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Search, category group, and category apply across all branches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="remaining-stock-search">Search</Label>
              <Input
                id="remaining-stock-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Product, variant, or SKU"
                className="w-full sm:w-64"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Category group</Label>
              <Select
                value={selectedGroupId}
                onValueChange={(value) => {
                  setSelectedGroupId(value || "all");
                  setSelectedCategoryId("all");
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-56">
                  <SelectValue>
                    {(value) => {
                      if (!value || value === "all") return "All groups";
                      return (
                        activeGroups.find((group) => group.id === value)
                          ?.name ?? "All groups"
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {activeGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Category</Label>
              <Select
                value={selectedCategoryId}
                onValueChange={(value) =>
                  setSelectedCategoryId(value || "all")
                }
              >
                <SelectTrigger size="sm" className="w-full sm:w-56">
                  <SelectValue>
                    {(value) => {
                      if (!value || value === "all") return "All categories";
                      if (value === UNCATEGORIZED_CATEGORY_ID) {
                        return "Uncategorized";
                      }
                      return (
                        categoryOptions.find((category) => category.id === value)
                          ?.name ?? "All categories"
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                  {categoryIdsInGroup == null ? (
                    <SelectItem value={UNCATEGORIZED_CATEGORY_ID}>
                      Uncategorized
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading remaining stocks…
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stock by branch</CardTitle>
            <CardDescription>
              {total} product{total === 1 ? "" : "s"} · {branches.length}{" "}
              branch{branches.length === 1 ? "" : "es"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active branches.
              </p>
            ) : pagedGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No selling variants match these filters.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[40rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-20 min-w-[10rem] bg-background">
                        Variant
                      </TableHead>
                      <TableHead className="min-w-[7rem]">SKU</TableHead>
                      {branches.map((branch) => (
                        <TableHead
                          key={branch.id}
                          className="min-w-[8rem] text-right"
                        >
                          <span className="block truncate" title={branch.name}>
                            {branch.name}
                          </span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {branch.code}
                          </span>
                        </TableHead>
                      ))}
                      <TableHead className="min-w-[5rem] text-right">
                        Total
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedGroups.map((group) => (
                      <CategoryBlock
                        key={group.categoryId}
                        group={group}
                        branches={branches}
                        colCount={colCount}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
