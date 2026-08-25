"use client";

import { useState } from "react";
import { Loader2, Minus, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  POS_TENDER_METHODS as PAYMENT_TENDER_METHODS,
  POS_PAYMENT_KINDS,
  accountTypeForTender,
  createItemPaymentLine,
  formatPaymentLineNote,
  itemPaymentsCoverLineTotal,
  moneyInputText,
  parseMoneyInput,
  paymentKindLabel,
  paymentRemaining,
  sumCheckoutPaymentAmounts,
  tenderMethodLabel as paymentTenderMethodLabel,
  tenderNeedsPaymentAccount,
  isPosTenderMethod as isPaymentTenderMethod,
  type PosCheckoutPaymentLine,
} from "@/lib/pos-payments";
import type {
  PaymentAccount,
  PosCustomerType,
  PosPaymentKind,
  PosPaymentMethod,
  PosSaleChannel,
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
  /** Suggested wholesale from catalog; null when unset. */
  wholesalePrice?: number | null;
  unitPrice: number;
  quantity: number;
  maxStock: number;
  /** True when this line was added as a category freebie (₱0). */
  isFreebie?: boolean;
  /** Category ids whose freebie rules produced this line. */
  freebieSourceCategoryIds?: string[];
  /** Active price promotion applied when the line was added. */
  promotionId?: string | null;
  promotionName?: string | null;
  /** Catalog cash before promotion (for strikethrough display). */
  baseCashPrice?: number | null;
  /** Shop: cash vs retail for this line. */
  priceList: PosPaymentMethod;
  /** Split tenders covering this line's total. */
  payments: PosCheckoutPaymentLine[];
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
  return paymentTenderMethodLabel(method);
}

export const POS_TENDER_METHODS = PAYMENT_TENDER_METHODS;

