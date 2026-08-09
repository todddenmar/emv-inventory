"use client";

import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import type { PosPaymentMethod } from "@/types";

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

interface PosCartPanelProps {
  lines: PosCartLine[];
  paymentMethod: PosPaymentMethod;
  charging: boolean;
  onPaymentMethodChange: (method: PosPaymentMethod) => void;
  onRetailPriceChange: (variantId: string, retailPrice: number | null) => void;
  onIncrement: (variantId: string) => void;
  onDecrement: (variantId: string) => void;
  onRemove: (variantId: string) => void;
  onClear: () => void;
  onCharge: () => void;
  className?: string;
}

export function PosCartPanel({
  lines,
  paymentMethod,
  charging,
  onPaymentMethodChange,
  onRetailPriceChange,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onCharge,
  className,
}: PosCartPanelProps) {
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );
  const missingRetail =
    paymentMethod === "retail" &&
    lines.some((line) => line.retailPrice == null || line.retailPrice <= 0);
  const canCharge = lines.length > 0 && !missingRetail && !charging;

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

      <div className="space-y-2 border-b px-4 py-3">
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
                value === "retail" ? "Retail" : value === "cash" ? "Cash" : null
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
            : "Uses retail price. Enter it below when missing."}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Tap products to add them to the sale.
          </p>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => {
              const label =
                line.variantLabel && line.variantLabel !== "Default"
                  ? line.variantLabel
                  : null;
              const needsRetailInput =
                paymentMethod === "retail" &&
                (line.retailPrice == null || line.retailPrice <= 0);
              return (
                <li key={line.variantId} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{line.productName}</p>
                      {label ? (
                        <p className="truncate text-sm text-muted-foreground">
                          {label}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                        {paymentMethod === "retail"
                          ? line.retailPrice != null && line.retailPrice > 0
                            ? formatCurrency(line.unitPrice)
                            : "Retail price required"
                          : formatCurrency(line.unitPrice)}
                        {paymentMethod === "retail" &&
                        line.retailPrice != null &&
                        line.retailPrice > 0 ? (
                          <span className="text-muted-foreground/80">
                            {" "}
                            · cash {formatCurrency(line.cashPrice)}
                          </span>
                        ) : null}
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
                          disabled={
                            charging || line.quantity >= line.maxStock
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
                          onClick={() => onRemove(line.variantId)}
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {line.unitPrice > 0
                          ? formatCurrency(line.unitPrice * line.quantity)
                          : "—"}
                      </p>
                    </div>
                  </div>
                  {paymentMethod === "retail" &&
                  (!line.retailFromCatalog ||
                    line.retailPrice == null ||
                    line.retailPrice <= 0) ? (
                    <div className="space-y-1">
                      <Label
                        htmlFor={`retail-${line.variantId}`}
                        className="text-xs"
                      >
                        {needsRetailInput
                          ? "Enter retail price"
                          : "Retail price"}
                      </Label>
                      <Input
                        id={`retail-${line.variantId}`}
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
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t p-4">
        {missingRetail ? (
          <p className="text-sm text-destructive">
            Enter retail price for every item before charging.
          </p>
        ) : null}
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="text-2xl font-bold tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
        <Button
          type="button"
          className="h-12 w-full text-base"
          disabled={!canCharge}
          onClick={onCharge}
        >
          {charging ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Charge {lines.length > 0 && !missingRetail ? formatCurrency(total) : ""}
        </Button>
      </div>
    </div>
  );
}
