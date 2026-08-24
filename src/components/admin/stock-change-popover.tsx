"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type StockChangeMode = "set" | "add" | "remove";

interface StockChangePopoverProps {
  previousStock: number;
  saving?: boolean;
  disabled?: boolean;
  onSave: (nextStock: number) => Promise<boolean>;
}

const MODE_OPTIONS: { value: StockChangeMode; label: string }[] = [
  { value: "add", label: "Add" },
  { value: "remove", label: "Remove" },
  { value: "set", label: "Set" },
];

export function StockChangePopover({
  previousStock,
  saving = false,
  disabled = false,
  onSave,
}: StockChangePopoverProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StockChangeMode>("add");
  const [value, setValue] = useState<number | "">("");

  useEffect(() => {
    if (!open) return;
    setMode("add");
    setValue("");
  }, [open, previousStock]);

  useEffect(() => {
    if (!open) return;
    if (mode === "set") {
      setValue(previousStock);
    } else {
      setValue("");
    }
  }, [mode, open, previousStock]);

  const amount = value === "" ? null : value;

  const nextStock = useMemo(() => {
    if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
    if (mode === "set") return amount;
    if (mode === "add") return previousStock + amount;
    return Math.max(0, previousStock - amount);
  }, [amount, mode, previousStock]);

  const delta = nextStock == null ? null : nextStock - previousStock;
  const canSave =
    nextStock != null &&
    Number.isFinite(nextStock) &&
    nextStock >= 0 &&
    nextStock !== previousStock;

  const inputLabel =
    mode === "set"
      ? "New stock"
      : mode === "add"
        ? "Amount to add"
        : "Amount to remove";

  const handleSave = async () => {
    if (nextStock == null || !canSave) return;
    const ok = await onSave(nextStock);
    if (ok) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || saving}
          />
        }
      >
        <Pencil className="h-3.5 w-3.5" />
        Change
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>Change stock</PopoverTitle>
          <PopoverDescription>
            Set a new total, or add/remove units from the current stock.
          </PopoverDescription>
        </PopoverHeader>

        <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              onClick={() => setMode(option.value)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                mode === option.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border bg-muted/40 px-2.5 py-2">
            <p className="text-xs text-muted-foreground">Previous</p>
            <p className="mt-0.5 font-semibold tabular-nums">{previousStock}</p>
          </div>
          <div className="rounded-md border bg-muted/40 px-2.5 py-2">
            <p className="text-xs text-muted-foreground">New stock</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {nextStock == null ? "—" : nextStock}
            </p>
          </div>
        </div>

        <div className="rounded-md border bg-muted/40 px-2.5 py-2 text-sm">
          <p className="text-xs text-muted-foreground">Change</p>
          <p
            className={cn(
              "mt-0.5 font-semibold tabular-nums",
              delta == null || delta === 0
                ? "text-muted-foreground"
                : delta > 0
                  ? "text-emerald-700"
                  : "text-red-700"
            )}
          >
            {delta == null ? "—" : delta > 0 ? `+${delta}` : String(delta)}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stock-change-amount">{inputLabel}</Label>
          <Input
            id="stock-change-amount"
            type="number"
            min={0}
            inputMode="numeric"
            value={value}
            disabled={saving}
            autoFocus
            placeholder={mode === "set" ? String(previousStock) : "0"}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setValue("");
                return;
              }
              const next = Number(raw);
              if (!Number.isFinite(next) || next < 0) return;
              setValue(Math.floor(next));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
          />
          {mode === "remove" &&
          amount != null &&
          amount > previousStock ? (
            <p className="text-xs text-muted-foreground">
              Remove is capped at current stock (new stock will be 0).
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave || saving}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
