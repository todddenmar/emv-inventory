"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, MoreHorizontal, Plus, Search } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
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
  getVoucherRedemptions,
  getVouchers,
  issueVoucher,
  parseVoucherDiscountType,
  updateVoucher,
  voidVoucher,
  voucherOwnerLabel,
} from "@/lib/firestore/vouchers";
import { formatCurrency, formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { useAuthStore } from "@/stores/auth-store";
import type {
  Reseller,
  Voucher,
  VoucherDiscountType,
  VoucherRedemption,
  VoucherStatus,
} from "@/types";

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [resellerId, setResellerId] = useState("");
  const [discountType, setDiscountType] =
    useState<VoucherDiscountType>("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [usageVoucher, setUsageVoucher] = useState<Voucher | null>(null);
  const [redemptions, setRedemptions] = useState<VoucherRedemption[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const isEditing = editingVoucher != null;

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
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
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

  useEffect(() => {
    if (!usageVoucher) {
      setRedemptions([]);
      return;
    }
    let cancelled = false;
    setLoadingUsage(true);
    getVoucherRedemptions(usageVoucher.id)
      .then((rows) => {
        if (!cancelled) setRedemptions(rows);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) toast.error("Failed to load voucher customers");
      })
      .finally(() => {
        if (!cancelled) setLoadingUsage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [usageVoucher]);

  const resetForm = () => {
    setEditingVoucher(null);
    setName("");
    setDescription("");
    setCode("");
    setResellerId("none");
    setDiscountType("amount");
    setDiscountValue("");
    setExpiresAt("");
  };

  const openIssue = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (voucher: Voucher) => {
    if (voucher.status === "void") {
      toast.error("Voided vouchers cannot be edited");
      return;
    }
    setEditingVoucher(voucher);
    setName(voucher.name);
    setDescription(voucher.description);
    setCode(voucher.code);
    setResellerId(voucher.resellerId ?? "none");
    setDiscountType(parseVoucherDiscountType(voucher.discountType));
    setDiscountValue(
      String(voucher.discountValue)
    );
    setExpiresAt(toDateInputValue(voucher.expiresAt));
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      toast.error("Enter a voucher name");
      return;
    }
    const value = Number(discountValue);
    if (discountType === "percent") {
      if (!Number.isFinite(value) || value <= 0 || value > 100) {
        toast.error("Enter a percent between 1 and 100");
        return;
      }
    } else if (!Number.isFinite(value) || value <= 0) {
      toast.error(
        isEditing ? "Enter a valid less amount" : "Enter a valid amount"
      );
      return;
    }

    if (isEditing && !code.trim()) {
      toast.error("Enter a voucher code");
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
      if (isEditing && editingVoucher) {
        const updated = await updateVoucher(editingVoucher.id, {
          name: name.trim(),
          description: description.trim(),
          code: code.trim(),
          resellerId: linked?.id ?? null,
          resellerName: linked?.name ?? null,
          discountValue: value,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`) : null,
        });
        toast.success(`Updated ${updated.code}`);
      } else {
        const voucher = await issueVoucher({
          name: name.trim(),
          description: description.trim(),
          code: code.trim() || null,
          resellerId: linked?.id ?? null,
          resellerName: linked?.name ?? null,
          discountType,
          discountValue: value,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`) : null,
          createdBy: user.uid,
          createdByName: user.displayName ?? user.email,
        });
        toast.success(`Issued ${voucher.code}`);
      }
      setDialogOpen(false);
      resetForm();
      load();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : isEditing
            ? "Failed to update voucher"
            : "Failed to issue voucher"
      );
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

  const copyCode = (nextCode: string) => {
    navigator.clipboard.writeText(nextCode);
    toast.success("Code copied");
  };

  const statusBadge = (status: VoucherStatus) => {
    if (status === "active") return <Badge>Active</Badge>;
    if (status === "depleted") return <Badge variant="secondary">Depleted</Badge>;
    return <Badge variant="outline">Void</Badge>;
  };

  const valueLabel = (voucher: Voucher) => {
    if (parseVoucherDiscountType(voucher.discountType) === "percent") {
      return `${voucher.discountValue}% less`;
    }
    return `−${formatCurrency(voucher.discountValue)}`;
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vouchers</h1>
          <p className="text-muted-foreground">
            Prepaid less-amount or percent-off codes. Reusable until voided.
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
            <CardDescription>Codes, less value, and status</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name, code, or reseller…"
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
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Less</TableHead>
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
                        <div>
                          <p className="font-medium">
                            {voucher.name || "—"}
                          </p>
                          {voucher.description ? (
                            <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                              {voucher.description}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
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
                        {valueLabel(voucher)}
                      </TableCell>
                      <TableCell>{statusBadge(voucher.status)}</TableCell>
                      <TableCell>
                        {voucher.expiresAt ? formatDate(voucher.expiresAt) : "—"}
                      </TableCell>
                      <TableCell>{formatDate(voucher.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            {voucher.status !== "void" ? (
                              <DropdownMenuItem
                                onClick={() => openEdit(voucher)}
                              >
                                Edit
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onClick={() => setUsageVoucher(voucher)}
                            >
                              Customers
                            </DropdownMenuItem>
                            {voucher.status === "active" ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setVoidId(voucher.id)}
                                >
                                  Void
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit voucher" : "Issue voucher"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="voucher-name">Name</Label>
              <Input
                id="voucher-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Christmas gift credit"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voucher-code">
                {isEditing ? "Code" : "Code (optional)"}
              </Label>
              <Input
                id="voucher-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={
                  isEditing ? "Voucher code" : "Leave blank to auto-generate"
                }
                className="font-mono"
                autoCapitalize="characters"
                required={isEditing}
              />
              <p className="text-xs text-muted-foreground">
                Letters, numbers, hyphen, or underscore. Must be unique.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voucher-description">Description (optional)</Label>
              <Textarea
                id="voucher-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes for staff or the customer"
                rows={3}
              />
            </div>
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Discount type</Label>
              <Select
                value={discountType}
                onValueChange={(v) =>
                  setDiscountType((v as VoucherDiscountType) ?? "amount")
                }
                disabled={isEditing}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value === "percent" ? "Less percentage" : "Less amount"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">Less amount</SelectItem>
                  <SelectItem value="percent">Less percentage</SelectItem>
                </SelectContent>
              </Select>
              {isEditing ? (
                <p className="text-xs text-muted-foreground">
                  Discount type cannot be changed after issue.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="voucher-value">
                {discountType === "percent"
                  ? "Less percent (1–100)"
                  : "Less amount"}
              </Label>
              <Input
                id="voucher-value"
                type="number"
                min={discountType === "percent" ? 1 : 0}
                max={discountType === "percent" ? 100 : undefined}
                step={discountType === "percent" ? 1 : "0.01"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {discountType === "percent"
                  ? "Percent less on each sale. Reusable until voided or expired."
                  : "Peso less on each sale (capped at cart total). Reusable until voided or expired."}
              </p>
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
              {isEditing ? "Save changes" : "Issue voucher"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={usageVoucher != null}
        onOpenChange={(open) => {
          if (!open) setUsageVoucher(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Customers · {usageVoucher?.code ?? "Voucher"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 max-h-[60dvh] overflow-y-auto">
            {loadingUsage ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading customers…
              </div>
            ) : redemptions.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">
                No one has used this voucher yet.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {redemptions.map((row) => (
                  <li key={row.id} className="space-y-1 px-3 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {row.customerName?.trim() || "Unnamed customer"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[row.customerMobile, row.customerEmail]
                            .filter(Boolean)
                            .join(" · ") || "No contact details"}
                        </p>
                        {row.customerAddress ? (
                          <p className="text-xs text-muted-foreground">
                            {row.customerAddress}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">
                        −{formatCurrency(row.amountApplied)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.createdAt)}
                      {row.branchName ? ` · ${row.branchName}` : ""}
                      {row.redeemedByName ? ` · ${row.redeemedByName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              Voided vouchers cannot be redeemed at POS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoid}>Void</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
