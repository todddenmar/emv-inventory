"use client";

import { useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import {
  generateVouchers,
  MAX_GENERATED_VOUCHERS,
} from "@/lib/firestore/vouchers";
import { formatCurrency } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { Voucher, VoucherDiscountType, VoucherGroup } from "@/types";

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadVouchersCsv(vouchers: Voucher[], groupName: string | null) {
  const header = ["Code", "Name", "Less", "Single use", "Expires", "Group"];
  const rows = vouchers.map((v) => [
    v.code,
    v.name,
    v.discountType === "percent"
      ? `${v.discountValue}%`
      : String(v.discountValue),
    v.singleUse ? "Yes" : "No",
    v.expiresAt ? v.expiresAt.toISOString().slice(0, 10) : "",
    groupName ?? "",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = (groupName ?? "vouchers")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  a.href = url;
  a.download = `${slug || "vouchers"}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function VoucherGenerateDialog({
  open,
  onOpenChange,
  groups,
  defaultGroupId,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: VoucherGroup[];
  defaultGroupId: string | null;
  onGenerated: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [groupId, setGroupId] = useState("none");
  const [quantity, setQuantity] = useState("10");
  const [prefix, setPrefix] = useState("");
  const [name, setName] = useState("");
  const [discountType, setDiscountType] =
    useState<VoucherDiscountType>("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [singleUse, setSingleUse] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generated, setGenerated] = useState<Voucher[] | null>(null);
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const group = groups.find((g) => g.id === defaultGroupId) ?? null;
      setGroupId(group?.id ?? "none");
      setQuantity("10");
      setPrefix("");
      setName(group?.name ?? "");
      setDiscountType("amount");
      setDiscountValue("");
      setExpiresAt("");
      setSingleUse(true);
      setGenerated(null);
    }
  }

  const groupName =
    groupId === "none" ? null : (groups.find((g) => g.id === groupId)?.name ?? null);
  const qty = Math.floor(Number(quantity));
  const value = Number(discountValue);
  const previewPrefix = prefix.trim().toUpperCase().replace(/\s+/g, "") || "VCH";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const rows = await generateVouchers({
        quantity: qty,
        prefix,
        name,
        discountType,
        discountValue: value,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`) : null,
        singleUse,
        groupId: groupId === "none" ? null : groupId,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });
      setGenerated(rows);
      toast.success(
        `Generated ${rows.length} voucher${rows.length === 1 ? "" : "s"}${
          groupName ? ` in ${groupName}` : ""
        }`
      );
      onGenerated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate vouchers"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyCodes = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated.map((v) => v.code).join("\n"));
    toast.success("Codes copied");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {generated
              ? `${generated.length} vouchers generated`
              : "Generate vouchers"}
          </DialogTitle>
        </DialogHeader>

        {generated ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {groupName ? `Added to ${groupName}. ` : ""}
              {generated[0]?.discountType === "percent"
                ? `${generated[0].discountValue}% less`
                : `−${formatCurrency(generated[0]?.discountValue ?? 0)}`}{" "}
              each{generated[0]?.singleUse ? ", single use" : ""}.
            </p>
            <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border font-mono text-sm">
              {generated.map((v) => (
                <li key={v.id} className="px-3 py-1.5">
                  {v.code}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={copyCodes}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy codes
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => downloadVouchersCsv(generated, groupName)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </Button>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label>Group</Label>
              <Select value={groupId} onValueChange={(v) => setGroupId(v ?? "none")}>
                <SelectTrigger>
                  <SelectValue>
                    {(v) =>
                      !v || v === "none"
                        ? "No group"
                        : (groups.find((g) => g.id === v)?.name ?? "Group")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gen-qty">How many</Label>
                <Input
                  id="gen-qty"
                  type="number"
                  min={1}
                  max={MAX_GENERATED_VOUCHERS}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-prefix">Code prefix</Label>
                <Input
                  id="gen-prefix"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="VCH"
                  maxLength={16}
                  className="font-mono"
                  autoCapitalize="characters"
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Codes look like{" "}
              <span className="font-mono">{previewPrefix}-7KQ2M9TA</span>. Each
              one is unique.
            </p>
            <div className="space-y-2">
              <Label htmlFor="gen-name">Voucher name</Label>
              <Input
                id="gen-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. October giveaway"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount type</Label>
                <Select
                  value={discountType}
                  onValueChange={(v) =>
                    setDiscountType((v as VoucherDiscountType) ?? "amount")
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v) => (v === "percent" ? "Less %" : "Less amount")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">Less amount</SelectItem>
                    <SelectItem value="percent">Less %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-value">
                  {discountType === "percent" ? "Percent (1–100)" : "Amount"}
                </Label>
                <Input
                  id="gen-value"
                  type="number"
                  min={discountType === "percent" ? 1 : 0}
                  max={discountType === "percent" ? 100 : undefined}
                  step={discountType === "percent" ? 1 : "0.01"}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gen-expires">Expires (optional)</Label>
              <Input
                id="gen-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="gen-single-use"
                checked={singleUse}
                onCheckedChange={(checked) => setSingleUse(checked === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="gen-single-use" className="cursor-pointer">
                  Single use
                </Label>
                <p className="text-xs text-muted-foreground">
                  Each code can only be redeemed on one sale.
                </p>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {submitting
                ? "Generating…"
                : `Generate ${Number.isFinite(qty) && qty > 0 ? qty : ""} voucher${qty === 1 ? "" : "s"}`}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
