"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ShoppingBag } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { toMonthKey } from "@/lib/dates";
import {
  getCategoryMonthSoldReport,
  type CategoryMonthSoldReport,
} from "@/lib/category-month-sales";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import type { Branch, Category } from "@/types";

type CategoryMonthSoldCardProps = {
  /** When set, locks the report to this branch (staff). */
  lockedBranchId?: string | null;
  lockedBranchName?: string | null;
};

export function CategoryMonthSoldCard({
  lockedBranchId = null,
  lockedBranchName = null,
}: CategoryMonthSoldCardProps) {
  const { canViewAllBranches } = useBranchAccess();
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [optionsReady, setOptionsReady] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [monthKey, setMonthKey] = useState(() => toMonthKey());
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<CategoryMonthSoldReport | null>(null);

  const branchId = lockedBranchId ?? selectedBranchId;

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const categoryList = await getCategories();
        if (cancelled) return;
        setCategories(categoryList);

        if (canViewAllBranches && !lockedBranchId) {
          const branchList = await getBranches(true);
          if (cancelled) return;
          setBranches(branchList);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          toast.error("Failed to load categories");
        }
      } finally {
        if (!cancelled) setOptionsReady(true);
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [canViewAllBranches, lockedBranchId]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId]
  );

  const branchLabel = useMemo(() => {
    if (lockedBranchId) {
      return lockedBranchName?.trim() || "Your branch";
    }
    if (branchId === "all") return "All branches";
    return branches.find((branch) => branch.id === branchId)?.name ?? "Branch";
  }, [branchId, branches, lockedBranchId, lockedBranchName]);

  const handleGenerate = async () => {
    if (!categoryId) {
      toast.error("Select a category");
      return;
    }
    if (!monthKey) {
      toast.error("Select a month");
      return;
    }

    setGenerating(true);
    try {
      const next = await getCategoryMonthSoldReport({
        categoryId,
        categoryName: selectedCategory?.name ?? "Category",
        monthKey,
        branchId: branchId === "all" ? null : branchId,
      });
      setReport(next);
      if (next.truncated) {
        toast.message(
          "Month has many sales — count may be incomplete. Narrow by branch if needed."
        );
      }
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate report"
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4 shrink-0" />
          Category sold this month
        </CardTitle>
        <CardDescription>
          Pick a category and month, then generate. Nothing loads until you
          click.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="category-month-sold-category">Category</Label>
            <Select
              value={categoryId || "none"}
              onValueChange={(value) => {
                setCategoryId(!value || value === "none" ? "" : value);
                setReport(null);
              }}
              disabled={!optionsReady || generating}
            >
              <SelectTrigger id="category-month-sold-category">
                <SelectValue placeholder="Select category">
                  {(value) => {
                    if (!value || value === "none") return null;
                    return (
                      categories.find((category) => category.id === value)
                        ?.name ?? null
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select category</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-month-sold-month">Month</Label>
            <Input
              id="category-month-sold-month"
              type="month"
              value={monthKey}
              onChange={(e) => {
                setMonthKey(e.target.value);
                setReport(null);
              }}
              disabled={generating}
            />
          </div>

          {canViewAllBranches && !lockedBranchId ? (
            <div className="space-y-2">
              <Label htmlFor="category-month-sold-branch">Branch</Label>
              <Select
                value={selectedBranchId}
                onValueChange={(value) => {
                  setSelectedBranchId(value ?? "all");
                  setReport(null);
                }}
                disabled={generating}
              >
                <SelectTrigger id="category-month-sold-branch">
                  <SelectValue placeholder="All branches">
                    {(value) => {
                      if (!value || value === "all") return "All branches";
                      return (
                        branches.find((branch) => branch.id === value)?.name ??
                        null
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Branch</Label>
              <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                {branchLabel}
              </p>
            </div>
          )}
        </div>

        <Button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating || !optionsReady || !categoryId || !monthKey}
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Generate report
        </Button>

        {!report ? (
          <p className="text-sm text-muted-foreground">
            Results appear here after you generate.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Units sold</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {report.unitsSold}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Products sold</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {report.productsSold}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Receipts</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {report.receipts}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">In category</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {report.catalogProductCount}
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {report.categoryName} · {report.monthLabel} · {branchLabel}
              {report.truncated ? " · may be incomplete" : ""}
            </p>

            {report.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No items from this category were sold in that month.
              </p>
            ) : (
              <div className="max-h-72 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-right">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Receipts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((row, index) => (
                      <TableRow key={row.productId}>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.receipts}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
