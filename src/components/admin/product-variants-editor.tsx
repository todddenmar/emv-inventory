"use client";

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
import { formatVariantLabel } from "@/lib/product-variants";
import {
  normalizeRetailPrice,
  normalizeWholesalePrice,
} from "@/lib/product-pricing";
import type { ProductImage, ProductOption, ProductVariant } from "@/types";

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

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead className="w-36">SKU</TableHead>
              <TableHead className="w-28">Cash</TableHead>
              <TableHead className="w-28">Retail</TableHead>
              <TableHead className="w-28">Wholesale</TableHead>
              <TableHead className="w-40">Image</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell className="font-medium">
                  {formatVariantLabel(variant, options)}
                </TableCell>
                <TableCell>
                  <Input
                    value={variant.sku}
                    placeholder="SKU"
                    disabled={disabled}
                    onChange={(e) =>
                      updateVariant(variant.id, { sku: e.target.value })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={variant.price}
                    disabled={disabled}
                    onChange={(e) =>
                      updateVariant(variant.id, {
                        price: Number(e.target.value) || 0,
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Optional"
                    value={variant.retailPrice ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      updateVariant(variant.id, {
                        retailPrice: normalizeRetailPrice(
                          e.target.value === "" ? null : Number(e.target.value)
                        ),
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Optional"
                    value={variant.wholesalePrice ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      updateVariant(variant.id, {
                        wholesalePrice: normalizeWholesalePrice(
                          e.target.value === "" ? null : Number(e.target.value)
                        ),
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={variant.imageId ?? "none"}
                    onValueChange={(value) =>
                      updateVariant(variant.id, {
                        imageId: value === "none" ? null : value,
                      })
                    }
                    disabled={disabled || images.length === 0}
                  >
                    <SelectTrigger>
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
                          Image {index + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
