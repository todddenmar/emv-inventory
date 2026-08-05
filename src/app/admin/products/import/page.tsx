"use client";

import { useMemo, useRef, useState } from "react";
import { FileJson, Loader2, Upload, X } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  formatImportPrice,
  groupImportProducts,
  parseProductJsonImport,
  summarizeImport,
  type ParsedImportProduct,
} from "@/lib/product-json-import";

export default function ProductJsonImportPage() {
  const { isMasterAdmin } = useBranchAccess();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [products, setProducts] = useState<ParsedImportProduct[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const summary = useMemo(() => summarizeImport(products), [products]);
  const grouped = useMemo(() => groupImportProducts(products), [products]);

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

  const clearImport = () => {
    setFileName(null);
    setProducts([]);
    setErrors([]);
    if (inputRef.current) inputRef.current.value = "";
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
      const result = parseProductJsonImport(raw);
      setFileName(file.name);
      setProducts(result.products);
      setErrors(result.errors);

      if (result.products.length === 0) {
        toast.error("No products found in this file");
      } else if (result.errors.length > 0) {
        toast.warning(
          `Loaded ${result.products.length} products with ${result.errors.length} warnings`
        );
      } else {
        toast.success(`Loaded ${result.products.length} products (preview only)`);
      }
    } catch (err) {
      clearImport();
      toast.error(
        err instanceof SyntaxError
          ? "Invalid JSON file"
          : "Failed to read JSON file"
      );
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product JSON import</h1>
          <p className="text-muted-foreground">
            Upload a catalog JSON file to preview products and variants. Nothing
            is saved to the database yet.
          </p>
        </div>
        <LinkButton href="/admin/products" variant="outline">
          Back to products
        </LinkButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileJson className="h-4 w-4" />
            Upload file
          </CardTitle>
          <CardDescription>
            Top-level name splits into vendor/category + product type (e.g.{" "}
            <code className="text-xs">BOM X MAGS</code> → vendor/category{" "}
            <code className="text-xs">BOM X</code>, type{" "}
            <code className="text-xs">MAGS</code>). Tags are inferred from
            variant names (motors + color/finish).
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
              onClick={() => inputRef.current?.click()}
              disabled={parsing}
            >
              {parsing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Choose JSON file
            </Button>
            {fileName && (
              <>
                <Badge variant="secondary">{fileName}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Clear import"
                  onClick={clearImport}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
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

      {products.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Products</CardDescription>
                <CardTitle className="text-3xl">{summary.productCount}</CardTitle>
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
                <CardDescription>Vendors</CardDescription>
                <CardTitle className="text-3xl">{summary.vendorCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Categories</CardDescription>
                <CardTitle className="text-3xl">{summary.categoryCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Product types</CardDescription>
                <CardTitle className="text-3xl">
                  {summary.productTypeCount}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview list</CardTitle>
              <CardDescription>
                Grouped by product type → category → vendor → products.
                Preview only — no database writes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {grouped.map((typeGroup) => (
                <section key={typeGroup.id} className="space-y-4">
                  <div className="border-b pb-2">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {typeGroup.productType}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Product type · {typeGroup.categories.length} categor
                      {typeGroup.categories.length === 1 ? "y" : "ies"}
                    </p>
                  </div>

                  <div className="space-y-6 pl-0 sm:pl-3">
                    {typeGroup.categories.map((categoryGroup) => (
                      <section key={categoryGroup.id} className="space-y-4">
                        <div>
                          <h3 className="text-lg font-medium">
                            {categoryGroup.categoryName}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Category
                          </p>
                        </div>

                        <div className="space-y-5 pl-0 sm:pl-3">
                          {categoryGroup.vendors.map((vendorGroup) => (
                            <section
                              key={vendorGroup.id}
                              className="space-y-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-medium">
                                  {vendorGroup.vendorName}
                                </h4>
                                <Badge variant="outline">Vendor</Badge>
                                <Badge variant="secondary">
                                  {vendorGroup.products.length} product
                                  {vendorGroup.products.length === 1
                                    ? ""
                                    : "s"}
                                </Badge>
                              </div>

                              <div className="space-y-4">
                                {vendorGroup.products.map((product) => (
                                  <div
                                    key={product.id}
                                    className="space-y-3 rounded-lg border p-4"
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <h5 className="text-base font-semibold">
                                          {product.name}
                                        </h5>
                                        <p className="text-sm text-muted-foreground">
                                          From group {product.groupName}
                                        </p>
                                      </div>
                                      <Badge variant="outline">
                                        {product.variants.length} variant
                                        {product.variants.length === 1
                                          ? ""
                                          : "s"}
                                      </Badge>
                                    </div>

                                    {product.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
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
                                      <p className="text-sm text-muted-foreground">
                                        No variants
                                      </p>
                                    ) : (
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Variant</TableHead>
                                            <TableHead className="w-[140px] text-right">
                                              Price
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {product.variants.map((variant) => (
                                            <TableRow key={variant.id}>
                                              <TableCell>
                                                {variant.name}
                                              </TableCell>
                                              <TableCell className="text-right tabular-nums">
                                                {formatImportPrice(
                                                  variant.price
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
