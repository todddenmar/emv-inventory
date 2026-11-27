"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { ConsignmentDeliveryReceiptDialog } from "@/components/admin/consignment-delivery-receipt-dialog";
import { TablePagination } from "@/components/admin/table-pagination";
import {
  VariantPickerButton,
  VariantSearchDialog,
} from "@/components/admin/variant-search-dialog";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { shiftDateInput, toDateInputValue } from "@/lib/dates";
import {
  getDeliveryReceiptCompany,
  printConsignmentDeliveryReceipt,
} from "@/lib/delivery-receipt";
import { getBranches } from "@/lib/firestore/branches";
import { createConsignee, getConsignees } from "@/lib/firestore/consignees";
import {
  completeConsignmentDelivery,
  getConsignmentDeliveries,
} from "@/lib/firestore/consignment-deliveries";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { formatDate } from "@/lib/format";
import {
  mergeSellingVariantsWithInventory,
  type VariantWithStock,
} from "@/lib/inventory";
import { paginateItems } from "@/lib/pagination";
import { formatVariantLabel } from "@/lib/product-variants";
import { useAuthStore } from "@/stores/auth-store";
import type { Branch, Consignee, ConsignmentDelivery, Product } from "@/types";

type Preset = "last7" | "thisMonth";

function applyPreset(preset: Preset): { fromDate: string; toDate: string } {
  const today = toDateInputValue();
  if (preset === "last7") {
    return { fromDate: shiftDateInput(today, -6), toDate: today };
  }
  const [y, m] = today.split("-").map(Number);
  return {
    fromDate: `${y}-${String(m).padStart(2, "0")}-01`,
    toDate: today,
  };
}

function formatDeliveryItemsSummary(delivery: ConsignmentDelivery): string {
  if (!delivery.items?.length) return "—";
  return delivery.items
    .map((item) => `${item.productName} ×${item.quantity} ${item.unit}`)
    .join(", ");
}

interface DeliveryLine {
  productId: string;
  productName: string;
  variantId: string;
  quantity: number;
  unit: string;
  available: number;
}

