"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useAuthStore } from "@/stores/auth-store";
import { getBranches } from "@/lib/firestore/branches";
import { getVendors } from "@/lib/firestore/vendors";
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import {
  completeSupplierStockIn,
  getSupplierStockIns,
} from "@/lib/firestore/supplier-stock-ins";
import { mergeVariantsWithInventory } from "@/lib/inventory";
import { isProductPublished } from "@/lib/products-catalog";
import { formatVariantLabel } from "@/lib/product-variants";
import { formatDate } from "@/lib/format";
import type {
  Branch,
  Product,
  SupplierStockIn,
  Vendor,
} from "@/types";

interface StockInLine {
  productId: string;
  productName: string;
  variantId: string;
  quantity: number;
  currentStock: number;
}

export default function AdminStockInPage() {
  const { isMasterAdmin, assignedBranchId } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branchId, setBranchId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<StockInLine[]>([]);
  const [selectedVariantKey, setSelectedVariantKey] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [variantRows, setVariantRows] = useState<
    ReturnType<typeof mergeVariantsWithInventory>
  >([]);
  const [history, setHistory] = useState<SupplierStockIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const defaultBranch = isMasterAdmin ? "" : assignedBranchId ?? "";

  useEffect(() => {
    Promise.all([getBranches(true), getVendors(), getProducts()])
      .then(([b, v, p]) => {
        setBranches(b);
        setVendors(v);
        setProducts(p.filter((x) => !x.isArchived && isProductPublished(x)));
        if (defaultBranch) setBranchId(defaultBranch);
        else if (isMasterAdmin && b[0]) setBranchId(b[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [defaultBranch, isMasterAdmin]);

  useEffect(() => {
    if (!branchId) {
      setVariantRows([]);
      setHistory([]);
      return;
    }

    Promise.all([
      getBranchInventory(branchId),
      getSupplierStockIns({
        branchId: isMasterAdmin ? branchId : assignedBranchId,
        max: 30,
      }),
    ])
      .then(([inv, stockIns]) => {
        setVariantRows(mergeVariantsWithInventory(products, inv));
        setHistory(stockIns);
      })
      .catch(console.error);
  }, [branchId, products, isMasterAdmin, assignedBranchId]);

  const branch = branches.find((b) => b.id === branchId);
  const vendor = vendors.find((v) => v.id === vendorId);

  const availableVariants = useMemo(
    () =>
      variantRows.filter((v) => !lines.some((l) => l.variantId === v.id)),
    [variantRows, lines]
  );

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const b = branches.find((row) => row.id === value);
    return b ? `${b.name} (${b.code})` : null;
  };

  const vendorSelectLabel = (value: string | null) => {
    if (!value) return null;
    return vendors.find((v) => v.id === value)?.name ?? null;
  };

  const variantSelectLabel = (value: string | null) => {
    if (!value) return null;
    const [productId, variantId] = value.split("::");
    const row = availableVariants.find(
      (v) => v.productId === productId && v.id === variantId
    );
    if (!row) return null;
    const product = products.find((p) => p.id === row.productId);
    const label = formatVariantLabel(row, product?.options ?? []);
    return `${row.productName}${label !== "Default" ? ` — ${label}` : ""} (stock ${row.stock})`;
  };

  const addLine = () => {
    if (!selectedVariantKey.includes("::")) {
      toast.error("Select a variant");
      return;
    }
    const [, variantId] = selectedVariantKey.split("::");
    const row = variantRows.find((v) => v.id === variantId);
    if (!row) {
      toast.error("Select a variant");
      return;
    }
    if (quantity <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }

    const product = products.find((p) => p.id === row.productId);
    const variantLabel = formatVariantLabel(row, product?.options ?? []);
    const productName =
      variantLabel === "Default"
        ? row.productName
        : `${row.productName} — ${variantLabel}`;

    setLines((prev) => [
      ...prev,
      {
        productId: row.productId,
        productName,
        variantId: row.id,
        quantity,
        currentStock: row.stock,
      },
    ]);
    setSelectedVariantKey("");
    setQuantity(1);
  };

  const removeLine = (variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  };

  const handleSubmit = async () => {
    if (!user || !branch || !vendor) {
      toast.error("Select branch and supplier");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one variant");
      return;
    }

    setSubmitting(true);
    try {
      await completeSupplierStockIn({
        branchId: branch.id,
        branchName: branch.name,
        vendorId: vendor.id,
        vendorName: vendor.name,
        items: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          productName: l.productName,
          quantity: l.quantity,
        })),
        notes: notes.trim() || null,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });
      toast.success("Stock in recorded");
      setLines([]);
      setNotes("");
      const [inv, stockIns] = await Promise.all([
        getBranchInventory(branch.id),
        getSupplierStockIns({ branchId: branch.id, max: 30 }),
      ]);
      setVariantRows(mergeVariantsWithInventory(products, inv));
      setHistory(stockIns);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stock in failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading stock in...</p>;
  }

  if (branches.length === 0) {
    return (
      <p className="text-muted-foreground">
        Create a branch before recording supplier stock in.
      </p>
    );
  }

  if (vendors.length === 0) {
    return (
      <p className="text-muted-foreground">
        Add a vendor/supplier first under Vendors.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier stock in</h1>
        <p className="text-muted-foreground">
          Receive inventory into a branch from a supplier
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New stock in</CardTitle>
          <CardDescription>
            Increases branch stock and marks variants as selling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select
                value={branchId}
                onValueChange={(v) => {
                  setBranchId(v ?? "");
                  setLines([]);
                }}
                disabled={!isMasterAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch">
                    {(value) => branchSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select
                value={vendorId}
                onValueChange={(v) => setVendorId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier">
                    {(value) => vendorSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {branchId && (
            <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label>Variant</Label>
                <Select
                  value={selectedVariantKey}
                  onValueChange={(v) => setSelectedVariantKey(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select variant">
                      {(value) => variantSelectLabel(value as string | null)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableVariants.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No variants available
                      </SelectItem>
                    ) : (
                      availableVariants.map((row) => {
                        const product = products.find(
                          (p) => p.id === row.productId
                        );
                        const label = formatVariantLabel(
                          row,
                          product?.options ?? []
                        );
                        return (
                          <SelectItem
                            key={row.id}
                            value={`${row.productId}::${row.id}`}
                          >
                            {row.productName}
                            {label !== "Default" ? ` — ${label}` : ""} (stock{" "}
                            {row.stock})
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full space-y-2 sm:w-28">
                <Label>Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                />
              </div>
              <Button type="button" variant="outline" onClick={addLine}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          )}

          {lines.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Qty in</TableHead>
                    <TableHead className="text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.variantId}>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell className="tabular-nums">
                        {line.currentStock}
                      </TableCell>
                      <TableCell className="tabular-nums text-green-600">
                        +{line.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.variantId)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Invoice number, delivery reference..."
              rows={2}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={
              submitting || lines.length === 0 || !vendorId || !branchId
            }
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete stock in
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent stock ins</CardTitle>
          <CardDescription>Supplier receipts for this branch</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock ins yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(entry.createdAt)}
                      </TableCell>
                      <TableCell>{entry.vendorName}</TableCell>
                      <TableCell className="max-w-xs text-sm">
                        {entry.items
                          .map((i) => `${i.productName} ×${i.quantity}`)
                          .join(", ")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.createdByName ?? "Staff"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
