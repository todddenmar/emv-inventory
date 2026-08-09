import { normalizeRetailPrice } from "@/lib/product-pricing";
import type { Product, ProductOption, ProductVariant } from "@/types";

export function defaultVariantId(productId: string): string {
  return `default-${productId}`;
}

export function optionValuesKey(optionValues: Record<string, string>): string {
  return Object.entries(optionValues)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join("|");
}

export function cartesianOptionCombos(
  options: ProductOption[]
): Record<string, string>[] {
  const sorted = [...options].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return [{}];

  return sorted.reduce<Record<string, string>[]>(
    (acc, option) => {
      const values = option.values.filter((v) => v.trim());
      if (values.length === 0) return acc;
      const next: Record<string, string>[] = [];
      for (const combo of acc) {
        for (const value of values) {
          next.push({ ...combo, [option.name]: value });
        }
      }
      return next;
    },
    [{}]
  ).filter((combo) => Object.keys(combo).length > 0);
}

export function generateVariantsFromOptions(
  options: ProductOption[],
  existing: ProductVariant[] = []
): ProductVariant[] {
  const combos = cartesianOptionCombos(options);
  if (combos.length === 0) {
    return existing.length > 0
      ? existing
      : [
          {
            id: crypto.randomUUID(),
            sku: "",
            price: 0,
            retailPrice: null,
            optionValues: {},
            imageId: null,
            position: 0,
          },
        ];
  }

  const existingByKey = new Map(
    existing.map((variant) => [
      optionValuesKey(variant.optionValues),
      variant,
    ])
  );

  return combos.map((optionValues, index) => {
    const key = optionValuesKey(optionValues);
    const prev = existingByKey.get(key);
    return {
      id: prev?.id ?? crypto.randomUUID(),
      sku: prev?.sku ?? "",
      price: prev?.price ?? 0,
      retailPrice: prev?.retailPrice ?? null,
      optionValues,
      imageId: prev?.imageId ?? null,
      position: index,
    };
  });
}

export function mergeVariantsOnOptionChange(
  existing: ProductVariant[],
  options: ProductOption[]
): ProductVariant[] {
  return generateVariantsFromOptions(options, existing);
}

export function findVariantById(
  product: Pick<Product, "variants">,
  variantId: string | null | undefined
): ProductVariant | null {
  if (!variantId) return null;
  return product.variants.find((v) => v.id === variantId) ?? null;
}

export function findVariantByOptions(
  product: Pick<Product, "variants">,
  selected: Record<string, string>
): ProductVariant | null {
  const key = optionValuesKey(selected);
  return (
    product.variants.find(
      (variant) => optionValuesKey(variant.optionValues) === key
    ) ?? null
  );
}

export function getDefaultVariant(product: Pick<Product, "variants">): ProductVariant {
  return product.variants[0] ?? {
    id: "missing",
    sku: "",
    price: 0,
    retailPrice: null,
    optionValues: {},
    imageId: null,
    position: 0,
  };
}

export function formatVariantLabel(
  variant: ProductVariant,
  options: ProductOption[] = []
): string {
  if (Object.keys(variant.optionValues).length === 0) {
    return "Default";
  }

  const sorted = [...options].sort((a, b) => a.position - b.position);
  const parts = sorted
    .map((option) => variant.optionValues[option.name])
    .filter(Boolean);

  if (parts.length > 0) return parts.join(" / ");

  return Object.values(variant.optionValues).join(" / ");
}

export function getProductPriceRange(product: Pick<Product, "variants">): {
  min: number;
  max: number;
} {
  const prices = product.variants.map((v) => v.price).filter((p) => p >= 0);
  if (prices.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function migrateLegacyProductVariants(
  productId: string,
  data: {
    price?: number;
    variants?: Array<Partial<ProductVariant>>;
    options?: ProductOption[];
  }
): { options: ProductOption[]; variants: ProductVariant[] } {
  if (Array.isArray(data.variants) && data.variants.length > 0) {
    return {
      options: data.options ?? [],
      variants: data.variants.map((variant, index) => ({
        id: variant.id || defaultVariantId(productId),
        sku: variant.sku ?? "",
        price: Number(variant.price ?? 0),
        retailPrice: normalizeRetailPrice(variant.retailPrice),
        optionValues: variant.optionValues ?? {},
        imageId: variant.imageId ?? null,
        position: variant.position ?? index,
      })),
    };
  }

  return {
    options: [],
    variants: [
      {
        id: defaultVariantId(productId),
        sku: "",
        price: Number(data.price ?? 0),
        retailPrice: null,
        optionValues: {},
        imageId: null,
        position: 0,
      },
    ],
  };
}

export function getLegacyProductPrice(product: Product): number {
  return getDefaultVariant(product).price;
}
