"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  FileJson,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getClientAuth } from "@/lib/firebase";
import {
  createCategory,
  getCategories,
} from "@/lib/firestore/categories";
import { getProducts } from "@/lib/firestore/products";
import { getVendors } from "@/lib/firestore/vendors";
import {
  getImportProductDbStatus,
  importProductToDatabase,
  resolveImportCategoryId,
  type ImportProductDbStatus,
} from "@/lib/import-products-db";
import emvCategoriesSample from "@/lib/sample-data/emv-categories.json";
import emvProductsSample from "@/lib/sample-data/emv-products.json";
import {
  addImportVariant,
  assignProductsToCategory,
  assignProductsToProductType,
  createImportProduct,
  formatImportPrice,
  listCategoryTabs,
  listProductTypeNames,
  listZeroPriceVariants,
  parseProductJsonImport,
  renameImportCategory,
  serializeImportProducts,
  summarizeImport,
  updateImportProduct,
  updateImportVariant,
  type ParsedImportProduct,
} from "@/lib/product-json-import";
import { slugify } from "@/lib/slug";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type { Category, Product, Vendor } from "@/types";

const SAMPLE_FILE_NAME = "emv-products.json";
const CATEGORIES_SAMPLE_FILE_NAME = "emv-categories.json";
const ALL_CATEGORIES = "__all__";

type BulkActionKind = "category" | "productType";
type DbStatusFilter = "all" | "not_in_database" | "in_database";

type SampleCategoryRow = {
  id: string;
  slug: string;
  name: string;
};

function buildSampleCategoryRows(
  entries: Array<{ id: string; name: string }>
): SampleCategoryRow[] {
  return entries.map((entry) => ({
    id: crypto.randomUUID(),
    slug: slugify(entry.id) || crypto.randomUUID(),
    name: entry.name.trim(),
  }));
}

function downloadFileStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function loadFromRaw(raw: unknown): {
  products: ParsedImportProduct[];
  errors: string[];
  emptyCategories: string[];
  ok: boolean;
} {
  const result = parseProductJsonImport(raw);
  if (
    result.products.length === 0 &&
    result.emptyCategories.length === 0
  ) {
    return { ...result, ok: false };
  }
  return {
    products: result.products,
    errors: result.errors,
    emptyCategories: result.emptyCategories,
    ok: true,
  };
}

