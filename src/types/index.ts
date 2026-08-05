export type UserRole = "master-admin" | "manager" | "customer";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  branchId: string | null;
  isAnonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  managerId: string | null;
  managerName: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchInventory {
  id: string;
  branchId: string;
  productId: string;
  variantId: string;
  stock: number;
  lowStockThreshold: number;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  tags: string[];
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductOption {
  name: string;
  values: string[];
  position: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  optionValues: Record<string, string>;
  imageId: string | null;
  position: number;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface ProductImage {
  id: string;
  url: string;
  storagePath: string;
  order: number;
}

export type ProductStatus = "draft" | "published";

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  productType: string;
  tags: string[];
  vendorId: string | null;
  /** @deprecated Derived from default variant. Kept for legacy reads. */
  price: number;
  /** @deprecated Derived from default variant. Kept for legacy reads. */
  compareAtPrice: number | null;
  categoryIds: string[];
  options: ProductOption[];
  variants: ProductVariant[];
  specsText: string;
  /** @deprecated Use specsText. Kept for legacy documents. */
  specs: ProductSpec[];
  images: ProductImage[];
  thumbnailImageId: string | null;
  status: ProductStatus;
  /** @deprecated Use status === "published". Kept for legacy documents. */
  isActive: boolean;
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vendor {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invite {
  id: string;
  token: string;
  email: string | null;
  role: "manager";
  branchId: string | null;
  branchName: string | null;
  createdBy: string;
  createdByName: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: string | null;
  createdAt: Date;
}

export type InventoryLogReason =
  | "manual_adjustment"
  | "transfer_out"
  | "transfer_in";

export interface InventoryLog {
  id: string;
  branchId: string;
  branchName: string | null;
  productId: string;
  variantId: string | null;
  productName: string | null;
  delta: number;
  previousStock: number;
  newStock: number;
  reason: InventoryLogReason;
  referenceId: string | null;
  referenceLabel: string | null;
  performedBy: string;
  performedByName: string | null;
  createdAt: Date;
}

export interface BranchTransferItem {
  productId: string;
  productName: string;
  quantity: number;
}

export interface BranchTransfer {
  id: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  items: BranchTransferItem[];
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
}
