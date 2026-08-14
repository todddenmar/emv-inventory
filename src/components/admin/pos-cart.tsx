"use client";

import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { paymentAccountTypeLabel } from "@/lib/firestore/payment-accounts";
import { voucherOwnerLabel } from "@/lib/firestore/vouchers";
import type {
  PaymentAccount,
  PosCustomerType,
  PosPaymentMethod,
  PosSaleCustomer,
  PosTenderMethod,
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
  /** True when this line was added as a category freebie (₱0). */
  isFreebie?: boolean;
  /** Category ids whose freebie rules produced this line. */
  freebieSourceCategoryIds?: string[];
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

export function customerTypeLabel(type: PosCustomerType): string {
  if (type === "reservation") return "Reservation";
  if (type === "delivery") return "Delivery";
  return "Walk in";
}

export function tenderMethodLabel(method: PosTenderMethod): string {
  switch (method) {
    case "ewallet":
      return "E-wallet";
    case "home_credit":
      return "Home Credit";
    case "skyro":
      return "Skyro";
    case "salmon":
      return "Salmon";
    case "card_swipe":
      return "Card/Swipe";
    default:
      return "Cash";
  }
}

export const POS_TENDER_METHODS: PosTenderMethod[] = [
  "cash",
  "ewallet",
  "home_credit",
  "skyro",
  "salmon",
  "card_swipe",
];

export function isPosTenderMethod(value: unknown): value is PosTenderMethod {
  return (
    value === "cash" ||
    value === "ewallet" ||
    value === "home_credit" ||
    value === "skyro" ||
    value === "salmon" ||
    value === "card_swipe"
  );
}

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

function cashSubtotal(lines: PosCartLine[]): number {
  return lines.reduce(
    (sum, line) =>
      line.isFreebie ? sum : sum + line.cashPrice * line.quantity,
    0
  );
}

function retailSubtotal(lines: PosCartLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    if (line.isFreebie) continue;
    if (line.retailPrice == null || line.retailPrice <= 0) return null;
    total += line.retailPrice * line.quantity;
  }
  return total;
}

