"use client";

import Link from "next/link";
import { CircleHelp, Expand, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PosCartLine } from "@/components/admin/pos-cart";
import type { VariantWithStock } from "@/lib/inventory";
import { resolvePosCatalogThumb } from "@/lib/pos-catalog-list";
import { showCatalogImages, type CatalogImageSource } from "@/lib/products";
import { formatVariantLabel } from "@/lib/product-variants";
import {
  normalizeRetailPrice,
  normalizeWholesalePrice,
  resolveEffectivePrices,
  unitPriceForPaymentMethod,
  type EffectiveSalePrices,
} from "@/lib/product-pricing";
import { formatCurrency } from "@/lib/format";
import type { PosPaymentMethod, Product } from "@/types";

function VariantPriceLabel({
  row,
  isWholesale,
  paymentMethod,
  promoMap,
}: {
  row: VariantWithStock;
  isWholesale: boolean;
  paymentMethod: PosPaymentMethod;
  promoMap: Map<string, EffectiveSalePrices>;
}) {
  const effective = resolveEffectivePrices(row, promoMap, row.id);
  const pricedRow = {
    price: effective.price,
    retailPrice: effective.retailPrice,
  };

  if (isWholesale) {
    const wholesale = normalizeWholesalePrice(row.wholesalePrice);
    return wholesale != null
      ? formatCurrency(wholesale)
      : "Set at checkout";
  }

  const display = unitPriceForPaymentMethod(pricedRow, paymentMethod);
  const catalogDisplay = unitPriceForPaymentMethod(
    {
      price: row.price,
      retailPrice: normalizeRetailPrice(row.retailPrice),
    },
    paymentMethod
  );
  const showStrike =
    effective.onSale &&
    catalogDisplay != null &&
    display != null &&
    catalogDisplay !== display;

  if (display != null) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
        {showStrike ? (
          <span className="text-xs font-normal text-muted-foreground line-through">
            {formatCurrency(catalogDisplay)}
          </span>
        ) : null}
        <span className={effective.onSale ? "text-amber-800" : undefined}>
          {formatCurrency(display)}
        </span>
      </span>
    );
  }

  return paymentMethod === "retail"
    ? "None"
    : formatCurrency(pricedRow.price);
}

function StockBadge({
  stock,
  inCart,
}: {
  stock: number;
  inCart: number;
}) {
  const outOfStock = stock <= 0;
  return (
    <Badge
      variant={outOfStock ? "outline" : "secondary"}
      className="text-xs"
    >
      {outOfStock ? "Out" : inCart > 0 ? `${stock} · ${inCart}` : `${stock}`}
    </Badge>
  );
}

function DisabledReasonHelp({
  reason,
  canCheckOtherBranches,
}: {
  reason: string;
  canCheckOtherBranches: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
            aria-label="Why is this disabled?"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <CircleHelp className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-56 gap-1.5 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <PopoverHeader>
          <PopoverTitle>Unavailable</PopoverTitle>
          <PopoverDescription>
            {reason}
            {canCheckOtherBranches
              ? " Use the search icon to check other branches."
              : ""}
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

/** One POS catalog card per variant — image on all breakpoints. */
export function PosCatalogVariantCard({
  row,
  product,
  catalogImageSource,
  cart,
  findStockBasePath,
  isWholesale,
  paymentMethod,
  promoMap,
  onAdd,
  onPreviewImage,
}: {
  row: VariantWithStock;
  product: Product | undefined;
  catalogImageSource: CatalogImageSource;
  cart: PosCartLine[];
  findStockBasePath: string | null;
  isWholesale: boolean;
  paymentMethod: PosPaymentMethod;
  promoMap: Map<string, EffectiveSalePrices>;
  onAdd: (row: VariantWithStock) => void;
  onPreviewImage: (url: string, title: string) => void;
}) {
  const thumb = resolvePosCatalogThumb(product, row, catalogImageSource);
  const showImage = showCatalogImages(catalogImageSource);
  const variantLabel = formatVariantLabel(row, product?.options ?? []);
  const displayName =
    variantLabel !== "Default"
      ? `${row.productName} — ${variantLabel}`
      : row.productName;
  const effective = resolveEffectivePrices(row, promoMap, row.id);
  const outOfStock = row.stock <= 0;
  const inCart =
    cart.find((line) => line.variantId === row.id)?.quantity ?? 0;
  const findStockHref = findStockBasePath
    ? `${findStockBasePath}?variantId=${encodeURIComponent(row.id)}&productId=${encodeURIComponent(row.productId)}`
    : null;

  const topRightActions =
    (outOfStock ? 1 : 0) + (findStockHref ? 1 : 0);

  return (
    <div className="relative flex min-h-0 flex-row items-stretch gap-3 overflow-hidden rounded-xl border bg-card p-3 sm:min-h-0 sm:flex-col sm:gap-0 sm:p-0">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        {outOfStock ? (
          <DisabledReasonHelp
            reason="Out of stock at this branch, so it can't be added to the cart."
            canCheckOtherBranches={findStockHref != null}
          />
        ) : null}
        {findStockHref ? (
          <Link
            href={findStockHref}
            title="Check other branches"
            aria-label={`Check other branches for ${displayName}`}
            className="inline-flex size-8 items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Search className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {showImage && thumb ? (
        <button
          type="button"
          title="View full image"
          aria-label={`View full image for ${displayName}`}
          className="absolute top-2 left-2 z-10 inline-flex size-8 items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onPreviewImage(thumb, displayName);
          }}
        >
          <Expand className="size-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        disabled={outOfStock}
        onClick={() => onAdd(row)}
        className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch gap-3 text-left transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-col sm:gap-0"
      >
        {showImage ? (
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No image
              </div>
            )}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:p-3">
          <div className="flex flex-col items-stretch gap-1.5 sm:pr-0">
            <p
              className={`text-sm font-medium leading-snug break-words whitespace-normal ${
                topRightActions > 0
                  ? topRightActions > 1
                    ? "pr-20"
                    : "pr-8"
                  : ""
              }`}
            >
              {displayName}
            </p>
            {effective.onSale && effective.promotionName ? (
              <Badge
                variant="outline"
                className="w-fit max-w-full text-[10px] text-amber-700 whitespace-normal"
                title={effective.promotionName}
              >
                {effective.promotionName}
              </Badge>
            ) : null}
          </div>
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <span className="text-sm font-semibold tabular-nums">
              <VariantPriceLabel
                row={row}
                isWholesale={isWholesale}
                paymentMethod={paymentMethod}
                promoMap={promoMap}
              />
            </span>
            <StockBadge stock={row.stock} inCart={inCart} />
          </div>
        </div>
      </button>
    </div>
  );
}
