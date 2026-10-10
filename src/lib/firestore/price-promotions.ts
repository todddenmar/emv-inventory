import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { pricePromotionConverter } from "@/lib/firestore/converters";
import { createProductPriceLogs } from "@/lib/firestore/price-logs";
import {
  isPricePromotionCurrentlyActive,
  pricePromotionAppliesToBranch,
  type EffectiveSalePrices,
} from "@/lib/product-pricing";
import type {
  PricePromotion,
  PricePromotionItem,
  PricePromotionStatus,
} from "@/types";

function promotionsRef(): CollectionReference<PricePromotion> {
  return collection(getClientDb(), COLLECTIONS.pricePromotions).withConverter(
    pricePromotionConverter
  );
}

export async function getPricePromotions(): Promise<PricePromotion[]> {
  const snapshot = await getDocs(
    query(promotionsRef(), orderBy("createdAt", "desc"))
  );
  return snapshot.docs.map((d) => d.data());
}

export async function getPricePromotion(
  id: string
): Promise<PricePromotion | null> {
  const snap = await getDoc(doc(promotionsRef(), id));
  return snap.exists() ? snap.data() : null;
}

/** Promotions that are active at `now` (status + window). */
export async function getActivePricePromotions(
  now: Date = new Date()
): Promise<PricePromotion[]> {
  const all = await getPricePromotions();
  return all.filter((promo) => isPricePromotionCurrentlyActive(promo, now));
}

export function buildActivePromotionPriceMap(
  promotions: PricePromotion[],
  branchId: string | null | undefined,
  now: Date = new Date()
): Map<string, EffectiveSalePrices> {
  const map = new Map<string, EffectiveSalePrices>();
  for (const promo of promotions) {
    if (!isPricePromotionCurrentlyActive(promo, now)) continue;
    if (!pricePromotionAppliesToBranch(promo, branchId)) continue;
    for (const item of promo.items) {
      if (map.has(item.variantId)) continue;
      map.set(item.variantId, {
        price: item.salePrice,
        retailPrice: item.saleRetailPrice,
        promotionId: promo.id,
        promotionName: promo.name,
      });
    }
  }
  return map;
}

