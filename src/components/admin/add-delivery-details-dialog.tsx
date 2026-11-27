"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { updatePosSaleDeliveryDetails } from "@/lib/firestore/pos-sales";
import { isPosSaleDelivery } from "@/lib/pos-customer-type";
import type { PosSale } from "@/types";

export function AddDeliveryDetailsDialog({
  sale,
  open,
  onOpenChange,
  onSaved,
}: {
  sale: PosSale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (sale: PosSale) => void;
}) {
  const { user, assignedBranchId } = useBranchAccess();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const editing = sale ? isPosSaleDelivery(sale) : false;

  useEffect(() => {
    if (!open || !sale) return;
    setName(sale.customer?.name ?? "");
    setMobile(sale.customer?.mobile ?? "");
    setEmail(sale.customer?.email ?? "");
    setAddress(sale.customer?.address ?? "");
    setSaving(false);
  }, [open, sale]);

  const handleSave = async () => {
    if (!sale || !user?.uid) return;
    if (!name.trim()) {
      toast.error("Enter customer name");
      return;
    }

    setSaving(true);
    try {
      const updated = await updatePosSaleDeliveryDetails(sale.id, {
        customer: {
          name: name.trim(),
          mobile: mobile.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
        },
        actor: {
          userId: user.uid,
          role: user.role,
          assignedBranchId,
          name: user.displayName ?? user.email ?? null,
        },
      });
      toast.success(
        editing
          ? "Delivery details saved"
          : "Sale added to deliveries"
      );
      onSaved?.(updated);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save delivery details"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit delivery details" : "Add delivery details"}
          </DialogTitle>
          <DialogDescription>
            This sale stays on the walk-in list and also appears under
            Deliveries so you can print a receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="walk-in-delivery-name">Name</Label>
            <Input
              id="walk-in-delivery-name"
              value={name}
              disabled={saving}
              placeholder="Customer name"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walk-in-delivery-mobile">Mobile</Label>
            <Input
              id="walk-in-delivery-mobile"
              type="tel"
              value={mobile}
              disabled={saving}
              placeholder="09…"
              onChange={(e) => setMobile(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walk-in-delivery-email">Email</Label>
            <Input
              id="walk-in-delivery-email"
              type="email"
              value={email}
              disabled={saving}
              placeholder="Optional"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walk-in-delivery-address">Address</Label>
            <Textarea
              id="walk-in-delivery-address"
              value={address}
              disabled={saving}
              placeholder="Delivery address"
              rows={3}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !sale}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {editing ? "Save" : "Add to deliveries"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
