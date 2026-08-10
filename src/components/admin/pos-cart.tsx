"use client";

import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { voucherOwnerLabel } from "@/lib/firestore/vouchers";
import type {
  PosPaymentMethod,
  PosSaleCustomer,
  Reseller,
  Voucher,
} from "@/types";

export interface PosCartLine {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  cashPrice: number;
  /** Catalog or POS-entered retail. Null until set. */
  retailPrice: number | null;
  /** Whether retail came from the product catalog (vs entered this sale). */
  retailFromCatalog: boolean;
  unitPrice: number;
  quantity: number;
  maxStock: number;
}

export type PosCustomerDraft = {
  name: string;
  mobile: string;
  email: string;
  address: string;
};

export const emptyPosCustomerDraft = (): PosCustomerDraft => ({
  name: "",
  mobile: "",
  email: "",
  address: "",
});

export function normalizePosCustomer(
  draft: PosCustomerDraft
): PosSaleCustomer | null {
  const name = draft.name.trim() || null;
  const mobile = draft.mobile.trim() || null;
  const email = draft.email.trim() || null;
  const address = draft.address.trim() || null;
  if (!name && !mobile && !email && !address) return null;
  return { name, mobile, email, address };
}

export type PosCheckoutStep = "details" | "review";

function lineLabel(line: PosCartLine): string | null {
  return line.variantLabel && line.variantLabel !== "Default"
    ? line.variantLabel
    : null;
}

function cartTotals(
  lines: PosCartLine[],
  appliedVoucher: Voucher | null
): { itemCount: number; subtotal: number; voucherApplied: number; amountDue: number } {
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );
  const voucherApplied = appliedVoucher
    ? Math.min(appliedVoucher.remainingAmount, subtotal)
    : 0;
  return {
    itemCount,
    subtotal,
    voucherApplied,
    amountDue: Math.max(0, subtotal - voucherApplied),
  };
}

interface PosCartPanelProps {
  lines: PosCartLine[];
  charging: boolean;
  onIncrement: (variantId: string) => void;
  onDecrement: (variantId: string) => void;
  onRemove: (variantId: string) => void;
  onClear: () => void;
  onContinue: () => void;
  className?: string;
}

