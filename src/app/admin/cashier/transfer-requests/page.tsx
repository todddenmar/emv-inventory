"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleDot,
  Loader2,
  PackageCheck,
  Send,
  X,
} from "lucide-react";
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
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
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

type TimelineTone = "done" | "current" | "pending" | "failed";

type TimelineStep = {
  key: string;
  label: string;
  at: Date | null;
  by: string | null;
  tone: TimelineTone;
};

function statusLabel(status: TransferRequestStatus): string {
  switch (status) {
    case "requested":
      return "Pending";
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

function statusToneClass(status: TransferRequestStatus): string {
  switch (status) {
    case "requested":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "released":
      return "bg-sky-100 text-sky-900 ring-sky-200";
    case "completed":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200";
    case "cancelled":
    case "declined":
      return "bg-red-100 text-red-900 ring-red-200";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

function formatDatePart(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimePart(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelative(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) return "just now";
  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (absMs < 7 * day) return rtf.format(Math.round(diffMs / day), "day");
  return formatDatePart(date);
}

function itemLabel(row: TransferRequest): string {
  return row.variantLabel && row.variantLabel !== "Default"
    ? `${row.productName} — ${row.variantLabel}`
    : row.productName;
}

function buildTimeline(row: TransferRequest): TimelineStep[] {
  if (row.status === "declined") {
    return [
      {
        key: "requested",
        label: "Requested",
        at: row.requestedAt,
        by: row.requestedByName,
        tone: "done",
      },
      {
        key: "declined",
        label: "Declined",
        at: row.declinedAt,
        by: row.declinedByName,
        tone: "failed",
      },
    ];
  }

  if (row.status === "cancelled") {
    return [
      {
        key: "requested",
        label: "Requested",
        at: row.requestedAt,
        by: row.requestedByName,
        tone: "done",
      },
      {
        key: "cancelled",
        label: "Cancelled",
        at: row.cancelledAt,
        by: row.cancelledByName,
        tone: "failed",
      },
    ];
  }

  return [
    {
      key: "requested",
      label: "Requested",
      at: row.requestedAt,
      by: row.requestedByName,
      tone: row.status === "requested" ? "current" : "done",
    },
    {
      key: "released",
      label: "Released",
      at: row.releasedAt,
      by: row.releasedByName,
      tone:
        row.status === "released"
          ? "current"
          : row.status === "completed"
            ? "done"
            : "pending",
    },
    {
      key: "received",
      label: "Received",
      at: row.receivedAt,
      by: row.receivedByName,
      tone: row.status === "completed" ? "done" : "pending",
    },
  ];
}

function TimelineIcon({
  tone,
  stepKey,
}: {
  tone: TimelineTone;
  stepKey: string;
}) {
  const iconClass = "size-3.5";
  if (tone === "failed") return <X className={iconClass} />;
  if (tone === "done" && stepKey === "received") {
    return <PackageCheck className={iconClass} />;
  }
  if (tone === "done") return <Check className={iconClass} />;
  if (tone === "current") {
    if (stepKey === "released") return <Send className={iconClass} />;
    return <CircleDot className={iconClass} />;
  }
  return <span className="size-1.5 rounded-full bg-current opacity-40" />;
}

function RequestTimeline({ row }: { row: TransferRequest }) {
  const steps = buildTimeline(row);

  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-3">
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          return (
            <li key={step.key} className="flex gap-3">
              <div className="flex w-5 flex-col items-center">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full ring-2 ring-background",
                    step.tone === "done" && "bg-emerald-600 text-white",
                    step.tone === "current" &&
                      "bg-primary text-primary-foreground",
                    step.tone === "pending" &&
                      "bg-muted text-muted-foreground ring-border",
                    step.tone === "failed" && "bg-red-600 text-white"
                  )}
                >
                  <TimelineIcon tone={step.tone} stepKey={step.key} />
                </span>
                {!isLast ? (
                  <span
                    className={cn(
                      "my-1 min-h-4 w-px flex-1",
                      step.tone === "done"
                        ? "bg-emerald-600/40"
                        : step.tone === "current"
                          ? "bg-primary/35"
                          : step.tone === "failed"
                            ? "bg-red-600/30"
                            : "bg-border"
                    )}
                  />
                ) : null}
              </div>
              <div className={cn("min-w-0 flex-1", !isLast && "pb-3")}>
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      step.tone === "pending" && "text-muted-foreground",
                      step.tone === "failed" && "text-red-700"
                    )}
                  >
                    {step.label}
                  </p>
                  {step.at ? (
                    <p
                      className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                      title={`${formatDatePart(step.at)} ${formatTimePart(step.at)}`}
                    >
                      {formatRelative(step.at)}
                    </p>
                  ) : (
                    <p className="shrink-0 text-[11px] text-muted-foreground/70">
                      Waiting
                    </p>
                  )}
                </div>
                {step.at ? (
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {formatDatePart(step.at)}
                    <span className="mx-1 text-muted-foreground/50">·</span>
                    {formatTimePart(step.at)}
                    {step.by ? (
                      <>
                        <span className="mx-1 text-muted-foreground/50">·</span>
                        {step.by}
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
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
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ring-inset",
                          statusToneClass(row.status)
                        )}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>
                    <CardDescription>
                      Qty {row.quantity}
                      {tab === "incoming"
                        ? ` · to ${row.toBranchName}`
                        : ` · from ${row.fromBranchName}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <RequestTimeline row={row} />

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
