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
  CardFooter,
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
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { getBranches } from "@/lib/firestore/branches";
import {
  cancelTransferRequest,
  declineTransferRequest,
  declineTransferRequests,
  getTransferRequestsForBranch,
  groupTransferRequests,
  receiveTransferRequest,
  receiveTransferRequests,
  releaseTransferRequest,
  releaseTransferRequests,
  undoDeclineTransferRequest,
  undoReleaseTransferRequest,
  type TransferRequestGroup,
} from "@/lib/firestore/transfer-requests";
import type {
  AppUser,
  Branch,
  TransferRequest,
  TransferRequestStatus,
} from "@/types";

type ConfirmAction =
  | "release"
  | "decline"
  | "receive"
  | "undo_release"
  | "undo_decline";

type GroupAction = "release_group" | "decline_group" | "receive_group";

type ConfirmState =
  | { kind: "row"; action: ConfirmAction; row: TransferRequest }
  | {
      kind: "group";
      action: GroupAction;
      group: TransferRequestGroup;
      ids: string[];
    };

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

function hasRequestActions(
  tab: "incoming" | "outgoing",
  status: TransferRequestStatus,
  user: AppUser | null
): boolean {
  if (!user) return false;
  if (tab === "incoming") {
    return (
      status === "requested" ||
      status === "released" ||
      status === "declined"
    );
  }
  return status === "requested" || status === "released";
}

function RequestActionBar({
  tab,
  row,
  busy,
  user,
  onConfirm,
  onCancelOutgoing,
}: {
  tab: "incoming" | "outgoing";
  row: TransferRequest;
  busy: boolean;
  user: AppUser | null;
  onConfirm: (action: ConfirmAction, row: TransferRequest) => void;
  onCancelOutgoing: (row: TransferRequest) => void;
}) {
  if (!user) return null;

  if (tab === "incoming" && row.status === "requested") {
    return (
      <>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => onConfirm("release", row)}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Release
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onConfirm("decline", row)}
        >
          Decline
        </Button>
      </>
    );
  }

  if (tab === "incoming" && row.status === "released") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => onConfirm("undo_release", row)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Undo release
      </Button>
    );
  }

  if (tab === "incoming" && row.status === "declined") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => onConfirm("undo_decline", row)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Undo decline
      </Button>
    );
  }

  if (tab === "outgoing" && row.status === "requested") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => onCancelOutgoing(row)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Cancel
      </Button>
    );
  }

  if (tab === "outgoing" && row.status === "released") {
    return (
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() => onConfirm("receive", row)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Mark received
      </Button>
    );
  }

  return null;
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

function groupConfirmCopy(
  action: GroupAction,
  group: TransferRequestGroup,
  ids: string[]
): { title: string; description: string; confirm: string } {
  const idSet = new Set(ids);
  const rows = group.rows.filter((row) => idSet.has(row.id));
  const totalQty = rows.reduce((sum, row) => sum + row.quantity, 0);
  const items = `${rows.length} item${rows.length === 1 ? "" : "s"} (qty ${totalQty})`;
  switch (action) {
    case "release_group":
      return {
        title: "Release this group?",
        description: `Release ${items} to ${group.toBranchName}? Stock will not move until they mark it received.`,
        confirm: `Release ${rows.length}`,
      };
    case "decline_group":
      return {
        title: "Decline this group?",
        description: `Decline ${items} requested by ${group.toBranchName}? You can undo each one later.`,
        confirm: `Decline ${rows.length}`,
      };
    case "receive_group":
      return {
        title: "Mark group as received?",
        description: `Confirm you received ${items} from ${group.fromBranchName}? This transfers stock into your branch as one transfer and cannot be undone.`,
        confirm: `Receive ${rows.length}`,
      };
  }
}

function StatusPill({
  status,
  className,
}: {
  status: TransferRequestStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ring-inset",
        statusToneClass(status),
        className
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function groupStatusSummary(rows: TransferRequest[]): string {
  const counts = new Map<TransferRequestStatus, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, count]) => `${count} ${statusLabel(status).toLowerCase()}`)
    .join(" · ");
}

