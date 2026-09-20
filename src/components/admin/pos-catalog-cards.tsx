"use client";

import Link from "next/link";
import { Expand, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PosCartLine } from "@/components/admin/pos-cart";
import type { VariantWithStock } from "@/lib/inventory";
import type { PosCatalogListItem } from "@/lib/pos-catalog-list";
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

function PosSingleVariantCard({
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

  return (
    <div className="relative flex min-h-0 flex-row items-stretch gap-3 overflow-hidden rounded-xl border bg-card p-3 sm:min-h-[140px] sm:flex-col sm:gap-0 sm:p-0">
      {findStockHref ? (
        <Link
          href={findStockHref}
          title="Check other branches"
          aria-label={`Check other branches for ${displayName}`}
          className="absolute top-2 right-2 z-10 inline-flex size-8 items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <Search className="size-3.5" />
        </Link>
      ) : null}
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
          <div className="flex items-start justify-between gap-2">
            <p
              className={`min-w-0 text-sm font-medium leading-snug break-words ${
                findStockHref ? "pr-8" : ""
              }`}
            >
              {displayName}
            </p>
            {effective.onSale && effective.promotionName ? (
              <Badge
                variant="outline"
                className="max-w-[7.5rem] shrink-0 truncate text-[10px] text-amber-700"
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

function VariantRowActions({
  row,
  productId,
  productName,
  product,
  cart,
  findStockBasePath,
  isWholesale,
  paymentMethod,
  promoMap,
  onAdd,
}: {
  row: VariantWithStock;
  productId: string;
  productName: string;
  product: Product | undefined;
  cart: PosCartLine[];
  findStockBasePath: string | null;
  isWholesale: boolean;
  paymentMethod: PosPaymentMethod;
  promoMap: Map<string, EffectiveSalePrices>;
  onAdd: (row: VariantWithStock) => void;
}) {
  const variantLabel = formatVariantLabel(row, product?.options ?? []);
  const label = variantLabel !== "Default" ? variantLabel : "Default";
  const effective = resolveEffectivePrices(row, promoMap, row.id);
  const outOfStock = row.stock <= 0;
  const inCart =
    cart.find((line) => line.variantId === row.id)?.quantity ?? 0;
  const findStockHref = findStockBasePath
    ? `${findStockBasePath}?variantId=${encodeURIComponent(row.id)}&productId=${encodeURIComponent(productId)}`
    : null;

  return (
    <li className="flex items-stretch">
      <button
        type="button"
        disabled={outOfStock}
        onClick={() => onAdd(row)}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{label}</span>
            {effective.onSale && effective.promotionName ? (
              <Badge
                variant="outline"
                className="max-w-[5.5rem] shrink-0 truncate text-[10px] text-amber-700"
                title={effective.promotionName}
              >
                {effective.promotionName}
              </Badge>
            ) : null}
          </div>
          <span className="text-sm font-semibold tabular-nums">
            <VariantPriceLabel
              row={row}
              isWholesale={isWholesale}
              paymentMethod={paymentMethod}
              promoMap={promoMap}
            />
          </span>
        </div>
        <StockBadge stock={row.stock} inCart={inCart} />
      </button>
      {findStockHref ? (
        <Link
          href={findStockHref}
          title="Check other branches"
          aria-label={`Check other branches for ${productName} — ${label}`}
          className="inline-flex shrink-0 items-center justify-center border-l px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Search className="size-3.5" />
        </Link>
      ) : null}
    </li>
  );
}

/** Desktop: one product card with shared image + variant list. */
function PosDesktopGroupedCard({
  productId,
  productName,
  imageUrl,
  variants,
  product,
  cart,
  findStockBasePath,
  isWholesale,
  paymentMethod,
  promoMap,
  onAdd,
  onPreviewImage,
}: {
  productId: string;
  productName: string;
  imageUrl: string;
  variants: VariantWithStock[];
  product: Product | undefined;
  cart: PosCartLine[];
  findStockBasePath: string | null;
  isWholesale: boolean;
  paymentMethod: PosPaymentMethod;
  promoMap: Map<string, EffectiveSalePrices>;
  onAdd: (row: VariantWithStock) => void;
  onPreviewImage: (url: string, title: string) => void;
}) {
  return (
    <div className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="relative">
        <button
          type="button"
          title="View full image"
          aria-label={`View full image for ${productName}`}
          className="absolute top-2 left-2 z-10 inline-flex size-8 items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
          onClick={() => onPreviewImage(imageUrl, productName)}
        >
          <Expand className="size-3.5" />
        </button>
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover object-center"
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 p-3">
        <p className="text-sm font-medium leading-snug break-words">
          {productName}
        </p>
        <ul className="divide-y rounded-lg border bg-muted/30">
          {variants.map((row) => (
            <VariantRowActions
              key={row.id}
              row={row}
              productId={productId}
              productName={productName}
              product={product}
              cart={cart}
              findStockBasePath={findStockBasePath}
              isWholesale={isWholesale}
              paymentMethod={paymentMethod}
              promoMap={promoMap}
              onAdd={onAdd}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PosCatalogListCard({
  item,
  productsById,
  catalogImageSource,
  cart,
  findStockBasePath,
  isWholesale,
  paymentMethod,
  promoMap,
  onAdd,
  onPreviewImage,
}: {
  item: PosCatalogListItem;
  productsById: Map<string, Product>;
  catalogImageSource: CatalogImageSource;
  cart: PosCartLine[];
  findStockBasePath: string | null;
  isWholesale: boolean;
  paymentMethod: PosPaymentMethod;
  promoMap: Map<string, EffectiveSalePrices>;
  onAdd: (row: VariantWithStock) => void;
  onPreviewImage: (url: string, title: string) => void;
}) {
  if (item.kind === "group") {
    const product = productsById.get(item.productId);

    return (
      <>
        <div className="flex flex-col gap-3 sm:hidden">
          {item.variants.map((row) => (
            <PosSingleVariantCard
              key={row.id}
              row={row}
              product={product}
              catalogImageSource={catalogImageSource}
              cart={cart}
              findStockBasePath={findStockBasePath}
              isWholesale={isWholesale}
              paymentMethod={paymentMethod}
              promoMap={promoMap}
              onAdd={onAdd}
              onPreviewImage={onPreviewImage}
            />
          ))}
        </div>
        <div className="hidden sm:block">
          <PosDesktopGroupedCard
            productId={item.productId}
            productName={item.productName}
            imageUrl={item.imageUrl}
            variants={item.variants}
            product={product}
            cart={cart}
            findStockBasePath={findStockBasePath}
            isWholesale={isWholesale}
            paymentMethod={paymentMethod}
            promoMap={promoMap}
            onAdd={onAdd}
            onPreviewImage={onPreviewImage}
          />
        </div>
      </>
    );
  }

  return (
    <PosSingleVariantCard
      row={item.row}
      product={productsById.get(item.row.productId)}
      catalogImageSource={catalogImageSource}
      cart={cart}
      findStockBasePath={findStockBasePath}
      isWholesale={isWholesale}
      paymentMethod={paymentMethod}
      promoMap={promoMap}
      onAdd={onAdd}
      onPreviewImage={onPreviewImage}
    />
  );
}
