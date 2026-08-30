"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getClientAuth } from "@/lib/firebase";
import { getBranches } from "@/lib/firestore/branches";
import type { Branch } from "@/types";

const ALL_BRANCHES = "all";
const CONFIRM_WORD = "RESET";

type ResetAction = "inventory-logs" | "transfers" | "stock-levels" | "sales";

const ACTIONS: Array<{
  action: ResetAction;
  title: string;
  description: string;
  warning: string;
}> = [
  {
    action: "inventory-logs",
    title: "Reset stock changes",
    description:
      "Deletes inventory logs for the selected scope. This also empties adjustment history and the inventory activity feed.",
    warning: "Quantities are not changed. POS sales and supplier stock-ins stay.",
  },
  {
    action: "transfers",
    title: "Reset transfers",
    description:
      "Deletes completed transfers and transfer requests that touch the selected scope, including related transfer-in and transfer-out logs.",
    warning:
      "Stock is not reversed. Daily stock changes still show other movement unless you also reset stock changes.",
  },
  {
    action: "sales",
    title: "Reset sales",
    description:
      "Deletes POS receipts for the selected scope, including related sale inventory logs. Reports and daily sales empty out.",
    warning:
      "Stock is not restored. Voucher balances used on those sales are not refunded. Products stay.",
  },
  {
    action: "stock-levels",
    title: "Reset all stock levels",
    description:
      "Sets every matching inventory quantity to 0. Selling flags and low-stock thresholds are kept. No adjustment logs are written.",
    warning:
      "Old movement history remains unless you also reset stock changes. Products and sales are not deleted.",
  },
];

export default function AdminInventoryResetPage() {
  const { isMasterAdmin } = useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(ALL_BRANCHES);
  const [pendingAction, setPendingAction] = useState<ResetAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getBranches(true).then(setBranches).catch(console.error);
  }, []);

  if (!isMasterAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only the master-admin can reset inventory data.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedBranch =
    branchId === ALL_BRANCHES
      ? null
      : (branches.find((b) => b.id === branchId) ?? null);
  const scopeLabel =
    selectedBranch?.name ?? "all branches";
  const pending = ACTIONS.find((item) => item.action === pendingAction);

  const closeConfirm = () => {
    if (running) return;
    setPendingAction(null);
    setConfirmText("");
  };

  const handleReset = async () => {
    if (!pendingAction || confirmText !== CONFIRM_WORD) return;
    const firebaseUser = getClientAuth().currentUser;
    if (!firebaseUser) {
      toast.error("Sign in to reset inventory");
      return;
    }

    setRunning(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/admin/inventory-reset", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: pendingAction,
          branchId: branchId === ALL_BRANCHES ? null : branchId,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        deleted?: number;
        updated?: number;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to reset inventory");
      }

      const deleted = data?.deleted ?? 0;
      const updated = data?.updated ?? 0;
      toast.success(
        pendingAction === "stock-levels"
          ? `Set ${updated} stock ${updated === 1 ? "row" : "rows"} to 0`
          : `Deleted ${deleted} ${deleted === 1 ? "record" : "records"}`
      );
      setPendingAction(null);
      setConfirmText("");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to reset inventory"
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Inventory reset
        </h1>
        <p className="text-sm text-muted-foreground">
          Permanent wipes for stock history, transfers, sales, and quantities.
          Pick a branch or all branches, then confirm with {CONFIRM_WORD}.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Scope</CardTitle>
          <CardDescription>
            Each action applies only to this selection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-w-0 max-w-sm flex-col gap-2">
            <Label>Branch</Label>
            <Select
              value={branchId}
              onValueChange={(value) => {
                if (value) setBranchId(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select branch">
                  {(value) => {
                    if (!value || value === ALL_BRANCHES) return "All branches";
                    return (
                      branches.find((b) => b.id === value)?.name ?? "All branches"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {ACTIONS.map((item) => (
          <Card key={item.action}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{item.warning}</p>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setConfirmText("");
                  setPendingAction(item.action);
                }}
              >
                {item.title}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={pendingAction != null}
        onOpenChange={(open) => {
          if (!open) closeConfirm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            <DialogDescription>
              This cannot be undone for {scopeLabel}. {pending?.warning}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-inventory-reset">
              Type{" "}
              <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to
              confirm
            </Label>
            <Input
              id="confirm-inventory-reset"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              disabled={running}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeConfirm}
              disabled={running}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={confirmText !== CONFIRM_WORD || running}
              onClick={() => void handleReset()}
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending?.title ?? "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