export default function CashierTransferRequestsPage() {
  const user = useAuthStore((s) => s.user);
  const { assignedBranchId, canViewAllBranches } = useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [rows, setRows] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const activeBranchId = canViewAllBranches
    ? selectedBranchId
    : assignedBranchId ?? "";

  useEffect(() => {
    if (!canViewAllBranches) return;
    getBranches(true)
      .then((list) => {
        setBranches(list);
        setSelectedBranchId((prev) => prev || assignedBranchId || list[0]?.id || "");
      })
      .catch(console.error);
  }, [canViewAllBranches, assignedBranchId]);

  const load = useCallback(async () => {
    if (!activeBranchId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await getTransferRequestsForBranch(activeBranchId);
      setRows(list);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load transfer requests");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const incoming = useMemo(
    () => rows.filter((r) => r.fromBranchId === activeBranchId),
    [rows, activeBranchId]
  );
  const outgoing = useMemo(
    () => rows.filter((r) => r.toBranchId === activeBranchId),
    [rows, activeBranchId]
  );

  const visible = tab === "incoming" ? incoming : outgoing;
  const groups = useMemo(() => groupTransferRequests(visible), [visible]);

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
    setConfirm(null);

    if (confirm.kind === "group") {
      const { action, group, ids } = confirm;
      switch (action) {
        case "release_group":
          await runAction(
            group.key,
            () =>
              releaseTransferRequests({
                requestIds: ids,
                releasedBy: user.uid,
                releasedByName: user.displayName,
              }),
            `Released ${ids.length} request${ids.length === 1 ? "" : "s"}`
          );
          break;
        case "decline_group":
          await runAction(
            group.key,
            () =>
              declineTransferRequests({
                requestIds: ids,
                declinedBy: user.uid,
                declinedByName: user.displayName,
              }),
            `Declined ${ids.length} request${ids.length === 1 ? "" : "s"}`
          );
          break;
        case "receive_group":
          await runAction(
            group.key,
            () =>
              receiveTransferRequests({
                requestIds: ids,
                receivedBy: user.uid,
                receivedByName: user.displayName,
              }),
            `Received ${ids.length} item${ids.length === 1 ? "" : "s"} — stock transferred`
          );
          break;
      }
      return;
    }

    const { action, row } = confirm;
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

  if (!activeBranchId) {
    return (
      <p className="text-sm text-muted-foreground">
        {canViewAllBranches
          ? "Select a branch to view transfer requests."
          : "Your account needs a branch assignment."}
      </p>
    );
  }

  const dialogCopy = !confirm
    ? null
    : confirm.kind === "group"
      ? groupConfirmCopy(confirm.action, confirm.group, confirm.ids)
      : confirmCopy(confirm.action, confirm.row);

  const cancelOutgoing = (row: TransferRequest) => {
    if (!user) return;
    void runAction(
      row.id,
      () =>
        cancelTransferRequest({
          requestId: row.id,
          cancelledBy: user.uid,
          cancelledByName: user.displayName,
        }),
      "Request cancelled"
    );
  };
  const confirmRow = (action: ConfirmAction, row: TransferRequest) =>
    setConfirm({ kind: "row", action, row });
  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const b = branches.find((row) => row.id === value);
    return b ? `${b.name} (${b.code})` : null;
  };

  return (
    <div className="mx-auto flex h-0 min-h-0 w-full max-w-lg flex-1 flex-col gap-4">
      <div className="shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
          <p className="text-sm text-muted-foreground">
            Release, receive, or cancel branch transfer requests
          </p>
        </div>

        {canViewAllBranches ? (
          <Select
            value={activeBranchId}
            onValueChange={(v) => setSelectedBranchId(v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select branch">
                {(value) => branchSelectLabel(value as string | null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

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
      </div>

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No {tab} requests
        </p>
      ) : (
        <ul className="flex h-0 min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
          {groups.map((group) => {
            if (group.rows.length === 1) {
              const row = group.rows[0];
              const busy = actingId === row.id;
              const showActions = hasRequestActions(tab, row.status, user);
              return (
                <li key={group.key} className="max-h-full shrink-0">
                  <Card className="flex max-h-full flex-col overflow-hidden">
                    <CardHeader className="shrink-0 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug">
                          {itemLabel(row)}
                        </CardTitle>
                        <StatusPill status={row.status} />
                      </div>
                      <CardDescription>
                        Qty {row.quantity}
                        {tab === "incoming"
                          ? ` · to ${row.toBranchName}`
                          : ` · from ${row.fromBranchName}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 overflow-y-auto text-sm">
                      <RequestTimeline row={row} />
                    </CardContent>
                    {showActions ? (
                      <CardFooter className="shrink-0 flex-wrap gap-2">
                        <RequestActionBar
                          tab={tab}
                          row={row}
                          busy={busy}
                          user={user}
                          onConfirm={confirmRow}
                          onCancelOutgoing={cancelOutgoing}
                        />
                      </CardFooter>
                    ) : null}
                  </Card>
                </li>
              );
            }

            const groupBusy = actingId === group.key;
            const pendingIds = group.rows
              .filter((row) => row.status === "requested")
              .map((row) => row.id);
            const releasedIds = group.rows
              .filter((row) => row.status === "released")
              .map((row) => row.id);
            const totalQty = group.rows.reduce(
              (sum, row) => sum + row.quantity,
              0
            );
            const showIncomingGroupActions =
              user != null && tab === "incoming" && pendingIds.length > 0;
            const showOutgoingGroupActions =
              user != null && tab === "outgoing" && releasedIds.length > 0;

            return (
              <li key={group.key} className="shrink-0">
                <Card className="flex flex-col overflow-hidden">
                  <CardHeader className="shrink-0 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        {group.rows.length} items · qty {totalQty}
                      </CardTitle>
                      <span className="shrink-0 text-right text-[11px] font-medium text-muted-foreground">
                        {groupStatusSummary(group.rows)}
                      </span>
                    </div>
                    <CardDescription>
                      {tab === "incoming"
                        ? `To ${group.toBranchName}`
                        : `From ${group.fromBranchName}`}
                      {" · "}
                      <span
                        title={`${formatDatePart(group.requestedAt)} ${formatTimePart(group.requestedAt)}`}
                      >
                        requested {formatRelative(group.requestedAt)}
                      </span>
                      {group.requestedByName
                        ? ` by ${group.requestedByName}`
                        : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <ul className="divide-y rounded-lg border">
                      {group.rows.map((row) => {
                        const rowBusy = actingId === row.id || groupBusy;
                        const showActions = hasRequestActions(
                          tab,
                          row.status,
                          user
                        );
                        return (
                          <li key={row.id} className="space-y-2 px-3 py-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium leading-snug break-words">
                                  {itemLabel(row)}
                                </p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                  Qty {row.quantity}
                                </p>
                              </div>
                              <StatusPill status={row.status} />
                            </div>
                            {showActions ? (
                              <div className="flex flex-wrap gap-2">
                                <RequestActionBar
                                  tab={tab}
                                  row={row}
                                  busy={rowBusy}
                                  user={user}
                                  onConfirm={confirmRow}
                                  onCancelOutgoing={cancelOutgoing}
                                />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                  {showIncomingGroupActions || showOutgoingGroupActions ? (
                    <CardFooter className="shrink-0 flex-wrap gap-2 border-t bg-muted/20 pt-4">
                      {showIncomingGroupActions ? (
                        <>
                          <Button
                            type="button"
                            className="flex-1"
                            disabled={groupBusy}
                            onClick={() =>
                              setConfirm({
                                kind: "group",
                                action: "release_group",
                                group,
                                ids: pendingIds,
                              })
                            }
                          >
                            {groupBusy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Release all ({pendingIds.length})
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={groupBusy}
                            onClick={() =>
                              setConfirm({
                                kind: "group",
                                action: "decline_group",
                                group,
                                ids: pendingIds,
                              })
                            }
                          >
                            Decline all
                          </Button>
                        </>
                      ) : null}
                      {showOutgoingGroupActions ? (
                        <Button
                          type="button"
                          className="flex-1"
                          disabled={groupBusy}
                          onClick={() =>
                            setConfirm({
                              kind: "group",
                              action: "receive_group",
                              group,
                              ids: releasedIds,
                            })
                          }
                        >
                          {groupBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Receive all ({releasedIds.length})
                        </Button>
                      ) : null}
                    </CardFooter>
                  ) : null}
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
                confirm?.action === "decline" ||
                confirm?.action === "receive" ||
                confirm?.action === "decline_group" ||
                confirm?.action === "receive_group"
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