export function PosCartPanel({
  lines,
  charging,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onContinue,
  className,
}: PosCartPanelProps) {
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce(
    (sum, line) => sum + line.cashPrice * line.quantity,
    0
  );

  return (
    <div className={`flex h-full min-h-0 flex-col bg-background ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Current sale</h2>
          <p className="text-sm text-muted-foreground">
            {itemCount === 0
              ? "No items"
              : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </p>
        </div>
        {lines.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={charging}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Tap products to add them to the sale.
          </p>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => {
              const label = lineLabel(line);
              return (
                <li key={line.variantId} className="flex gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{line.productName}</p>
                    {label ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {label}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(line.cashPrice)}
                      <span className="text-muted-foreground/80"> cash</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={charging || line.quantity <= 1}
                        onClick={() => onDecrement(line.variantId)}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={charging || line.quantity >= line.maxStock}
                        onClick={() => onIncrement(line.variantId)}
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={charging}
                        onClick={() => onRemove(line.variantId)}
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatCurrency(line.cashPrice * line.quantity)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-2xl font-bold tabular-nums">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <Button
          type="button"
          className="h-12 w-full text-base"
          disabled={charging || lines.length === 0}
          onClick={onContinue}
        >
          Continue to checkout
        </Button>
      </div>
    </div>
  );
}

interface PosCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: PosCheckoutStep;
  onStepChange: (step: PosCheckoutStep) => void;
  lines: PosCartLine[];
  branchName: string;
  paymentMethod: PosPaymentMethod;
  customer: PosCustomerDraft;
  resellers: Reseller[];
  selectedResellerId: string | null;
  resellerVouchers: Voucher[];
  appliedVoucher: Voucher | null;
  voucherCodeInput: string;
  charging: boolean;
  onPaymentMethodChange: (method: PosPaymentMethod) => void;
  onResellerChange: (resellerId: string | null) => void;
  onApplyVoucherId: (voucherId: string | null) => void;
  onVoucherCodeInputChange: (code: string) => void;
  onApplyVoucherCode: () => void;
  onCustomerChange: (patch: Partial<PosCustomerDraft>) => void;
  onRetailPriceChange: (variantId: string, retailPrice: number | null) => void;
  onConfirmCharge: () => void;
}

export function PosCheckoutDialog({
  open,
  onOpenChange,
  step,
  onStepChange,
  lines,
  branchName,
  paymentMethod,
  customer,
  resellers,
  selectedResellerId,
  resellerVouchers,
  appliedVoucher,
  voucherCodeInput,
  charging,
  onPaymentMethodChange,
  onResellerChange,
  onApplyVoucherId,
  onVoucherCodeInputChange,
  onApplyVoucherCode,
  onCustomerChange,
  onRetailPriceChange,
  onConfirmCharge,
}: PosCheckoutDialogProps) {
  const { itemCount, subtotal, voucherApplied, amountDue } = cartTotals(
    lines,
    appliedVoucher
  );
  const missingRetail =
    paymentMethod === "retail" &&
    lines.some((line) => line.retailPrice == null || line.retailPrice <= 0);
  const selectedReseller =
    resellers.find((r) => r.id === selectedResellerId) ?? null;
  const customerSummary = normalizePosCustomer(customer);

  const goToReview = () => {
    if (missingRetail) return;
    onStepChange("review");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (charging) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={!charging}
      >
        <DialogHeader className="border-b px-4 py-3 text-left">
          <DialogTitle>
            {step === "details" ? "Checkout details" : "Review invoice"}
          </DialogTitle>
          <DialogDescription>
            {step === "details"
              ? "Step 1 of 2 — payment, customer, and voucher"
              : "Step 2 of 2 — confirm before charging"}
          </DialogDescription>
          <div className="flex gap-2 pt-2">
            <div
              className={`h-1.5 flex-1 rounded-full ${
                step === "details" || step === "review"
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
            <div
              className={`h-1.5 flex-1 rounded-full ${
                step === "review" ? "bg-primary" : "bg-muted"
              }`}
            />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {step === "details" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="pos-payment-method">Payment method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) =>
                    onPaymentMethodChange((value as PosPaymentMethod) ?? "cash")
                  }
                  disabled={charging}
                >
                  <SelectTrigger id="pos-payment-method">
                    <SelectValue>
                      {(value) =>
                        value === "retail"
                          ? "Retail"
                          : value === "cash"
                            ? "Cash"
                            : null
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {paymentMethod === "cash"
                    ? "Uses each variant’s cash price."
                    : "Uses retail price. Enter missing retail prices below."}
                </p>
              </div>

              {paymentMethod === "retail" ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">Retail prices</p>
                  {lines.map((line) => {
                    const needsInput =
                      line.retailPrice == null || line.retailPrice <= 0;
                    if (line.retailFromCatalog && !needsInput) {
                      return (
                        <div
                          key={line.variantId}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="truncate">{line.productName}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(line.retailPrice!)}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div key={line.variantId} className="space-y-1">
                        <Label
                          htmlFor={`checkout-retail-${line.variantId}`}
                          className="text-xs"
                        >
                          {line.productName}
                          {lineLabel(line) ? ` — ${lineLabel(line)}` : ""}
                          {needsInput ? " (required)" : ""}
                        </Label>
                        <Input
                          id={`checkout-retail-${line.variantId}`}
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="0.00"
                          disabled={charging}
                          value={line.retailPrice ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            onRetailPriceChange(
                              line.variantId,
                              raw === "" ? null : Number(raw)
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                  {missingRetail ? (
                    <p className="text-sm text-destructive">
                      Enter retail price for every item to continue.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-3">
                <div>
                  <Label>Reseller</Label>
                  <p className="text-xs text-muted-foreground">Optional</p>
                </div>
                <Select
                  value={selectedResellerId ?? "none"}
                  onValueChange={(value) =>
                    onResellerChange(!value || value === "none" ? null : value)
                  }
                  disabled={charging}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Walk-in / no reseller">
                      {(value) => {
                        if (!value || value === "none") {
                          return "Walk-in / no reseller";
                        }
                        return (
                          resellers.find((r) => r.id === value)?.name ?? null
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Walk-in / no reseller</SelectItem>
                    {resellers.map((reseller) => (
                      <SelectItem key={reseller.id} value={reseller.id}>
                        {reseller.name}
                        {reseller.mobile ? ` · ${reseller.mobile}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="space-y-2">
                  <Label className="text-xs">Voucher</Label>
                  <p className="text-xs text-muted-foreground">
                    Reseller vouchers or walk-in prepaid codes
                  </p>
                  {selectedResellerId && resellerVouchers.length > 0 ? (
                    <Select
                      value={appliedVoucher?.id ?? "none"}
                      onValueChange={(value) =>
                        onApplyVoucherId(
                          !value || value === "none" ? null : value
                        )
                      }
                      disabled={charging}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No voucher">
                          {(value) => {
                            if (!value || value === "none") return "No voucher";
                            const voucher = resellerVouchers.find(
                              (v) => v.id === value
                            );
                            return voucher
                              ? `${voucher.code} · ${formatCurrency(voucher.remainingAmount)}`
                              : null;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No voucher</SelectItem>
                        {resellerVouchers.map((voucher) => (
                          <SelectItem key={voucher.id} value={voucher.id}>
                            {voucher.code} ·{" "}
                            {formatCurrency(voucher.remainingAmount)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <div className="flex gap-2">
                    <Input
                      value={voucherCodeInput}
                      disabled={charging}
                      placeholder="Or enter voucher code"
                      className="font-mono text-sm"
                      onChange={(e) => onVoucherCodeInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onApplyVoucherCode();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={charging || !voucherCodeInput.trim()}
                      onClick={onApplyVoucherCode}
                    >
                      Apply
                    </Button>
                  </div>
                  {appliedVoucher ? (
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                      <p className="font-medium">{appliedVoucher.code}</p>
                      <p className="text-muted-foreground">
                        {voucherOwnerLabel(appliedVoucher)} · remaining{" "}
                        {formatCurrency(appliedVoucher.remainingAmount)}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 px-2"
                        disabled={charging}
                        onClick={() => onApplyVoucherId(null)}
                      >
                        Remove voucher
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Customer details</Label>
                  <p className="text-xs text-muted-foreground">Optional</p>
                </div>
                <div className="grid gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="pos-customer-name" className="text-xs">
                      Name
                    </Label>
                    <Input
                      id="pos-customer-name"
                      value={customer.name}
                      disabled={charging}
                      placeholder="Customer name"
                      onChange={(e) =>
                        onCustomerChange({ name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pos-customer-mobile" className="text-xs">
                      Mobile
                    </Label>
                    <Input
                      id="pos-customer-mobile"
                      type="tel"
                      value={customer.mobile}
                      disabled={charging}
                      placeholder="09…"
                      onChange={(e) =>
                        onCustomerChange({ mobile: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pos-customer-email" className="text-xs">
                      Email
                    </Label>
                    <Input
                      id="pos-customer-email"
                      type="email"
                      value={customer.email}
                      disabled={charging}
                      placeholder="Optional"
                      onChange={(e) =>
                        onCustomerChange({ email: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pos-customer-address" className="text-xs">
                      Address
                    </Label>
                    <Textarea
                      id="pos-customer-address"
                      value={customer.address}
                      disabled={charging}
                      placeholder="Optional delivery or contact address"
                      rows={2}
                      onChange={(e) =>
                        onCustomerChange({ address: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-muted-foreground">Branch</p>
                <p className="font-medium">{branchName}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Items ({itemCount})
                </p>
                <ul className="divide-y rounded-lg border">
                  {lines.map((line) => {
                    const label = lineLabel(line);
                    return (
                      <li
                        key={line.variantId}
                        className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">
                            {line.quantity}× {line.productName}
                          </p>
                          {label ? (
                            <p className="text-muted-foreground">{label}</p>
                          ) : null}
                          <p className="tabular-nums text-muted-foreground">
                            @ {formatCurrency(line.unitPrice)}
                          </p>
                        </div>
                        <p className="shrink-0 font-medium tabular-nums">
                          {formatCurrency(line.unitPrice * line.quantity)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Payment</span>
                  <span className="font-medium capitalize">{paymentMethod}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Reseller</span>
                  <span className="font-medium text-right">
                    {selectedReseller?.name ??
                      (appliedVoucher
                        ? voucherOwnerLabel(appliedVoucher)
                        : "Walk-in")}
                  </span>
                </div>
                {appliedVoucher ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Voucher</span>
                    <span className="font-mono text-right">
                      {appliedVoucher.code}
                    </span>
                  </div>
                ) : null}
                {customerSummary ? (
                  <div className="border-t pt-2">
                    <p className="text-muted-foreground">Customer</p>
                    <p className="font-medium">
                      {customerSummary.name || "—"}
                    </p>
                    {customerSummary.mobile ? (
                      <p>{customerSummary.mobile}</p>
                    ) : null}
                    {customerSummary.email ? (
                      <p>{customerSummary.email}</p>
                    ) : null}
                    {customerSummary.address ? (
                      <p className="text-muted-foreground">
                        {customerSummary.address}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-1 rounded-lg border p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                {voucherApplied > 0 ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Voucher</span>
                    <span className="tabular-nums">
                      −{formatCurrency(voucherApplied)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between border-t pt-2">
                  <span className="font-medium">Amount due</span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatCurrency(amountDue)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t p-4">
          {step === "details" ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={charging}
                onClick={() => onOpenChange(false)}
              >
                Back to cart
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={charging || missingRetail || lines.length === 0}
                onClick={goToReview}
              >
                Review invoice
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={charging}
                onClick={() => onStepChange("details")}
              >
                Back
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={charging || missingRetail || lines.length === 0}
                onClick={onConfirmCharge}
              >
                {charging ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirm charge {formatCurrency(amountDue)}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
