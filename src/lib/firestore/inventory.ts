import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { branchInventoryConverter } from "@/lib/firestore/converters";
import { defaultVariantId } from "@/lib/product-variants";
import { normalizeRetailPrice } from "@/lib/product-pricing";
import { roundMoney } from "@/lib/pos-payments";
import type { BranchInventory, InventoryLogReason, Product } from "@/types";

export function inventoryDocId(branchId: string, variantId: string): string {
  return `${branchId}_${variantId}`;
}

function inventoryRef(branchId: string, variantId: string) {
  return doc(
    getClientDb(),
    COLLECTIONS.branchInventory,
    inventoryDocId(branchId, variantId)
  ).withConverter(branchInventoryConverter);
}

export interface StockChangeContext {
  branchId: string;
  productId: string;
  variantId: string;
  productName?: string | null;
  branchName?: string | null;
  reason: InventoryLogReason;
  referenceId?: string | null;
  referenceLabel?: string | null;
  performedBy: string;
  performedByName?: string | null;
}

function resolveVariantId(
  data: Record<string, unknown> | undefined,
  docId: string,
  productId: string
): string {
  if (data?.variantId && typeof data.variantId === "string") {
    return data.variantId;
  }

  const suffix = docId.startsWith(`${data?.branchId}_`)
    ? docId.slice(String(data?.branchId).length + 1)
    : docId.split("_").slice(1).join("_");

  if (suffix && suffix !== productId) {
    return suffix;
  }

  return defaultVariantId(productId);
}

export async function getBranchInventory(
  branchId: string
): Promise<BranchInventory[]> {
  const q = query(
    collection(getClientDb(), COLLECTIONS.branchInventory).withConverter(
      branchInventoryConverter
    ),
    where("branchId", "==", branchId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      variantId: resolveVariantId(
        d.data() as unknown as Record<string, unknown>,
        d.id,
        data.productId
      ),
    };
  });
}

export async function getAllBranchInventory(): Promise<BranchInventory[]> {
  const snapshot = await getDocs(
    collection(getClientDb(), COLLECTIONS.branchInventory).withConverter(
      branchInventoryConverter
    )
  );
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      variantId: resolveVariantId(
        d.data() as unknown as Record<string, unknown>,
        d.id,
        data.productId
      ),
    };
  });
}

