"use client";

import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

export interface PosCartLine {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  maxStock: number;
}

interface PosCartPanelProps {
  lines: PosCartLine[];
  charging: boolean;
  onIncrement: (variantId: string) => void;
  onDecrement: (variantId: string) => void;
  onRemove: (variantId: string) => void;
  onClear: () => void;
  onCharge: () => void;
  className?: string;
}

export function PosCartPanel({
  lines,
  charging,
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
              const label =
                line.variantLabel && line.variantLabel !== "Default"
                  ? line.variantLabel
                  : null;
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
                      {formatCurrency(line.unitPrice)}
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
                      {formatCurrency(line.unitPrice * line.quantity)}
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
          <span className="text-muted-foreground">Total</span>
          <span className="text-2xl font-bold tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
        <Button
          type="button"
          className="h-12 w-full text-base"
          disabled={charging || lines.length === 0}
          onClick={onCharge}
        >
          {charging ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Charge {lines.length > 0 ? formatCurrency(total) : ""}
        </Button>
      </div>
    </div>
  );
}
