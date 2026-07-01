import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
} from "firebase/firestore";
import type { AppUser, Branch, BranchInventory, BranchTransfer, Category, HomeBanner, InventoryLog, Invite, Order, OrderItem, Product, ProductImage, ProductOption, ProductSpec, ProductVariant, SiteSettings, SocialLink, SocialPlatform, Testimonial } from "@/types";
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
      tags: data.tags ?? [],
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
      isOnlineShop: branch.isOnlineShop,
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
      isOnlineShop: data.isOnlineShop ?? false,
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
      description: product.description,
      price: defaultVariant.price,
      compareAtPrice: defaultVariant.compareAtPrice,
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
      compareAtPrice: data.compareAtPrice,
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
      description: data.description,
      price: defaultVariant?.price ?? Number(data.price ?? 0),
      compareAtPrice: defaultVariant?.compareAtPrice ?? null,
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

export const orderConverter: FirestoreDataConverter<Order> = {
  toFirestore(order: Order): DocumentData {
    return {
      branchId: order.branchId,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      deliveryAddress: order.deliveryAddress,
      deliveryLocation: order.deliveryLocation,
      items: order.items,
      subtotal: order.subtotal,
      total: order.total,
      paymentMethod: order.paymentMethod,
      status: order.status,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Order {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      branchId: data.branchId ?? null,
      customerId: data.customerId ?? null,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail ?? null,
      deliveryAddress: data.deliveryAddress,
      deliveryLocation: data.deliveryLocation ?? null,
      items: ((data.items as OrderItem[]) ?? []).map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? defaultVariantId(item.productId),
        sku: item.sku ?? "",
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      subtotal: data.subtotal,
      total: data.total,
      paymentMethod: data.paymentMethod,
      status: data.status,
      notes: data.notes ?? null,
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
      role: data.role,
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

export const bannerConverter: FirestoreDataConverter<HomeBanner> = {
  toFirestore(banner: HomeBanner): DocumentData {
    return {
      title: banner.title,
      subtitle: banner.subtitle,
      imageUrl: banner.imageUrl,
      storagePath: banner.storagePath,
      linkUrl: banner.linkUrl,
      order: banner.order,
      isActive: banner.isActive,
      createdAt: banner.createdAt,
      updatedAt: banner.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): HomeBanner {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      title: data.title,
      subtitle: data.subtitle ?? null,
      imageUrl: data.imageUrl,
      storagePath: data.storagePath ?? "",
      linkUrl: data.linkUrl ?? null,
      order: data.order ?? 0,
      isActive: data.isActive ?? true,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },
};

export const testimonialConverter: FirestoreDataConverter<Testimonial> = {
  toFirestore(item: Testimonial): DocumentData {
    return {
      customerName: item.customerName,
      quote: item.quote,
      customerImageUrl: item.customerImageUrl,
      customerImageStoragePath: item.customerImageStoragePath,
      productId: item.productId,
      productName: item.productName,
      productImageUrl: item.productImageUrl,
      productImageStoragePath: item.productImageStoragePath,
      order: item.order,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): Testimonial {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      customerName: data.customerName,
      quote: data.quote ?? null,
      customerImageUrl: data.customerImageUrl,
      customerImageStoragePath: data.customerImageStoragePath ?? "",
      productId: data.productId ?? null,
      productName: data.productName,
      productImageUrl: data.productImageUrl ?? null,
      productImageStoragePath: data.productImageStoragePath ?? null,
      order: data.order ?? 0,
      isActive: data.isActive ?? true,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
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
    return {
      id: snapshot.id,
      fromBranchId: data.fromBranchId,
      fromBranchName: data.fromBranchName,
      toBranchId: data.toBranchId,
      toBranchName: data.toBranchName,
      items: data.items ?? [],
      notes: data.notes ?? null,
      createdBy: data.createdBy,
      createdByName: data.createdByName ?? null,
      createdAt: toDate(data.createdAt),
    };
  },
};

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  "facebook",
  "instagram",
  "twitter",
  "tiktok",
  "youtube",
  "website",
];

function parseSocialLinks(raw: unknown): SocialLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item.url === "string" && item.url.trim())
    .map((item) => ({
      platform: SOCIAL_PLATFORMS.includes(item.platform)
        ? item.platform
        : "website",
      url: item.url.trim(),
      label: item.label?.trim() || null,
    }));
}

export const siteSettingsConverter: FirestoreDataConverter<SiteSettings> = {
  toFirestore(settings: SiteSettings): DocumentData {
    return {
      footerAddress: settings.footerAddress,
      footerPhone: settings.footerPhone,
      footerEmail: settings.footerEmail,
      socialLinks: settings.socialLinks,
      updatedAt: settings.updatedAt,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): SiteSettings {
    const data = snapshot.data(options);
    return {
      footerAddress: data.footerAddress ?? "",
      footerPhone: data.footerPhone ?? null,
      footerEmail: data.footerEmail ?? null,
      socialLinks: parseSocialLinks(data.socialLinks),
      updatedAt: toDate(data.updatedAt),
    };
  },
};