export function ConsignmentDeliveriesPage() {
  const { canViewAllBranches, assignedBranchId, canEditStock, isElevatedAdmin } =
    useBranchAccess();
  const user = useAuthStore((s) => s.user);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [consignees, setConsignees] = useState<Consignee[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branchId, setBranchId] = useState("");
  const [consigneeId, setConsigneeId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DeliveryLine[]>([]);
  const [selectedVariant, setSelectedVariant] =
    useState<VariantWithStock | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("pcs");
  const [sellingVariants, setSellingVariants] = useState<VariantWithStock[]>(
    []
  );

  const [fromDate, setFromDate] = useState(() => applyPreset("last7").fromDate);
  const [toDate, setToDate] = useState(() => applyPreset("last7").toDate);
  const [itemSearch, setItemSearch] = useState("");
  const [consigneeSearch, setConsigneeSearch] = useState("");
  const [deliveries, setDeliveries] = useState<ConsignmentDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [receiptDelivery, setReceiptDelivery] =
    useState<ConsignmentDelivery | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [consigneeDialogOpen, setConsigneeDialogOpen] = useState(false);
  const [newConsigneeName, setNewConsigneeName] = useState("");
  const [newConsigneeMobile, setNewConsigneeMobile] = useState("");
  const [newConsigneeAddress, setNewConsigneeAddress] = useState("");
  const [creatingConsignee, setCreatingConsignee] = useState(false);

  const defaultBranch = canViewAllBranches ? "" : assignedBranchId ?? "";

  useEffect(() => {
    Promise.all([
      getBranches(true),
      getProducts(),
      getConsignees(true),
    ])
      .then(([branchList, productList, consigneeList]) => {
        setBranches(branchList);
        setProducts(productList.filter((row) => !row.isArchived));
        setConsignees(consigneeList);
        const fromId = defaultBranch || branchList[0]?.id || "";
        if (fromId) setBranchId(fromId);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [defaultBranch]);

  useEffect(() => {
    if (!branchId) {
      setSellingVariants([]);
      return;
    }
    getBranchInventory(branchId)
      .then((inv) => {
        setSellingVariants(
          mergeSellingVariantsWithInventory(
            products.filter((row) => !row.isArchived),
            inv
          )
        );
      })
      .catch(console.error);
  }, [branchId, products]);

  const loadDeliveries = useCallback(async () => {
    if (!canViewAllBranches && !assignedBranchId) {
      setDeliveries([]);
      return;
    }
    try {
      const rows = await getConsignmentDeliveries({
        fromDate,
        toDate,
        max: 1000,
      });
      const scoped = canViewAllBranches
        ? rows
        : rows.filter((row) => row.branchId === assignedBranchId);
      setDeliveries(scoped);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load consignment deliveries");
      setDeliveries([]);
    }
  }, [assignedBranchId, canViewAllBranches, fromDate, toDate]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, itemSearch, consigneeSearch]);

  const branch = branches.find((row) => row.id === branchId);
  const consignee = consignees.find((row) => row.id === consigneeId);

  const availableVariants = useMemo(
    () =>
      sellingVariants.filter(
        (row) => row.stock > 0 && !lines.some((line) => line.variantId === row.id)
      ),
    [sellingVariants, lines]
  );

  const filteredDeliveries = useMemo(() => {
    const itemQ = itemSearch.trim().toLowerCase();
    const consigneeQ = consigneeSearch.trim().toLowerCase();
    return deliveries.filter((delivery) => {
      if (
        consigneeQ &&
        !delivery.consigneeName.toLowerCase().includes(consigneeQ)
      ) {
        return false;
      }
      if (itemQ) {
        const match = (delivery.items ?? []).some((item) =>
          item.productName.toLowerCase().includes(itemQ)
        );
        if (!match) return false;
      }
      return true;
    });
  }, [deliveries, itemSearch, consigneeSearch]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(filteredDeliveries, page),
    [filteredDeliveries, page]
  );

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

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const row = branches.find((b) => b.id === value);
    return row ? `${row.name} (${row.code})` : null;
  };

  const consigneeSelectLabel = (value: string | null) => {
    if (!value) return null;
    return consignees.find((row) => row.id === value)?.name ?? null;
  };

  const companyForDelivery = (delivery: ConsignmentDelivery | null) => {
    if (!delivery) return null;
    const fromBranch = branches.find((row) => row.id === delivery.branchId);
    return getDeliveryReceiptCompany(
      fromBranch ?? {
        name: delivery.branchName,
        address: "",
        phone: null,
        deliveryReceipt: null,
      }
    );
  };

  const addLine = () => {
    if (!selectedVariant) {
      toast.error("Select a variant");
      return;
    }
    const trimmedUnit = unit.trim() || "pcs";
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
        unit: trimmedUnit,
        available: row.stock,
      },
    ]);
    setSelectedVariant(null);
    setQuantity(1);
    setUnit("pcs");
  };

  const removeLine = (variantId: string) => {
    setLines((prev) => prev.filter((line) => line.variantId !== variantId));
  };

  const handleCreateConsignee = async () => {
    if (!newConsigneeName.trim()) {
      toast.error("Enter consignee name");
      return;
    }
    setCreatingConsignee(true);
    try {
      const id = await createConsignee({
        name: newConsigneeName,
        mobile: newConsigneeMobile,
        address: newConsigneeAddress,
      });
      const next = await getConsignees(true);
      setConsignees(next);
      setConsigneeId(id);
      setConsigneeDialogOpen(false);
      setNewConsigneeName("");
      setNewConsigneeMobile("");
      setNewConsigneeAddress("");
      toast.success("Consignee added");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add consignee"
      );
    } finally {
      setCreatingConsignee(false);
    }
  };

  const handleComplete = async () => {
    if (!user || !branch || !consignee) {
      toast.error("Select a branch and consignee");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one variant");
      return;
    }

    setSubmitting(true);
    try {
      await completeConsignmentDelivery({
        branchId: branch.id,
        branchName: branch.name,
        consigneeId: consignee.id,
        consigneeName: consignee.name,
        consigneeMobile: consignee.mobile,
        consigneeAddress: consignee.address,
        referenceNumber,
        items: lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          variantId: line.variantId,
          quantity: line.quantity,
          unit: line.unit,
        })),
        notes,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });
      toast.success(`Consignment delivery recorded for ${consignee.name}`);
      setLines([]);
      setNotes("");
      setReferenceNumber("");
      setSelectedVariant(null);
      setFormOpen(false);
      const inv = await getBranchInventory(branch.id);
      setSellingVariants(
        mergeSellingVariantsWithInventory(
          products.filter((row) => !row.isArchived),
          inv
        )
      );
      await loadDeliveries();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to record delivery"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = (delivery: ConsignmentDelivery) => {
    void printConsignmentDeliveryReceipt(
      delivery,
      companyForDelivery(delivery)
    ).catch((error) => {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Printing is not available in this browser"
      );
    });
  };

  if (loading) {
    return (
      <p className="text-muted-foreground">Loading consignment deliveries…</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Consignment</h1>
          <p className="text-muted-foreground">
            Deliver stock from a branch to a reusable consignee and print a
            consignment delivery receipt.
          </p>
        </div>
        {canEditStock ? (
          <Button type="button" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New consignment delivery
          </Button>
        ) : null}
      </div>

      {canEditStock ? (
        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            if (
              !open &&
              (pickerOpen || consigneeDialogOpen || submitting)
            ) {
              return;
            }
            setFormOpen(open);
          }}
        >
          <DialogContent
            className="flex max-h-[92dvh] min-h-0 w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl"
            showCloseButton={!submitting}
          >
            <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6">
              <DialogTitle>New consignment delivery</DialogTitle>
              <DialogDescription>
                {isElevatedAdmin
                  ? "Issue selling variants from any branch to a consignee"
                  : `Issue stock from ${branch?.name ?? "your branch"}`}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
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
                  disabled={!canViewAllBranches}
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
                <Label>Consignee</Label>
                <div className="flex gap-2">
                  <Select
                    value={consigneeId}
                    onValueChange={(v) => setConsigneeId(v ?? "")}
                    disabled={consignees.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select consignee">
                        {(value) =>
                          consigneeSelectLabel(value as string | null)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {consignees.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConsigneeDialogOpen(true)}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="consignment-reference">Reference number</Label>
                <Input
                  id="consignment-reference"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="PO, invoice, or tracking number"
                />
              </div>
            </div>

            {branchId ? (
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
                <div className="w-full space-y-2 sm:w-28">
                  <Label>Unit</Label>
                  <Input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="pcs"
                  />
                </div>
                <Button type="button" variant="outline" onClick={addLine}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            ) : null}

            {lines.length > 0 ? (
              <div className="max-h-56 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Remove</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.variantId}>
                        <TableCell>{line.productName}</TableCell>
                        <TableCell>{line.quantity}</TableCell>
                        <TableCell>{line.unit}</TableCell>
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
            ) : null}

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason or extra details…"
                rows={2}
              />
            </div>
            </div>
            <DialogFooter className="mx-0 mb-0 shrink-0 px-4 py-4 sm:px-6">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleComplete()}
                disabled={
                  submitting ||
                  lines.length === 0 ||
                  !consigneeId ||
                  !branchId
                }
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Record consignment delivery
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter by date range, consignee, or item name
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = applyPreset("last7");
                setFromDate(next.fromDate);
                setToDate(next.toDate);
              }}
            >
              Last 7 days
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = applyPreset("thisMonth");
                setFromDate(next.fromDate);
                setToDate(next.toDate);
              }}
            >
              This month
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="consignment-from">From</Label>
              <Input
                id="consignment-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consignment-to">To</Label>
              <Input
                id="consignment-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consignment-consignee-search">Consignee</Label>
              <Input
                id="consignment-consignee-search"
                placeholder="Search consignee…"
                value={consigneeSearch}
                onChange={(e) => setConsigneeSearch(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consignment-item-search">Item name</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="consignment-item-search"
                  className="pl-9"
                  placeholder="Search product name…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consignment deliveries</CardTitle>
          <CardDescription>
            {`${total} ${total === 1 ? "delivery" : "deliveries"} · newest first`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredDeliveries.length === 0 ? (
            <p className="text-muted-foreground">
              No consignment deliveries in this range.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>DR No</TableHead>
                    {canViewAllBranches ? <TableHead>From</TableHead> : null}
                    <TableHead>Consignee</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="w-[1%] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(delivery.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {delivery.drNumber}
                      </TableCell>
                      {canViewAllBranches ? (
                        <TableCell className="text-sm">
                          {delivery.branchName}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <div>
                          <p className="font-medium">{delivery.consigneeName}</p>
                          {delivery.consigneeMobile ? (
                            <p className="text-xs text-muted-foreground">
                              {delivery.consigneeMobile}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs text-sm">
                        {formatDeliveryItemsSummary(delivery)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setReceiptDelivery(delivery)}
                          >
                            View
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(delivery)}
                          >
                            Download
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {total > 0 ? (
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
            />
          ) : null}
        </CardContent>
      </Card>

      <ConsignmentDeliveryReceiptDialog
        delivery={receiptDelivery}
        company={companyForDelivery(receiptDelivery)}
        open={receiptDelivery != null}
        onOpenChange={(open) => {
          if (!open) setReceiptDelivery(null);
        }}
      />

      <VariantSearchDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        variants={availableVariants}
        products={products}
        title="Select variant to deliver"
        stockLabel={(stock) => `${stock} available`}
        emptyMessage="No selling variants with stock match your search."
        onSelect={setSelectedVariant}
      />

      <Dialog
        open={consigneeDialogOpen}
        onOpenChange={(open) => {
          setConsigneeDialogOpen(open);
          if (!open) {
            setNewConsigneeName("");
            setNewConsigneeMobile("");
            setNewConsigneeAddress("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add consignee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-consignee-name">Name</Label>
              <Input
                id="new-consignee-name"
                value={newConsigneeName}
                onChange={(e) => setNewConsigneeName(e.target.value)}
                placeholder="Store or recipient name"
                autoFocus
                disabled={creatingConsignee}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-consignee-mobile">Contact number</Label>
              <Input
                id="new-consignee-mobile"
                value={newConsigneeMobile}
                onChange={(e) => setNewConsigneeMobile(e.target.value)}
                placeholder="Mobile or landline"
                disabled={creatingConsignee}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-consignee-address">Address</Label>
              <Textarea
                id="new-consignee-address"
                value={newConsigneeAddress}
                onChange={(e) => setNewConsigneeAddress(e.target.value)}
                placeholder="Delivery address"
                rows={3}
                disabled={creatingConsignee}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConsigneeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={creatingConsignee}
              onClick={() => void handleCreateConsignee()}
            >
              {creatingConsignee ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create consignee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
