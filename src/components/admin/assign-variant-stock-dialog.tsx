"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/stores/auth-store";
import {
  enableVariantSellingOnBranches,
  getInventoryForProduct,
  sellingBranchIdsForProduct,
} from "@/lib/firestore/inventory";
import { markAssortmentRequestAssigned } from "@/lib/firestore/assortment-requests";
import type { Branch, BranchInventory } from "@/types";

export type AssignVariantStockTarget = {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  sku?: string;
  requestId?: string | null;
  requestedBranchId?: string | null;
};

interface AssignVariantStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AssignVariantStockTarget | null;
  branches: Branch[];
  onAssigned: () => void;
}

function stockForVariant(
  inventory: BranchInventory[],
  branchId: string,
  variantId: string
): { stock: number; assigned: boolean } {
  const row = inventory.find(
    (item) => item.branchId === branchId && item.variantId === variantId
  );
  return {
    stock: row?.stock ?? 0,
    assigned: row != null && row.isSelling !== false,
  };
}

function AssignVariantStockForm({
  target,
  branches,
  onOpenChange,
  onAssigned,
}: {
  target: AssignVariantStockTarget;
  branches: Branch[];
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInventoryForProduct(target.productId)
      .then((rows) => {
        if (cancelled) return;
        setInventory(rows);
        const parentBranchIds = sellingBranchIdsForProduct(
          target.productId,
          rows
        );
        const initial =
          parentBranchIds.length > 0
            ? parentBranchIds
            : target.requestedBranchId
              ? [target.requestedBranchId]
              : [];
        setSelectedIds(initial);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load current stock");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target.productId, target.requestedBranchId]);

  const rows = useMemo(
    () =>
      branches.map((branch) => {
        const { stock, assigned } = stockForVariant(
          inventory,
          branch.id,
          target.variantId
        );
        return { branch, stock, assigned };
      }),
    [branches, inventory, target.variantId]
  );

  const toggle = (branchId: string) => {
    setSelectedIds((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    );
  };

  const titleLabel =
    target.variantLabel === "Default"
      ? target.productName
      : `${target.productName} — ${target.variantLabel}`;

  const handleConfirm = async () => {
    if (selectedIds.length === 0) return;
    setSaving(true);
    try {
      await enableVariantSellingOnBranches(
        target.productId,
        target.variantId,
        selectedIds
      );
      if (target.requestId) {
        await markAssortmentRequestAssigned({
          requestId: target.requestId,
          assignedBy: user?.uid ?? "unknown",
          assignedByName: user?.displayName ?? user?.email ?? null,
          assignedBranchIds: selectedIds,
        });
      }
      toast.success(
        `Assigned to ${selectedIds.length} branch${selectedIds.length === 1 ? "" : "es"} · stock unchanged`
      );
      onAssigned();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to assign variant"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg" showCloseButton={!saving}>
      <DialogHeader>
        <DialogTitle>Assign variant</DialogTitle>
        <DialogDescription>
          Enable “{titleLabel}” for POS on branches that already sell this
          product. Current stock per branch is shown below and will not be
          changed.
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading current stock…
        </div>
      ) : branches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active branches.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ branch, stock, assigned }) => {
                const checked = selectedIds.includes(branch.id);
                return (
                  <TableRow key={branch.id}>
                    <TableCell className="w-10">
                      <Checkbox
                        id={`assign-variant-branch-${branch.id}`}
                        checked={checked}
                        disabled={saving}
                        onCheckedChange={() => toggle(branch.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Label
                        htmlFor={`assign-variant-branch-${branch.id}`}
                        className="cursor-pointer font-normal leading-snug"
                      >
                        <span className="font-medium">{branch.name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          ({branch.code})
                        </span>
                      </Label>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stock}
                    </TableCell>
                    <TableCell className="text-right">
                      {assigned ? (
                        <Badge variant="secondary">Assigned</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Unassigned
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={saving}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={saving || loading || selectedIds.length === 0}
          onClick={() => {
            handleConfirm().catch(console.error);
          }}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Confirm assign
        </Button>
      </div>
    </DialogContent>
  );
}

export function AssignVariantStockDialog({
  open,
  onOpenChange,
  target,
  branches,
  onAssigned,
}: AssignVariantStockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && target ? (
        <AssignVariantStockForm
          key={target.variantId}
          target={target}
          branches={branches}
          onOpenChange={onOpenChange}
          onAssigned={onAssigned}
        />
      ) : null}
    </Dialog>
  );
}