export function isPosTenderMethod(value: unknown): value is PosTenderMethod {
  return isPaymentTenderMethod(value);
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

interface PosCartPanelProps {
  lines: PosCartLine[];
  charging: boolean;
  saleChannel?: PosSaleChannel;
  onIncrement: (variantId: string) => void;
  onDecrement: (variantId: string) => void;
  onQuantityChange?: (variantId: string, quantity: number) => void;
  onRemove: (variantId: string, isFreebie?: boolean) => void;
  onClear: () => void;
  onContinue: () => void;
  /** When set, shows a close control aligned with Clear (e.g. mobile cart drawer). */
  onClose?: () => void;
  className?: string;
}

export function PosCartPanel({
  lines,
  charging,
  saleChannel = "shop",
  onIncrement,
  onDecrement,
  onQuantityChange,
  onRemove,
  onClear,
  onContinue,
  onClose,
  className,
}: PosCartPanelProps) {
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const isWholesale = saleChannel === "wholesale";
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(
    {}
  );
  const subtotal = lines.reduce(
    (sum, line) =>
      sum +
      (isWholesale || line.isFreebie
        ? line.unitPrice
        : line.cashPrice) *
        line.quantity,
    0
  );

  const commitQuantity = (variantId: string, raw: string, maxStock: number) => {
    if (!onQuantityChange) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      onQuantityChange(variantId, 1);
    } else {
      onQuantityChange(variantId, Math.min(Math.floor(parsed), maxStock));
    }
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  };

  return (
    <div className={`flex h-full min-h-0 flex-col bg-background ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Current sale</h2>
          <p className="text-sm text-muted-foreground">
            {itemCount === 0
              ? "No items"
              : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {lines.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={onClear}
              disabled={charging}
            >
              Clear
            </Button>
          ) : null}
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-8 w-8"
              onClick={onClose}
              aria-label="Close cart"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
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
                      {!isFreebie && line.promotionName ? (
                        <Badge
                          variant="outline"
                          className="max-w-[10rem] shrink-0 truncate text-[10px] text-amber-700"
                          title={line.promotionName}
                        >
                          {line.promotionName}
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
                      ) : isWholesale ? (
                        <>
                          {formatCurrency(line.unitPrice)}
                          <span className="text-muted-foreground/80">
                            {" "}
                            unit
                          </span>
                        </>
                      ) : (
                        <>
                          {line.baseCashPrice != null &&
                          line.baseCashPrice !== line.cashPrice ? (
                            <span className="mr-1.5 line-through opacity-60">
                              {formatCurrency(line.baseCashPrice)}
                            </span>
                          ) : null}
                          <span
                            className={
                              line.promotionName
                                ? "font-medium text-amber-800"
                                : undefined
                            }
                          >
                            {formatCurrency(line.cashPrice)}
                          </span>
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
                        onClick={() => {
                          setQuantityDrafts((prev) => {
                            if (!(line.variantId in prev)) return prev;
                            const next = { ...prev };
                            delete next[line.variantId];
                            return next;
                          });
                          onDecrement(line.variantId);
                        }}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      {isWholesale && !isFreebie && onQuantityChange ? (
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={line.maxStock}
                          step={1}
                          disabled={charging}
                          className="h-8 w-16 px-1 text-center text-sm font-semibold tabular-nums"
                          aria-label={`Quantity for ${line.productName}`}
                          value={
                            quantityDrafts[line.variantId] ??
                            String(line.quantity)
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            setQuantityDrafts((prev) => ({
                              ...prev,
                              [line.variantId]: raw,
                            }));
                            if (raw === "") return;
                            const parsed = Number(raw);
                            if (
                              Number.isFinite(parsed) &&
                              parsed >= 1 &&
                              Number.isInteger(parsed)
                            ) {
                              onQuantityChange(
                                line.variantId,
                                Math.min(parsed, line.maxStock)
                              );
                            }
                          }}
                          onBlur={() =>
                            commitQuantity(
                              line.variantId,
                              quantityDrafts[line.variantId] ??
                                String(line.quantity),
                              line.maxStock
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      ) : (
                        <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
                          {line.quantity}
                        </span>
                      )}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={
                          charging ||
                          isFreebie ||
                          line.quantity >= line.maxStock
                        }
                        onClick={() => {
                          setQuantityDrafts((prev) => {
                            if (!(line.variantId in prev)) return prev;
                            const next = { ...prev };
                            delete next[line.variantId];
                            return next;
                          });
                          onIncrement(line.variantId);
                        }}
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
                    {isWholesale && !isFreebie ? (
                      <p className="text-[11px] text-muted-foreground">
                        Max {line.maxStock}
                      </p>
                    ) : null}
                    <p className="text-sm font-semibold tabular-nums">
                      {formatCurrency(
                        isFreebie
                          ? 0
                          : (isWholesale ? line.unitPrice : line.cashPrice) *
                              line.quantity
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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  layout?: "dialog" | "page";
  onBack?: () => void;
  step: PosCheckoutStep;
  onStepChange: (step: PosCheckoutStep) => void;
  lines: PosCartLine[];
  branchName: string;
  saleChannel?: PosSaleChannel;
  paymentAccounts: PaymentAccount[];
  customerType: PosCustomerType;
  customer: PosCustomerDraft;
  appliedVoucher: Voucher | null;
  voucherCodeInput: string;
  charging: boolean;
  onLineChange: (
    variantId: string,
    patch: Partial<Pick<PosCartLine, "priceList" | "payments" | "unitPrice" | "retailPrice">>
  ) => void;
  onCustomerTypeChange: (type: PosCustomerType) => void;
  onApplyVoucherId: (voucherId: string | null) => void;
  onVoucherCodeInputChange: (code: string) => void;
  onApplyVoucherCode: () => void;
  onCustomerChange: (patch: Partial<PosCustomerDraft>) => void;
  onRetailPriceChange: (variantId: string, retailPrice: number | null) => void;
  onUnitPriceChange?: (variantId: string, unitPrice: number) => void;
  onConfirmCharge: () => void;
}

export function PosCheckoutDialog({
  open = true,
  onOpenChange,
  layout = "dialog",
  onBack,
  step,
  onStepChange,
  lines,
  branchName,
  saleChannel = "shop",
  paymentAccounts,
  customerType,
  customer,
  appliedVoucher,
  voucherCodeInput,
  charging,
  onLineChange,
  onCustomerTypeChange,
  onApplyVoucherId,
  onVoucherCodeInputChange,
  onApplyVoucherCode,
  onCustomerChange,
  onRetailPriceChange,
  onUnitPriceChange,
  onConfirmCharge,
}: PosCheckoutDialogProps) {
  const isWholesale = saleChannel === "wholesale";
  const isPage = layout === "page";
  const [paymentEditor, setPaymentEditor] = useState<{
    variantId: string;
    payId: string | null;
    draft: PosCheckoutPaymentLine;
  } | null>(null);
  const { itemCount, subtotal, voucherApplied, amountDue } = cartTotals(
    lines,
    appliedVoucher
  );
  const missingWholesalePrice =
    isWholesale &&
    lines.some(
      (line) => !line.isFreebie && (!(line.unitPrice > 0))
    );
  const paidLines = lines.filter((line) => !line.isFreebie);
  const missingPaymentAccount = paidLines.some((line) =>
    (line.payments ?? []).some((pay) => {
      if (!tenderNeedsPaymentAccount(pay.tenderMethod)) return false;
      const expectedType = accountTypeForTender(pay.tenderMethod);
      return !paymentAccounts.some(
        (account) =>
          account.id === pay.paymentAccountId &&
          account.isActive &&
          expectedType != null &&
          account.type === expectedType
      );
    })
  );
  const unbalancedItemPayments = paidLines.some((line) => {
    const lineTotal = Math.round(line.unitPrice * line.quantity * 100) / 100;
    return !itemPaymentsCoverLineTotal(line.payments ?? [], lineTotal);
  });
  const invalidItemPaymentAmount = paidLines.some(
    (line) =>
      !(line.payments?.length > 0) ||
      line.payments.some((pay) => !Number.isFinite(pay.amount) || pay.amount <= 0)
  );
  const missingRetail =
    !isWholesale &&
    paidLines.some(
      (line) =>
        line.priceList === "retail" &&
        (line.retailPrice == null || line.retailPrice <= 0)
    );
  const showCustomerForm =
    customerType === "reservation" || customerType === "delivery";
  const customerSummary = showCustomerForm
    ? normalizePosCustomer(customer)
    : null;
  const missingCustomerName =
    showCustomerForm && !customer.name.trim();

  const goToReview = () => {
    if (missingRetail || missingWholesalePrice) return;
    if (amountDue > 0.01 && paidLines.length === 0) return;
    if (missingPaymentAccount || unbalancedItemPayments || invalidItemPaymentAmount)
      return;
    if (missingCustomerName) return;
    onStepChange("review");
  };

  const handleBackToCart = () => {
    if (charging) return;
    if (onBack) {
      onBack();
      return;
    }
    onOpenChange?.(false);
  };

  const header = (
    <div
      className={
        isPage
          ? "border-b px-4 py-4 text-left sm:px-6 lg:flex lg:items-end lg:justify-between lg:gap-6"
          : "border-b px-4 py-3 text-left"
      }
    >
      <div>
        <h2 className="text-lg font-semibold lg:text-xl">
          {step === "details" ? "Checkout details" : "Review invoice"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {step === "details"
            ? "Step 1 of 2 — payment, customer, and voucher"
            : "Step 2 of 2 — confirm before charging"}
          {branchName ? ` · ${branchName}` : ""}
        </p>
      </div>
      <div
        className={`mt-3 flex gap-2 ${isPage ? "lg:mt-0 lg:w-56" : "pt-2"}`}
      >
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
    </div>
  );

  const footer = (
    <div
      className={
        isPage
          ? "flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end sm:px-6"
          : "flex gap-2 border-t p-4"
      }
    >
      {step === "details" ? (
        <>
          <Button
            type="button"
            variant="outline"
            className={isPage ? "sm:min-w-36" : "flex-1"}
            disabled={charging}
            onClick={handleBackToCart}
          >
            Back to cart
          </Button>
          <Button
            type="button"
            className={isPage ? "sm:min-w-44" : "flex-1"}
            disabled={
              charging ||
              missingRetail ||
              missingWholesalePrice ||
              missingPaymentAccount ||
              unbalancedItemPayments ||
              invalidItemPaymentAmount ||
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
            className={isPage ? "sm:min-w-36" : "flex-1"}
            disabled={charging}
            onClick={() => onStepChange("details")}
          >
            Back
          </Button>
          <Button
            type="button"
            className={isPage ? "sm:min-w-52" : "flex-1"}
            disabled={
              charging ||
              missingRetail ||
              missingWholesalePrice ||
              missingPaymentAccount ||
              unbalancedItemPayments ||
              invalidItemPaymentAmount ||
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
  );

  const scrollBody = (
    <div
      className={
        isPage
          ? "min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
          : "min-h-0 flex-1 overflow-y-auto px-4 py-4"
      }
    >
          {step === "details" ? (
            <div
              className={
                isPage
                  ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start"
                  : "space-y-5"
              }
            >
              <div className="space-y-5">
              {isWholesale ? (
                <div className="space-y-3">
                  <div>
                    <Label>Wholesale unit prices</Label>
                    <p className="text-xs text-muted-foreground">
                      Cash and retail are shown for reference. Edit the
                      wholesale unit price charged for each line.
                    </p>
                  </div>
                  <div
                    className={
                      isPage
                        ? "grid gap-3 sm:grid-cols-2 rounded-lg border p-3"
                        : "space-y-2 rounded-lg border p-3"
                    }
                  >
                    {lines
                      .filter((line) => !line.isFreebie)
                      .map((line) => {
                        const label = lineLabel(line);
                        const suggested =
                          line.wholesalePrice != null && line.wholesalePrice > 0
                            ? line.wholesalePrice
                            : null;
                        return (
                          <div
                            key={line.variantId}
                            className={
                              isPage
                                ? "space-y-2 rounded-md border p-3"
                                : "space-y-2 border-b pb-3 last:border-b-0 last:pb-0"
                            }
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
                              <div className="rounded-md border bg-muted/30 px-2.5 py-2">
                                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                  Cash
                                </p>
                                <p className="tabular-nums font-medium">
                                  {formatCurrency(line.cashPrice)}
                                </p>
                              </div>
                              <div className="rounded-md border bg-muted/30 px-2.5 py-2">
                                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                  Retail
                                </p>
                                <p className="tabular-nums font-medium">
                                  {line.retailPrice != null &&
                                  line.retailPrice > 0
                                    ? formatCurrency(line.retailPrice)
                                    : "—"}
                                </p>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <Label
                                  htmlFor={`checkout-wholesale-${line.variantId}`}
                                  className="text-xs"
                                >
                                  Wholesale unit price
                                </Label>
                                {suggested != null ? (
                                  <span className="text-[11px] text-muted-foreground">
                                    Suggested {formatCurrency(suggested)}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">
                                    No suggested price
                                  </span>
                                )}
                              </div>
                              <Input
                                id={`checkout-wholesale-${line.variantId}`}
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="0.00"
                                disabled={charging}
                                className="h-9"
                                value={line.unitPrice || ""}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  onUnitPriceChange?.(
                                    line.variantId,
                                    raw === "" ? 0 : Number(raw)
                                  );
                                }}
                              />
                              {line.quantity > 1 && line.unitPrice > 0 ? (
                                <p className="text-xs tabular-nums text-muted-foreground">
                                  Line{" "}
                                  {formatCurrency(
                                    line.unitPrice * line.quantity
                                  )}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {missingWholesalePrice ? (
                    <p className="text-sm text-destructive">
                      Enter a unit price greater than 0 for every item.
                    </p>
                  ) : null}
                </div>
              ) : (
              <div className="space-y-3">
                <div>
                  <Label>Price list</Label>
                  <p className="text-xs text-muted-foreground">
                    Compare cash and retail, then tap a price to charge per item
                  </p>
                </div>

                <div
                  className={
                    isPage
                      ? "grid gap-3 sm:grid-cols-2 rounded-lg border p-3"
                      : "space-y-2 rounded-lg border p-3"
                  }
                >
                  {lines
                    .filter((line) => !line.isFreebie)
                    .map((line) => {
                    const label = lineLabel(line);
                    const needsRetailInput =
                      line.retailPrice == null || line.retailPrice <= 0;
                    return (
                      <div
                        key={line.variantId}
                        className={
                          isPage
                            ? "space-y-2 rounded-md border p-3"
                            : "space-y-2 border-b pb-3 last:border-b-0 last:pb-0"
                        }
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
                          <button
                            type="button"
                            disabled={charging}
                            onClick={() =>
                              onLineChange(line.variantId, {
                                priceList: "cash",
                              })
                            }
                            className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                              line.priceList === "cash"
                                ? "border-primary bg-primary/5"
                                : "bg-muted/30 hover:bg-muted/50"
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
                                Line{" "}
                                {formatCurrency(
                                  line.cashPrice * line.quantity
                                )}
                              </p>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            disabled={charging}
                            onClick={() =>
                              onLineChange(line.variantId, {
                                priceList: "retail",
                              })
                            }
                            className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                              line.priceList === "retail"
                                ? "border-primary bg-primary/5"
                                : "bg-muted/30 hover:bg-muted/50"
                            }`}
                          >
                            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                              Retail
                            </p>
                            {line.priceList === "retail" &&
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
                                onClick={(e) => e.stopPropagation()}
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
                                {line.retailPrice != null &&
                                line.retailPrice > 0
                                  ? formatCurrency(line.retailPrice)
                                  : "—"}
                              </p>
                            )}
                            {!needsRetailInput && line.quantity > 1 ? (
                              <p className="text-xs tabular-nums text-muted-foreground">
                                Line{" "}
                                {formatCurrency(
                                  (line.retailPrice ?? 0) * line.quantity
                                )}
                              </p>
                            ) : null}
                          </button>
                        </div>
                        {needsRetailInput && line.priceList !== "retail" ? (
                          <p className="text-xs text-muted-foreground">
                            No retail price set — choose Retail to enter one.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {missingRetail ? (
                  <p className="text-sm text-destructive">
                    Enter retail price for every item to continue.
                  </p>
                ) : null}
              </div>
              )}

              <div className="space-y-3">
                <div>
                  <Label>Payments by item</Label>
                  <p className="text-xs text-muted-foreground">
                    Set cash/retail and split payments per item. Amount due{" "}
                    <span className="font-medium tabular-nums">
                      {formatCurrency(amountDue)}
                    </span>
                    .
                  </p>
                </div>

                <div
                  className={
                    isPage ? "grid gap-3 md:grid-cols-2" : "space-y-3"
                  }
                >
                  {paidLines.length === 0 ? (
                    <p className="text-sm text-muted-foreground md:col-span-2">
                      No paid items — voucher or freebies cover this sale.
                    </p>
                  ) : (
                    paidLines.map((line) => {
                      const label = lineLabel(line);
                      const lineTotal =
                        Math.round(line.unitPrice * line.quantity * 100) / 100;
                      const payments = line.payments ?? [];
                      const paidSum = sumCheckoutPaymentAmounts(payments);
                      const remaining = paymentRemaining(lineTotal, payments);
                      const balanced = itemPaymentsCoverLineTotal(
                        payments,
                        lineTotal
                      );

                      const updatePayments = (
                        next: PosCheckoutPaymentLine[]
                      ) => {
                        onLineChange(line.variantId, { payments: next });
                      };

                      return (
                        <div
                          key={line.variantId}
                          className="space-y-3 rounded-lg border p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
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
                            <p className="shrink-0 text-sm font-semibold tabular-nums">
                              {formatCurrency(lineTotal)}
                            </p>
                          </div>

                          {!isWholesale ? (
                            <div className="space-y-1.5">
                              <Label>Price list</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    line.priceList === "cash"
                                      ? "default"
                                      : "outline"
                                  }
                                  disabled={charging}
                                  onClick={() =>
                                    onLineChange(line.variantId, {
                                      priceList: "cash",
                                    })
                                  }
                                >
                                  Cash {formatCurrency(line.cashPrice)}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    line.priceList === "retail"
                                      ? "default"
                                      : "outline"
                                  }
                                  disabled={charging}
                                  onClick={() =>
                                    onLineChange(line.variantId, {
                                      priceList: "retail",
                                    })
                                  }
                                >
                                  Retail{" "}
                                  {line.retailPrice != null &&
                                  line.retailPrice > 0
                                    ? formatCurrency(line.retailPrice)
                                    : "—"}
                                </Button>
                              </div>
                              {line.priceList === "retail" &&
                              (line.retailPrice == null ||
                                line.retailPrice <= 0) ? (
                                <div className="space-y-1">
                                  <Label
                                    htmlFor={`item-retail-${line.variantId}`}
                                    className="text-xs"
                                  >
                                    Enter retail unit price
                                  </Label>
                                  <Input
                                    id={`item-retail-${line.variantId}`}
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    disabled={charging}
                                    className="h-8"
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
                              ) : null}
                            </div>
                          ) : null}

                          <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/20 p-2 text-[11px]">
                            <div>
                              <p className="text-muted-foreground">Line</p>
                              <p className="font-semibold tabular-nums">
                                {formatCurrency(lineTotal)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Paid</p>
                              <p className="font-semibold tabular-nums">
                                {formatCurrency(paidSum)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Left</p>
                              <p
                                className={`font-semibold tabular-nums ${
                                  remaining > 0.01
                                    ? "text-amber-700"
                                    : remaining < -0.01
                                      ? "text-destructive"
                                      : "text-emerald-700"
                                }`}
                              >
                                {formatCurrency(remaining)}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Payments
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={charging}
                                onClick={() => {
                                  const addAmount =
                                    remaining > 0 ? remaining : 0;
                                  setPaymentEditor({
                                    variantId: line.variantId,
                                    payId: null,
                                    draft: createItemPaymentLine(addAmount),
                                  });
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add
                              </Button>
                            </div>

                            {payments.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No payments yet — click Add.
                              </p>
                            ) : (
                              <ul className="space-y-1.5">
                                {payments.map((pay) => {
                                  const account =
                                    tenderNeedsPaymentAccount(
                                      pay.tenderMethod
                                    ) && pay.paymentAccountId
                                      ? paymentAccounts.find(
                                          (a) => a.id === pay.paymentAccountId
                                        )
                                      : null;
                                  return (
                                    <li
                                      key={pay.id}
                                      className="flex items-stretch gap-1"
                                    >
                                      <button
                                        type="button"
                                        disabled={charging}
                                        onClick={() =>
                                          setPaymentEditor({
                                            variantId: line.variantId,
                                            payId: pay.id,
                                            draft: { ...pay },
                                          })
                                        }
                                        className="min-w-0 flex-1 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                              {tenderMethodLabel(
                                                pay.tenderMethod
                                              )}
                                              {account
                                                ? ` · ${account.provider}`
                                                : ""}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                              {formatPaymentLineNote(pay) ??
                                                paymentKindLabel(pay.kind)}
                                            </p>
                                          </div>
                                          <p className="shrink-0 text-sm font-semibold tabular-nums">
                                            {formatCurrency(pay.amount)}
                                          </p>
                                        </div>
                                      </button>
                                      {payments.length > 1 ? (
                                        <Button
                                          type="button"
                                          size="icon-sm"
                                          variant="ghost"
                                          disabled={charging}
                                          className="shrink-0 self-center"
                                          aria-label="Remove payment"
                                          onClick={() =>
                                            updatePayments(
                                              payments.filter(
                                                (p) => p.id !== pay.id
                                              )
                                            )
                                          }
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>

                          {!balanced ? (
                            <p className="text-xs text-destructive">
                              Payments must equal this item&apos;s line total.
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                {missingPaymentAccount ? (
                  <p className="text-sm text-destructive">
                    Select a receiving account for every e-wallet or bank
                    transfer payment.
                  </p>
                ) : null}
                {unbalancedItemPayments || invalidItemPaymentAmount ? (
                  <p className="text-sm text-destructive">
                    Fix payment splits so each item is fully covered.
                  </p>
                ) : null}
              </div>

              </div>

              <aside
                className={
                  isPage
                    ? "space-y-5 lg:sticky lg:top-4"
                    : "space-y-5"
                }
              >
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Amount due</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatCurrency(amountDue)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                  {voucherApplied > 0
                    ? ` · voucher −${formatCurrency(voucherApplied)}`
                    : ""}
                </p>
              </div>

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
              </aside>
            </div>
          ) : (
            <div
              className={
                isPage
                  ? "grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,24rem)] lg:items-start"
                  : "space-y-4"
              }
            >
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

              </div>

              <aside
                className={
                  isPage ? "space-y-4 lg:sticky lg:top-4" : "space-y-4"
                }
              >
              <div className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Channel</span>
                  <span className="font-medium capitalize">
                    {isWholesale ? "Wholesale" : "Shop"}
                  </span>
                </div>
                {!isWholesale ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Price list</span>
                    <span className="font-medium capitalize">
                      {(() => {
                        const lists = paidLines.map((l) => l.priceList);
                        if (lists.length === 0) return "—";
                        const allSame = lists.every((p) => p === lists[0]);
                        return allSame ? lists[0] : "Mixed";
                      })()}
                    </span>
                  </div>
                ) : null}
                <div className="space-y-2 border-t pt-2">
                  <p className="text-muted-foreground">Payments by item</p>
                  {paidLines.map((line) => (
                    <div key={line.variantId} className="space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="min-w-0 font-medium">
                          {line.quantity}× {line.productName}
                          {!isWholesale ? (
                            <span className="ml-1.5 text-xs font-normal capitalize text-muted-foreground">
                              ({line.priceList})
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatCurrency(line.unitPrice * line.quantity)}
                        </span>
                      </div>
                      {(line.payments ?? []).map((pay) => {
                        const account = pay.paymentAccountId
                          ? paymentAccounts.find(
                              (a) => a.id === pay.paymentAccountId
                            )
                          : null;
                        return (
                          <div
                            key={pay.id}
                            className="flex justify-between gap-2 pl-2 text-xs"
                          >
                            <span className="min-w-0">
                              <span className="font-medium">
                                {tenderMethodLabel(pay.tenderMethod)}
                              </span>
                              {formatPaymentLineNote(pay) ? (
                                <span className="ml-1 font-medium text-red-700">
                                  {formatPaymentLineNote(pay)}
                                </span>
                              ) : null}
                              {account ? (
                                <span className="block text-muted-foreground">
                                  {paymentAccountTypeLabel(account.type)} ·{" "}
                                  {account.provider}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {formatCurrency(pay.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
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
              </aside>
            </div>
          )}
    </div>
  );

  const editorDraft = paymentEditor?.draft ?? null;
  const editorExpectedType = editorDraft
    ? accountTypeForTender(editorDraft.tenderMethod)
    : null;
  const editorNeedsAccount = editorDraft
    ? tenderNeedsPaymentAccount(editorDraft.tenderMethod)
    : false;
  const editorAccounts = editorNeedsAccount
    ? paymentAccounts.filter(
        (account) =>
          account.isActive &&
          editorExpectedType != null &&
          account.type === editorExpectedType
      )
    : [];
  const editorAmountValid =
    editorDraft != null &&
    Number.isFinite(editorDraft.amount) &&
    editorDraft.amount > 0;
  const editorAccountValid =
    !editorNeedsAccount ||
    editorAccounts.some(
      (account) => account.id === editorDraft?.paymentAccountId
    );
  const editorCanSave = editorAmountValid && editorAccountValid;

  const patchEditorDraft = (patch: Partial<PosCheckoutPaymentLine>) => {
    setPaymentEditor((prev) =>
      prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev
    );
  };

  const savePaymentEditor = () => {
    if (!paymentEditor || !editorCanSave) return;
    const { variantId, payId, draft } = paymentEditor;
    const line = lines.find((l) => l.variantId === variantId);
    if (!line || line.isFreebie) return;
    const payments = line.payments ?? [];
    const parsed = parseMoneyInput(draft.amountText);
    const amount = parsed ?? draft.amount;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const nextPay: PosCheckoutPaymentLine = {
      ...draft,
      amount,
      amountText: moneyInputText(amount),
      note: draft.note.trim(),
    };
    const next = payId
      ? payments.map((p) => (p.id === payId ? nextPay : p))
      : [...payments, nextPay];
    onLineChange(variantId, { payments: next });
    setPaymentEditor(null);
  };

  const paymentEditorDialog = (
    <Dialog
      open={paymentEditor != null}
      onOpenChange={(next) => {
        if (!next) setPaymentEditor(null);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {paymentEditor?.payId ? "Edit payment" : "Add payment"}
          </DialogTitle>
          <DialogDescription>
            {paymentEditor
              ? (() => {
                  const line = lines.find(
                    (l) => l.variantId === paymentEditor.variantId
                  );
                  if (!line) return "Enter payment details.";
                  return `${line.quantity}× ${line.productName}`;
                })()
              : "Enter payment details."}
          </DialogDescription>
        </DialogHeader>

        {editorDraft ? (
          <div className="space-y-3 py-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-editor-method">Method</Label>
                <Select
                  value={editorDraft.tenderMethod}
                  onValueChange={(value) => {
                    const nextMethod =
                      (value as PosTenderMethod) ?? "cash";
                    const prevType = accountTypeForTender(
                      editorDraft.tenderMethod
                    );
                    const nextType = accountTypeForTender(nextMethod);
                    patchEditorDraft({
                      tenderMethod: nextMethod,
                      paymentAccountId:
                        tenderNeedsPaymentAccount(nextMethod) &&
                        prevType === nextType
                          ? editorDraft.paymentAccountId
                          : null,
                    });
                  }}
                >
                  <SelectTrigger id="pay-editor-method">
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
              <div className="space-y-1.5">
                <Label htmlFor="pay-editor-amount">Amount</Label>
                <Input
                  id="pay-editor-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={editorDraft.amountText}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                    const parsed = parseMoneyInput(raw);
                    patchEditorDraft({
                      amountText: raw,
                      amount: parsed ?? 0,
                    });
                  }}
                  onBlur={() => {
                    const parsed = parseMoneyInput(editorDraft.amountText);
                    if (parsed == null) {
                      patchEditorDraft({ amountText: "", amount: 0 });
                      return;
                    }
                    patchEditorDraft({
                      amount: parsed,
                      amountText: moneyInputText(parsed),
                    });
                  }}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-editor-kind">Type</Label>
                <Select
                  value={editorDraft.kind}
                  onValueChange={(value) =>
                    patchEditorDraft({
                      kind: (value as PosPaymentKind) ?? "full",
                    })
                  }
                >
                  <SelectTrigger id="pay-editor-kind">
                    <SelectValue>
                      {(value) =>
                        value
                          ? paymentKindLabel(value as PosPaymentKind)
                          : null
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {POS_PAYMENT_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {paymentKindLabel(kind)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-editor-note">Note</Label>
                <Input
                  id="pay-editor-note"
                  placeholder={
                    editorDraft.kind === "down_payment"
                      ? "e.g. PAID"
                      : "Optional"
                  }
                  value={editorDraft.note}
                  onChange={(e) =>
                    patchEditorDraft({ note: e.target.value })
                  }
                />
              </div>
            </div>

            {editorNeedsAccount ? (
              <div className="space-y-1.5">
                <Label htmlFor="pay-editor-account">
                  {editorExpectedType === "bank_transfer"
                    ? "Bank account"
                    : "E-wallet account"}
                </Label>
                <Select
                  value={editorDraft.paymentAccountId ?? ""}
                  onValueChange={(value) =>
                    patchEditorDraft({
                      paymentAccountId: value || null,
                    })
                  }
                >
                  <SelectTrigger id="pay-editor-account">
                    <SelectValue placeholder="Select account">
                      {(value) => {
                        if (!value) return null;
                        const account = editorAccounts.find(
                          (a) => a.id === value
                        );
                        return account
                          ? `${account.provider} · ${account.accountName}`
                          : null;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {editorAccounts.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No accounts in Settings
                      </SelectItem>
                    ) : (
                      editorAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.provider} · {account.accountName} ·{" "}
                          {account.accountNumber}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {!editorAccountValid ? (
                  <p className="text-xs text-destructive">
                    Select a receiving account.
                  </p>
                ) : null}
              </div>
            ) : null}

            {!editorAmountValid ? (
              <p className="text-xs text-destructive">
                Enter an amount greater than zero.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPaymentEditor(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!editorCanSave}
            onClick={savePaymentEditor}
          >
            Save payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isPage) {
    return (
      <>
        <div className="flex w-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
          {header}
          {scrollBody}
          {footer}
        </div>
        {paymentEditorDialog}
      </>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (charging) return;
          onOpenChange?.(next);
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton={!charging}
        >
          {header}
          {scrollBody}
          {footer}
        </DialogContent>
      </Dialog>
      {paymentEditorDialog}
    </>
  );
}