interface PosCartPanelProps {
  lines: PosCartLine[];
  charging: boolean;
  onIncrement: (variantId: string) => void;
  onDecrement: (variantId: string) => void;
  onRemove: (variantId: string, isFreebie?: boolean) => void;
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
              const isFreebie = Boolean(line.isFreebie);
              return (
                <li
                  key={`${isFreebie ? "free" : "paid"}-${line.variantId}`}
                  className="flex gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{line.productName}</p>
                      {isFreebie ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          Freebie
                        </Badge>
                      ) : null}
                    </div>
                    {label ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {label}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                      {isFreebie ? (
                        "Free"
                      ) : (
                        <>
                          {formatCurrency(line.cashPrice)}
                          <span className="text-muted-foreground/80">
                            {" "}
                            cash
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={
                          charging || isFreebie || line.quantity <= 1
                        }
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
                        disabled={
                          charging ||
                          isFreebie ||
                          line.quantity >= line.maxStock
                        }
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
                        onClick={() =>
                          onRemove(line.variantId, isFreebie)
                        }
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatCurrency(
                        isFreebie ? 0 : line.cashPrice * line.quantity
                      )}
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
  tenderMethod: PosTenderMethod;
  paymentAccounts: PaymentAccount[];
  selectedPaymentAccountId: string | null;
  customerType: PosCustomerType;
  customer: PosCustomerDraft;
  appliedVoucher: Voucher | null;
  voucherCodeInput: string;
  charging: boolean;
  onPaymentMethodChange: (method: PosPaymentMethod) => void;
  onTenderMethodChange: (method: PosTenderMethod) => void;
  onPaymentAccountChange: (accountId: string | null) => void;
  onCustomerTypeChange: (type: PosCustomerType) => void;
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
  tenderMethod,
  paymentAccounts,
  selectedPaymentAccountId,
  customerType,
  customer,
  appliedVoucher,
  voucherCodeInput,
  charging,
  onPaymentMethodChange,
  onTenderMethodChange,
  onPaymentAccountChange,
  onCustomerTypeChange,
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
  const cashTotal = cashSubtotal(lines);
  const retailTotal = retailSubtotal(lines);
  const missingRetail =
    paymentMethod === "retail" &&
    lines.some(
      (line) =>
        !line.isFreebie &&
        (line.retailPrice == null || line.retailPrice <= 0)
    );
  const needsPaymentAccount = tenderMethod === "ewallet";
  const accountsForTender = paymentAccounts.filter(
    (a) => a.type === "ewallet" && a.isActive
  );
  const selectedPaymentAccount =
    accountsForTender.find((a) => a.id === selectedPaymentAccountId) ?? null;
  const showCustomerForm =
    customerType === "reservation" || customerType === "delivery";
  const customerSummary = showCustomerForm
    ? normalizePosCustomer(customer)
    : null;
  const missingCustomerName =
    showCustomerForm && !customer.name.trim();
  const missingPaymentAccount =
    needsPaymentAccount && !selectedPaymentAccount;

  const goToReview = () => {
    if (missingRetail) return;
    if (missingPaymentAccount) return;
    if (missingCustomerName) return;
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
              <div className="space-y-3">
                <div>
                  <Label>Price list</Label>
                  <p className="text-xs text-muted-foreground">
                    Compare cash and retail, then choose which price to charge
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border p-3">
                  {lines
                    .filter((line) => !line.isFreebie)
                    .map((line) => {
                    const label = lineLabel(line);
                    const needsRetailInput =
                      line.retailPrice == null || line.retailPrice <= 0;
                    return (
                      <div
                        key={line.variantId}
                        className="space-y-2 border-b pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {line.quantity}× {line.productName}
                          </p>
                          {label ? (
                            <p className="text-xs text-muted-foreground">
                              {label}
                            </p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div
                            className={`rounded-md border px-2.5 py-2 ${
                              paymentMethod === "cash"
                                ? "border-primary bg-primary/5"
                                : "bg-muted/30"
                            }`}
                          >
                            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                              Cash
                            </p>
                            <p className="tabular-nums font-medium">
                              {formatCurrency(line.cashPrice)}
                            </p>
                            {line.quantity > 1 ? (
                              <p className="text-xs tabular-nums text-muted-foreground">
                                Line {formatCurrency(line.cashPrice * line.quantity)}
                              </p>
                            ) : null}
                          </div>
                          <div
                            className={`rounded-md border px-2.5 py-2 ${
                              paymentMethod === "retail"
                                ? "border-primary bg-primary/5"
                                : "bg-muted/30"
                            }`}
                          >
                            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                              Retail
                            </p>
                            {paymentMethod === "retail" &&
                            (!line.retailFromCatalog || needsRetailInput) ? (
                              <Input
                                id={`checkout-retail-${line.variantId}`}
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="0.00"
                                disabled={charging}
                                className="mt-1 h-8"
                                value={line.retailPrice ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  onRetailPriceChange(
                                    line.variantId,
                                    raw === "" ? null : Number(raw)
                                  );
                                }}
                              />
                            ) : (
                              <p className="tabular-nums font-medium">
                                {line.retailPrice != null && line.retailPrice > 0
                                  ? formatCurrency(line.retailPrice)
                                  : "—"}
                              </p>
                            )}
                            {!needsRetailInput &&
                            line.quantity > 1 &&
                            !(
                              paymentMethod === "retail" &&
                              (!line.retailFromCatalog || needsRetailInput)
                            ) ? (
                              <p className="text-xs tabular-nums text-muted-foreground">
                                Line{" "}
                                {formatCurrency(
                                  (line.retailPrice ?? 0) * line.quantity
                                )}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {needsRetailInput && paymentMethod !== "retail" ? (
                          <p className="text-xs text-muted-foreground">
                            No retail price set — choose Retail to enter one.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={paymentMethod === "cash" ? "default" : "outline"}
                    className="h-auto flex-col items-start gap-0.5 px-3 py-2.5"
                    disabled={charging}
                    onClick={() => onPaymentMethodChange("cash")}
                  >
                    <span className="text-sm font-medium">
                      Use cash{" "}
                      {lines.filter((l) => !l.isFreebie).length === 1
                        ? "price"
                        : "prices"}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${
                        paymentMethod === "cash"
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      Total {formatCurrency(cashTotal)}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === "retail" ? "default" : "outline"}
                    className="h-auto flex-col items-start gap-0.5 px-3 py-2.5"
                    disabled={charging}
                    onClick={() => onPaymentMethodChange("retail")}
                  >
                    <span className="text-sm font-medium">
                      Use retail{" "}
                      {lines.filter((l) => !l.isFreebie).length === 1
                        ? "price"
                        : "prices"}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${
                        paymentMethod === "retail"
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {retailTotal != null
                        ? `Total ${formatCurrency(retailTotal)}`
                        : "Enter missing retail"}
                    </span>
                  </Button>
                </div>

                {missingRetail ? (
                  <p className="text-sm text-destructive">
                    Enter retail price for every item to continue.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="pos-tender-method">Payment method</Label>
                <Select
                  value={tenderMethod}
                  onValueChange={(value) =>
                    onTenderMethodChange(
                      (value as PosTenderMethod) ?? "cash"
                    )
                  }
                  disabled={charging}
                >
                  <SelectTrigger id="pos-tender-method">
                    <SelectValue>
                      {(value) =>
                        value
                          ? tenderMethodLabel(value as PosTenderMethod)
                          : null
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {POS_TENDER_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {tenderMethodLabel(method)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {needsPaymentAccount ? (
                <div className="space-y-2">
                  <Label htmlFor="pos-payment-account">E-wallet account</Label>
                  <Select
                    value={selectedPaymentAccountId ?? ""}
                    onValueChange={(value) =>
                      onPaymentAccountChange(value || null)
                    }
                    disabled={charging}
                  >
                    <SelectTrigger id="pos-payment-account">
                      <SelectValue placeholder="Select account">
                        {(value) => {
                          if (!value) return null;
                          const account = accountsForTender.find(
                            (a) => a.id === value
                          );
                          return account
                            ? `${account.provider} · ${account.accountName}`
                            : null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {accountsForTender.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          No accounts in Settings
                        </SelectItem>
                      ) : (
                        accountsForTender.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.provider} · {account.accountName} ·{" "}
                            {account.accountNumber}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {missingPaymentAccount ? (
                    <p className="text-sm text-destructive">
                      {accountsForTender.length === 0
                        ? "Add an account under Settings → Payment accounts."
                        : "Select a receiving account to continue."}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="pos-voucher-code">Voucher code</Label>
                <p className="text-xs text-muted-foreground">
                  Optional prepaid credit — reseller is taken from the voucher if linked
                </p>
                <div className="flex gap-2">
                  <Input
                    id="pos-voucher-code"
                    value={voucherCodeInput}
                    disabled={charging}
                    placeholder="Enter voucher code"
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
                    <p className="font-medium">
                      {appliedVoucher.name
                        ? `${appliedVoucher.name} · ${appliedVoucher.code}`
                        : appliedVoucher.code}
                    </p>
                    {appliedVoucher.description ? (
                      <p className="text-muted-foreground">
                        {appliedVoucher.description}
                      </p>
                    ) : null}
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

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="pos-customer-type">Customer type</Label>
                  <Select
                    value={customerType}
                    onValueChange={(value) =>
                      onCustomerTypeChange(
                        (value as PosCustomerType) ?? "walk_in"
                      )
                    }
                    disabled={charging}
                  >
                    <SelectTrigger id="pos-customer-type">
                      <SelectValue>
                        {(value) =>
                          value
                            ? customerTypeLabel(value as PosCustomerType)
                            : null
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="walk_in">Walk in</SelectItem>
                      <SelectItem value="reservation">Reservation</SelectItem>
                      <SelectItem value="delivery">Delivery</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {showCustomerForm ? (
                  <div className="space-y-3">
                    <div>
                      <Label>Customer details</Label>
                      <p className="text-xs text-muted-foreground">
                        Required for {customerTypeLabel(customerType).toLowerCase()}
                      </p>
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
                        <Label
                          htmlFor="pos-customer-address"
                          className="text-xs"
                        >
                          Address
                        </Label>
                        <Textarea
                          id="pos-customer-address"
                          value={customer.address}
                          disabled={charging}
                          placeholder={
                            customerType === "delivery"
                              ? "Delivery address"
                              : "Optional contact address"
                          }
                          rows={2}
                          onChange={(e) =>
                            onCustomerChange({ address: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    {missingCustomerName ? (
                      <p className="text-sm text-destructive">
                        Enter customer name to continue.
                      </p>
                    ) : null}
                  </div>
                ) : null}
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
                  <span className="text-muted-foreground">Price list</span>
                  <span className="font-medium capitalize">{paymentMethod}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Payment</span>
                  <span className="font-medium text-right">
                    {tenderMethodLabel(tenderMethod)}
                  </span>
                </div>
                {selectedPaymentAccount ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {paymentAccountTypeLabel(selectedPaymentAccount.type)}
                    </span>
                    <span className="text-right">
                      <span className="font-medium">
                        {selectedPaymentAccount.provider}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {selectedPaymentAccount.accountName} ·{" "}
                        {selectedPaymentAccount.accountNumber}
                      </span>
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Customer type</span>
                  <span className="font-medium">
                    {customerTypeLabel(customerType)}
                  </span>
                </div>
                {appliedVoucher ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Voucher</span>
                      <span className="text-right">
                        {appliedVoucher.name ? (
                          <>
                            {appliedVoucher.name}
                            <span className="ml-1 font-mono text-muted-foreground">
                              {appliedVoucher.code}
                            </span>
                          </>
                        ) : (
                          <span className="font-mono">{appliedVoucher.code}</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Voucher owner</span>
                      <span className="font-medium text-right">
                        {voucherOwnerLabel(appliedVoucher)}
                      </span>
                    </div>
                  </>
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
                disabled={
                  charging ||
                  missingRetail ||
                  missingPaymentAccount ||
                  missingCustomerName ||
                  lines.length === 0
                }
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
                disabled={
                  charging ||
                  missingRetail ||
                  missingPaymentAccount ||
                  missingCustomerName ||
                  lines.length === 0
                }
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
