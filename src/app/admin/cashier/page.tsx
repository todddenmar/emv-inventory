"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, PackageOpen, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranch } from "@/lib/firestore/branches";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import { toDateInputValue } from "@/lib/dates";
import { summarizeSales } from "@/lib/reports";
import type { Branch } from "@/types";

export default function CashierOverviewPage() {
  const { assignedBranchId } = useBranchAccess();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState({ revenue: 0, receipts: 0, itemsSold: 0 });
  const [month, setMonth] = useState({ revenue: 0, receipts: 0 });

  const load = useCallback(async () => {
    if (!assignedBranchId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const todayStr = toDateInputValue();
    const monthStart = `${todayStr.slice(0, 7)}-01`;
    try {
      const [branchDoc, todaySales, monthSales] = await Promise.all([
        getBranch(assignedBranchId),
        getPosSales({
          branchId: assignedBranchId,
          fromDate: todayStr,
          toDate: todayStr,
          max: 500,
        }),
        getPosSales({
          branchId: assignedBranchId,
          fromDate: monthStart,
          toDate: todayStr,
          max: 2000,
        }),
      ]);
      setBranch(branchDoc);
      const todayTotals = summarizeSales(todaySales);
      const monthTotals = summarizeSales(monthSales);
      setToday({
        revenue: todayTotals.revenue,
        receipts: todayTotals.receipts,
        itemsSold: todayTotals.itemsSold,
      });
      setMonth({
        revenue: monthTotals.revenue,
        receipts: monthTotals.receipts,
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, [assignedBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!assignedBranchId) {
    return (
      <p className="text-muted-foreground">
        Your account needs a branch assignment.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const supportsWholesale = branch?.supportsWholesale === true;

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">
          {branch ? `${branch.name} · ${branch.code}` : "Your branch"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today&apos;s sales</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(today.revenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {today.receipts} receipt{today.receipts === 1 ? "" : "s"} ·{" "}
            {today.itemsSold} item{today.itemsSold === 1 ? "" : "s"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>This month</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(month.revenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {month.receipts} receipt{month.receipts === 1 ? "" : "s"} so far
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3">
        <LinkButton href="/admin/pos" className="h-14 w-full text-base">
          <ShoppingCart className="mr-2 h-5 w-5" />
          Open POS
        </LinkButton>
        {supportsWholesale ? (
          <LinkButton
            href="/admin/wholesale"
            variant="outline"
            className="h-12 w-full"
          >
            <PackageOpen className="mr-2 h-4 w-4" />
            Wholesale POS
          </LinkButton>
        ) : null}
        <LinkButton
          href="/admin/cashier/sales"
          variant="outline"
          className="h-12 w-full"
        >
          <History className="mr-2 h-4 w-4" />
          Sales history
        </LinkButton>
      </div>
    </div>
  );
}