export async function getBranchVariantStock(
  branchId: string,
  variantId: string
): Promise<BranchInventory | null> {
  const snap = await getDoc(inventoryRef(branchId, variantId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    ...data,
    variantId: resolveVariantId(
      snap.data() as unknown as Record<string, unknown>,
      snap.id,
      data.productId
    ),
  };
}

/** @deprecated Use getBranchVariantStock */
export async function getBranchProductStock(
  branchId: string,
  productId: string
): Promise<BranchInventory | null> {
  return getBranchVariantStock(branchId, defaultVariantId(productId));
}

async function applyStockDelta(
  delta: number,
  lowStockThreshold: number | undefined,
  ctx: StockChangeContext
): Promise<void> {
  if (delta === 0) return;

  const db = getClientDb();
  const invId = inventoryDocId(ctx.branchId, ctx.variantId);
  const invRef = doc(db, COLLECTIONS.branchInventory, invId).withConverter(
    branchInventoryConverter
  );
  const logRef = doc(collection(db, COLLECTIONS.inventoryLogs));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(invRef);
    const previousStock = snap.exists() ? (snap.data()?.stock ?? 0) : 0;
    const threshold = snap.exists()
      ? (snap.data()?.lowStockThreshold ?? 5)
      : (lowStockThreshold ?? 5);
    const newStock = previousStock + delta;

    if (newStock < 0) {
      throw new Error("Insufficient stock");
    }

    if (snap.exists()) {
      tx.update(invRef, {
        stock: newStock,
        isSelling: true,
        ...(lowStockThreshold !== undefined
          ? { lowStockThreshold }
          : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(invRef, {
        id: invId,
        branchId: ctx.branchId,
        productId: ctx.productId,
        variantId: ctx.variantId,
        stock: newStock,
        lowStockThreshold: threshold,
        isSelling: true,
        cashPrice: null,
        retailPrice: null,
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(logRef, {
      branchId: ctx.branchId,
      branchName: ctx.branchName ?? null,
      productId: ctx.productId,
      variantId: ctx.variantId,
      productName: ctx.productName ?? null,
      delta,
      previousStock,
      newStock,
      reason: ctx.reason,
      referenceId: ctx.referenceId ?? null,
      referenceLabel: ctx.referenceLabel ?? null,
      performedBy: ctx.performedBy,
      performedByName: ctx.performedByName ?? null,
      createdAt: serverTimestamp(),
    });
  });
}

export async function setBranchStockWithLog(
  branchId: string,
  productId: string,
  variantId: string,
  stock: number,
  lowStockThreshold: number,
  ctx: Omit<StockChangeContext, "branchId" | "productId" | "variantId" | "reason"> & {
    reason?: InventoryLogReason;
  }
): Promise<void> {
  const current = await getBranchVariantStock(branchId, variantId);
  const previousStock = current?.stock ?? 0;
  const delta = stock - previousStock;

  if (delta === 0 && current?.lowStockThreshold === lowStockThreshold) {
    return;
  }

  if (delta === 0) {
    const db = getClientDb();
    const invRef = doc(
      db,
      COLLECTIONS.branchInventory,
      inventoryDocId(branchId, variantId)
    ).withConverter(branchInventoryConverter);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(invRef);
      if (snap.exists()) {
        tx.update(invRef, {
          lowStockThreshold,
          isSelling: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(invRef, {
          id: inventoryDocId(branchId, variantId),
          branchId,
          productId,
          variantId,
          stock,
          lowStockThreshold,
          isSelling: true,
          cashPrice: null,
          retailPrice: null,
          updatedAt: serverTimestamp(),
        });
      }
    });
    return;
  }

  await applyStockDelta(delta, lowStockThreshold, {
    branchId,
    productId,
    variantId,
    reason: ctx.reason ?? "manual_adjustment",
    ...ctx,
  });
}

export async function decrementBranchStock(
  branchId: string,
  productId: string,
  variantId: string,
  quantity: number,
  ctx: Omit<StockChangeContext, "branchId" | "productId" | "variantId" | "reason"> & {
    reason?: InventoryLogReason;
  }
): Promise<void> {
  await applyStockDelta(-quantity, undefined, {
    branchId,
    productId,
    variantId,
    reason: ctx.reason ?? "manual_adjustment",
    ...ctx,
  });
}

export async function incrementBranchStock(
  branchId: string,
  productId: string,
  variantId: string,
  quantity: number,
  ctx: Omit<StockChangeContext, "branchId" | "productId" | "variantId" | "reason"> & {
    reason?: InventoryLogReason;
  }
): Promise<void> {
  await applyStockDelta(quantity, undefined, {
    branchId,
    productId,
    variantId,
    reason: ctx.reason ?? "manual_adjustment",
    ...ctx,
  });
}

export function buildVariantStockMap(
  inventory: BranchInventory[]
): Record<string, number> {
  return Object.fromEntries(inventory.map((i) => [i.variantId, i.stock]));
}

export async function getInventoryForProduct(
  productId: string
): Promise<BranchInventory[]> {
  const snapshot = await getDocs(
    query(
      collection(getClientDb(), COLLECTIONS.branchInventory).withConverter(
        branchInventoryConverter
      ),
      where("productId", "==", productId)
    )
  );
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      variantId: resolveVariantId(
        d.data() as unknown as Record<string, unknown>,
        d.id,
        data.productId
      ),
    };
  });
}

export async function setBranchVariantPrices(input: {
  branchId: string;
  productId: string;
  variantId: string;
  cashPrice?: number | null;
  retailPrice?: number | null;
}): Promise<void> {
  const db = getClientDb();
  const invId = inventoryDocId(input.branchId, input.variantId);
  const invRef = doc(db, COLLECTIONS.branchInventory, invId).withConverter(
    branchInventoryConverter
  );

  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (input.cashPrice !== undefined) {
    patch.cashPrice =
      input.cashPrice == null || !Number.isFinite(input.cashPrice)
        ? null
        : roundMoney(Math.max(0, input.cashPrice));
  }
  if (input.retailPrice !== undefined) {
    patch.retailPrice = normalizeRetailPrice(input.retailPrice);
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(invRef);
    if (snap.exists()) {
      tx.update(invRef, patch);
      return;
    }

    tx.set(invRef, {
      id: invId,
      branchId: input.branchId,
      productId: input.productId,
      variantId: input.variantId,
      stock: 0,
      lowStockThreshold: 5,
      isSelling: false,
      cashPrice:
        input.cashPrice === undefined
          ? null
          : input.cashPrice == null || !Number.isFinite(input.cashPrice)
            ? null
            : roundMoney(Math.max(0, input.cashPrice)),
      retailPrice:
        input.retailPrice === undefined
          ? null
          : normalizeRetailPrice(input.retailPrice),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setVariantSelling(
  branchId: string,
  productId: string,
  variantId: string,
  isSelling: boolean
): Promise<void> {
  const db = getClientDb();
  const invId = inventoryDocId(branchId, variantId);
  const invRef = doc(db, COLLECTIONS.branchInventory, invId).withConverter(
    branchInventoryConverter
  );

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(invRef);
    if (snap.exists()) {
      tx.update(invRef, {
        isSelling,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    tx.set(invRef, {
      id: invId,
      branchId,
      productId,
      variantId,
      stock: 0,
      lowStockThreshold: 5,
      isSelling,
      cashPrice: null,
      retailPrice: null,
      updatedAt: serverTimestamp(),
    });
  });
}

export interface VariantSellingTarget {
  productId: string;
  variantId: string;
}

export async function setVariantsSellingBulk(
  branchId: string,
  targets: VariantSellingTarget[],
  isSelling: boolean
): Promise<void> {
  if (targets.length === 0) return;

  // Firestore batches are limited to 500 ops; chunk to stay safe.
  const chunkSize = 400;
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((target) =>
        setVariantSelling(
          branchId,
          target.productId,
          target.variantId,
          isSelling
        )
      )
    );
  }
}

/** Branches where any variant of the product is currently selling. */
export function sellingBranchIdsForProduct(
  productId: string,
  inventory: BranchInventory[]
): string[] {
  const ids = new Set<string>();
  for (const row of inventory) {
    if (row.productId !== productId) continue;
    if (row.isSelling === false) continue;
    ids.add(row.branchId);
  }
  return [...ids];
}

export type PosAssortmentGap = {
  product: Product;
  /** No branch sells any variant. */
  kind: "unassigned" | "incomplete";
  /** Branches that sell some but not all variants (incomplete only). */
  partialBranchIds: string[];
  /** Distinct variants missing from POS for this product. */
  missingVariantCount: number;
  /** How many variant×branch slots are missing for POS. */
  missingVariantSlots: number;
};

export type PosMissingVariantLine = {
  variantId: string;
  sku: string;
  /** Branch where this variant is not selling (incomplete). Empty for unassigned. */
  branchId: string | null;
};

export type PosProductMissingDetail = {
  product: Product;
  kind: "unassigned" | "incomplete" | "complete";
  partialBranchIds: string[];
  missingVariantSlots: number;
  /** Distinct variants that are missing on at least one branch (or all when unassigned). */
  missingVariants: Array<{ variantId: string; sku: string }>;
  /** Variant × branch gaps for incomplete products. */
  lines: PosMissingVariantLine[];
};

/** Missing POS assortment detail for one product. */
export function findMissingPosDetailForProduct(
  product: Product,
  inventory: BranchInventory[]
): PosProductMissingDetail {
  if (product.variants.length === 0) {
    return {
      product,
      kind: "complete",
      partialBranchIds: [],
      missingVariantSlots: 0,
      missingVariants: [],
      lines: [],
    };
  }

  const sellingBranchIds = sellingBranchIdsForProduct(product.id, inventory);
  if (sellingBranchIds.length === 0) {
    const missingVariants = product.variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
    }));
    return {
      product,
      kind: "unassigned",
      partialBranchIds: [],
      missingVariantSlots: product.variants.length,
      missingVariants,
      lines: missingVariants.map((variant) => ({
        variantId: variant.variantId,
        sku: variant.sku,
        branchId: null,
      })),
    };
  }

  const partialBranchIds: string[] = [];
  const lines: PosMissingVariantLine[] = [];
  const missingVariantIds = new Set<string>();

  for (const branchId of sellingBranchIds) {
    const sellingVariantIds = new Set(
      inventory
        .filter(
          (row) =>
            row.productId === product.id &&
            row.branchId === branchId &&
            row.isSelling !== false
        )
        .map((row) => row.variantId)
    );
    let branchMissing = 0;
    for (const variant of product.variants) {
      if (sellingVariantIds.has(variant.id)) continue;
      branchMissing += 1;
      missingVariantIds.add(variant.id);
      lines.push({
        variantId: variant.id,
        sku: variant.sku,
        branchId,
      });
    }
    if (branchMissing > 0) partialBranchIds.push(branchId);
  }

  if (lines.length === 0) {
    return {
      product,
      kind: "complete",
      partialBranchIds: [],
      missingVariantSlots: 0,
      missingVariants: [],
      lines: [],
    };
  }

  return {
    product,
    kind: "incomplete",
    partialBranchIds,
    missingVariantSlots: lines.length,
    missingVariants: product.variants
      .filter((variant) => missingVariantIds.has(variant.id))
      .map((variant) => ({ variantId: variant.id, sku: variant.sku })),
    lines,
  };
}

/**
 * Published products that would be missing (fully or partly) from POS because
 * they are unassigned, or some variants are not selling on a branch that
 * already sells other variants of the same product.
 */
export function findProductsMissingFromPos(
  products: Product[],
  inventory: BranchInventory[],
  isPublished: (product: Product) => boolean
): PosAssortmentGap[] {
  const gaps: PosAssortmentGap[] = [];

  for (const product of products) {
    if (!isPublished(product)) continue;
    const detail = findMissingPosDetailForProduct(product, inventory);
    if (detail.kind === "complete") continue;
    gaps.push({
      product,
      kind: detail.kind,
      partialBranchIds: detail.partialBranchIds,
      missingVariantCount: detail.missingVariants.length,
      missingVariantSlots: detail.missingVariantSlots,
    });
  }

  return gaps;
}

/**
 * Enable only the missing variant×branch slots for a product (incomplete
 * assortment). Does not change already-selling variants or other products.
 */
export async function syncMissingPosVariantsForProduct(
  detail: PosProductMissingDetail
): Promise<number> {
  if (detail.kind !== "incomplete" || detail.lines.length === 0) return 0;

  const ops = detail.lines
    .filter((line): line is PosMissingVariantLine & { branchId: string } =>
      Boolean(line.branchId)
    )
    .map((line) =>
      setVariantSelling(
        line.branchId,
        detail.product.id,
        line.variantId,
        true
      )
    );

  const chunkSize = 40;
  for (let i = 0; i < ops.length; i += chunkSize) {
    await Promise.all(ops.slice(i, i + chunkSize));
  }
  return ops.length;
}

/**
 * Assign all variants of a product to the selected branches.
 * Unselected branches that already have inventory rows are marked not selling
 * (stock is preserved). Does not create inventory docs for unselected branches.
 */
export async function setProductSellingForBranches(
  product: Pick<Product, "id" | "variants">,
  selectedBranchIds: string[],
  existingInventory: BranchInventory[]
): Promise<void> {
  const selected = new Set(selectedBranchIds);
  const variantIds = product.variants.map((v) => v.id);
  if (variantIds.length === 0) return;

  const ops: Array<Promise<void>> = [];

  for (const branchId of selected) {
    for (const variantId of variantIds) {
      ops.push(setVariantSelling(branchId, product.id, variantId, true));
    }
  }

  const productRows = existingInventory.filter(
    (row) => row.productId === product.id
  );
  for (const row of productRows) {
    if (selected.has(row.branchId)) continue;
    if (row.isSelling === false) continue;
    if (!variantIds.includes(row.variantId)) continue;
    ops.push(
      setVariantSelling(row.branchId, product.id, row.variantId, false)
    );
  }

  const chunkSize = 40;
  for (let i = 0; i < ops.length; i += chunkSize) {
    await Promise.all(ops.slice(i, i + chunkSize));
  }
}

/** @deprecated Use buildVariantStockMap */
export function buildStockMap(
  inventory: BranchInventory[]
): Record<string, number> {
  return Object.fromEntries(inventory.map((i) => [i.productId, i.stock]));
}

/** @deprecated Use setBranchStockWithLog with variantId */
export async function upsertBranchStock(
  branchId: string,
  productId: string,
  stock: number,
  lowStockThreshold = 5
): Promise<void> {
  await setBranchStockWithLog(
    branchId,
    productId,
    defaultVariantId(productId),
    stock,
    lowStockThreshold,
    {
      performedBy: "system",
      performedByName: "System",
    }
  );
}
