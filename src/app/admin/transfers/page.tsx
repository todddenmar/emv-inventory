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
import { InventoryActivityFeed } from "@/components/admin/inventory-activity-feed";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getBranches } from "@/lib/firestore/branches";
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import {
  createBranchTransfer,
  getBranchTransfers,
} from "@/lib/firestore/transfers";
import {
  mergeSellingVariantsWithInventory,
  type VariantWithStock,
} from "@/lib/inventory";
import { formatVariantLabel } from "@/lib/product-variants";
import { formatDate } from "@/lib/format";
import type { Branch, BranchTransfer, Product } from "@/types";

interface TransferLine {
  productId: string;
  productName: string;
  variantId: string;
  quantity: number;
  available: number;
}

function firstDestinationId(branches: Branch[], fromId: string) {
  return branches.find((b) => b.id !== fromId)?.id ?? "";
}

export default function AdminTransfersPage() {
  const { isMasterAdmin, assignedBranchId } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<VariantWithStock | null>(
    null
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [sellingVariants, setSellingVariants] = useState<VariantWithStock[]>(
    []
  );
  const [transfers, setTransfers] = useState<BranchTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const defaultFromBranch = isMasterAdmin ? "" : assignedBranchId ?? "";

  useEffect(() => {
    Promise.all([getBranches(true), getProducts(), getBranchTransfers()])
      .then(([b, p, t]) => {
        setBranches(b);
        setProducts(p.filter((x) => !x.isArchived));
        setTransfers(t);
        const fromId = defaultFromBranch || b[0]?.id || "";
        if (fromId) {
          setFromBranchId(fromId);
          setToBranchId(firstDestinationId(b, fromId));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [defaultFromBranch]);

  useEffect(() => {
    if (!fromBranchId) {
      setSellingVariants([]);
      return;
    }
    getBranchInventory(fromBranchId)
      .then((inv) => {
        const rows = mergeSellingVariantsWithInventory(
          products.filter((x) => !x.isArchived),
          inv
        );
        setSellingVariants(rows);
      })
      .catch(console.error);
  }, [fromBranchId, products]);

  const fromBranch = branches.find((b) => b.id === fromBranchId);
  const toBranch = branches.find((b) => b.id === toBranchId);
  const destinationOptions = branches.filter((b) => b.id !== fromBranchId);

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const branch = branches.find((b) => b.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  const availableVariants = useMemo(
    () =>
      sellingVariants.filter(
        (v) => v.stock > 0 && !lines.some((l) => l.variantId === v.id)
      ),
    [sellingVariants, lines]
  );

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
    if (!user || !fromBranch || !toBranch) {
      toast.error("Select source and destination branches");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one variant");
      return;
    }

    setSubmitting(true);
    try {
      await createBranchTransfer({
        fromBranchId: fromBranch.id,
        fromBranchName: fromBranch.name,
        toBranchId: toBranch.id,
        toBranchName: toBranch.name,
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
      toast.success("Transfer completed");
      setLines([]);
      setNotes("");
      setToBranchId(firstDestinationId(branches, fromBranch.id));
      const [inv, t] = await Promise.all([
        getBranchInventory(fromBranch.id),
        getBranchTransfers(),
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
    return <p className="text-muted-foreground">Loading transfers...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock transfers</h1>
        <p className="text-muted-foreground">
          Move inventory between branches with a full audit trail
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New transfer</CardTitle>
          <CardDescription>
            {isMasterAdmin
              ? "Transfer selling variants from any branch to another"
              : `Transfer stock out of ${fromBranch?.name ?? "your branch"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>From branch</Label>
              <Select
                value={fromBranchId}
                onValueChange={(v) => {
                  const nextFrom = v ?? "";
                  setFromBranchId(nextFrom);
                  setLines([]);
                  setSelectedVariant(null);
                  setToBranchId(firstDestinationId(branches, nextFrom));
                }}
                disabled={!isMasterAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source branch">
                    {(value) => branchSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To branch</Label>
              <Select
                value={toBranchId}
                onValueChange={(v) => setToBranchId(v ?? "")}
                disabled={!fromBranchId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination branch">
                    {(value) => branchSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {destinationOptions.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {fromBranchId && (
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
            disabled={submitting || lines.length === 0 || !toBranchId}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete transfer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer history</CardTitle>
          <CardDescription>Recent branch-to-branch movements</CardDescription>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transfers yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(transfer.createdAt)}
                      </TableCell>
                      <TableCell>{transfer.fromBranchName}</TableCell>
                      <TableCell>{transfer.toBranchName}</TableCell>
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
        </CardContent>
      </Card>

      <InventoryActivityFeed
        branchId={isMasterAdmin ? null : assignedBranchId}
        showViewAll={false}
        max={20}
      />

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
