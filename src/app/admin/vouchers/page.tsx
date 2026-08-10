"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePagination } from "@/components/admin/table-pagination";
import { getResellers } from "@/lib/firestore/resellers";
import {
  getVouchers,
  issueVoucher,
  voidVoucher,
  voucherOwnerLabel,
} from "@/lib/firestore/vouchers";
import { formatCurrency, formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { useAuthStore } from "@/stores/auth-store";
import type { Reseller, Voucher, VoucherStatus } from "@/types";

export default function AdminVouchersPage() {
  const user = useAuthStore((s) => s.user);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | "all">(
    "all"
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [resellerId, setResellerId] = useState("");
  const [amount, setAmount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const load = () => {
    Promise.all([getVouchers(), getResellers(true)])
      .then(([v, r]) => {
        setVouchers(v);
        setResellers(r);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load vouchers");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (!q) return true;
      const owner = voucherOwnerLabel(v).toLowerCase();
      return (
        v.code.toLowerCase().includes(q) ||
        owner.includes(q) ||
        (v.resellerName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [vouchers, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(filtered, page), [filtered, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const openIssue = () => {
    setResellerId("none");
    setAmount("");
    setExpiresAt("");
    setDialogOpen(true);
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const linked =
      resellerId && resellerId !== "none"
        ? resellers.find((r) => r.id === resellerId)
        : null;
    if (resellerId && resellerId !== "none" && !linked) {
      toast.error("Select a valid reseller");
      return;
    }

    setSubmitting(true);
    try {
      const voucher = await issueVoucher({
        resellerId: linked?.id ?? null,
        resellerName: linked?.name ?? null,
        amount: value,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`) : null,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });
      toast.success(`Issued ${voucher.code}`);
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue voucher");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async () => {
    if (!voidId) return;
    try {
      await voidVoucher(voidId);
      toast.success("Voucher voided");
      setVoidId(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied");
  };

  const statusBadge = (status: VoucherStatus) => {
    if (status === "active") return <Badge>Active</Badge>;
    if (status === "depleted") return <Badge variant="secondary">Depleted</Badge>;
    return <Badge variant="outline">Void</Badge>;
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vouchers</h1>
          <p className="text-muted-foreground">
            Prepaid store credit for resellers or walk-in customers
          </p>
        </div>
        <Button onClick={openIssue}>
          <Plus className="mr-2 h-4 w-4" />
          Issue voucher
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>All vouchers</CardTitle>
            <CardDescription>Codes, balances, and status</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search code or reseller…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter((v as VoucherStatus | "all") ?? "all")
              }
            >
              <SelectTrigger className="sm:w-36">
                <SelectValue>
                  {(value) =>
                    value === "all"
                      ? "All statuses"
                      : value
                        ? String(value).charAt(0).toUpperCase() +
                          String(value).slice(1)
                        : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="depleted">Depleted</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">No vouchers found.</p>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Initial</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((voucher) => (
                    <TableRow key={voucher.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-sm">{voucher.code}</span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => copyCode(voucher.code)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{voucherOwnerLabel(voucher)}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatCurrency(voucher.initialAmount)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatCurrency(voucher.remainingAmount)}
                      </TableCell>
                      <TableCell>{statusBadge(voucher.status)}</TableCell>
                      <TableCell>
                        {voucher.expiresAt ? formatDate(voucher.expiresAt) : "—"}
                      </TableCell>
                      <TableCell>{formatDate(voucher.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {voucher.status === "active" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setVoidId(voucher.id)}
                          >
                            Void
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={safePage}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue voucher</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleIssue}>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select
                value={resellerId || "none"}
                onValueChange={(v) => setResellerId(v ?? "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Walk-in (no reseller)">
                    {(value) => {
                      if (!value || value === "none") {
                        return "Walk-in (no reseller)";
                      }
                      return (
                        resellers.find((r) => r.id === value)?.name ?? null
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Walk-in (no reseller)</SelectItem>
                  {resellers.map((reseller) => (
                    <SelectItem key={reseller.id} value={reseller.id}>
                      {reseller.name}
                      {reseller.mobile ? ` · ${reseller.mobile}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave as walk-in for gift cards or general prepaid credit.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voucher-amount">Amount</Label>
              <Input
                id="voucher-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voucher-expires">Expires (optional)</Label>
              <Input
                id="voucher-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Issue voucher
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(voidId)}
        onOpenChange={(open) => {
          if (!open) setVoidId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Voided vouchers cannot be redeemed. Remaining balance is kept for
              history but blocked at POS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleVoid().catch(console.error);
              }}
            >
              Void voucher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
