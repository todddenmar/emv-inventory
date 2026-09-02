import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
} from "firebase/firestore";
import { parseUserRole } from "@/lib/roles";
import { resolveSlug } from "@/lib/slug";
import type {
  AppUser,
  Branch,
  BranchInventory,
  BranchTransfer,
  TransferRequest,
  Category,
  CategoryGroup,
  DailyExpense,
  DailyCashAdd,
  DailyCashRecord,
  InventoryLog,
  Invite,
  PaymentAccount,
  PaymentMethod,
  PosSale,
  Product,
  ProductImage,
  ProductOption,
  ProductPriceLog,
  ProductSpec,
  ProductVariant,
  Reseller,
  SupplierStockIn,
  Vendor,
  Voucher,
  PricePromotion,
  PricePromotionItem,
} from "@/types";
import { migrateLegacyProductVariants, getDefaultVariant, defaultVariantId } from "@/lib/product-variants";
import { specsToText } from "@/lib/specs";
import { parseOptionalPosTenderMethod, parsePosTenderMethod } from "@/lib/pos-payments";
import { parsePosCustomerType } from "@/lib/pos-customer-type";

function toDate(value: Timestamp | Date | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return value.toDate();
}

function optionalMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

export const categoryConverter: FirestoreDataConverter<Category> = {
  toFirestore(category: Category): DocumentData {
    return {
      name: category.name,
      slug: category.slug,
      tags: category.tags,
      lowStockThreshold: category.lowStockThreshold,
      freebieVariants: category.freebieVariants,
      isArchived: category.isArchived,
      archivedAt: category.archivedAt,
      isLocked: category.isLocked,
      lockedBy: category.lockedBy,
      lockedByName: category.lockedByName,
      lockedAt: category.lockedAt,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Category {
    const data = snapshot.data(options);
    const rawFreebies = Array.isArray(data.freebieVariants)
      ? data.freebieVariants
      : [];
    return {
      id: snapshot.id,
      name: data.name,
      slug: resolveSlug(data.slug, data.name, snapshot.id),
      tags: Array.isArray(data.tags)
        ? data.tags.filter((t: unknown): t is string => typeof t === "string")
        : [],
      lowStockThreshold:
        typeof data.lowStockThreshold === "number" && data.lowStockThreshold >= 0
          ? data.lowStockThreshold
          : 5,
      freebieVariants: rawFreebies
        .map((item: Record<string, unknown>) => {
          const productId =
            typeof item.productId === "string" ? item.productId : "";
          const variantId =
            typeof item.variantId === "string" ? item.variantId : "";
          if (!productId || !variantId) return null;
          return {
            productId,
            variantId,
            productName:
              typeof item.productName === "string" ? item.productName : "",
            variantLabel:
              typeof item.variantLabel === "string" ? item.variantLabel : "",
          };
        })
        .filter(
          (item: Category["freebieVariants"][number] | null): item is Category["freebieVariants"][number] =>
            item != null
        ),
      isArchived: data.isArchived ?? false,
      archivedAt: data.archivedAt ? toDate(data.archivedAt) : null,
      isLocked: data.isLocked === true,
      lockedBy: typeof data.lockedBy === "string" ? data.lockedBy : null,
      lockedByName:
        typeof data.lockedByName === "string" ? data.lockedByName : null,
      lockedAt: data.lockedAt ? toDate(data.lockedAt) : null,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const categoryGroupConverter: FirestoreDataConverter<CategoryGroup> = {
  toFirestore(group: CategoryGroup): DocumentData {
    return {
      name: group.name,
      slug: group.slug,
      categoryIds: group.categoryIds,
      isArchived: group.isArchived,
      archivedAt: group.archivedAt,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): CategoryGroup {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name,
      slug: resolveSlug(data.slug, data.name, snapshot.id),
      categoryIds: Array.isArray(data.categoryIds)
        ? data.categoryIds.filter(
            (id: unknown): id is string => typeof id === "string"
          )
        : [],
      isArchived: data.isArchived ?? false,
      archivedAt: data.archivedAt ? toDate(data.archivedAt) : null,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

function parseLegacyImages(data: DocumentData): ProductImage[] {
  if (Array.isArray(data.images) && data.images.length > 0) {
    return data.images.map((img: ProductImage, index: number) => ({
      id: img.id,
      url: img.url,
      storagePath: img.storagePath ?? "",
      order: img.order ?? index,
    }));
  }
  if (data.imageUrl) {
    return [
      {
        id: "legacy",
        url: data.imageUrl,
        storagePath: "",
        order: 0,
      },
    ];
  }
  return [];
}

export const branchConverter: FirestoreDataConverter<Branch> = {
  toFirestore(branch: Branch): DocumentData {
    return {
      name: branch.name,
      code: branch.code,
      address: branch.address,
      latitude: branch.latitude,
      longitude: branch.longitude,
      phone: branch.phone,
      managerId: branch.managerId,
      managerName: branch.managerName,
      isActive: branch.isActive,
      supportsWholesale: branch.supportsWholesale,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Branch {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name,
      code: data.code ?? "",
      address: data.address ?? "",
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      phone: data.phone ?? null,
      managerId: data.managerId ?? null,
      managerName: data.managerName ?? null,
      isActive: data.isActive ?? true,
      supportsWholesale: data.supportsWholesale === true,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const branchInventoryConverter: FirestoreDataConverter<BranchInventory> = {
  toFirestore(item: BranchInventory): DocumentData {
    return {
      branchId: item.branchId,
      productId: item.productId,
      variantId: item.variantId,
      stock: item.stock,
      lowStockThreshold: item.lowStockThreshold,
      isSelling: item.isSelling,
      cashPrice: item.cashPrice,
      retailPrice: item.retailPrice,
      updatedAt: item.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): BranchInventory {
    const data = snapshot.data(options);
    const productId = data.productId as string;
    const variantId =
      (data.variantId as string | undefined) ??
      (snapshot.id.includes("_") ? snapshot.id.split("_").slice(1).join("_") : productId);
    return {
      id: snapshot.id,
      branchId: data.branchId,
      productId,
      variantId,
      stock: data.stock ?? 0,
      lowStockThreshold: data.lowStockThreshold ?? 5,
      // Legacy docs without the field remain visible as selling.
      isSelling: data.isSelling !== false,
      cashPrice: optionalMoney(data.cashPrice),
      retailPrice: optionalMoney(data.retailPrice),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const productConverter: FirestoreDataConverter<Product> = {
  toFirestore(product: Product): DocumentData {
    const defaultVariant = getDefaultVariant(product);
    return {
      name: product.name,
      slug: product.slug,
      productType: product.productType,
      tags: product.tags,
      vendorId: product.vendorId,
      price: defaultVariant.price,
      categoryIds: product.categoryIds,
      options: product.options,
      variants: product.variants,
      specsText: product.specsText,
      specs: product.specs,
      images: product.images,
      thumbnailImageId: product.thumbnailImageId,
      status: product.status,
      isActive: product.isActive,
      isArchived: product.isArchived,
      archivedAt: product.archivedAt,
      isLocked: product.isLocked,
      lockedBy: product.lockedBy,
      lockedByName: product.lockedByName,
      lockedAt: product.lockedAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Product {
    const data = snapshot.data(options);
    const images = parseLegacyImages(data);
    const legacySpecs = (data.specs as ProductSpec[]) ?? [];
    const { options: productOptions, variants } = migrateLegacyProductVariants(snapshot.id, {
      price: data.price,
      variants: data.variants as ProductVariant[] | undefined,
      options: data.options as ProductOption[] | undefined,
    });
    const defaultVariant = variants[0];
    const specsText =
      typeof data.specsText === "string" && data.specsText.trim()
        ? data.specsText
        : specsToText(legacySpecs);

    return {
      id: snapshot.id,
      name: data.name,
      slug: resolveSlug(data.slug, data.name, snapshot.id),
      productType: typeof data.productType === "string" ? data.productType : "",
      tags: Array.isArray(data.tags)
        ? data.tags.filter((t: unknown): t is string => typeof t === "string")
        : [],
      vendorId: data.vendorId ?? null,
      price: defaultVariant?.price ?? Number(data.price ?? 0),
      categoryIds: data.categoryIds ?? [],
      options: productOptions,
      variants,
      specsText,
      specs: legacySpecs,
      images,
      thumbnailImageId:
        data.thumbnailImageId ??
        (images.length > 0 ? images[0].id : null),
      status:
        data.status === "draft" || data.status === "published"
          ? data.status
          : data.isActive === false
            ? "draft"
            : "published",
      isActive: data.isActive ?? true,
      isArchived: data.isArchived ?? false,
      archivedAt: data.archivedAt ? toDate(data.archivedAt) : null,
      isLocked: data.isLocked === true,
      lockedBy: typeof data.lockedBy === "string" ? data.lockedBy : null,
      lockedByName:
        typeof data.lockedByName === "string" ? data.lockedByName : null,
      lockedAt: data.lockedAt ? toDate(data.lockedAt) : null,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const vendorConverter: FirestoreDataConverter<Vendor> = {
  toFirestore(vendor: Vendor): DocumentData {
    return {
      name: vendor.name,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Vendor {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name ?? "",
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const userConverter: FirestoreDataConverter<AppUser> = {
  toFirestore(user: AppUser): DocumentData {
    return {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      branchId: user.branchId,
      isAnonymous: user.isAnonymous,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): AppUser {
    const data = snapshot.data(options);
    return {
      uid: snapshot.id,
      email: data.email ?? null,
      displayName: data.displayName ?? null,
      photoURL: data.photoURL ?? null,
      role: parseUserRole(data.role),
      branchId: data.branchId ?? null,
      isAnonymous: data.isAnonymous ?? false,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const inviteConverter: FirestoreDataConverter<Invite> = {
  toFirestore(invite: Invite): DocumentData {
    return {
      token: invite.token,
      email: invite.email,
      role: invite.role,
      branchId: invite.branchId,
      branchName: invite.branchName,
      createdBy: invite.createdBy,
      createdByName: invite.createdByName,
      expiresAt: invite.expiresAt,
      usedAt: invite.usedAt,
      usedBy: invite.usedBy,
      createdAt: invite.createdAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Invite {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      token: data.token,
      email: data.email ?? null,
      role:
        data.role === "admin"
          ? "admin"
          : data.role === "owner"
            ? "owner"
            : "cashier",
      branchId: data.branchId ?? null,
      branchName: data.branchName ?? null,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
      expiresAt: toDate(data.expiresAt),
      usedAt: data.usedAt ? toDate(data.usedAt) : null,
      usedBy: data.usedBy ?? null,
      createdAt: toDate(data.createdAt),
    };
  },
};

export const inventoryLogConverter: FirestoreDataConverter<InventoryLog> = {
  toFirestore(log: InventoryLog): DocumentData {
    return {
      branchId: log.branchId,
      branchName: log.branchName,
      productId: log.productId,
      variantId: log.variantId,
      productName: log.productName,
      delta: log.delta,
      previousStock: log.previousStock,
      newStock: log.newStock,
      reason: log.reason,
      referenceId: log.referenceId,
      referenceLabel: log.referenceLabel,
      performedBy: log.performedBy,
      performedByName: log.performedByName,
      createdAt: log.createdAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): InventoryLog {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      branchId: data.branchId,
      branchName: data.branchName ?? null,
      productId: data.productId,
      variantId: data.variantId ?? defaultVariantId(data.productId),
      productName: data.productName ?? null,
      delta: data.delta,
      previousStock: data.previousStock,
      newStock: data.newStock,
      reason: data.reason,
      referenceId: data.referenceId ?? null,
      referenceLabel: data.referenceLabel ?? null,
      performedBy: data.performedBy,
      performedByName: data.performedByName ?? null,
      createdAt: toDate(data.createdAt),
    };
  },
};

export const productPriceLogConverter: FirestoreDataConverter<ProductPriceLog> = {
  toFirestore(log: ProductPriceLog): DocumentData {
    return {
      productId: log.productId,
      productName: log.productName,
      variantId: log.variantId,
      variantLabel: log.variantLabel,
      previousPrice: log.previousPrice,
      newPrice: log.newPrice,
      delta: log.delta,
      direction: log.direction,
      performedBy: log.performedBy,
      performedByName: log.performedByName,
      note: log.note,
      promotionId: log.promotionId,
      createdAt: log.createdAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): ProductPriceLog {
    const data = snapshot.data(options);
    const previousPrice = Number(data.previousPrice ?? 0);
    const newPrice = Number(data.newPrice ?? 0);
    const delta = Number(data.delta ?? newPrice - previousPrice);
    return {
      id: snapshot.id,
      productId: data.productId,
      productName: data.productName ?? "",
      variantId: data.variantId,
      variantLabel: data.variantLabel ?? "Default",
      previousPrice,
      newPrice,
      delta,
      direction:
        data.direction === "increase" || data.direction === "decrease"
          ? data.direction
          : delta >= 0
            ? "increase"
            : "decrease",
      performedBy: data.performedBy,
      performedByName: data.performedByName ?? null,
      note: (data.note as string | null | undefined) ?? null,
      promotionId: (data.promotionId as string | null | undefined) ?? null,
      createdAt: toDate(data.createdAt),
    };
  },
};

export const branchTransferConverter: FirestoreDataConverter<BranchTransfer> = {
  toFirestore(transfer: BranchTransfer): DocumentData {
    return {
      fromBranchId: transfer.fromBranchId,
      fromBranchName: transfer.fromBranchName,
      toBranchId: transfer.toBranchId,
      toBranchName: transfer.toBranchName,
      items: transfer.items,
      notes: transfer.notes,
      createdBy: transfer.createdBy,
      createdByName: transfer.createdByName,
      createdAt: transfer.createdAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): BranchTransfer {
    const data = snapshot.data(options);
    const rawItems = (data.items ?? []) as Array<{
      productId: string;
      productName: string;
      variantId?: string;
      quantity: number;
    }>;
    return {
      id: snapshot.id,
      fromBranchId: data.fromBranchId,
      fromBranchName: data.fromBranchName,
      toBranchId: data.toBranchId,
      toBranchName: data.toBranchName,
      items: rawItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        variantId: item.variantId ?? item.productId,
        quantity: item.quantity,
      })),
      notes: data.notes ?? null,
      createdBy: data.createdBy,
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
    };
  },
};

export const transferRequestConverter: FirestoreDataConverter<TransferRequest> =
  {
    toFirestore(request: TransferRequest): DocumentData {
      return {
        productId: request.productId,
        productName: request.productName,
        variantId: request.variantId,
        variantLabel: request.variantLabel,
        quantity: request.quantity,
        fromBranchId: request.fromBranchId,
        fromBranchName: request.fromBranchName,
        toBranchId: request.toBranchId,
        toBranchName: request.toBranchName,
        status: request.status,
        notes: request.notes,
        requestedBy: request.requestedBy,
        requestedByName: request.requestedByName,
        requestedAt: request.requestedAt,
        releasedBy: request.releasedBy,
        releasedByName: request.releasedByName,
        releasedAt: request.releasedAt,
        receivedBy: request.receivedBy,
        receivedByName: request.receivedByName,
        receivedAt: request.receivedAt,
        completedTransferId: request.completedTransferId,
        cancelledBy: request.cancelledBy,
        cancelledByName: request.cancelledByName,
        cancelledAt: request.cancelledAt,
        declinedBy: request.declinedBy,
        declinedByName: request.declinedByName,
        declinedAt: request.declinedAt,
      };
    },
    fromFirestore(
      snapshot: QueryDocumentSnapshot,
      options: SnapshotOptions
    ): TransferRequest {
      const data = snapshot.data(options);
      return {
        id: snapshot.id,
        productId: data.productId,
        productName: data.productName,
        variantId: data.variantId,
        variantLabel: data.variantLabel ?? "",
        quantity: data.quantity ?? 0,
        fromBranchId: data.fromBranchId,
        fromBranchName: data.fromBranchName,
        toBranchId: data.toBranchId,
        toBranchName: data.toBranchName,
        status: data.status,
        notes: data.notes ?? null,
        requestedBy: data.requestedBy,
        requestedByName: data.requestedByName ?? null,
        requestedAt: toDate(data.requestedAt),
        releasedBy: data.releasedBy ?? null,
        releasedByName: data.releasedByName ?? null,
        releasedAt: data.releasedAt ? toDate(data.releasedAt) : null,
        receivedBy: data.receivedBy ?? null,
        receivedByName: data.receivedByName ?? null,
        receivedAt: data.receivedAt ? toDate(data.receivedAt) : null,
        completedTransferId: data.completedTransferId ?? null,
        cancelledBy: data.cancelledBy ?? null,
        cancelledByName: data.cancelledByName ?? null,
        cancelledAt: data.cancelledAt ? toDate(data.cancelledAt) : null,
        declinedBy: data.declinedBy ?? null,
        declinedByName: data.declinedByName ?? null,
        declinedAt: data.declinedAt ? toDate(data.declinedAt) : null,
      };
    },
  };

export const posSaleConverter: FirestoreDataConverter<PosSale> = {
  toFirestore(sale: PosSale): DocumentData {
    return {
      branchId: sale.branchId,
      branchName: sale.branchName,
      saleChannel: sale.saleChannel,
      paymentMethod: sale.paymentMethod,
      tenderMethod: sale.tenderMethod,
      paymentAccount: sale.paymentAccount,
      payments: sale.payments,
      customerType: sale.customerType,
      customer: sale.customer,
      resellerId: sale.resellerId,
      resellerName: sale.resellerName,
      voucherId: sale.voucherId,
      voucherCode: sale.voucherCode,
      voucherAmountApplied: sale.voucherAmountApplied,
      total: sale.total,
      amountDue: sale.amountDue,
      items: sale.items,
      itemCount: sale.itemCount,
      createdBy: sale.createdBy,
      createdByName: sale.createdByName,
      createdAt: sale.createdAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): PosSale {
    const data = snapshot.data(options);
    const rawItems = (data.items ?? []) as PosSale["items"];
    const rawCustomer = data.customer as PosSale["customer"] | undefined;
    const rawAccount = data.paymentAccount as PosSale["paymentAccount"] | undefined;
    const total = Number(data.total ?? 0);
    const voucherAmountApplied = Number(data.voucherAmountApplied ?? 0);
    const amountDue =
      data.amountDue != null
        ? Number(data.amountDue)
        : Math.max(0, total - voucherAmountApplied);
    const tenderMethod = parsePosTenderMethod(data.tenderMethod);
    const customerType = parsePosCustomerType(data.customerType);
    const paymentAccount: PosSale["paymentAccount"] = rawAccount
      ? {
          id: String(rawAccount.id ?? ""),
          type:
            rawAccount.type === "bank_transfer" ? "bank_transfer" : "ewallet",
          provider: String(rawAccount.provider ?? ""),
          accountName: String(rawAccount.accountName ?? ""),
          accountNumber: String(rawAccount.accountNumber ?? ""),
        }
      : null;

    const parsePaymentLine = (raw: unknown): PosSale["payments"][number] | null => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Record<string, unknown>;
      const method = parsePosTenderMethod(row.tenderMethod);
      const amount = Number(row.amount ?? 0);
      if (!Number.isFinite(amount)) return null;
      const acct = row.paymentAccount as PosSale["paymentAccount"] | undefined;
      const lineAccount: PosSale["paymentAccount"] = acct
        ? {
            id: String(acct.id ?? ""),
            type: acct.type === "bank_transfer" ? "bank_transfer" : "ewallet",
            provider: String(acct.provider ?? ""),
            accountName: String(acct.accountName ?? ""),
            accountNumber: String(acct.accountNumber ?? ""),
          }
        : null;
      return {
        tenderMethod: method,
        amount,
        paymentAccount: lineAccount,
        kind:
          row.kind === "down_payment" ||
          row.kind === "balance" ||
          row.kind === "other"
            ? row.kind
            : "full",
        note:
          typeof row.note === "string" && row.note.trim()
            ? row.note.trim()
            : null,
      };
    };

    const rawPayments = Array.isArray(data.payments) ? data.payments : null;
    const parsedPayments =
      rawPayments
        ?.map(parsePaymentLine)
        .filter((line): line is PosSale["payments"][number] => line != null) ??
      [];
    const payments =
      parsedPayments.length > 0
        ? parsedPayments
        : [
            {
              tenderMethod,
              amount: Math.max(0, amountDue),
              paymentAccount:
                tenderMethod === "ewallet" || tenderMethod === "bank_transfer"
                  ? paymentAccount
                  : null,
              kind: "full" as const,
              note: null,
            },
          ];

    return {
      id: snapshot.id,
      branchId: data.branchId,
      branchName: data.branchName ?? "",
      saleChannel: data.saleChannel === "wholesale" ? "wholesale" : "shop",
      paymentMethod: data.paymentMethod === "retail" ? "retail" : "cash",
      tenderMethod,
      paymentAccount,
      payments,
      customerType,
      customer: rawCustomer
        ? {
            name: rawCustomer.name?.trim() || null,
            mobile: rawCustomer.mobile?.trim() || null,
            email: rawCustomer.email?.trim() || null,
            address: rawCustomer.address?.trim() || null,
          }
        : null,
      resellerId: data.resellerId ?? null,
      resellerName: data.resellerName ?? null,
      voucherId: data.voucherId ?? null,
      voucherCode: data.voucherCode ?? null,
      voucherAmountApplied,
      total,
      amountDue,
      items: rawItems.map((item) => {
        const tenderMethod = parseOptionalPosTenderMethod(item.tenderMethod);
        const acct = item.paymentAccount as
          | PosSale["paymentAccount"]
          | undefined
          | null;
        const lineAccount: PosSale["paymentAccount"] = acct
          ? {
              id: String(acct.id ?? ""),
              type:
                acct.type === "bank_transfer" ? "bank_transfer" : "ewallet",
              provider: String(acct.provider ?? ""),
              accountName: String(acct.accountName ?? ""),
              accountNumber: String(acct.accountNumber ?? ""),
            }
          : null;
        const kind =
          item.kind === "down_payment" ||
          item.kind === "balance" ||
          item.kind === "other" ||
          item.kind === "full"
            ? item.kind
            : null;
        const note =
          typeof item.note === "string" && item.note.trim()
            ? item.note.trim()
            : null;
        const priceList =
          item.priceList === "retail" || item.priceList === "cash"
            ? item.priceList
            : null;

        const rawItemPayments = Array.isArray(item.payments)
          ? item.payments
          : null;
        const parsedItemPayments =
          rawItemPayments
            ?.map((raw) => {
              if (!raw || typeof raw !== "object") return null;
              return parsePaymentLine(raw);
            })
            .filter(
              (line): line is PosSale["payments"][number] => line != null
            ) ?? [];

        const payments: PosSale["payments"] =
          parsedItemPayments.length > 0
            ? parsedItemPayments
            : tenderMethod
              ? [
                  {
                    tenderMethod,
                    amount: Number(item.lineTotal ?? 0),
                    paymentAccount: lineAccount,
                    kind: kind ?? "full",
                    note,
                  },
                ]
              : [];

        const primary = payments[0] ?? null;

        return {
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          priceList,
          payments,
          tenderMethod: primary?.tenderMethod ?? tenderMethod,
          paymentAccount: primary?.paymentAccount ?? lineAccount,
          kind: primary?.kind ?? kind,
          note: primary?.note ?? note,
        };
      }),
      itemCount: data.itemCount ?? 0,
      createdBy: data.createdBy,
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
    };
  },
};

export const paymentAccountConverter: FirestoreDataConverter<PaymentAccount> = {
  toFirestore(account: PaymentAccount): DocumentData {
    return {
      type: account.type,
      provider: account.provider,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): PaymentAccount {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      type: data.type === "bank_transfer" ? "bank_transfer" : "ewallet",
      provider: String(data.provider ?? ""),
      accountName: String(data.accountName ?? ""),
      accountNumber: String(data.accountNumber ?? ""),
      isActive: data.isActive !== false,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const paymentMethodConverter: FirestoreDataConverter<PaymentMethod> = {
  toFirestore(method: PaymentMethod): DocumentData {
    return {
      key: method.key,
      name: method.name,
      shortLabel: method.shortLabel,
      isCash: method.isCash,
      isActive: method.isActive,
      isBuiltIn: method.isBuiltIn,
      needsPaymentAccount: method.needsPaymentAccount,
      accountType: method.accountType,
      position: method.position,
      createdAt: method.createdAt,
      updatedAt: method.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): PaymentMethod {
    const data = snapshot.data(options);
    const key = String(data.key ?? snapshot.id).trim() || snapshot.id;
    return {
      id: snapshot.id,
      key,
      name: String(data.name ?? key),
      shortLabel: String(data.shortLabel ?? "").trim(),
      isCash: data.isCash === true || key === "cash",
      isActive: data.isActive !== false,
      isBuiltIn: data.isBuiltIn === true,
      needsPaymentAccount: data.needsPaymentAccount === true,
      accountType:
        data.accountType === "bank_transfer" || data.accountType === "ewallet"
          ? data.accountType
          : null,
      position: Number.isFinite(data.position) ? Number(data.position) : 0,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const resellerConverter: FirestoreDataConverter<Reseller> = {
  toFirestore(reseller: Reseller): DocumentData {
    return {
      name: reseller.name,
      mobile: reseller.mobile,
      email: reseller.email,
      address: reseller.address,
      notes: reseller.notes,
      isActive: reseller.isActive,
      createdAt: reseller.createdAt,
      updatedAt: reseller.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Reseller {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name ?? "",
      mobile: data.mobile ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      isActive: data.isActive !== false,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const voucherConverter: FirestoreDataConverter<Voucher> = {
  toFirestore(voucher: Voucher): DocumentData {
    return {
      code: voucher.code,
      name: voucher.name,
      description: voucher.description,
      resellerId: voucher.resellerId,
      resellerName: voucher.resellerName,
      initialAmount: voucher.initialAmount,
      remainingAmount: voucher.remainingAmount,
      status: voucher.status,
      expiresAt: voucher.expiresAt,
      createdBy: voucher.createdBy,
      createdByName: voucher.createdByName,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Voucher {
    const data = snapshot.data(options);
    const status =
      data.status === "void" || data.status === "depleted"
        ? data.status
        : "active";
    return {
      id: snapshot.id,
      code: String(data.code ?? "").toUpperCase(),
      name: String(data.name ?? "").trim(),
      description: String(data.description ?? "").trim(),
      resellerId: data.resellerId ?? null,
      resellerName: data.resellerName ?? null,
      initialAmount: Number(data.initialAmount ?? 0),
      remainingAmount: Number(data.remainingAmount ?? 0),
      status,
      expiresAt: data.expiresAt ? toDate(data.expiresAt) : null,
      createdBy: data.createdBy,
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const supplierStockInConverter: FirestoreDataConverter<SupplierStockIn> = {
  toFirestore(entry: SupplierStockIn): DocumentData {
    return {
      branchId: entry.branchId,
      branchName: entry.branchName,
      vendorId: entry.vendorId,
      vendorName: entry.vendorName,
      items: entry.items,
      itemCount: entry.itemCount,
      notes: entry.notes,
      createdBy: entry.createdBy,
      createdByName: entry.createdByName,
      createdAt: entry.createdAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): SupplierStockIn {
    const data = snapshot.data(options);
    const rawItems = (data.items ?? []) as SupplierStockIn["items"];
    return {
      id: snapshot.id,
      branchId: data.branchId,
      branchName: data.branchName ?? "",
      vendorId: data.vendorId,
      vendorName: data.vendorName ?? "",
      items: rawItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        quantity: item.quantity,
      })),
      itemCount: data.itemCount ?? 0,
      notes: data.notes ?? null,
      createdBy: data.createdBy,
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
    };
  },
};

function mapPricePromotionItem(item: PricePromotionItem): PricePromotionItem {
  return {
    productId: item.productId,
    variantId: item.variantId,
    productName: item.productName,
    salePrice: Number(item.salePrice ?? 0),
    saleRetailPrice:
      item.saleRetailPrice == null ||
      !Number.isFinite(Number(item.saleRetailPrice))
        ? null
        : Number(item.saleRetailPrice),
    basePrice: Number(item.basePrice ?? 0),
    baseRetailPrice:
      item.baseRetailPrice == null ||
      !Number.isFinite(Number(item.baseRetailPrice))
        ? null
        : Number(item.baseRetailPrice),
  };
}

export const pricePromotionConverter: FirestoreDataConverter<PricePromotion> = {
  toFirestore(promo: PricePromotion): DocumentData {
    return {
      name: promo.name,
      status: promo.status,
      startsAt: promo.startsAt,
      endsAt: promo.endsAt,
      items: promo.items,
      itemCount: promo.itemCount,
      createdBy: promo.createdBy,
      createdByName: promo.createdByName,
      createdAt: promo.createdAt,
      updatedAt: promo.updatedAt,
      endedAt: promo.endedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): PricePromotion {
    const data = snapshot.data(options);
    const status =
      data.status === "scheduled" ||
      data.status === "active" ||
      data.status === "ended"
        ? data.status
        : "ended";
    const rawItems = (data.items ?? []) as PricePromotionItem[];
    return {
      id: snapshot.id,
      name: data.name ?? "",
      status,
      startsAt: toDate(data.startsAt),
      endsAt: data.endsAt ? toDate(data.endsAt) : null,
      items: rawItems.map(mapPricePromotionItem),
      itemCount: data.itemCount ?? rawItems.length,
      createdBy: data.createdBy ?? "",
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
      endedAt: data.endedAt ? toDate(data.endedAt) : null,
    };
  },
};

export const dailyExpenseConverter: FirestoreDataConverter<DailyExpense> = {
  toFirestore(entry: DailyExpense): DocumentData {
    return {
      branchId: entry.branchId,
      branchName: entry.branchName,
      date: entry.date,
      description: entry.description,
      amount: entry.amount,
      createdBy: entry.createdBy,
      createdByName: entry.createdByName,
      createdAt: entry.createdAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): DailyExpense {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      branchId: data.branchId,
      branchName: data.branchName ?? "",
      date: String(data.date ?? ""),
      description: String(data.description ?? "").trim(),
      amount: Number(data.amount ?? 0),
      createdBy: data.createdBy ?? "",
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
    };
  },
};

export const dailyCashRecordConverter: FirestoreDataConverter<DailyCashRecord> = {
  toFirestore(record: DailyCashRecord): DocumentData {
    return {
      branchId: record.branchId,
      branchName: record.branchName,
      date: record.date,
      openingCash: record.openingCash,
      closingCash: record.closingCash,
      additions: record.additions,
      createdBy: record.createdBy,
      createdByName: record.createdByName,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): DailyCashRecord {
    const data = snapshot.data(options);
    const rawAdds = Array.isArray(data.additions) ? data.additions : [];
    const additions: DailyCashAdd[] = rawAdds.map(
      (row: Record<string, unknown>) => ({
        id: String(row.id ?? ""),
        note: String(row.note ?? "").trim(),
        amount: Number(row.amount ?? 0),
        createdBy: String(row.createdBy ?? ""),
        createdByName:
          typeof row.createdByName === "string" ? row.createdByName : null,
        createdAt: toDate(
          (row.createdAt as Timestamp | Date | null | undefined) ?? null
        ),
      })
    );
    const closingRaw = data.closingCash;
    return {
      id: snapshot.id,
      branchId: data.branchId,
      branchName: data.branchName ?? "",
      date: String(data.date ?? ""),
      openingCash: Number(data.openingCash ?? 0),
      closingCash:
        closingRaw == null || closingRaw === "" ? null : Number(closingRaw),
      additions,
      createdBy: data.createdBy ?? "",
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};