function matchesQuery(value: string, query: string): boolean {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function ImportDbStatusBadge({
  status,
  loading,
}: {
  status: ImportProductDbStatus | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <Badge variant="outline">Checking…</Badge>;
  }
  if (!status) {
    return <Badge variant="outline">Unknown</Badge>;
  }
  if (status.kind === "in_database") {
    return <Badge variant="secondary">In database</Badge>;
  }
  return <Badge>Ready to import</Badge>;
}

export default function ProductJsonImportPage() {
  const { isMasterAdmin } = useBranchAccess();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceLabel, setSourceLabel] = useState(SAMPLE_FILE_NAME);
  const [loadingSample, setLoadingSample] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<ParsedImportProduct[]>([]);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const [sampleCategoryRows, setSampleCategoryRows] = useState<
    SampleCategoryRow[]
  >(() => buildSampleCategoryRows(emvCategoriesSample));
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [dbVendors, setDbVendors] = useState<Vendor[]>([]);
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [loadingDbCategories, setLoadingDbCategories] = useState(true);
  const [loadingDbProducts, setLoadingDbProducts] = useState(true);
  const [importingCategories, setImportingCategories] = useState(false);
  const [importingProductIds, setImportingProductIds] = useState<string[]>([]);
  const [importingSelectedProducts, setImportingSelectedProducts] =
    useState(false);
  const [assignCategoryOpen, setAssignCategoryOpen] = useState(false);
  const [assignCategoryMode, setAssignCategoryMode] = useState<
    "single" | "bulk"
  >("single");
  const [assignCategoryProduct, setAssignCategoryProduct] =
    useState<ParsedImportProduct | null>(null);
  const [assignCategoryId, setAssignCategoryId] = useState<string>("none");

  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [editingCategoryFrom, setEditingCategoryFrom] = useState("");
  const [editCategoryFormName, setEditCategoryFormName] = useState("");

  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [bulkActionKind, setBulkActionKind] =
    useState<BulkActionKind>("productType");
  const [bulkAssignCategory, setBulkAssignCategory] = useState("");
  const [bulkAssignProductType, setBulkAssignProductType] = useState("");

  const [editProductOpen, setEditProductOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState("");
  const [editName, setEditName] = useState("");
  const [editProductType, setEditProductType] = useState("");
  const [editVendorName, setEditVendorName] = useState("");
  const [editCategoryName, setEditCategoryName] = useState("");

  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [createProductName, setCreateProductName] = useState("");
  const [createProductType, setCreateProductType] = useState("");
  const [createProductVendor, setCreateProductVendor] = useState("");

  const [createVariantOpen, setCreateVariantOpen] = useState(false);
  const [createVariantProductId, setCreateVariantProductId] = useState("");
  const [createVariantProductName, setCreateVariantProductName] = useState("");
  const [createVariantName, setCreateVariantName] = useState("");
  const [createVariantPrice, setCreateVariantPrice] = useState("0");

  const [editVariantOpen, setEditVariantOpen] = useState(false);
  const [editVariantProductId, setEditVariantProductId] = useState("");
  const [editVariantProductName, setEditVariantProductName] = useState("");
  const [editVariantId, setEditVariantId] = useState("");
  const [editVariantName, setEditVariantName] = useState("");
  const [editVariantPrice, setEditVariantPrice] = useState("0");

  const [zeroPriceOpen, setZeroPriceOpen] = useState(false);

  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [productSearch, setProductSearch] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState("all");
  const [dbStatusFilter, setDbStatusFilter] = useState<DbStatusFilter>("all");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [browseAllProducts, setBrowseAllProducts] = useState(false);
  const [productPage, setProductPage] = useState(1);

  const summary = useMemo(() => summarizeImport(products), [products]);
  const zeroPriceVariants = useMemo(
    () => listZeroPriceVariants(products),
    [products]
  );
  const categoryTabs = useMemo(
    () => listCategoryTabs(products, extraCategories),
    [products, extraCategories]
  );
  const productTypeNames = useMemo(
    () => listProductTypeNames(products),
    [products]
  );

  const existingCategorySlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const category of dbCategories) {
      const slug = category.slug.trim().toLowerCase();
      if (slug) slugs.add(slug);
    }
    return slugs;
  }, [dbCategories]);

  const existingCategoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const category of dbCategories) {
      const name = category.name.trim().toLowerCase();
      if (name) names.add(name);
    }
    return names;
  }, [dbCategories]);

  const sampleCategoriesReadyCount = useMemo(
    () =>
      sampleCategoryRows.filter(
        (row) =>
          !existingCategorySlugs.has(row.slug.toLowerCase()) &&
          !existingCategoryNames.has(row.name.toLowerCase())
      ).length,
    [sampleCategoryRows, existingCategorySlugs, existingCategoryNames]
  );

  const importProductDbStatusById = useMemo(() => {
    const map = new Map<string, ImportProductDbStatus>();
    for (const product of products) {
      map.set(
        product.id,
        getImportProductDbStatus(
          product,
          dbProducts,
          dbCategories,
          dbVendors
        )
      );
    }
    return map;
  }, [products, dbProducts, dbCategories, dbVendors]);

  const selectedReadyToImportCount = useMemo(
    () =>
      selectedProductIds.filter(
        (id) => importProductDbStatusById.get(id)?.kind === "ready"
      ).length,
    [selectedProductIds, importProductDbStatusById]
  );

  const importDbOverview = useMemo(() => {
    let inDatabase = 0;
    let notInDatabase = 0;
    for (const status of importProductDbStatusById.values()) {
      if (status.kind === "in_database") inDatabase += 1;
      else notInDatabase += 1;
    }
    return { inDatabase, notInDatabase };
  }, [importProductDbStatusById]);

  const matchesDbStatusFilter = (
    productId: string,
    filter: DbStatusFilter
  ): boolean => {
    if (filter === "all") return true;
    const status = importProductDbStatusById.get(productId);
    if (filter === "not_in_database") return status?.kind === "ready";
    return status?.kind === "in_database";
  };

  const isViewingAllCategories = activeCategory === ALL_CATEGORIES;

  const categoryTabsForNav = useMemo(() => {
    if (dbStatusFilter === "all") return categoryTabs;
    return categoryTabs.map((tab) => {
      const matching = products.filter(
        (product) =>
          product.categoryName === tab.categoryName &&
          matchesDbStatusFilter(product.id, dbStatusFilter)
      );
      return {
        categoryName: tab.categoryName,
        productCount: matching.length,
        variantCount: matching.reduce(
          (sum, product) => sum + product.variants.length,
          0
        ),
      };
    });
  }, [
    categoryTabs,
    products,
    dbStatusFilter,
    importProductDbStatusById,
  ]);

  const activeCategoryTab = useMemo(() => {
    if (isViewingAllCategories) {
      const matching = products.filter((product) =>
        matchesDbStatusFilter(product.id, dbStatusFilter)
      );
      return {
        categoryName: "All categories",
        productCount: matching.length,
        variantCount: matching.reduce(
          (sum, product) => sum + product.variants.length,
          0
        ),
      };
    }
    return categoryTabsForNav.find(
      (tab) => tab.categoryName === activeCategory
    );
  }, [
    isViewingAllCategories,
    categoryTabsForNav,
    activeCategory,
    products,
    dbStatusFilter,
    importProductDbStatusById,
  ]);

  const allCategoriesNavCount = useMemo(() => {
    if (dbStatusFilter === "all") return products.length;
    return products.filter((product) =>
      matchesDbStatusFilter(product.id, dbStatusFilter)
    ).length;
  }, [products, dbStatusFilter, importProductDbStatusById]);

  const sourceProducts = useMemo(() => {
    if (!activeCategoryTab) return [];
    if (isViewingAllCategories) return products;
    if (browseAllProducts) {
      return products.filter(
        (product) => product.categoryName !== activeCategory
      );
    }
    return products.filter(
      (product) => product.categoryName === activeCategory
    );
  }, [
    activeCategoryTab,
    browseAllProducts,
    products,
    activeCategory,
    isViewingAllCategories,
  ]);

  const filteredProductRows = useMemo(() => {
    return sourceProducts
      .map((product) => {
        if (!matchesDbStatusFilter(product.id, dbStatusFilter)) return null;
        if (
          productTypeFilter !== "all" &&
          product.productType !== productTypeFilter
        ) {
          return null;
        }
        if (!matchesQuery(product.name, productSearch)) return null;

        const variants = variantSearch.trim()
          ? product.variants.filter((v) => matchesQuery(v.name, variantSearch))
          : product.variants;

        if (variantSearch.trim() && variants.length === 0) return null;

        return { ...product, variants };
      })
      .filter((p): p is NonNullable<typeof p> => p != null)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
  }, [
    sourceProducts,
    productSearch,
    variantSearch,
    productTypeFilter,
    dbStatusFilter,
    importProductDbStatusById,
  ]);

  const totalProductPages = Math.max(
    1,
    Math.ceil(filteredProductRows.length / TABLE_PAGE_SIZE)
  );

  const pagedProductRows = useMemo(() => {
    const start = (productPage - 1) * TABLE_PAGE_SIZE;
    return filteredProductRows.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredProductRows, productPage]);

  const productRangeStart =
    filteredProductRows.length === 0
      ? 0
      : (productPage - 1) * TABLE_PAGE_SIZE + 1;
  const productRangeEnd = Math.min(
    productPage * TABLE_PAGE_SIZE,
    filteredProductRows.length
  );

  const visibleProductIds = useMemo(
    () => pagedProductRows.map((p) => p.id),
    [pagedProductRows]
  );

  const allVisibleSelected =
    visibleProductIds.length > 0 &&
    visibleProductIds.every((id) => selectedProductIds.includes(id));

  const someVisibleSelected = visibleProductIds.some((id) =>
    selectedProductIds.includes(id)
  );

  const bulkCategoryOptions = useMemo(
    () =>
      categoryTabs.filter((tab) =>
        browseAllProducts ? true : tab.categoryName !== activeCategory
      ),
    [categoryTabs, browseAllProducts, activeCategory]
  );

  const selectCategory = (categoryName: string) => {
    setActiveCategory(categoryName);
    setProductSearch("");
    setVariantSearch("");
    setProductTypeFilter("all");
    setSelectedProductIds([]);
    setBrowseAllProducts(false);
    setProductPage(1);
  };

  useEffect(() => {
    const result = loadFromRaw(emvProductsSample);
    setSourceLabel(SAMPLE_FILE_NAME);
    setProducts(result.products);
    setErrors(result.errors);
    setExtraCategories(result.emptyCategories);
    setSelectedProductIds([]);
    setLoadingSample(false);
    if (!result.ok) {
      toast.error("Sample catalog has no products");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingDbCategories(true);
    setLoadingDbProducts(true);

    Promise.all([getCategories(true), getVendors(), getProducts(false, true)])
      .then(([categories, vendors, productsInDb]) => {
        if (cancelled) return;
        setDbCategories(categories);
        setDbVendors(vendors);
        setDbProducts(productsInDb);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          toast.error("Failed to load database catalog");
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingDbCategories(false);
        setLoadingDbProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (categoryTabs.length === 0) {
      setActiveCategory("");
      return;
    }
    if (activeCategory === ALL_CATEGORIES) return;
    if (!categoryTabs.some((tab) => tab.categoryName === activeCategory)) {
      setActiveCategory(ALL_CATEGORIES);
    }
  }, [categoryTabs, activeCategory]);

  useEffect(() => {
    setProductPage(1);
  }, [
    activeCategory,
    browseAllProducts,
    productSearch,
    variantSearch,
    productTypeFilter,
    dbStatusFilter,
  ]);

  useEffect(() => {
    if (productPage > totalProductPages) {
      setProductPage(totalProductPages);
    }
  }, [productPage, totalProductPages]);

  if (!isMasterAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only the master-admin can import products.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pruneExtraCategories = (
    nextProducts: ParsedImportProduct[],
    nextExtras: string[]
  ) => {
    const used = new Set(nextProducts.map((p) => p.categoryName));
    return nextExtras.filter((name) => !used.has(name));
  };

  const applyParsed = (
    result: {
      products: ParsedImportProduct[];
      errors: string[];
      emptyCategories: string[];
      ok: boolean;
    },
    label: string
  ) => {
    if (!result.ok) {
      toast.error("No products or categories found in this file");
      return;
    }
    setSourceLabel(label);
    setProducts(result.products);
    setErrors(result.errors);
    setExtraCategories(result.emptyCategories);
    setSelectedProductIds([]);
    setProductSearch("");
    setVariantSearch("");
    setProductTypeFilter("all");
    setBrowseAllProducts(false);
    setActiveCategory("");
    if (result.errors.length > 0) {
      toast.warning(
        `Loaded ${result.products.length} products with ${result.errors.length} warnings`
      );
    } else {
      toast.success(
        `Loaded ${result.products.length} products` +
          (result.emptyCategories.length > 0
            ? ` · ${result.emptyCategories.length} empty categor${
                result.emptyCategories.length === 1 ? "y" : "ies"
              }`
            : "")
      );
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      toast.error("Please upload a .json file");
      return;
    }

    setParsing(true);
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      applyParsed(loadFromRaw(raw), file.name);
    } catch (err) {
      toast.error(
        err instanceof SyntaxError
          ? "Invalid JSON file"
          : "Failed to read JSON file"
      );
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleImportSampleCategories = async () => {
    if (sampleCategoriesReadyCount === 0) {
      toast.message("All sample categories are already in the database");
      return;
    }

    setImportingCategories(true);
    let created = 0;
    let skipped = 0;
    const createdRows: Category[] = [];
    const seenSlugs = new Set(existingCategorySlugs);
    const seenNames = new Set(existingCategoryNames);

    try {
      for (const row of sampleCategoryRows) {
        const slugKey = row.slug.toLowerCase();
        const nameKey = row.name.toLowerCase();
        if (seenSlugs.has(slugKey) || seenNames.has(nameKey)) {
          skipped += 1;
          continue;
        }

        await createCategory({
          id: row.id,
          name: row.name,
          slug: row.slug,
          tags: [],
        });
        created += 1;
        seenSlugs.add(slugKey);
        seenNames.add(nameKey);
        createdRows.push({
          id: row.id,
          name: row.name,
          slug: row.slug,
          tags: [],
          lowStockThreshold: 5,
          freebieVariants: [],
          isArchived: false,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      if (createdRows.length > 0) {
        setDbCategories((prev) =>
          [...prev, ...createdRows].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          )
        );
      }

      if (created > 0) {
        toast.success(
          `Added ${created} categor${created === 1 ? "y" : "ies"} to the database` +
            (skipped > 0 ? ` · skipped ${skipped} existing` : "")
        );
      } else {
        toast.message(
          skipped > 0
            ? "No new categories — all already exist"
            : "No categories to import"
        );
      }
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add categories to the database"
      );
    } finally {
      setImportingCategories(false);
    }
  };

  const mergeImportedProductIntoState = (
    product: Product,
    vendorCreated: Vendor | null
  ) => {
    setDbProducts((prev) => {
      if (prev.some((existing) => existing.id === product.id)) return prev;
      return [...prev, product].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    });
    if (vendorCreated) {
      setDbVendors((prev) => {
        if (prev.some((vendor) => vendor.id === vendorCreated.id)) return prev;
        return [...prev, vendorCreated].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
      });
    }
  };

  const suggestedCategoryId = (product: ParsedImportProduct) =>
    resolveImportCategoryId(product.categoryName, dbCategories) ?? "none";

  const openAssignCategoryForProduct = (product: ParsedImportProduct) => {
    const status = importProductDbStatusById.get(product.id);
    if (status?.kind === "in_database") {
      toast.message(`“${product.name}” is already in the database`);
      return;
    }
    setAssignCategoryMode("single");
    setAssignCategoryProduct(product);
    setAssignCategoryId(suggestedCategoryId(product));
    setAssignCategoryOpen(true);
  };

  const openAssignCategoryForSelected = () => {
    const readyProducts = products.filter((product) => {
      if (!selectedProductIds.includes(product.id)) return false;
      return importProductDbStatusById.get(product.id)?.kind === "ready";
    });

    if (readyProducts.length === 0) {
      toast.message("No selected products are ready to import");
      return;
    }

    const firstSuggested = suggestedCategoryId(readyProducts[0]);
    const allSame = readyProducts.every(
      (product) => suggestedCategoryId(product) === firstSuggested
    );

    setAssignCategoryMode("bulk");
    setAssignCategoryProduct(null);
    setAssignCategoryId(allSame ? firstSuggested : "none");
    setAssignCategoryOpen(true);
  };

  const selectedCategoryIdForImport =
    assignCategoryId === "none" ? null : assignCategoryId;

  const handleImportProductToDb = async (
    product: ParsedImportProduct,
    categoryId: string | null
  ) => {
    setImportingProductIds((prev) => [...prev, product.id]);
    try {
      const result = await importProductToDatabase(
        product,
        dbCategories,
        dbVendors,
        dbProducts,
        { categoryId }
      );
      mergeImportedProductIntoState(result.product, result.vendorCreated);
      if (result.created) {
        toast.success(
          `Added “${product.name}” with ${product.variants.length} variant${
            product.variants.length === 1 ? "" : "s"
          }`
        );
      } else {
        toast.message(`“${product.name}” was already in the database`);
      }
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to add “${product.name}”`
      );
    } finally {
      setImportingProductIds((prev) => prev.filter((id) => id !== product.id));
    }
  };

  const handleImportSelectedProductsToDb = async (
    categoryId: string | null
  ) => {
    const readyProducts = products.filter((product) => {
      if (!selectedProductIds.includes(product.id)) return false;
      return importProductDbStatusById.get(product.id)?.kind === "ready";
    });

    if (readyProducts.length === 0) {
      toast.message("No selected products are ready to import");
      return;
    }

    setImportingSelectedProducts(true);
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let workingProducts = [...dbProducts];
    let workingVendors = [...dbVendors];

    try {
      for (const product of readyProducts) {
        try {
          const result = await importProductToDatabase(
            product,
            dbCategories,
            workingVendors,
            workingProducts,
            { categoryId }
          );
          if (result.vendorCreated) {
            workingVendors = [...workingVendors, result.vendorCreated];
            setDbVendors((prev) => {
              if (prev.some((vendor) => vendor.id === result.vendorCreated!.id)) {
                return prev;
              }
              return [...prev, result.vendorCreated!].sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                  sensitivity: "base",
                })
              );
            });
          }
          if (result.created) {
            created += 1;
            workingProducts = [...workingProducts, result.product];
            setDbProducts((prev) => {
              if (prev.some((existing) => existing.id === result.product.id)) {
                return prev;
              }
              return [...prev, result.product].sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                  sensitivity: "base",
                })
              );
            });
          } else {
            skipped += 1;
          }
        } catch (error) {
          console.error(error);
          failed += 1;
        }
      }

      if (created > 0) {
        toast.success(
          `Added ${created} product${created === 1 ? "" : "s"} to the database` +
            (skipped > 0 ? ` · skipped ${skipped}` : "") +
            (failed > 0 ? ` · failed ${failed}` : "")
        );
      } else if (failed > 0) {
        toast.error(`Failed to import ${failed} product${failed === 1 ? "" : "s"}`);
      } else {
        toast.message("No new products were added");
      }
    } finally {
      setImportingSelectedProducts(false);
    }
  };

  const handleConfirmAssignCategory = async () => {
    const categoryId = selectedCategoryIdForImport;
    setAssignCategoryOpen(false);

    if (assignCategoryMode === "single" && assignCategoryProduct) {
      await handleImportProductToDb(assignCategoryProduct, categoryId);
      setAssignCategoryProduct(null);
      return;
    }

    await handleImportSelectedProductsToDb(categoryId);
  };

  const handleSaveSample = async () => {
    if (products.length === 0 && extraCategories.length === 0) {
      toast.error("Nothing to save");
      return;
    }

    const firebaseUser = getClientAuth().currentUser;
    if (!firebaseUser) {
      toast.error("Sign in to save the sample catalog");
      return;
    }

    setSaving(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const payload = serializeImportProducts(products, extraCategories);
      const response = await fetch("/api/admin/sample-catalog", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        productCount?: number;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to save sample catalog");
      }

      setSourceLabel(SAMPLE_FILE_NAME);
      toast.success(
        `Saved ${data?.productCount ?? products.length} products to ${SAMPLE_FILE_NAME}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save sample catalog"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    const payload = serializeImportProducts(products, extraCategories);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `emv-products-${downloadFileStamp()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded current catalog JSON");
  };

  const handleCreateCategory = () => {
    const name = newCategoryName.trim();

    if (!name) {
      toast.error("Enter a category name");
      return;
    }
    if (
      categoryTabs.some(
        (tab) => tab.categoryName.toLowerCase() === name.toLowerCase()
      )
    ) {
      toast.error("That category already exists");
      return;
    }

    setExtraCategories((prev) => [...prev, name]);
    setNewCategoryName("");
    setCreateCategoryOpen(false);
    if (editProductOpen) {
      setEditCategoryName(name);
    } else {
      setActiveCategory(name);
      setBrowseAllProducts(false);
      setSelectedProductIds([]);
      setProductSearch("");
      setVariantSearch("");
      setProductTypeFilter("all");
    }
    toast.success(`Created category “${name}”`);
  };

  const openEditCategory = (categoryName: string) => {
    setEditingCategoryFrom(categoryName);
    setEditCategoryFormName(categoryName);
    setEditCategoryOpen(true);
  };

  const handleEditCategory = () => {
    const from = editingCategoryFrom.trim();
    const to = editCategoryFormName.trim();

    if (!from) return;
    if (!to) {
      toast.error("Enter a category name");
      return;
    }
    if (
      to.toLowerCase() !== from.toLowerCase() &&
      categoryTabs.some(
        (tab) => tab.categoryName.toLowerCase() === to.toLowerCase()
      )
    ) {
      toast.error("That category name already exists");
      return;
    }

    const next = renameImportCategory(products, from, to);
    setProducts(next);
    setExtraCategories((prev) => {
      const withoutFrom = prev.filter((name) => name !== from);
      const used = new Set(next.map((p) => p.categoryName));
      if (!used.has(to) && !withoutFrom.includes(to)) {
        return [...withoutFrom, to];
      }
      return withoutFrom.filter((name) => !used.has(name));
    });
    setEditCategoryOpen(false);
    setEditingCategoryFrom("");
    setActiveCategory(to);
    toast.success(`Renamed category to “${to}”`);
  };

  const toggleProductSelected = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedProductIds((prev) =>
        prev.filter((id) => !visibleProductIds.includes(id))
      );
      return;
    }
    setSelectedProductIds((prev) => [
      ...new Set([...prev, ...visibleProductIds]),
    ]);
  };

  const openEditProduct = (product: ParsedImportProduct) => {
    setEditingProductId(product.id);
    setEditName(product.name);
    setEditProductType(product.productType);
    setEditVendorName(product.vendorName);
    setEditCategoryName(product.categoryName || activeCategory);
    setEditProductOpen(true);
  };

  const handleEditProduct = () => {
    const name = editName.trim();
    const productType = editProductType.trim();
    const categoryName = editCategoryName.trim();

    if (!editingProductId) return;
    if (!name) {
      toast.error("Enter a product name");
      return;
    }
    if (!productType) {
      toast.error("Enter a product type");
      return;
    }
    if (!categoryName) {
      toast.error("Choose a category");
      return;
    }

    const next = updateImportProduct(products, editingProductId, {
      name,
      productType,
      categoryName,
      vendorName: editVendorName,
    });
    setProducts(next);
    setExtraCategories((prev) => pruneExtraCategories(next, prev));
    setEditProductOpen(false);
    setEditingProductId("");
    setActiveCategory(categoryName);
    setBrowseAllProducts(false);
    toast.success(`Updated “${name}”`);
  };

  const openCreateProduct = () => {
    if (!activeCategory) {
      toast.error("Select a category first");
      return;
    }
    setCreateProductName("");
    setCreateProductType(productTypeNames[0] ?? "");
    const vendorGuess =
      products.find((p) => p.categoryName === activeCategory)?.vendorName ??
      "";
    setCreateProductVendor(vendorGuess);
    setCreateProductOpen(true);
  };

  const handleCreateProduct = () => {
    const created = createImportProduct({
      name: createProductName,
      productType: createProductType,
      categoryName: activeCategory,
      vendorName: createProductVendor,
    });
    if (!created) {
      toast.error("Enter a product name and product type");
      return;
    }
    const next = [...products, created];
    setProducts(next);
    setExtraCategories((prev) => pruneExtraCategories(next, prev));
    setCreateProductOpen(false);
    setBrowseAllProducts(false);
    setProductSearch("");
    setVariantSearch("");
    setProductTypeFilter("all");
    toast.success(`Created product “${created.name}”`);
  };

  const openCreateVariant = (product: ParsedImportProduct) => {
    setCreateVariantProductId(product.id);
    setCreateVariantProductName(product.name);
    setCreateVariantName("");
    setCreateVariantPrice("0");
    setCreateVariantOpen(true);
  };

  const handleCreateVariant = () => {
    const name = createVariantName.trim();
    const price =
      createVariantPrice.trim() === "" ? 0 : Number(createVariantPrice);
    if (!name) {
      toast.error("Enter a variant name");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price (0 or higher)");
      return;
    }
    if (!createVariantProductId) return;

    const next = addImportVariant(products, createVariantProductId, {
      name,
      price,
    });
    setProducts(next);
    setCreateVariantOpen(false);
    setCreateVariantProductId("");
    toast.success(`Added variant “${name}” to “${createVariantProductName}”`);
  };

  const openEditVariant = (
    product: ParsedImportProduct,
    variant: { id: string; name: string; price: number }
  ) => {
    setEditVariantProductId(product.id);
    setEditVariantProductName(product.name);
    setEditVariantId(variant.id);
    setEditVariantName(variant.name);
    setEditVariantPrice(String(variant.price));
    setEditVariantOpen(true);
  };

  const handleEditVariant = () => {
    const name = editVariantName.trim();
    const price =
      editVariantPrice.trim() === "" ? 0 : Number(editVariantPrice);
    if (!name) {
      toast.error("Enter a variant name");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price (0 or higher)");
      return;
    }
    if (!editVariantProductId || !editVariantId) return;

    const next = updateImportVariant(
      products,
      editVariantProductId,
      editVariantId,
      { name, price }
    );
    setProducts(next);
    setEditVariantOpen(false);
    setEditVariantProductId("");
    setEditVariantId("");
    toast.success(`Updated variant “${name}”`);
  };

  const openBulkAction = (kind: BulkActionKind) => {
    if (selectedProductIds.length === 0) {
      toast.error("Select at least one product");
      return;
    }
    setBulkActionKind(kind);
    if (kind === "category") {
      setBulkAssignCategory(
        browseAllProducts
          ? activeCategory
          : bulkCategoryOptions[0]?.categoryName ?? ""
      );
    } else {
      setBulkAssignProductType("");
    }
    setBulkActionOpen(true);
  };

  const handleBulkAction = () => {
    if (selectedProductIds.length === 0) {
      toast.error("Select at least one product");
      return;
    }

    const count = selectedProductIds.length;

    if (bulkActionKind === "category") {
      const target = bulkAssignCategory.trim();
      if (!target) {
        toast.error("Choose a target category");
        return;
      }
      const next = assignProductsToCategory(
        products,
        selectedProductIds,
        target
      );
      setProducts(next);
      setExtraCategories((prev) => pruneExtraCategories(next, prev));
      setSelectedProductIds([]);
      setBulkActionOpen(false);
      setActiveCategory(target);
      setBrowseAllProducts(false);
      toast.success(
        `Assigned ${count} product${count === 1 ? "" : "s"} to category “${target}”`
      );
      return;
    }

    const targetType = bulkAssignProductType.trim();
    if (!targetType) {
      toast.error("Enter a product type");
      return;
    }
    const next = assignProductsToProductType(
      products,
      selectedProductIds,
      targetType
    );
    setProducts(next);
    setSelectedProductIds([]);
    setBulkActionOpen(false);
    toast.success(
      `Assigned ${count} product${count === 1 ? "" : "s"} to type “${targetType}”`
    );
  };

  const hasCatalog = categoryTabs.length > 0 || products.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product catalog</h1>
          <p className="text-muted-foreground">
            Browse the catalog, then add products to the database with their
            variants. Status shows whether each product is already imported.
          </p>
        </div>
        <LinkButton href="/admin/products" variant="outline">
          Back to products
        </LinkButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Physical store categories
          </CardTitle>
          <CardDescription>
            Preview from{" "}
            <Badge variant="secondary">{CATEGORIES_SAMPLE_FILE_NAME}</Badge>
            . File <code className="text-xs">id</code> becomes the category
            slug; each row gets a new random unique database id.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void handleImportSampleCategories()}
              disabled={
                importingCategories ||
                loadingDbCategories ||
                sampleCategoriesReadyCount === 0
              }
            >
              {importingCategories ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Add {sampleCategoriesReadyCount} to database
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSampleCategoryRows(
                  buildSampleCategoryRows(emvCategoriesSample)
                )
              }
              disabled={importingCategories}
            >
              Regenerate ids
            </Button>
            <Badge variant="outline">
              {sampleCategoryRows.length} in file
            </Badge>
            {loadingDbCategories ? (
              <Badge variant="secondary">Checking database…</Badge>
            ) : (
              <Badge variant="secondary">
                {sampleCategoryRows.length - sampleCategoriesReadyCount} already
                exist
              </Badge>
            )}
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="min-w-[220px]">Id</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleCategoryRows.map((row) => {
                  const exists =
                    existingCategorySlugs.has(row.slug.toLowerCase()) ||
                    existingCategoryNames.has(row.name.toLowerCase());
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.slug}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.id}
                      </TableCell>
                      <TableCell>
                        {loadingDbCategories ? (
                          <Badge variant="outline">…</Badge>
                        ) : exists ? (
                          <Badge variant="secondary">Exists</Badge>
                        ) : (
                          <Badge>New</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileJson className="h-4 w-4" />
            Catalog JSON
          </CardTitle>
          <CardDescription>
            Source: <Badge variant="secondary">{sourceLabel}</Badge>
            <span className="mt-1 block">
              Upload accepts the same JSON you download (category groups with
              product-level productType). Save overwrites{" "}
              <code className="text-xs">src/lib/sample-data/{SAMPLE_FILE_NAME}</code>{" "}
              in development.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={parsing || loadingSample}
            >
              {parsing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownload}
              disabled={products.length === 0 || loadingSample || saving}
            >
              <Download className="mr-2 h-4 w-4" />
              Download JSON
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveSample()}
              disabled={
                saving ||
                loadingSample ||
                (products.length === 0 && extraCategories.length === 0)
              }
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save to {SAMPLE_FILE_NAME}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNewCategoryName("");
                setCreateCategoryOpen(true);
              }}
              disabled={loadingSample || saving}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create category
            </Button>
          </div>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base text-amber-700">
              Parse warnings ({errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {errors.map((error, index) => (
                <li key={`error-${index}`}>{error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {loadingSample ? (
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sample catalog…
          </CardContent>
        </Card>
      ) : hasCatalog ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Products</CardDescription>
                <CardTitle className="text-3xl">{summary.productCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-muted/40"
              onClick={() => {
                setDbStatusFilter("in_database");
                setActiveCategory(ALL_CATEGORIES);
                setBrowseAllProducts(false);
              }}
            >
              <CardHeader className="pb-2">
                <CardDescription>In database</CardDescription>
                <CardTitle className="text-3xl">
                  {loadingDbProducts ? "…" : importDbOverview.inDatabase}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-muted/40"
              onClick={() => {
                setDbStatusFilter("not_in_database");
                setActiveCategory(ALL_CATEGORIES);
                setBrowseAllProducts(false);
              }}
            >
              <CardHeader className="pb-2">
                <CardDescription>Not in database</CardDescription>
                <CardTitle className="text-3xl">
                  {loadingDbProducts ? "…" : importDbOverview.notInDatabase}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Variants</CardDescription>
                <CardTitle className="text-3xl">{summary.variantCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Suppliers</CardDescription>
                <CardTitle className="text-3xl">{summary.vendorCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Categories</CardDescription>
                <CardTitle className="text-3xl">
                  {categoryTabs.length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Product types</CardDescription>
                <CardTitle className="text-3xl">
                  {productTypeNames.length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Zero-price variants</CardDescription>
                <CardTitle className="text-3xl">
                  {summary.zeroPriceVariantCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={summary.zeroPriceVariantCount === 0}
                  onClick={() => setZeroPriceOpen(true)}
                >
                  View list
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Catalog</CardTitle>
              <CardDescription>
                Pick a category in the sidebar, then manage its products (10 per
                page). Bulk-assign selected products to a product type or another
                category.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {categoryTabs.length > 0 && activeCategory && activeCategoryTab ? (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <aside className="w-full shrink-0 space-y-2 lg:sticky lg:top-4 lg:w-64">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Categories</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNewCategoryName("");
                          setCreateCategoryOpen(true);
                        }}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                    <nav className="max-h-[32rem] space-y-1 overflow-y-auto rounded-lg border p-1">
                      <button
                        type="button"
                        onClick={() => selectCategory(ALL_CATEGORIES)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                          isViewingAllCategories
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <span className="truncate font-medium">
                          All categories
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            isViewingAllCategories
                              ? "text-accent-foreground/70"
                              : "text-muted-foreground"
                          )}
                        >
                          {allCategoriesNavCount} product
                          {allCategoriesNavCount === 1 ? "" : "s"}
                        </span>
                      </button>
                      {categoryTabsForNav.map((tab) => {
                        const isActive = activeCategory === tab.categoryName;
                        return (
                          <button
                            key={tab.categoryName}
                            type="button"
                            onClick={() => selectCategory(tab.categoryName)}
                            className={cn(
                              "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                              isActive
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-muted"
                            )}
                          >
                            <span className="truncate font-medium">
                              {tab.categoryName}
                            </span>
                            <span
                              className={cn(
                                "text-xs",
                                isActive
                                  ? "text-accent-foreground/70"
                                  : "text-muted-foreground"
                              )}
                            >
                              {tab.productCount} product
                              {tab.productCount === 1 ? "" : "s"} ·{" "}
                              {tab.variantCount} variant
                              {tab.variantCount === 1 ? "" : "s"}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </aside>

                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-medium">
                          {activeCategoryTab.categoryName}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {activeCategoryTab.productCount} product
                          {activeCategoryTab.productCount === 1 ? "" : "s"} ·{" "}
                          {activeCategoryTab.variantCount} variant
                          {activeCategoryTab.variantCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          onClick={openCreateProduct}
                          disabled={browseAllProducts || isViewingAllCategories}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add product
                        </Button>
                        {!isViewingAllCategories && (
                          <Button
                            type="button"
                            variant={browseAllProducts ? "default" : "outline"}
                            onClick={() => {
                              setBrowseAllProducts((v) => !v);
                              setSelectedProductIds([]);
                              setProductSearch("");
                              setVariantSearch("");
                              setProductTypeFilter("all");
                            }}
                          >
                            {browseAllProducts
                              ? "Show this category"
                              : "Browse other products"}
                          </Button>
                        )}
                        {!isViewingAllCategories && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">
                                    Category actions
                                  </span>
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  openEditCategory(
                                    activeCategoryTab.categoryName
                                  )
                                }
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Database status</Label>
                        <Select
                          value={dbStatusFilter}
                          onValueChange={(value) =>
                            setDbStatusFilter(
                              (value as DbStatusFilter | null) ?? "all"
                            )
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="All products">
                              {(value) => {
                                if (value === "not_in_database") {
                                  return "Not in database";
                                }
                                if (value === "in_database") {
                                  return "In database";
                                }
                                return "All products";
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All products</SelectItem>
                            <SelectItem value="not_in_database">
                              Not in database
                              {loadingDbProducts
                                ? ""
                                : ` (${importDbOverview.notInDatabase})`}
                            </SelectItem>
                            <SelectItem value="in_database">
                              In database
                              {loadingDbProducts
                                ? ""
                                : ` (${importDbOverview.inDatabase})`}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Filter by product type</Label>
                        <Select
                          value={productTypeFilter}
                          onValueChange={(value) =>
                            setProductTypeFilter(value ?? "all")
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="All product types">
                              {(value) =>
                                !value || value === "all"
                                  ? "All product types"
                                  : String(value)
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              All product types
                            </SelectItem>
                            {productTypeNames.map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="search-products">Search products</Label>
                        <div className="relative">
                          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="search-products"
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder="Search products…"
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="search-variants">Search variants</Label>
                        <div className="relative">
                          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="search-variants"
                            value={variantSearch}
                            onChange={(e) => setVariantSearch(e.target.value)}
                            placeholder="Search variants…"
                            className="pl-9"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="select-all-visible"
                            checked={allVisibleSelected}
                            indeterminate={
                              someVisibleSelected && !allVisibleSelected
                            }
                            onCheckedChange={toggleSelectAllVisible}
                          />
                          <Label
                            htmlFor="select-all-visible"
                            className="cursor-pointer text-sm"
                          >
                            Select page ({visibleProductIds.length})
                          </Label>
                        </div>
                        <Badge variant="secondary">
                          {selectedProductIds.length} selected
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={selectedProductIds.length === 0}
                          onClick={() => openBulkAction("productType")}
                        >
                          Assign to product type
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            selectedProductIds.length === 0 ||
                            bulkCategoryOptions.length === 0
                          }
                          onClick={() => openBulkAction("category")}
                        >
                          Assign to category
                        </Button>
                        <Button
                          type="button"
                          disabled={
                            importingSelectedProducts ||
                            loadingDbProducts ||
                            selectedReadyToImportCount === 0
                          }
                          onClick={() => openAssignCategoryForSelected()}
                        >
                          {importingSelectedProducts ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Database className="mr-2 h-4 w-4" />
                          )}
                          Add {selectedReadyToImportCount} to database
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        {isViewingAllCategories
                          ? "Browsing all categories."
                          : browseAllProducts
                            ? "Browsing products from other categories."
                            : "Products in this category."}{" "}
                        {filteredProductRows.length === 0
                          ? "No matches."
                          : `Showing ${productRangeStart}–${productRangeEnd} of ${filteredProductRows.length}`}
                        {(productSearch ||
                          variantSearch ||
                          productTypeFilter !== "all" ||
                          dbStatusFilter !== "all") &&
                          " (filtered)"}
                        .
                      </p>
                      {filteredProductRows.length > TABLE_PAGE_SIZE && (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={productPage <= 1}
                            onClick={() =>
                              setProductPage((page) => Math.max(1, page - 1))
                            }
                          >
                            <ChevronLeft className="h-4 w-4" />
                            <span className="sr-only">Previous page</span>
                          </Button>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            Page {productPage} of {totalProductPages}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={productPage >= totalProductPages}
                            onClick={() =>
                              setProductPage((page) =>
                                Math.min(totalProductPages, page + 1)
                              )
                            }
                          >
                            <ChevronRight className="h-4 w-4" />
                            <span className="sr-only">Next page</span>
                          </Button>
                        </div>
                      )}
                    </div>

                    {filteredProductRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {isViewingAllCategories
                          ? dbStatusFilter === "not_in_database"
                            ? "No products outside the database match these filters."
                            : dbStatusFilter === "in_database"
                              ? "No products already in the database match these filters."
                              : "No products match these filters."
                          : browseAllProducts
                            ? "No other products match these filters."
                            : "No products in this category yet. Browse other products and assign them here, or bulk-assign from another category."}
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {pagedProductRows.map((product) => {
                          const checked = selectedProductIds.includes(
                            product.id
                          );
                          const dbStatus = importProductDbStatusById.get(
                            product.id
                          );
                          const importingThis = importingProductIds.includes(
                            product.id
                          );
                          return (
                            <div
                              key={product.id}
                              className="space-y-3 rounded-lg border p-4"
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  id={`product-${product.id}`}
                                  checked={checked}
                                  onCheckedChange={() =>
                                    toggleProductSelected(product.id)
                                  }
                                  className="mt-1"
                                />
                                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <Label
                                      htmlFor={`product-${product.id}`}
                                      className="cursor-pointer text-base font-semibold"
                                    >
                                      {product.name}
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                      Category {product.categoryName} · supplier{" "}
                                      {product.vendorName || "—"}
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                      <Badge variant="outline">
                                        Type: {product.productType || "—"}
                                      </Badge>
                                      <ImportDbStatusBadge
                                        status={dbStatus}
                                        loading={loadingDbProducts}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <Badge variant="outline">
                                      {product.variants.length} variant
                                      {product.variants.length === 1
                                        ? ""
                                        : "s"}
                                    </Badge>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger
                                        render={
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            disabled={importingThis}
                                          >
                                            {importingThis ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <MoreHorizontal className="h-4 w-4" />
                                            )}
                                            <span className="sr-only">
                                              Product actions
                                            </span>
                                          </Button>
                                        }
                                      />
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={() =>
                                            openEditProduct(product)
                                          }
                                        >
                                          <Pencil className="h-4 w-4" />
                                          Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() =>
                                            openCreateVariant(product)
                                          }
                                        >
                                          <Plus className="h-4 w-4" />
                                          Add variant
                                        </DropdownMenuItem>
                                        {dbStatus?.kind === "in_database" ? (
                                          <DropdownMenuItem
                                            onClick={() => {
                                              window.open(
                                                `/admin/products/${dbStatus.match.productId}`,
                                                "_blank",
                                                "noopener,noreferrer"
                                              );
                                            }}
                                          >
                                            <ExternalLink className="h-4 w-4" />
                                            Open in products
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem
                                            disabled={
                                              importingThis ||
                                              loadingDbProducts
                                            }
                                            onClick={() =>
                                              openAssignCategoryForProduct(
                                                product
                                              )
                                            }
                                          >
                                            <Database className="h-4 w-4" />
                                            Add to database
                                          </DropdownMenuItem>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                              </div>

                              {product.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pl-7">
                                  {product.tags.map((tag) => (
                                    <Badge
                                      key={`${product.id}-${tag}`}
                                      variant="secondary"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {product.variants.length === 0 ? (
                                <div className="flex flex-wrap items-center gap-2 pl-7">
                                  <p className="text-sm text-muted-foreground">
                                    No variants
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openCreateVariant(product)}
                                  >
                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                                    Add variant
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-2 pl-7">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Variant</TableHead>
                                        <TableHead className="w-[140px] text-right">
                                          Price
                                        </TableHead>
                                        <TableHead className="w-[56px]" />
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {product.variants.map((variant) => (
                                        <TableRow key={variant.id}>
                                          <TableCell>{variant.name}</TableCell>
                                          <TableCell className="text-right tabular-nums">
                                            {formatImportPrice(variant.price)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <DropdownMenu>
                                              <DropdownMenuTrigger
                                                render={
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                  >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                    <span className="sr-only">
                                                      Variant actions
                                                    </span>
                                                  </Button>
                                                }
                                              />
                                              <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                  onClick={() =>
                                                    openEditVariant(
                                                      product,
                                                      variant
                                                    )
                                                  }
                                                >
                                                  <Pencil className="h-4 w-4" />
                                                  Edit
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openCreateVariant(product)}
                                  >
                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                                    Add variant
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {filteredProductRows.length > TABLE_PAGE_SIZE && (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={productPage <= 1}
                          onClick={() =>
                            setProductPage((page) => Math.max(1, page - 1))
                          }
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          Page {productPage} of {totalProductPages}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={productPage >= totalProductPages}
                          onClick={() =>
                            setProductPage((page) =>
                              Math.min(totalProductPages, page + 1)
                            )
                          }
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No categories yet. Create a category to get started.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            No products loaded. Upload a catalog JSON file to begin.
          </CardContent>
        </Card>
      )}

      <Dialog
        open={assignCategoryOpen}
        onOpenChange={(open) => {
          if (
            importingSelectedProducts ||
            importingProductIds.length > 0
          ) {
            return;
          }
          setAssignCategoryOpen(open);
          if (!open) setAssignCategoryProduct(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign category</DialogTitle>
            <DialogDescription>
              {assignCategoryMode === "single" && assignCategoryProduct
                ? `Choose a database category before adding “${assignCategoryProduct.name}”. Import catalog category: ${assignCategoryProduct.categoryName || "—"}.`
                : `Choose a database category for ${selectedReadyToImportCount} selected product${
                    selectedReadyToImportCount === 1 ? "" : "s"
                  }.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Database category</Label>
            <Select
              value={assignCategoryId}
              onValueChange={(value) => setAssignCategoryId(value ?? "none")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category">
                  {(value) => {
                    if (!value || value === "none") return "No category";
                    return (
                      dbCategories.find((category) => category.id === value)
                        ?.name ?? "Select category"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {dbCategories
                  .filter((category) => !category.isArchived)
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {dbCategories.filter((category) => !category.isArchived).length ===
              0 && (
              <p className="text-sm text-muted-foreground">
                No database categories yet. You can still add without one, or
                import categories first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAssignCategoryOpen(false);
                setAssignCategoryProduct(null);
              }}
              disabled={
                importingSelectedProducts || importingProductIds.length > 0
              }
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmAssignCategory()}
              disabled={
                importingSelectedProducts || importingProductIds.length > 0
              }
            >
              {importingSelectedProducts || importingProductIds.length > 0 ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Add to database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create category</DialogTitle>
            <DialogDescription>
              Categories appear in the catalog sidebar. Assign products into
              this category with bulk actions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-category-name">Name</Label>
              <Input
                id="new-category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. ZEBRA HELMETS"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateCategoryOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleCreateCategory}>
                Create
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editCategoryOpen} onOpenChange={setEditCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>
              Rename this category. All products currently in it will be
              updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-category-name">Name</Label>
              <Input
                id="edit-category-name"
                value={editCategoryFormName}
                onChange={(e) => setEditCategoryFormName(e.target.value)}
                placeholder="Category name"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditCategoryOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!editCategoryFormName.trim()}
                onClick={handleEditCategory}
              >
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkActionOpen} onOpenChange={setBulkActionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkActionKind === "productType"
                ? "Assign to product type"
                : "Assign to category"}
            </DialogTitle>
            <DialogDescription>
              Apply to {selectedProductIds.length} selected product
              {selectedProductIds.length === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {bulkActionKind === "productType" ? (
              <div className="space-y-2">
                <Label htmlFor="bulk-product-type">Product type</Label>
                <Input
                  id="bulk-product-type"
                  value={bulkAssignProductType}
                  onChange={(e) => setBulkAssignProductType(e.target.value)}
                  placeholder="e.g. MAGS"
                  autoFocus
                  list="product-type-suggestions"
                />
                <datalist id="product-type-suggestions">
                  {productTypeNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={bulkAssignCategory}
                  onValueChange={(value) => setBulkAssignCategory(value ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category">
                      {(value) => (value ? String(value) : null)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {bulkCategoryOptions.map((tab) => (
                      <SelectItem
                        key={tab.categoryName}
                        value={tab.categoryName}
                      >
                        {tab.categoryName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkActionOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  bulkActionKind === "productType"
                    ? !bulkAssignProductType
                    : !bulkAssignCategory
                }
                onClick={handleBulkAction}
              >
                Assign
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editProductOpen} onOpenChange={setEditProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
            <DialogDescription>
              Update the product name, supplier, product type, and category
              assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-product-name">Name</Label>
              <Input
                id="edit-product-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Product name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-product-vendor">Supplier</Label>
              <Input
                id="edit-product-vendor"
                value={editVendorName}
                onChange={(e) => setEditVendorName(e.target.value)}
                placeholder="Optional supplier"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-product-type">Product type</Label>
              <Input
                id="edit-product-type"
                value={editProductType}
                onChange={(e) => setEditProductType(e.target.value)}
                placeholder="e.g. MAGS"
                list="edit-product-type-suggestions"
              />
              <datalist id="edit-product-type-suggestions">
                {productTypeNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={editCategoryName}
                onValueChange={(value) => setEditCategoryName(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category">
                    {(value) => (value ? String(value) : null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categoryTabs.map((tab) => (
                    <SelectItem
                      key={tab.categoryName}
                      value={tab.categoryName}
                    >
                      {tab.categoryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setNewCategoryName("");
                  setCreateCategoryOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create new category
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditProductOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!editName.trim() || !editProductType || !editCategoryName}
                onClick={handleEditProduct}
              >
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>
              Create a product in “{activeCategory}”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-product-name">Name</Label>
              <Input
                id="create-product-name"
                value={createProductName}
                onChange={(e) => setCreateProductName(e.target.value)}
                placeholder="Product name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-product-type">Product type</Label>
              <Input
                id="create-product-type"
                value={createProductType}
                onChange={(e) => setCreateProductType(e.target.value)}
                placeholder="e.g. MAGS"
                list="create-product-type-suggestions"
              />
              <datalist id="create-product-type-suggestions">
                {productTypeNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-product-vendor">Supplier</Label>
              <Input
                id="create-product-vendor"
                value={createProductVendor}
                onChange={(e) => setCreateProductVendor(e.target.value)}
                placeholder="Optional supplier"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateProductOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  !createProductName.trim() || !createProductType.trim()
                }
                onClick={handleCreateProduct}
              >
                Create
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createVariantOpen} onOpenChange={setCreateVariantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add variant</DialogTitle>
            <DialogDescription>
              Add a variant to “{createVariantProductName}”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-variant-name">Name</Label>
              <Input
                id="create-variant-name"
                value={createVariantName}
                onChange={(e) => setCreateVariantName(e.target.value)}
                placeholder="Variant name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-variant-price">Price</Label>
              <Input
                id="create-variant-price"
                type="number"
                min="0"
                step="0.01"
                value={createVariantPrice}
                onChange={(e) => setCreateVariantPrice(e.target.value)}
                placeholder="0"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateVariantOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!createVariantName.trim() || Number(createVariantPrice) < 0 || Number.isNaN(Number(createVariantPrice))}
                onClick={handleCreateVariant}
              >
                Create
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editVariantOpen} onOpenChange={setEditVariantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit variant</DialogTitle>
            <DialogDescription>
              Update variant for “{editVariantProductName}”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-variant-name">Name</Label>
              <Input
                id="edit-variant-name"
                value={editVariantName}
                onChange={(e) => setEditVariantName(e.target.value)}
                placeholder="Variant name"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-variant-price">Price</Label>
              <Input
                id="edit-variant-price"
                type="number"
                min="0"
                step="0.01"
                value={editVariantPrice}
                onChange={(e) => setEditVariantPrice(e.target.value)}
                placeholder="0"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditVariantOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  !editVariantName.trim() ||
                  Number(editVariantPrice) < 0 ||
                  Number.isNaN(Number(editVariantPrice))
                }
                onClick={handleEditVariant}
              >
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={zeroPriceOpen} onOpenChange={setZeroPriceOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Zero-price variants</DialogTitle>
            <DialogDescription>
              {zeroPriceVariants.length} variant
              {zeroPriceVariants.length === 1 ? "" : "s"} with price 0.
            </DialogDescription>
          </DialogHeader>
          {zeroPriceVariants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No zero-price variants.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zeroPriceVariants.map((row) => (
                    <TableRow key={`${row.productId}-${row.variantId}`}>
                      <TableCell>{row.categoryName}</TableCell>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell>{row.productType || "—"}</TableCell>
                      <TableCell>{row.variantName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatImportPrice(row.price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setZeroPriceOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
