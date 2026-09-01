import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { productPriceLogConverter } from "@/lib/firestore/converters";
import { formatVariantLabel } from "@/lib/product-variants";
import { roundMoney } from "@/lib/pos-payments";
import type {
  Product,
  ProductOption,
  ProductPriceLog,
  ProductVariant,
} from "@/types";

export interface PriceChangeActor {
  performedBy: string;
  performedByName?: string | null;
}

export function diffVariantPriceChanges(
  productId: string,
  productName: string,
  previousVariants: ProductVariant[],
  nextVariants: ProductVariant[],
  options: ProductOption[],
  actor: PriceChangeActor
): Omit<ProductPriceLog, "id" | "createdAt">[] {
  const previousById = new Map(previousVariants.map((v) => [v.id, v]));
  const changes: Omit<ProductPriceLog, "id" | "createdAt">[] = [];

  for (const next of nextVariants) {
    const previous = previousById.get(next.id);
    if (!previous) continue;

    const previousPrice = roundMoney(Number(previous.price ?? 0));
    const newPrice = roundMoney(Number(next.price ?? 0));
    if (previousPrice === newPrice) continue;

    const delta = newPrice - previousPrice;
    changes.push({
      productId,
      productName,
      variantId: next.id,
      variantLabel: formatVariantLabel(next, options),
      previousPrice,
      newPrice,
      delta,
      direction: delta > 0 ? "increase" : "decrease",
      performedBy: actor.performedBy,
      performedByName: actor.performedByName ?? null,
      note: null,
      promotionId: null,
    });
  }

  return changes;
}

export async function createProductPriceLogs(
  logs: Omit<ProductPriceLog, "id" | "createdAt">[]
): Promise<void> {
  if (logs.length === 0) return;

  const db = getClientDb();
  await Promise.all(
    logs.map((log) =>
      addDoc(collection(db, COLLECTIONS.productPriceLogs), {
        ...log,
        createdAt: serverTimestamp(),
      })
    )
  );
}

export async function logProductPriceChangesFromUpdate(
  existing: Product,
  nextVariants: ProductVariant[] | undefined,
  nextOptions: ProductOption[] | undefined,
  nextName: string | undefined,
  actor: PriceChangeActor
): Promise<number> {
  if (!nextVariants) return 0;

  const changes = diffVariantPriceChanges(
    existing.id,
    nextName ?? existing.name,
    existing.variants,
    nextVariants,
    nextOptions ?? existing.options,
    actor
  );

  await createProductPriceLogs(changes);
  return changes.length;
}

export async function getProductPriceLogs(options?: {
  productId?: string | null;
  max?: number;
}): Promise<ProductPriceLog[]> {
  const ref = collection(
    getClientDb(),
    COLLECTIONS.productPriceLogs
  ).withConverter(productPriceLogConverter);
  const max = options?.max ?? 100;

  const q = options?.productId
    ? query(
        ref,
        where("productId", "==", options.productId),
        orderBy("createdAt", "desc"),
        limit(max)
      )
    : query(ref, orderBy("createdAt", "desc"), limit(max));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}
