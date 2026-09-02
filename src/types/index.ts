export type UserRole =
  | "master-admin"
  | "admin"
  | "owner"
  | "cashier"
  | "customer";

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
  /** When true, this branch can run wholesale POS. */
  supportsWholesale: boolean;
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
  /** When false, variant is hidden from inventory for this branch. Missing legacy docs default to true. */
  isSelling: boolean;
  updatedAt: Date;
}

export interface CategoryFreebieVariant {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  tags: string[];
  /** Alert when variant stock is at or below this (products in this category). */
  lowStockThreshold: number;
  /** Variants auto-added free (₱0) in POS when products in this category are sold. */
  freebieVariants: CategoryFreebieVariant[];
  isArchived: boolean;
  archivedAt: Date | null;
  /** When locked, permanent delete is blocked until unlocked by locker or master-admin. */
  isLocked: boolean;
  lockedBy: string | null;
  lockedByName: string | null;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Named bundle of categories for report / history filters (e.g. "Paddles"). */
export interface CategoryGroup {
  id: string;
  name: string;
  slug: string;
  categoryIds: string[];
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
  /** Cash / walk-in selling price. */
  price: number;
  /** Retail / list price. Optional until set on product or at POS. */
  retailPrice: number | null;
  /** Suggested wholesale price; optional and editable per wholesale sale. */
  wholesalePrice: number | null;
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
  productType: string;
  tags: string[];
  vendorId: string | null;
  /** @deprecated Derived from default variant. Kept for legacy reads. */
  price: number;
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
  /** When locked, archive/permanent delete is blocked until unlocked by locker or master-admin. */
  isLocked: boolean;
  lockedBy: string | null;
  lockedByName: string | null;
  lockedAt: Date | null;
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
  role: "cashier" | "admin" | "owner";
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
  | "transfer_in"
  | "pos_sale"
  | "supplier_stock_in";

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

export type PriceChangeDirection = "increase" | "decrease";

export interface ProductPriceLog {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  previousPrice: number;
  newPrice: number;
  delta: number;
  direction: PriceChangeDirection;
  performedBy: string;
  performedByName: string | null;
  /** Optional context, e.g. temporary promotion. */
  note: string | null;
  promotionId: string | null;
  createdAt: Date;
}

export interface BranchTransferItem {
  productId: string;
  productName: string;
  variantId: string;
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

export type TransferRequestStatus =
  | "requested"
  | "released"
  | "completed"
  | "cancelled"
  | "declined";

export interface TransferRequest {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  quantity: number;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  status: TransferRequestStatus;
  notes: string | null;
  requestedBy: string;
  requestedByName: string | null;
  requestedAt: Date;
  releasedBy: string | null;
  releasedByName: string | null;
  releasedAt: Date | null;
  receivedBy: string | null;
  receivedByName: string | null;
  receivedAt: Date | null;
  completedTransferId: string | null;
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelledAt: Date | null;
  declinedBy: string | null;
  declinedByName: string | null;
  declinedAt: Date | null;
}

export type PosPaymentMethod = "cash" | "retail";

export type PosSaleChannel = "shop" | "wholesale";

/** Built-in plus custom payment-method keys stored on sales. */
export type PosTenderMethod =
  | "cash"
  | "ewallet"
  | "bank_transfer"
  | "home_credit"
  | "skyro"
  | "salmon"
  | "card_swipe"
  | (string & {});

/** Configurable POS tender (Settings → Payment methods). */
export interface PaymentMethod {
  id: string;
  /** Stored on sale payment lines as `tenderMethod`. */
  key: string;
  name: string;
  /** Short till label, e.g. BT, HC, SW. */
  shortLabel: string;
  /** When true, this tender stays in the till (not deducted). */
  isCash: boolean;
  isActive: boolean;
  isBuiltIn: boolean;
  needsPaymentAccount: boolean;
  accountType: PaymentAccountType | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PosCustomerType = "walk_in" | "reservation" | "delivery";

export type PaymentAccountType = "ewallet" | "bank_transfer";

export interface PaymentAccount {
  id: string;
  type: PaymentAccountType;
  provider: string;
  accountName: string;
  accountNumber: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Snapshot of the receiving account used on a sale. */
export interface PosSalePaymentAccount {
  id: string;
  type: PaymentAccountType;
  provider: string;
  accountName: string;
  accountNumber: string;
}

/** How this tender line applies to the sale. */
export type PosPaymentKind =
  | "full"
  | "down_payment"
  | "balance"
  | "other";

/** One tender amount toward the sale's amount due. */
export interface PosPaymentLine {
  tenderMethod: PosTenderMethod;
  amount: number;
  paymentAccount: PosSalePaymentAccount | null;
  /** Defaults to full for legacy sales. */
  kind: PosPaymentKind;
  /** Optional free-text note (e.g. custom label when kind is other). */
  note: string | null;
}

export interface PosSaleCustomer {
  name: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
}

export interface PosSaleItem {
  productId: string;
  variantId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /**
   * Cash vs retail for this line (shop). Null for wholesale, freebies, or legacy.
   */
  priceList: PosPaymentMethod | null;
  /** Split tenders covering this line. Empty for freebies / legacy. */
  payments: PosPaymentLine[];
  /**
   * Primary tender (first payment). Kept for legacy readers / daily notes.
   */
  tenderMethod: PosTenderMethod | null;
  paymentAccount: PosSalePaymentAccount | null;
  kind: PosPaymentKind | null;
  note: string | null;
}

export interface PosSale {
  id: string;
  branchId: string;
  branchName: string;
  /** Shop vs wholesale channel. Legacy sales default to shop. */
  saleChannel: PosSaleChannel;
  /** Price list used for line prices (cash vs retail) on shop sales. */
  paymentMethod: PosPaymentMethod;
  /**
   * Primary tender (first payment line). Kept for legacy readers.
   * Prefer `payments` for the full breakdown.
   */
  tenderMethod: PosTenderMethod;
  /**
   * Primary receiving account (first payment line). Kept for legacy readers.
   */
  paymentAccount: PosSalePaymentAccount | null;
  /** Full tender split covering amountDue. */
  payments: PosPaymentLine[];
  customerType: PosCustomerType;
  customer: PosSaleCustomer | null;
  resellerId: string | null;
  resellerName: string | null;
  voucherId: string | null;
  voucherCode: string | null;
  voucherAmountApplied: number;
  /** Cart merchandise total (before voucher). */
  total: number;
  /** Amount still owed after voucher (cash/retail collect). */
  amountDue: number;
  items: PosSaleItem[];
  itemCount: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
}

/** Day/branch expense row for the daily sales report. */
export interface DailyExpense {
  id: string;
  branchId: string;
  branchName: string;
  /** Local calendar day as YYYY-MM-DD. */
  date: string;
  description: string;
  amount: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
}

/** Extra cash put in the till (float, change, etc.) for a day. */
export interface DailyCashAdd {
  id: string;
  note: string;
  amount: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
}

/** Opening / closing cash and cash-in notes for one branch day. */
export interface DailyCashRecord {
  id: string;
  branchId: string;
  branchName: string;
  /** Local calendar day as YYYY-MM-DD. */
  date: string;
  openingCash: number;
  /** Counted drawer at close. Null if not recorded yet. */
  closingCash: number | null;
  additions: DailyCashAdd[];
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reseller {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type VoucherStatus = "active" | "depleted" | "void";

export interface Voucher {
  id: string;
  code: string;
  name: string;
  description: string;
  /** Null = walk-in / unassigned prepaid credit. */
  resellerId: string | null;
  resellerName: string | null;
  initialAmount: number;
  remainingAmount: number;
  status: VoucherStatus;
  expiresAt: Date | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierStockInItem {
  productId: string;
  variantId: string;
  productName: string;
  quantity: number;
}

export interface SupplierStockIn {
  id: string;
  branchId: string;
  branchName: string;
  vendorId: string;
  vendorName: string;
  items: SupplierStockInItem[];
  itemCount: number;
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
}

export type PricePromotionStatus = "scheduled" | "active" | "ended";

export interface PricePromotionItem {
  productId: string;
  variantId: string;
  productName: string;
  /** Sale cash / walk-in price. */
  salePrice: number;
  /** Sale retail price; null keeps retail unset for this promo. */
  saleRetailPrice: number | null;
  /** Catalog cash snapshot at create time (UI / audit). */
  basePrice: number;
  baseRetailPrice: number | null;
}

export interface PricePromotion {
  id: string;
  name: string;
  status: PricePromotionStatus;
  startsAt: Date;
  /** Null = runs until manually ended. */
  endsAt: Date | null;
  items: PricePromotionItem[];
  itemCount: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
}
