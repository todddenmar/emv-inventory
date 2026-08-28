"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import {
  cancelTransferRequest,
  declineTransferRequest,
  getTransferRequestsForBranch,
  receiveTransferRequest,
  releaseTransferRequest,
  undoDeclineTransferRequest,
  undoReleaseTransferRequest,
} from "@/lib/firestore/transfer-requests";
import type { TransferRequest, TransferRequestStatus } from "@/types";

type ConfirmAction =
  | "release"
  | "decline"
  | "receive"
  | "undo_release"
  | "undo_decline";

function statusLabel(status: TransferRequestStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "released":
      return "Released";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "declined":
      return "Declined";
    default:
      return status;
  }
}

function statusVariant(
  status: TransferRequestStatus
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "requested":
      return "default";
    case "released":
      return "secondary";
    case "completed":
      return "outline";
    case "cancelled":
    case "declined":
      return "destructive";
    default:
      return "outline";
  }
}

function formatWhen(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function itemLabel(row: TransferRequest): string {
  return row.variantLabel && row.variantLabel !== "Default"
    ? `${row.productName} — ${row.variantLabel}`
    : row.productName;
}

function confirmCopy(
  action: ConfirmAction,
  row: TransferRequest
): { title: string; description: string; confirm: string } {
  const item = itemLabel(row);
  switch (action) {
    case "release":
      return {
        title: "Release this request?",
        description: `Release ${row.quantity}× ${item} to ${row.toBranchName}? Stock will not move until they mark it received.`,
        confirm: "Release",
      };
    case "decline":
      return {
        title: "Decline this request?",
        description: `Decline the request for ${row.quantity}× ${item} from ${row.toBranchName}? You can undo this later.`,
        confirm: "Decline",
      };
    case "receive":
      return {
        title: "Mark as received?",
        description: `Confirm you received ${row.quantity}× ${item} from ${row.fromBranchName}? This transfers stock into your branch and cannot be undone.`,
        confirm: "Mark received",
      };
    case "undo_release":
      return {
        title: "Undo release?",
        description: `Put ${row.quantity}× ${item} back to pending? ${row.toBranchName} will no longer see it as ready to receive.`,
        confirm: "Undo release",
      };
    case "undo_decline":
      return {
        title: "Undo decline?",
        description: `Restore the request for ${row.quantity}× ${item} so you can release or decline it again?`,
        confirm: "Undo decline",
      };
  }
}

export default function CashierTransferRequestsPage() {
  const user = useAuthStore((s) => s.user);
  const { assignedBranchId } = useBranchAccess();
  const [rows, setRows] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [confirm, setConfirm] = useState<{
    action: ConfirmAction;
    row: TransferRequest;
  } | null>(null);

  const load = useCallback(async () => {
    if (!assignedBranchId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await getTransferRequestsForBranch(assignedBranchId);
      setRows(list);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load transfer requests");
    } finally {
      setLoading(false);
    }
  }, [assignedBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const incoming = useMemo(
    () => rows.filter((r) => r.fromBranchId === assignedBranchId),
    [rows, assignedBranchId]
  );
  const outgoing = useMemo(
    () => rows.filter((r) => r.toBranchId === assignedBranchId),
    [rows, assignedBranchId]
  );

  const visible = tab === "incoming" ? incoming : outgoing;

  const runAction = async (
    id: string,
    action: () => Promise<unknown>,
    success: string
  ) => {
    setActingId(id);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Action failed"
      );
    } finally {
      setActingId(null);
    }
  };

  const handleConfirm = async () => {
    if (!confirm || !user) return;
    const { action, row } = confirm;
    setConfirm(null);

    switch (action) {
      case "release":
        await runAction(
          row.id,
          () =>
            releaseTransferRequest({
              requestId: row.id,
              releasedBy: user.uid,
              releasedByName: user.displayName,
            }),
          "Request released"
        );
        break;
      case "decline":
        await runAction(
          row.id,
          () =>
            declineTransferRequest({
              requestId: row.id,
              declinedBy: user.uid,
              declinedByName: user.displayName,
            }),
          "Request declined"
        );
        break;
      case "receive":
        await runAction(
          row.id,
          () =>
            receiveTransferRequest({
              requestId: row.id,
              receivedBy: user.uid,
              receivedByName: user.displayName,
            }),
          "Marked received — stock transferred"
        );
        break;
      case "undo_release":
        await runAction(
          row.id,
          () => undoReleaseTransferRequest(row.id),
          "Release undone — back to pending"
        );
        break;
      case "undo_decline":
        await runAction(
          row.id,
          () => undoDeclineTransferRequest(row.id),
          "Decline undone — back to pending"
        );
        break;
    }
  };

  if (!assignedBranchId) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account needs a branch assignment.
      </p>
    );
  }

  const dialogCopy = confirm ? confirmCopy(confirm.action, confirm.row) : null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        <p className="text-sm text-muted-foreground">
          Release, receive, or cancel branch transfer requests
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={tab === "incoming" ? "default" : "outline"}
          onClick={() => setTab("incoming")}
        >
          Incoming ({incoming.length})
        </Button>
        <Button
          type="button"
          variant={tab === "outgoing" ? "default" : "outline"}
          onClick={() => setTab("outgoing")}
        >
          Outgoing ({outgoing.length})
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No {tab} requests
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const busy = actingId === row.id;
            return (
              <li key={row.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        {itemLabel(row)}
                      </CardTitle>
                      <Badge variant={statusVariant(row.status)}>
                        {statusLabel(row.status)}
                      </Badge>
                    </div>
                    <CardDescription>
                      Qty {row.quantity}
                      {tab === "incoming"
                        ? ` · to ${row.toBranchName}`
                        : ` · from ${row.fromBranchName}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="space-y-1 text-muted-foreground">
                      <p>Requested {formatWhen(row.requestedAt)}</p>
                      {row.releasedAt ? (
                        <p>Released {formatWhen(row.releasedAt)}</p>
                      ) : null}
                      {row.receivedAt ? (
                        <p>Received {formatWhen(row.receivedAt)}</p>
                      ) : null}
                      {row.cancelledAt ? (
                        <p>Cancelled {formatWhen(row.cancelledAt)}</p>
                      ) : null}
                      {row.declinedAt ? (
                        <p>Declined {formatWhen(row.declinedAt)}</p>
                      ) : null}
                    </div>

                    {tab === "incoming" && row.status === "requested" && user ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({ action: "release", row })
                          }
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Release
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({ action: "decline", row })
                          }
                        >
                          Decline
                        </Button>
                      </div>
                    ) : null}

                    {tab === "incoming" && row.status === "released" && user ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ action: "undo_release", row })
                        }
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Undo release
                      </Button>
                    ) : null}

                    {tab === "incoming" && row.status === "declined" && user ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ action: "undo_decline", row })
                        }
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Undo decline
                      </Button>
                    ) : null}

                    {tab === "outgoing" &&
                    row.status === "requested" &&
                    user ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            row.id,
                            () =>
                              cancelTransferRequest({
                                requestId: row.id,
                                cancelledBy: user.uid,
                                cancelledByName: user.displayName,
                              }),
                            "Request cancelled"
                          )
                        }
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Cancel
                      </Button>
                    ) : null}

                    {tab === "outgoing" &&
                    row.status === "released" &&
                    user ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ action: "receive", row })
                        }
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Mark received
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogCopy?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={
                confirm?.action === "decline" || confirm?.action === "receive"
                  ? "destructive"
                  : "default"
              }
              onClick={() => void handleConfirm()}
            >
              {dialogCopy?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
