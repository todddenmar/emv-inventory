"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
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
import { TablePagination } from "@/components/admin/table-pagination";
import { TransferDeliveryReceiptDialog } from "@/components/admin/transfer-delivery-receipt-dialog";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { shiftDateInput, toDateInputValue } from "@/lib/dates";
import {
  getDeliveryReceiptCompany,
  printTransferDeliveryReceipt,
  type TransferReceiptDestination,
} from "@/lib/delivery-receipt";
import { getBranches } from "@/lib/firestore/branches";
import { getBranchTransfers } from "@/lib/firestore/transfers";
import { formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { Branch, BranchTransfer } from "@/types";

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

function formatTransferItemsSummary(transfer: BranchTransfer): string {
  if (!transfer.items?.length) return "—";
  return transfer.items
    .map((item) => `${item.productName} ×${item.quantity}`)
    .join(", ");
}

function transferMatchesItemNameSearch(
  transfer: BranchTransfer,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (transfer.items ?? []).some((item) =>
    item.productName.toLowerCase().includes(q)
  );
}

export function DeliveryTransfersList() {
  const { canViewAllBranches, assignedBranchId } = useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [fromBranchId, setFromBranchId] = useState("all");
  const [toBranchId, setToBranchId] = useState("all");
  const [fromDate, setFromDate] = useState(() => applyPreset("last7").fromDate);
  const [toDate, setToDate] = useState(() => applyPreset("last7").toDate);
  const [transfers, setTransfers] = useState<BranchTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [itemSearch, setItemSearch] = useState("");
  const [receiptTransfer, setReceiptTransfer] =
    useState<BranchTransfer | null>(null);

  useEffect(() => {
    getBranches(true)
      .then(setBranches)
      .catch(console.error);
  }, []);

  const loadTransfers = useCallback(async () => {
    if (!canViewAllBranches && !assignedBranchId) {
      setTransfers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await getBranchTransfers({
        fromDate,
        toDate,
        max: 1000,
      });
      const scoped = canViewAllBranches
        ? rows
        : rows.filter(
            (transfer) =>
              transfer.fromBranchId === assignedBranchId ||
              transfer.toBranchId === assignedBranchId
          );
      setTransfers(scoped);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load transfers");
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [assignedBranchId, canViewAllBranches, fromDate, toDate]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, fromBranchId, toBranchId, itemSearch]);

  const filteredTransfers = useMemo(() => {
    return transfers.filter((transfer) => {
      if (fromBranchId !== "all" && transfer.fromBranchId !== fromBranchId) {
        return false;
      }
      if (toBranchId !== "all" && transfer.toBranchId !== toBranchId) {
        return false;
      }
      return transferMatchesItemNameSearch(transfer, itemSearch);
    });
  }, [transfers, fromBranchId, toBranchId, itemSearch]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(filteredTransfers, page),
    [filteredTransfers, page]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const branchById = useCallback(
    (id: string | undefined) => branches.find((row) => row.id === id),
    [branches]
  );

  const companyForTransfer = (transfer: BranchTransfer | null) => {
    if (!transfer) return null;
    const fromBranch = branchById(transfer.fromBranchId);
    return getDeliveryReceiptCompany(
      fromBranch ?? {
        name: transfer.fromBranchName,
        address: "",
        phone: null,
        deliveryReceipt: null,
      }
    );
  };

  const destinationForTransfer = (
    transfer: BranchTransfer | null
  ): TransferReceiptDestination | null => {
    if (!transfer) return null;
    const toBranch = branchById(transfer.toBranchId);
    return {
      name: toBranch?.name || transfer.toBranchName,
      address: toBranch?.address,
      phone: toBranch?.phone,
    };
  };

  const handleDownload = (transfer: BranchTransfer) => {
    void printTransferDeliveryReceipt(
      transfer,
      companyForTransfer(transfer),
      destinationForTransfer(transfer)
    ).catch((error) => {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Printing is not available in this browser"
      );
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Delivery Transfers</h1>
        <p className="text-muted-foreground">
          Completed branch-to-branch transfers. View or download a delivery
          receipt using the sending branch’s company header.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Transfers</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{total}</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter by date range
            {canViewAllBranches ? ", from/to branch," : ""} or item name
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
              <Label htmlFor="deliveries-transfers-item-search">Item name</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="deliveries-transfers-item-search"
                  className="pl-9"
                  placeholder="Search product name…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveries-transfers-from">From</Label>
              <Input
                id="deliveries-transfers-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveries-transfers-to">To</Label>
              <Input
                id="deliveries-transfers-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            {canViewAllBranches ? (
              <>
                <div className="space-y-2">
                  <Label>From branch</Label>
                  <Select
                    value={fromBranchId}
                    onValueChange={(v) => setFromBranchId(v ?? "all")}
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
                <div className="space-y-2">
                  <Label>To branch</Label>
                  <Select
                    value={toBranchId}
                    onValueChange={(v) => setToBranchId(v ?? "all")}
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
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Transfers</CardTitle>
          <CardDescription>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </span>
            ) : (
              `${total} transfer${total === 1 ? "" : "s"} · newest first`
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading transfers…</p>
          ) : filteredTransfers.length === 0 ? (
            <p className="text-muted-foreground">No transfers in this range.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="w-[1%] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(transfer.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {transfer.fromBranchName || transfer.fromBranchId}
                      </TableCell>
                      <TableCell className="text-sm">
                        {transfer.toBranchName || transfer.toBranchId}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm">
                        {formatTransferItemsSummary(transfer)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setReceiptTransfer(transfer)}
                          >
                            View
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(transfer)}
                          >
                            Download
                          </Button>
                        </div>
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

      <TransferDeliveryReceiptDialog
        transfer={receiptTransfer}
        company={companyForTransfer(receiptTransfer)}
        destination={destinationForTransfer(receiptTransfer)}
        open={receiptTransfer != null}
        onOpenChange={(open) => {
          if (!open) setReceiptTransfer(null);
        }}
      />
    </div>
  );
}
