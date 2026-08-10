"use client";

import { useEffect, useState } from "react";
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
import { setProductSellingForBranches } from "@/lib/firestore/inventory";
import type { Branch, BranchInventory, Product } from "@/types";

interface AssignBranchesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  branches: Branch[];
  initialSelectedBranchIds: string[];
  existingInventory: BranchInventory[];
  onSaved: () => void;
}

export function AssignBranchesDialog({
  open,
  onOpenChange,
  product,
  branches,
  initialSelectedBranchIds,
  existingInventory,
  onSaved,
}: AssignBranchesDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(initialSelectedBranchIds);
    }
  }, [open, initialSelectedBranchIds]);

  const toggle = (branchId: string) => {
    setSelectedIds((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    );
  };

  const selectAll = () => setSelectedIds(branches.map((b) => b.id));
  const clearAll = () => setSelectedIds([]);

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await setProductSellingForBranches(
        product,
        selectedIds,
        existingInventory
      );
      toast.success(
        selectedIds.length === 0
          ? "Product unassigned from all branches"
          : `Assigned to ${selectedIds.length} branch${selectedIds.length === 1 ? "" : "es"}`
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to update branches"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Assign branches</DialogTitle>
          <DialogDescription>
            {product
              ? `Choose which branches sell all ${product.variants.length} variant${product.variants.length === 1 ? "" : "s"} of “${product.name || "Untitled"}”. Unassigning keeps stock.`
              : "Select branches for this product."}
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
                    id={`assign-branch-${branch.id}`}
                    checked={checked}
                    disabled={saving}
                    onCheckedChange={() => toggle(branch.id)}
                  />
                  <Label
                    htmlFor={`assign-branch-${branch.id}`}
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
            disabled={saving || !product}
            onClick={() => {
              handleSave().catch(console.error);
            }}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
