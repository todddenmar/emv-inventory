/** Firestore collection names for the physical inventory app. */
export const COLLECTIONS = {
  branches: "physicalBranches",
  products: "physicalProducts",
  categories: "physicalCategories",
  vendors: "physicalVendors",
  branchInventory: "physicalBranchInventory",
  inventoryLogs: "physicalInventoryLogs",
  productPriceLogs: "physicalProductPriceLogs",
  branchTransfers: "physicalBranchTransfers",
  posSales: "physicalPosSales",
  supplierStockIns: "physicalSupplierStockIns",
  resellers: "physicalResellers",
  vouchers: "physicalVouchers",
  /** Auth — shared, not physical-prefixed */
  users: "users",
  invites: "invites",
  settingsBootstrap: "settings",
} as const;
