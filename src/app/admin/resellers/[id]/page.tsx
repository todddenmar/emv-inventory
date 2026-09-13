"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
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
import { TablePagination } from "@/components/admin/table-pagination";
import { VoucherSalesTable } from "@/components/admin/voucher-sales-table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { shiftDateInput, toDateInputValue } from "@/lib/dates";
import { getReseller } from "@/lib/firestore/resellers";
import {
  clearResellerCommissionSent,
  getVoucherSales,
  markResellerCommissionSent,
} from "@/lib/firestore/pos-sales";
import {
  getVouchers,
  parseVoucherDiscountType,
} from "@/lib/firestore/vouchers";
import { formatCurrency, formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { summarizeVoucherCommission } from "@/lib/voucher-sales";
import type { PosSale, Reseller, Voucher } from "@/types";

export default function AdminResellerDetailPage() {
  const params = useParams();
  const resellerId = String(params.id ?? "");
  const user = useAuthStore((s) => s.user);
  const { isElevatedAdmin, scopedBranchId } = useBranchAccess();

  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() =>
    shiftDateInput(toDateInputValue(), -29)
  );
  const [toDate, setToDate] = useState(() => toDateInputValue());
  const [salesPage, setSalesPage] = useState(1);

  const load = useCallback(async () => {
    if (!resellerId) return;
    setLoading(true);
    try {
      const [r, v, s] = await Promise.all([
        getReseller(resellerId),
        getVouchers({ resellerId }),
        getVoucherSales({
          resellerId,
          branchId: scopedBranchId,
          fromDate,
          toDate,
          max: 1000,
        }),
      ]);
      setReseller(r);
      setVouchers(v);
      setSales(s);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load reseller");
    } finally {
      setLoading(false);
    }
  }, [resellerId, scopedBranchId, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSalesPage(1);
  }, [fromDate, toDate]);

  const summary = useMemo(() => summarizeVoucherCommission(sales), [sales]);

  const {
    page: safeSalesPage,
    totalPages: salesTotalPages,
    pagedItems: pagedSales,
    total: salesTotal,
  } = useMemo(() => paginateItems(sales, salesPage), [sales, salesPage]);

  useEffect(() => {
    if (salesPage !== safeSalesPage) setSalesPage(safeSalesPage);
  }, [salesPage, safeSalesPage]);

  const handleMarkSent = async (saleId: string) => {
    if (!user) return;
    setMarkingId(saleId);
    try {
      await markResellerCommissionSent(saleId, {
        performedBy: user.uid,
        performedByName: user.displayName ?? user.email,
      });
      toast.success("Commission marked sent");
      await load();
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
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setMarkingId(null);
    }
  };

  if (loading && !reseller) {
    return <p className="text-muted-foreground">Loading reseller…</p>;
  }

  if (!reseller) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Reseller not found.</p>
        <LinkButton href="/admin/resellers" variant="outline">
          Back to resellers
        </LinkButton>
      </div>
    );
  }

  const voucherLessLabel = (voucher: Voucher) =>
    parseVoucherDiscountType(voucher.discountType) === "percent"
      ? `${voucher.discountValue}% less`
      : `−${formatCurrency(voucher.discountValue)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <LinkButton
          href="/admin/resellers"
          variant="ghost"
          className="w-fit px-0"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to resellers
        </LinkButton>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{reseller.name}</h1>
            <p className="text-muted-foreground">
              {[reseller.mobile, reseller.email].filter(Boolean).join(" · ") ||
                "No contact details"}
            </p>
            {reseller.address ? (
              <p className="text-sm text-muted-foreground">{reseller.address}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {reseller.isActive ? (
              <Badge>Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
            <LinkButton
              href="/admin/settings/resellers"
              variant="outline"
              size="sm"
            >
              Edit in settings
            </LinkButton>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Voucher sales</CardDescription>
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
            {summary.pendingCount} unpaid
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
            {summary.sentCount} marked sent
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vouchers</CardTitle>
          <CardDescription>
            Vouchers linked to this reseller
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vouchers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No vouchers linked to this reseller.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Less</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((voucher) => (
                    <TableRow key={voucher.id}>
                      <TableCell>{voucher.name || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {voucher.code}
                      </TableCell>
                      <TableCell>{voucherLessLabel(voucher)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            voucher.status === "active"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {voucher.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {voucher.expiresAt
                          ? formatDate(voucher.expiresAt)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voucher sales</CardTitle>
          <CardDescription>
            Sales where this reseller&apos;s voucher was used
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reseller-from-date">From</Label>
              <Input
                id="reseller-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reseller-to-date">To</Label>
              <Input
                id="reseller-to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sales…
            </div>
          ) : (
            <>
              <VoucherSalesTable
                sales={pagedSales}
                showVoucherCode
                showBranch={!scopedBranchId}
                canMarkCommission={isElevatedAdmin}
                markingId={markingId}
                onMarkCommissionSent={handleMarkSent}
                onClearCommissionSent={
                  isElevatedAdmin ? handleClearSent : undefined
                }
              />
              {salesTotal > 0 ? (
                <TablePagination
                  page={safeSalesPage}
                  totalPages={salesTotalPages}
                  total={salesTotal}
                  onPageChange={setSalesPage}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
