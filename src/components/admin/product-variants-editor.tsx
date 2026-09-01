"use client";

import { useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/product-variants";
import {
  normalizeRetailPrice,
  normalizeWholesalePrice,
} from "@/lib/product-pricing";
import { moneyInputText, parseMoneyInput } from "@/lib/pos-payments";
import type { ProductImage, ProductOption, ProductVariant } from "@/types";

const moneyInputClass = "h-9 min-w-[7.5rem] tabular-nums";

interface ProductVariantsEditorProps {
  variants: ProductVariant[];
  options: ProductOption[];
  images: ProductImage[];
  onChange: (variants: ProductVariant[]) => void;
  disabled?: boolean;
}

export function ProductVariantsEditor({
  variants,
  options,
  images,
  onChange,
  disabled,
}: ProductVariantsEditorProps) {
  const updateVariant = (id: string, patch: Partial<ProductVariant>) => {
    onChange(
      variants.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant
      )
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Variants</Label>
        <p className="text-xs text-muted-foreground">
          Set SKU, cash, retail, and optional wholesale pricing, and optional image
          per variant.
        </p>
      </div>

      <div className="space-y-3 lg:hidden">
        {variants.map((variant) => (
          <div
            key={variant.id}
            className="space-y-3 rounded-md border p-3"
          >
            <p className="font-medium">
              {formatVariantLabel(variant, options)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">SKU</Label>
                <SkuField
                  variant={variant}
                  disabled={disabled}
                  onChange={(sku) => updateVariant(variant.id, { sku })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cash</Label>
                <CashField
                  variant={variant}
                  disabled={disabled}
                  onChange={(price) => updateVariant(variant.id, { price })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Retail</Label>
                <RetailField
                  variant={variant}
                  disabled={disabled}
                  onChange={(retailPrice) =>
                    updateVariant(variant.id, { retailPrice })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Wholesale
                </Label>
                <WholesaleField
                  variant={variant}
                  disabled={disabled}
                  onChange={(wholesalePrice) =>
                    updateVariant(variant.id, { wholesalePrice })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Image</Label>
                <VariantImageField
                  variant={variant}
                  images={images}
                  disabled={disabled}
                  onChange={(imageId) => updateVariant(variant.id, { imageId })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-md border lg:block">
        <Table className="min-w-[60rem] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[14%]">Variant</TableHead>
              <TableHead className="w-[16%]">SKU</TableHead>
              <TableHead className="w-[14%]">Cash</TableHead>
              <TableHead className="w-[14%]">Retail</TableHead>
              <TableHead className="w-[14%]">Wholesale</TableHead>
              <TableHead className="w-[28%]">Image</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell className="font-medium whitespace-normal">
                  {formatVariantLabel(variant, options)}
                </TableCell>
                <TableCell>
                  <SkuField
                    variant={variant}
                    disabled={disabled}
                    onChange={(sku) => updateVariant(variant.id, { sku })}
                  />
                </TableCell>
                <TableCell>
                  <CashField
                    variant={variant}
                    disabled={disabled}
                    onChange={(price) => updateVariant(variant.id, { price })}
                  />
                </TableCell>
                <TableCell>
                  <RetailField
                    variant={variant}
                    disabled={disabled}
                    onChange={(retailPrice) =>
                      updateVariant(variant.id, { retailPrice })
                    }
                  />
                </TableCell>
                <TableCell>
                  <WholesaleField
                    variant={variant}
                    disabled={disabled}
                    onChange={(wholesalePrice) =>
                      updateVariant(variant.id, { wholesalePrice })
                    }
                  />
                </TableCell>
                <TableCell>
                  <VariantImageField
                    variant={variant}
                    images={images}
                    disabled={disabled}
                    onChange={(imageId) =>
                      updateVariant(variant.id, { imageId })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SkuField({
  variant,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  disabled?: boolean;
  onChange: (sku: string) => void;
}) {
  return (
    <Input
      value={variant.sku}
      placeholder="SKU"
      disabled={disabled}
      className="h-9 min-w-[8rem]"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function isMoneyDraft(raw: string): boolean {
  return raw === "" || /^\d*\.?\d*$/.test(raw);
}

function VariantMoneyField({
  variantId,
  amount,
  optional,
  disabled,
  placeholder,
  onCommit,
}: {
  variantId: string;
  amount: number | null;
  optional?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onCommit: (value: number | null) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() =>
    amount == null ? "" : moneyInputText(amount)
  );

  useEffect(() => {
    if (focused) return;
    setText(amount == null ? "" : moneyInputText(amount));
  }, [amount, focused, variantId]);

  const commit = (raw: string) => {
    if (raw.trim() === "") {
      onCommit(optional ? null : 0);
      return;
    }
    const parsed = parseMoneyInput(raw);
    if (parsed == null) {
      onCommit(optional ? null : 0);
      return;
    }
    onCommit(optional ? normalizeRetailPrice(parsed) : parsed);
  };

  return (
    <Input
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      className={moneyInputClass}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit(text);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!isMoneyDraft(raw)) return;
        setText(raw);
        if (raw.endsWith(".")) return;
        commit(raw);
      }}
    />
  );
}

function CashField({
  variant,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  disabled?: boolean;
  onChange: (price: number) => void;
}) {
  return (
    <VariantMoneyField
      variantId={variant.id}
      amount={variant.price}
      disabled={disabled}
      onCommit={(value) => onChange(value ?? 0)}
    />
  );
}

function RetailField({
  variant,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  disabled?: boolean;
  onChange: (retailPrice: number | null) => void;
}) {
  return (
    <VariantMoneyField
      variantId={variant.id}
      amount={variant.retailPrice}
      optional
      disabled={disabled}
      placeholder="Optional"
      onCommit={(value) => onChange(normalizeRetailPrice(value))}
    />
  );
}

function WholesaleField({
  variant,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  disabled?: boolean;
  onChange: (wholesalePrice: number | null) => void;
}) {
  return (
    <VariantMoneyField
      variantId={variant.id}
      amount={variant.wholesalePrice}
      optional
      disabled={disabled}
      placeholder="Optional"
      onCommit={(value) => onChange(normalizeWholesalePrice(value))}
    />
  );
}

function VariantImageField({
  variant,
  images,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  images: ProductImage[];
  disabled?: boolean;
  onChange: (imageId: string | null) => void;
}) {
  const selected = images.find((img) => img.id === variant.imageId);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {selected ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={selected.url}
          alt=""
          className="size-9 shrink-0 rounded-md border bg-muted object-cover object-center"
        />
      ) : (
        <div className="size-9 shrink-0 rounded-md border bg-muted" />
      )}
      <Select
        value={variant.imageId ?? "none"}
        onValueChange={(value) => onChange(value === "none" ? null : value)}
        disabled={disabled || images.length === 0}
      >
        <SelectTrigger className={cn("h-9 min-w-0 flex-1")}>
          <SelectValue placeholder="Image">
            {(value) => {
              if (!value || value === "none") return "None";
              const image = images.find((img) => img.id === value);
              return image
                ? `Image ${images.findIndex((img) => img.id === value) + 1}`
                : "None";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {images.map((image, index) => (
            <SelectItem key={image.id} value={image.id}>
              <span className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="size-6 rounded object-cover object-center"
                />
                Image {index + 1}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
