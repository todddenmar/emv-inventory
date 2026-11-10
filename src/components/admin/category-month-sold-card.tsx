"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { CategoryMultiSelect } from "@/components/admin/category-multi-select";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  getTrackedCategoryMonthSoldReports,
  type CategoryMonthSoldReport,
} from "@/lib/category-month-sales";
import { formatMonthLabel, toMonthKey } from "@/lib/dates";
import { getCategories } from "@/lib/firestore/categories";
import { updateTrackedSoldCategoryIds } from "@/lib/firestore/users";
import { useAuthStore } from "@/stores/auth-store";
import type { Category } from "@/types";

type CategoryMonthSoldCardProps = {
  /** When set, locks totals to this branch (staff). */
  lockedBranchId?: string | null;
  lockedBranchName?: string | null;
};

export function CategoryMonthSoldCard({
  lockedBranchId = null,
  lockedBranchName = null,
}: CategoryMonthSoldCardProps) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { canViewAllBranches } = useBranchAccess();

  const trackedIds = useMemo(
    () => user?.trackedSoldCategoryIds ?? [],
    [user?.trackedSoldCategoryIds]
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [managing, setManaging] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [monthKey, setMonthKey] = useState(() => toMonthKey());
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [reports, setReports] = useState<CategoryMonthSoldReport[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const branchId = lockedBranchId;
  const branchLabel = lockedBranchId
    ? lockedBranchName?.trim() || "Your branch"
    : canViewAllBranches
      ? "All branches"
      : lockedBranchName?.trim() || "Your branch";

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const list = await getCategories();
        if (!cancelled) setCategories(list);
      } catch (error) {
        console.error(error);
        if (!cancelled) toast.error("Failed to load categories");
      } finally {
        if (!cancelled) setCategoriesReady(true);
      }
    }

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  const trackedCategories = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    return trackedIds
      .map((id) => byId.get(id))
      .filter((category): category is Category => category != null);
  }, [categories, trackedIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadTotals() {
      if (!categoriesReady) return;
      if (trackedCategories.length === 0) {
        setReports([]);
        setLoadingTotals(false);
        return;
      }
      if (!monthKey) return;

      setLoadingTotals(true);
      try {
        const next = await getTrackedCategoryMonthSoldReports({
          categories: trackedCategories.map((category) => ({
            id: category.id,
            name: category.name,
          })),
          monthKey,
          branchId,
        });
        if (cancelled) return;
        setReports(next);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to load category sold totals"
          );
        }
      } finally {
        if (!cancelled) setLoadingTotals(false);
      }
    }

    void loadTotals();
    return () => {
      cancelled = true;
    };
  }, [branchId, categoriesReady, monthKey, trackedCategories]);

  const handleTrackedChange = async (ids: string[]) => {
    if (!user?.uid) {
      toast.error("Sign in to save tracked categories");
      return;
    }
    setSavingPrefs(true);
    try {
      const saved = await updateTrackedSoldCategoryIds(user.uid, ids);
      setUser({ ...user, trackedSoldCategoryIds: saved });
    } catch (error) {
      console.error(error);
      toast.error("Failed to save tracked categories");
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4 shrink-0" />
            Tracked category sales
          </CardTitle>
          <CardDescription>
            Your selected categories load automatically for{" "}
            {formatMonthLabel(monthKey)} · {branchLabel}
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => setManaging((open) => !open)}
          disabled={!categoriesReady}
        >
          {managing ? "Done" : "Select categories"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="tracked-category-month">Month</Label>
            <Input
              id="tracked-category-month"
              type="month"
              value={monthKey}
              onChange={(e) => {
                setMonthKey(e.target.value);
                setExpandedId(null);
              }}
              disabled={loadingTotals}
            />
          </div>
          <p className="text-sm text-muted-foreground sm:pb-2">
            {trackedIds.length === 0
              ? "No categories tracked yet."
              : `${trackedCategories.length} categor${
                  trackedCategories.length === 1 ? "y" : "ies"
                } tracked`}
            {savingPrefs ? " · Saving…" : ""}
          </p>
        </div>

        {managing ? (
          <div className="space-y-2">
            <Label>Categories to track</Label>
            <CategoryMultiSelect
              categories={categories}
              selectedIds={trackedIds}
              onChange={(ids) => void handleTrackedChange(ids)}
              idPrefix="tracked-sold-cat"
              maxHeightClassName="max-h-56"
              disabled={savingPrefs || !user}
            />
            <p className="text-xs text-muted-foreground">
              Saved to your account. Other users keep their own list.
            </p>
          </div>
        ) : null}

        {loadingTotals ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sold totals…
          </div>
        ) : trackedCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Select categories to track and their sold totals will show here on
            every refresh.
          </p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No totals yet for this month.
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right">Receipts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report, index) => {
                  const expanded = expandedId === report.categoryId;
                  return (
                    <Fragment key={report.categoryId}>
                      <TableRow>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-left font-medium hover:underline"
                            onClick={() =>
                              setExpandedId(expanded ? null : report.categoryId)
                            }
                          >
                            {expanded ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                            )}
                            {report.categoryName}
                          </button>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {report.unitsSold}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {report.productsSold}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {report.receipts}
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30 p-0">
                            {report.rows.length === 0 ? (
                              <p className="px-4 py-3 text-sm text-muted-foreground">
                                No items sold in this category for{" "}
                                {report.monthLabel}.
                              </p>
                            ) : (
                              <div className="max-h-56 overflow-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-12 text-right">
                                        #
                                      </TableHead>
                                      <TableHead>Product</TableHead>
                                      <TableHead className="text-right">
                                        Units
                                      </TableHead>
                                      <TableHead className="text-right">
                                        Receipts
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {report.rows.map((row, rowIndex) => (
                                      <TableRow key={row.productId}>
                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                          {rowIndex + 1}
                                        </TableCell>
                                        <TableCell>{row.name}</TableCell>
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
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
