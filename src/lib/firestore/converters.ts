import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
} from "firebase/firestore";
import type {
  AppUser,
  Branch,
  BranchInventory,
  BranchTransfer,
  Category,
  CategoryGroup,
  InventoryLog,
  Invite,
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
import { resolveSlug } from "@/lib/slug";

function toDate(value: Timestamp | Date | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return value.toDate();
}

export const categoryConverter: FirestoreDataConverter<Category> = {
  toFirestore(category: Category): DocumentData {
    return {
      name: category.name,
      slug: category.slug,
      tags: category.tags,
      lowStockThreshold: category.lowStockThreshold,
      isArchived: category.isArchived,
      archivedAt: category.archivedAt,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Category {
    const data = snapshot.data(options);
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
      isArchived: data.isArchived ?? false,
      archivedAt: data.archivedAt ? toDate(data.archivedAt) : null,
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
      role: data.role,
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
      role: data.role === "admin" ? "admin" : "manager",
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

export const posSaleConverter: FirestoreDataConverter<PosSale> = {
  toFirestore(sale: PosSale): DocumentData {
    return {
      branchId: sale.branchId,
      branchName: sale.branchName,
      paymentMethod: sale.paymentMethod,
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
    const total = Number(data.total ?? 0);
    const voucherAmountApplied = Number(data.voucherAmountApplied ?? 0);
    return {
      id: snapshot.id,
      branchId: data.branchId,
      branchName: data.branchName ?? "",
      paymentMethod: data.paymentMethod === "retail" ? "retail" : "cash",
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
      amountDue:
        data.amountDue != null
          ? Number(data.amountDue)
          : Math.max(0, total - voucherAmountApplied),
      items: rawItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      itemCount: data.itemCount ?? 0,
      createdBy: data.createdBy,
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
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
