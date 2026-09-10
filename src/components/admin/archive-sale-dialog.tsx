"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import {
  archivePosSale,
  getPosSale,
  isPosSaleArchived,
} from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import { isNonRevenueCustomerType } from "@/lib/pos-customer-type";
import type { PosSale } from "@/types";

export function ArchiveSaleDialog({
  sale,
  saleId = null,
  open,
  onOpenChange,
  onArchived,
}: {
  sale: PosSale | null;
  saleId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived?: (saleId: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [loaded, setLoaded] = useState<PosSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restock, setRestock] = useState(true);

  const invoice = sale ?? loaded;

  useEffect(() => {
    if (open) setRestock(true);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setLoaded(null);
      setLoading(false);
      setSaving(false);
      return;
    }

    if (sale) {
      setLoaded(sale);
      return;
    }

    if (!saleId) {
      setLoaded(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getPosSale(saleId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          toast.error("Sale not found");
          onOpenChange(false);
          return;
        }
        setLoaded(row);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        toast.error("Failed to load sale");
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sale, saleId, onOpenChange]);

  const alreadyArchived = isPosSaleArchived(invoice);
  const noCharge = invoice
    ? isNonRevenueCustomerType(invoice.customerType)
    : false;
  const restockLines = useMemo(
    () => (invoice?.items ?? []).filter((item) => item.quantity > 0),
    [invoice]
  );
  const restockUnits = restockLines.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const handleArchive = async () => {
    if (!invoice || alreadyArchived || !user?.uid) return;
    setSaving(true);
    try {
      await archivePosSale(invoice.id, {
        restock,
        performedBy: user.uid,
        performedByName: user.displayName ?? user.email ?? null,
      });
      toast.success(
        restock ? "Sale archived and items restocked" : "Sale archived"
      );
      onArchived?.(invoice.id);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to archive sale"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Archive this sale?</DialogTitle>
          <DialogDescription>
            The receipt is removed from reports and till totals. This cannot be
            undone from the daily sales list.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading sale…
          </div>
        ) : invoice ? (
          <div className="space-y-4">
            <p className="text-sm">
              {restockUnits} unit{restockUnits === 1 ? "" : "s"}
              {noCharge ? "" : ` · ${formatCurrency(invoice.total)}`}
              {invoice.branchName ? ` · ${invoice.branchName}` : ""}
            </p>
            {alreadyArchived ? (
              <p className="text-sm text-muted-foreground">
                This sale is already archived.
              </p>
            ) : (
              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={restock}
                    onCheckedChange={(checked) => setRestock(checked === true)}
                    disabled={saving}
                    className="mt-0.5"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium leading-none">
                      Restock items
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Return these quantities to this branch. Leave unchecked if
                      the goods already left the store.
                    </span>
                  </span>
                </label>
                {restockLines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This sale has no quantities to restock.
                  </p>
                ) : (
                  <div className={restock ? undefined : "opacity-50"}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {restock ? "Items to restock" : "Items (not restocked)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {restockLines.length} line
                        {restockLines.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ul className="max-h-56 overflow-y-auto rounded-md border">
                      {restockLines.map((item, index) => (
                        <li
                          key={`${item.variantId}-${item.productId}-${index}`}
                          className="flex items-start justify-between gap-3 border-b px-3 py-2 last:border-b-0"
                        >
                          <p className="min-w-0 text-sm leading-snug">
                            {item.productName}
                          </p>
                          <p className="shrink-0 tabular-nums text-sm font-medium">
                            ×{item.quantity}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No sale selected.</p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleArchive()}
            disabled={saving || loading || !invoice || alreadyArchived || !user}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Archive sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveSaleButton({
  sale,
  saleId,
  onArchived,
}: {
  sale?: PosSale | null;
  saleId?: string | null;
  onArchived?: (saleId: string) => void;
}) {
  const { isElevatedAdmin } = useBranchAccess();
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(sale || saleId);

  if (!isElevatedAdmin) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!canOpen || isPosSaleArchived(sale)}
        onClick={() => setOpen(true)}
        title="Archive sale"
      >
        <Archive className="h-4 w-4" />
        <span className="sr-only">Archive sale</span>
      </Button>
      <ArchiveSaleDialog
        sale={sale ?? null}
        saleId={saleId ?? null}
        open={open}
        onOpenChange={setOpen}
        onArchived={onArchived}
      />
    </>
  );
}
