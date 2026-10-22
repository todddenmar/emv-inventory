"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { setVariantSelling } from "@/lib/firestore/inventory";
import type { Branch } from "@/types";

export type SyncVariantTarget = {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
};

interface SyncVariantBranchesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SyncVariantTarget | null;
  branches: Branch[];
  initialSelectedBranchIds: string[];
  onSaved: () => void;
}

function SyncVariantBranchesForm({
  target,
  branches,
  initialSelectedBranchIds,
  onOpenChange,
  onSaved,
}: {
  target: SyncVariantTarget;
  branches: Branch[];
  initialSelectedBranchIds: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState(initialSelectedBranchIds);
  const [saving, setSaving] = useState(false);

  const toggle = (branchId: string) => {
    setSelectedIds((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    );
  };

  const selectAll = () => setSelectedIds(branches.map((b) => b.id));
  const clearAll = () => setSelectedIds([]);

  const handleConfirm = async () => {
    if (selectedIds.length === 0) return;
    setSaving(true);
    try {
      const chunkSize = 40;
      for (let i = 0; i < selectedIds.length; i += chunkSize) {
        const chunk = selectedIds.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((branchId) =>
            setVariantSelling(
              branchId,
              target.productId,
              target.variantId,
              true
            )
          )
        );
      }
      toast.success(
        `Synced to ${selectedIds.length} branch${selectedIds.length === 1 ? "" : "es"} · stock unchanged`
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to sync variant"
      );
    } finally {
      setSaving(false);
    }
  };

  const titleLabel =
    target.variantLabel === "Default"
      ? target.productName
      : `${target.productName} — ${target.variantLabel}`;

  return (
    <DialogContent className="sm:max-w-md" showCloseButton={!saving}>
      <DialogHeader>
        <DialogTitle>Sync to branches</DialogTitle>
        <DialogDescription>
          Enable “{titleLabel}” for POS on the selected branches. This does not
          change stock — receive quantity after syncing.
        </DialogDescription>
      </DialogHeader>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || branches.length === 0}
          onClick={selectAll}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || selectedIds.length === 0}
          onClick={clearAll}
        >
          Clear
        </Button>
      </div>

      {branches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active branches.</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
          {branches.map((branch) => {
            const checked = selectedIds.includes(branch.id);
            return (
              <div key={branch.id} className="flex items-start gap-3">
                <Checkbox
                  id={`sync-variant-branch-${branch.id}`}
                  checked={checked}
                  disabled={saving}
                  onCheckedChange={() => toggle(branch.id)}
                />
                <Label
                  htmlFor={`sync-variant-branch-${branch.id}`}
                  className="cursor-pointer font-normal leading-snug"
                >
                  <span className="font-medium">{branch.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({branch.code})
                  </span>
                </Label>
              </div>
            );
          })}
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
          disabled={saving || selectedIds.length === 0}
          onClick={() => {
            handleConfirm().catch(console.error);
          }}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Confirm sync
        </Button>
      </div>
    </DialogContent>
  );
}

export function SyncVariantBranchesDialog({
  open,
  onOpenChange,
  target,
  branches,
  initialSelectedBranchIds,
  onSaved,
}: SyncVariantBranchesDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      {open && target ? (
        <SyncVariantBranchesForm
          key={`${target.variantId}:${initialSelectedBranchIds.join(",")}`}
          target={target}
          branches={branches}
          initialSelectedBranchIds={initialSelectedBranchIds}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}