function branchScopesIntersect(
  a: string[] | null,
  b: string[] | null
): boolean {
  if (a == null || b == null) return true;
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

function normalizeBranchIds(branchIds: string[] | null | undefined): string[] | null {
  if (branchIds == null) return null;
  const unique = [...new Set(branchIds.filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("Select at least one branch, or choose all branches");
  }
  return unique;
}

function withBranchScope(note: string, branchScopeLabel?: string | null) {
  return branchScopeLabel ? `${note} (${branchScopeLabel})` : note;
}

function findOverlappingVariantIds(
  existing: PricePromotion[],
  items: PricePromotionItem[],
  startsAt: Date,
  endsAt: Date | null,
  branchIds: string[] | null,
  excludeId?: string
): string[] {
  const candidateIds = new Set(items.map((i) => i.variantId));
  const overlaps = new Set<string>();

  for (const promo of existing) {
    if (excludeId && promo.id === excludeId) continue;
    if (promo.status === "ended") continue;
    if (!branchScopesIntersect(branchIds, promo.branchIds)) continue;

    // Treat as overlapping if windows could both be live at some point.
    const otherStart = promo.startsAt.getTime();
    const otherEnd = promo.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const start = startsAt.getTime();
    const end = endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (start > otherEnd || otherStart > end) continue;

    for (const item of promo.items) {
      if (candidateIds.has(item.variantId)) {
        overlaps.add(item.variantId);
      }
    }
  }

  return [...overlaps];
}

function resolveCreateStatus(
  startsAt: Date,
  now: Date = new Date()
): PricePromotionStatus {
  return startsAt.getTime() > now.getTime() ? "scheduled" : "active";
}

export interface CreatePricePromotionInput {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  items: PricePromotionItem[];
  /** null = all branches. */
  branchIds: string[] | null;
  /** Branch names for price-log notes, e.g. "Main, Mall". Omit for all branches. */
  branchScopeLabel?: string | null;
  createdBy: string;
  createdByName: string | null;
}

export async function createPricePromotion(
  input: CreatePricePromotionInput
): Promise<string> {
  if (!input.name.trim()) {
    throw new Error("Promotion name is required");
  }
  if (input.items.length === 0) {
    throw new Error("Add at least one variant");
  }
  for (const item of input.items) {
    if (!Number.isFinite(item.salePrice) || item.salePrice < 0) {
      throw new Error(`Invalid sale cash price for ${item.productName}`);
    }
  }

  const branchIds = normalizeBranchIds(input.branchIds);
  const existing = await getPricePromotions();
  const overlaps = findOverlappingVariantIds(
    existing,
    input.items,
    input.startsAt,
    input.endsAt,
    branchIds
  );
  if (overlaps.length > 0) {
    throw new Error(
      `Some variants already have an overlapping promotion (${overlaps.length}). End or adjust the other sale first.`
    );
  }

  const status = resolveCreateStatus(input.startsAt);
  const docRef = await addDoc(
    collection(getClientDb(), COLLECTIONS.pricePromotions),
    {
      name: input.name.trim(),
      status,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      items: input.items,
      itemCount: input.items.length,
      branchIds,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      endedAt: null,
    }
  );

  await createProductPriceLogs(
    input.items.map((item) => {
      const previousPrice = item.basePrice;
      const newPrice = item.salePrice;
      const delta = newPrice - previousPrice;
      return {
        productId: item.productId,
        productName: item.productName,
        variantId: item.variantId,
        variantLabel: item.productName,
        previousPrice,
        newPrice,
        delta,
        direction: (delta >= 0 ? "increase" : "decrease") as
          | "increase"
          | "decrease",
        performedBy: input.createdBy,
        performedByName: input.createdByName,
        note: withBranchScope(
          `Sale started: ${input.name.trim()}`,
          branchIds ? input.branchScopeLabel : null
        ),
        promotionId: docRef.id,
      };
    })
  );

  return docRef.id;
}

function promotionPriceLogEntries(
  items: PricePromotionItem[],
  previousByVariant: Map<string, PricePromotionItem> | null,
  actor: { performedBy: string; performedByName: string | null },
  note: string,
  promotionId: string
) {
  return items
    .filter((item) => {
      if (!previousByVariant) return true;
      const prev = previousByVariant.get(item.variantId);
      if (!prev) return true;
      return prev.salePrice !== item.salePrice;
    })
    .map((item) => {
      const prev = previousByVariant?.get(item.variantId);
      const previousPrice = prev ? prev.salePrice : item.basePrice;
      const newPrice = item.salePrice;
      const delta = newPrice - previousPrice;
      return {
        productId: item.productId,
        productName: item.productName,
        variantId: item.variantId,
        variantLabel: item.productName,
        previousPrice,
        newPrice,
        delta,
        direction: (delta >= 0 ? "increase" : "decrease") as
          | "increase"
          | "decrease",
        performedBy: actor.performedBy,
        performedByName: actor.performedByName,
        note,
        promotionId,
      };
    });
}

function validatePromotionItems(items: PricePromotionItem[]) {
  if (items.length === 0) {
    throw new Error("Add at least one variant");
  }
  for (const item of items) {
    if (!Number.isFinite(item.salePrice) || item.salePrice < 0) {
      throw new Error(`Invalid sale cash price for ${item.productName}`);
    }
  }
}

export interface UpdatePricePromotionInput {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  items: PricePromotionItem[];
  /** null = all branches. */
  branchIds: string[] | null;
  branchScopeLabel?: string | null;
  performedBy: string;
  performedByName: string | null;
}

export async function updatePricePromotion(
  id: string,
  input: UpdatePricePromotionInput
): Promise<void> {
  if (!input.name.trim()) {
    throw new Error("Promotion name is required");
  }
  validatePromotionItems(input.items);

  const existing = await getPricePromotion(id);
  if (!existing) {
    throw new Error("Promotion not found");
  }

  const branchIds = normalizeBranchIds(input.branchIds);
  const all = await getPricePromotions();
  const overlaps = findOverlappingVariantIds(
    all,
    input.items,
    input.startsAt,
    input.endsAt,
    branchIds,
    id
  );
  if (overlaps.length > 0) {
    throw new Error(
      `Some variants already have an overlapping promotion (${overlaps.length}). End or adjust the other sale first.`
    );
  }

  const wasEnded = existing.status === "ended" || existing.endedAt != null;
  const nextStatus = resolveCreateStatus(input.startsAt);
  const name = input.name.trim();
  const previousByVariant = new Map(
    existing.items.map((item) => [item.variantId, item])
  );

  await updateDoc(doc(getClientDb(), COLLECTIONS.pricePromotions, id), {
    name,
    status: nextStatus,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    items: input.items,
    itemCount: input.items.length,
    branchIds,
    endedAt: null,
    updatedAt: serverTimestamp(),
  });
  const scopeLabel = branchIds ? input.branchScopeLabel : null;

  const wasLive = isPricePromotionCurrentlyActive(existing);
  const willBeLive = isPricePromotionCurrentlyActive({
    status: nextStatus,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });

  const actor = {
    performedBy: input.performedBy,
    performedByName: input.performedByName,
  };

  if (wasEnded || (!wasLive && willBeLive)) {
    const logs = promotionPriceLogEntries(
      input.items,
      null,
      actor,
      withBranchScope(`Sale started: ${name}`, scopeLabel),
      id
    );
    if (logs.length > 0) await createProductPriceLogs(logs);
    return;
  }

  if (wasLive && willBeLive) {
    const logs = promotionPriceLogEntries(
      input.items,
      previousByVariant,
      actor,
      withBranchScope(`Sale updated: ${name}`, scopeLabel),
      id
    );
    if (logs.length > 0) await createProductPriceLogs(logs);
  }
}

export async function updatePricePromotionBranches(
  id: string,
  branchIds: string[] | null
): Promise<void> {
  const existing = await getPricePromotion(id);
  if (!existing) {
    throw new Error("Promotion not found");
  }

  const normalized = normalizeBranchIds(branchIds);
  const finished =
    existing.status === "ended" ||
    (existing.endsAt != null && existing.endsAt.getTime() < Date.now());
  if (!finished) {
    const all = await getPricePromotions();
    const overlaps = findOverlappingVariantIds(
      all,
      existing.items,
      existing.startsAt,
      existing.endsAt,
      normalized,
      id
    );
    if (overlaps.length > 0) {
      throw new Error(
        `Some variants already have an overlapping promotion at those branches (${overlaps.length}). End or adjust the other sale first.`
      );
    }
  }

  await updateDoc(doc(getClientDb(), COLLECTIONS.pricePromotions, id), {
    branchIds: normalized,
    updatedAt: serverTimestamp(),
  });
}

export async function endPricePromotion(
  id: string,
  actor: { performedBy: string; performedByName?: string | null }
): Promise<void> {
  const existing = await getPricePromotion(id);
  if (!existing) {
    throw new Error("Promotion not found");
  }
  if (existing.status === "ended") {
    return;
  }

  await updateDoc(doc(getClientDb(), COLLECTIONS.pricePromotions, id), {
    status: "ended",
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await createProductPriceLogs(
    existing.items.map((item) => {
      const previousPrice = item.salePrice;
      const newPrice = item.basePrice;
      const delta = newPrice - previousPrice;
      return {
        productId: item.productId,
        productName: item.productName,
        variantId: item.variantId,
        variantLabel: item.productName,
        previousPrice,
        newPrice,
        delta,
        direction: (delta >= 0 ? "increase" : "decrease") as
          | "increase"
          | "decrease",
        performedBy: actor.performedBy,
        performedByName: actor.performedByName ?? null,
        note: `Sale ended: ${existing.name}`,
        promotionId: existing.id,
      };
    })
  );
}
