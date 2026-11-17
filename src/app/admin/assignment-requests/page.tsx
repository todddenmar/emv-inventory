"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  AssignVariantStockDialog,
  type AssignVariantStockTarget,
} from "@/components/admin/assign-variant-stock-dialog";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import {
  cancelAssortmentRequest,
  declineAssortmentRequest,
  subscribeAssortmentRequests,
} from "@/lib/firestore/assortment-requests";
import { getBranches } from "@/lib/firestore/branches";
import { cn } from "@/lib/utils";
import type {
  AssortmentRequest,
  AssortmentRequestStatus,
  Branch,
} from "@/types";

type StatusFilter = "requested" | "all";

function statusLabel(status: AssortmentRequestStatus): string {
  switch (status) {
    case "requested":
      return "Pending";
    case "assigned":
      return "Assigned";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function statusToneClass(status: AssortmentRequestStatus): string {
  switch (status) {
    case "requested":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "assigned":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200";
    case "declined":
    case "cancelled":
      return "bg-red-100 text-red-900 ring-red-200";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

function formatWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayName(row: AssortmentRequest): string {
  return row.variantLabel && row.variantLabel !== "Default"
    ? `${row.productName} — ${row.variantLabel}`
    : row.productName;
}

export default function AssignmentRequestsPage() {
  const user = useAuthStore((s) => s.user);
  const { isElevatedAdmin } = useBranchAccess();
  const [rows, setRows] = useState<AssortmentRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("requested");
  const [assignTarget, setAssignTarget] =
    useState<AssignVariantStockTarget | null>(null);
  const [declineRow, setDeclineRow] = useState<AssortmentRequest | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getBranches(true)
      .then(setBranches)
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load branches");
      });
  }, []);

  useEffect(() => {
    return subscribeAssortmentRequests(
      (data) => {
        setRows(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load assignment requests");
        setLoading(false);
      }
    );
  }, []);

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? rows
        : rows.filter((row) => row.status === statusFilter),
    [rows, statusFilter]
  );

  const openAssign = (row: AssortmentRequest) => {
    setAssignTarget({
      productId: row.productId,
      productName: row.productName,
      variantId: row.variantId,
      variantLabel: row.variantLabel,
      sku: row.sku,
      requestId: row.id,
      requestedBranchId: row.requestedBranchId,
    });
  };

  const handleDecline = async (row: AssortmentRequest) => {
    if (!user?.uid) return;
    setBusyId(row.id);
    try {
      await declineAssortmentRequest({
        requestId: row.id,
        declinedBy: user.uid,
        declinedByName: user.displayName ?? user.email ?? null,
      });
      toast.success("Request declined");
      setDeclineRow(null);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to decline request"
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (row: AssortmentRequest) => {
    if (!user?.uid) return;
    setBusyId(row.id);
    try {
      await cancelAssortmentRequest({
        requestId: row.id,
        cancelledBy: user.uid,
        cancelledByName: user.displayName ?? user.email ?? null,
      });
      toast.success("Request cancelled");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel request"
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Assignment requests
        </h1>
        <p className="text-sm text-muted-foreground">
          Review unassigned variants requested from POS, confirm current stock,
          then assign them to branches that already sell the product.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Requests</CardTitle>
            <CardDescription>
              {filtered.length}{" "}
              {statusFilter === "requested" ? "pending" : "total"}
            </CardDescription>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter((value as StatusFilter) || "requested")
            }
          >
            <SelectTrigger size="sm" className="w-full sm:w-44">
              <SelectValue>
                {(value) =>
                  value === "all" ? "All statuses" : "Pending"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="requested">Pending</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading requests…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {statusFilter === "requested"
                ? "No pending assignment requests."
                : "No assignment requests yet."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Requested from</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const busy = busyId === row.id;
                    const canCancel =
                      row.status === "requested" &&
                      (row.requestedBy === user?.uid || isElevatedAdmin);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {displayName(row)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.sku || "—"}
                        </TableCell>
                        <TableCell>{row.requestedBranchName}</TableCell>
                        <TableCell>
                          {row.requestedByName || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatWhen(row.requestedAt)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                              statusToneClass(row.status)
                            )}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status === "requested" ? (
                            <div className="flex justify-end gap-1.5">
                              {isElevatedAdmin ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => openAssign(row)}
                                  >
                                    Assign
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => setDeclineRow(row)}
                                  >
                                    Decline
                                  </Button>
                                </>
                              ) : null}
                              {canCancel && !isElevatedAdmin ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => {
                                    void handleCancel(row);
                                  }}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    "Cancel"
                                  )}
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AssignVariantStockDialog
        open={assignTarget != null}
        onOpenChange={(open) => {
          if (!open) setAssignTarget(null);
        }}
        target={assignTarget}
        branches={branches}
        onAssigned={() => setAssignTarget(null)}
      />

      <AlertDialog
        open={declineRow != null}
        onOpenChange={(open) => {
          if (!open) setDeclineRow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this request?</AlertDialogTitle>
            <AlertDialogDescription>
              {declineRow
                ? `${displayName(declineRow)} will stay unassigned.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep pending</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyId != null}
              onClick={() => {
                if (declineRow) void handleDecline(declineRow);
              }}
            >
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
