import { formatCurrency } from "@/lib/format";
import { isProductOnSale } from "@/lib/product-pricing";
import { cn } from "@/lib/utils";

interface ProductPriceProps {
  price: number;
  compareAtPrice?: number | null;
  className?: string;
  priceClassName?: string;
  compareClassName?: string;
  layout?: "inline" | "stacked";
}

export function ProductPrice({
  price,
  compareAtPrice = null,
  className,
  priceClassName,
  compareClassName,
  layout = "inline",
}: ProductPriceProps) {
  const onSale = isProductOnSale({ price, compareAtPrice });

  if (!onSale) {
    return (
      <span className={cn("font-semibold", priceClassName, className)}>
        {formatCurrency(price)}
      </span>
    );
  }

  return (
    <div
      className={cn(
        layout === "stacked" ? "flex flex-col gap-0.5" : "flex flex-wrap items-baseline gap-2",
        className
      )}
    >
      <span className={cn("font-semibold", priceClassName)}>
        {formatCurrency(price)}
      </span>
      <span
        className={cn(
          "text-sm text-muted-foreground line-through",
          compareClassName
        )}
      >
        {formatCurrency(compareAtPrice!)}
      </span>
    </div>
  );
}
