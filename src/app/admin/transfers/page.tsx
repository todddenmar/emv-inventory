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
import { formatDate } from "@/lib/format";
import type { Branch, BranchTransfer, Product } from "@/types";

interface TransferLine {
  productId: string;
  productName: string;
  quantity: number;
  available: number;
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
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
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
        if (defaultFromBranch) setFromBranchId(defaultFromBranch);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [defaultFromBranch]);

  useEffect(() => {
    if (!fromBranchId) {
      setStockMap({});
      return;
    }
    getBranchInventory(fromBranchId)
      .then((inv) =>
        setStockMap(Object.fromEntries(inv.map((i) => [i.productId, i.stock])))
      )
      .catch(console.error);
  }, [fromBranchId]);

  const fromBranch = branches.find((b) => b.id === fromBranchId);
  const toBranch = branches.find((b) => b.id === toBranchId);
  const destinationOptions = branches.filter((b) => b.id !== fromBranchId);

  const availableProducts = useMemo(
    () =>
      products.filter(
        (p) => (stockMap[p.id] ?? 0) > 0 && !lines.some((l) => l.productId === p.id)
      ),
    [products, stockMap, lines]
  );

  const addLine = () => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      toast.error("Select a product");
      return;
    }
    const available = stockMap[product.id] ?? 0;
    if (quantity <= 0 || quantity > available) {
      toast.error(`Enter a quantity between 1 and ${available}`);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        quantity,
        available,
      },
    ]);
    setSelectedProductId("");
    setQuantity(1);
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const handleTransfer = async () => {
    if (!user || !fromBranch || !toBranch) {
      toast.error("Select source and destination branches");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one product");
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
          quantity: l.quantity,
        })),
        notes: notes.trim() || null,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });
      toast.success("Transfer completed");
      setLines([]);
      setNotes("");
      setToBranchId("");
      const [inv, t] = await Promise.all([
        getBranchInventory(fromBranch.id),
        getBranchTransfers(),
      ]);
      setStockMap(Object.fromEntries(inv.map((i) => [i.productId, i.stock])));
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
              ? "Transfer stock from any branch to another"
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
                  setFromBranchId(v ?? "");
                  setLines([]);
                  setToBranchId("");
                }}
                disabled={!isMasterAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source branch" />
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
                  <SelectValue placeholder="Select destination branch" />
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
                <Label>Product</Label>
                <Select
                  value={selectedProductId}
                  onValueChange={(v) => setSelectedProductId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({stockMap[product.id] ?? 0} available)
                      </SelectItem>
                    ))}
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
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead className="text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.productId}>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell>{line.quantity}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.productId)}
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
    </div>
  );
}
