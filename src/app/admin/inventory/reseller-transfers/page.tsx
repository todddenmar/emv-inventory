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
import {
  VariantPickerButton,
  VariantSearchDialog,
} from "@/components/admin/variant-search-dialog";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getBranches } from "@/lib/firestore/branches";
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { getResellers } from "@/lib/firestore/resellers";
import {
  completeResellerTransfer,
  getResellerTransfers,
} from "@/lib/firestore/reseller-transfers";
import {
  mergeSellingVariantsWithInventory,
  type VariantWithStock,
} from "@/lib/inventory";
import { formatVariantLabel } from "@/lib/product-variants";
import { formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { Branch, Product, Reseller, ResellerTransfer } from "@/types";

interface TransferLine {
  productId: string;
  productName: string;
  variantId: string;
  quantity: number;
  available: number;
}

export default function AdminResellerTransfersPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branchId, setBranchId] = useState("");
  const [resellerId, setResellerId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [selectedVariant, setSelectedVariant] =
    useState<VariantWithStock | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [sellingVariants, setSellingVariants] = useState<VariantWithStock[]>(
    []
  );
  const [transfers, setTransfers] = useState<ResellerTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const defaultBranch = isElevatedAdmin ? "" : assignedBranchId ?? "";

  useEffect(() => {
    Promise.all([
      getBranches(true),
      getProducts(),
      getResellers(true),
    ])
      .then(([b, p, r]) => {
        setBranches(b);
        setProducts(p.filter((x) => !x.isArchived));
        setResellers(r);
        const fromId = defaultBranch || b[0]?.id || "";
        if (fromId) setBranchId(fromId);
        if (r[0]) setResellerId(r[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [defaultBranch]);

  useEffect(() => {
    if (!branchId && isElevatedAdmin) {
      getResellerTransfers({ max: 50 })
        .then(setTransfers)
        .catch(console.error);
      return;
    }
    if (!branchId) {
      setTransfers([]);
      return;
    }
    getResellerTransfers({
      branchId: isElevatedAdmin ? branchId : assignedBranchId ?? branchId,
      max: 50,
    })
      .then(setTransfers)
      .catch(console.error);
  }, [assignedBranchId, branchId, isElevatedAdmin]);

  useEffect(() => {
    if (!branchId) {
      setSellingVariants([]);
      return;
    }
    getBranchInventory(branchId)
      .then((inv) => {
        setSellingVariants(
          mergeSellingVariantsWithInventory(
            products.filter((x) => !x.isArchived),
            inv
          )
        );
      })
      .catch(console.error);
  }, [branchId, products]);

  const branch = branches.find((b) => b.id === branchId);
  const reseller = resellers.find((r) => r.id === resellerId);

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const row = branches.find((b) => b.id === value);
    return row ? `${row.name} (${row.code})` : null;
  };

  const resellerSelectLabel = (value: string | null) => {
    if (!value) return null;
    return resellers.find((r) => r.id === value)?.name ?? null;
  };

  const availableVariants = useMemo(
    () =>
      sellingVariants.filter(
        (v) => v.stock > 0 && !lines.some((l) => l.variantId === v.id)
      ),
    [sellingVariants, lines]
  );

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(transfers, page), [transfers, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const selectedVariantLabel = useMemo(() => {
    if (!selectedVariant) return null;
    const product = products.find((p) => p.id === selectedVariant.productId);
    const label = formatVariantLabel(
      selectedVariant,
      product?.options ?? []
    );
    return `${selectedVariant.productName}${
      label !== "Default" ? ` — ${label}` : ""
    } (${selectedVariant.stock} available)`;
  }, [selectedVariant, products]);

  const addLine = () => {
    if (!selectedVariant) {
      toast.error("Select a variant");
      return;
    }
    const row = selectedVariant;
    const product = products.find((p) => p.id === row.productId);
    const variantLabel = formatVariantLabel(row, product?.options ?? []);
    const productName =
      variantLabel === "Default"
        ? row.productName
        : `${row.productName} — ${variantLabel}`;

    if (quantity <= 0 || quantity > row.stock) {
      toast.error(`Enter a quantity between 1 and ${row.stock}`);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: row.productId,
        productName,
        variantId: row.id,
        quantity,
        available: row.stock,
      },
    ]);
    setSelectedVariant(null);
    setQuantity(1);
  };

  const removeLine = (variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  };

  const handleTransfer = async () => {
    if (!user || !branch || !reseller) {
      toast.error("Select a branch and reseller");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one variant");
      return;
    }

    setSubmitting(true);
    try {
      await completeResellerTransfer({
        branchId: branch.id,
        branchName: branch.name,
        resellerId: reseller.id,
        resellerName: reseller.name,
        items: lines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          variantId: l.variantId,
          quantity: l.quantity,
        })),
        notes: notes.trim() || null,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });
      toast.success(`Transferred to ${reseller.name}`);
      setLines([]);
      setNotes("");
      const [inv, t] = await Promise.all([
        getBranchInventory(branch.id),
        getResellerTransfers({
          branchId: isElevatedAdmin ? branch.id : assignedBranchId ?? branch.id,
          max: 50,
        }),
      ]);
      setSellingVariants(
        mergeSellingVariantsWithInventory(
          products.filter((x) => !x.isArchived),
          inv
        )
      );
      setTransfers(t);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading reseller transfers...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reseller transfers</h1>
        <p className="text-muted-foreground">
          Issue stock from a branch to a reseller. Branch inventory decreases;
          this is not a POS sale.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New transfer</CardTitle>
          <CardDescription>
            {isElevatedAdmin
              ? "Transfer selling variants from any branch to a reseller"
              : `Transfer stock out of ${branch?.name ?? "your branch"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>From branch</Label>
              <Select
                value={branchId}
                onValueChange={(v) => {
                  setBranchId(v ?? "");
                  setLines([]);
                  setSelectedVariant(null);
                }}
                disabled={!isElevatedAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch">
                    {(value) => branchSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branches.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name} ({row.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To reseller</Label>
              <Select
                value={resellerId}
                onValueChange={(v) => setResellerId(v ?? "")}
                disabled={resellers.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reseller">
                    {(value) => resellerSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {resellers.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {resellers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add active resellers under Settings → Resellers.
                </p>
              ) : null}
            </div>
          </div>

          {branchId && (
            <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label>Variant</Label>
                <VariantPickerButton
                  selectedLabel={selectedVariantLabel}
                  placeholder="Search and select variant"
                  onClick={() => setPickerOpen(true)}
                />
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
                    <TableHead>Quantity</TableHead>
                    <TableHead className="text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.variantId}>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell>{line.quantity}</TableCell>
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
              placeholder="Reason or reference for this transfer..."
              rows={2}
            />
          </div>

          <Button
            onClick={handleTransfer}
            disabled={
              submitting ||
              lines.length === 0 ||
              !resellerId ||
              !branchId
            }
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transfer to reseller
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer history</CardTitle>
          <CardDescription>
            Recent stock issued from branches to resellers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reseller transfers yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Reseller</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(transfer.createdAt)}
                      </TableCell>
                      <TableCell>{transfer.branchName}</TableCell>
                      <TableCell>{transfer.resellerName}</TableCell>
                      <TableCell className="max-w-xs text-sm">
                        {transfer.items
                          .map((i) => `${i.productName} ×${i.quantity}`)
                          .join(", ")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {transfer.createdByName ?? "Staff"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {transfers.length > 0 && (
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              className="mt-4"
            />
          )}
        </CardContent>
      </Card>

      <VariantSearchDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        variants={availableVariants}
        products={products}
        title="Select variant to transfer"
        stockLabel={(stock) => `${stock} available`}
        emptyMessage="No selling variants with stock match your search."
        onSelect={setSelectedVariant}
      />
    </div>
  );
}
