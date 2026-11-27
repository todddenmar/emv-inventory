"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Printer, Save, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  EMPTY_DELIVERY_RECEIPT_COMPANY,
  buildDeliveryReceiptHtml,
  getDeliveryReceiptCompany,
  normalizeDeliveryReceiptCompany,
  printDeliveryReceipt,
  sampleDeliverySale,
} from "@/lib/delivery-receipt";
import { getBranches, updateBranch } from "@/lib/firestore/branches";
import {
  deleteDeliveryReceiptLogo,
  uploadDeliveryReceiptLogo,
} from "@/lib/storage/delivery-receipts";
import type { Branch, DeliveryReceiptCompany } from "@/types";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function companyEquals(
  a: DeliveryReceiptCompany,
  b: DeliveryReceiptCompany
): boolean {
  return (
    a.companyName === b.companyName &&
    a.tagline === b.tagline &&
    a.address === b.address &&
    a.phone === b.phone &&
    a.email === b.email &&
    a.footerNote === b.footerNote &&
    a.logoUrl === b.logoUrl &&
    a.logoStoragePath === b.logoStoragePath
  );
}

export default function AdminDeliverySettingsPage() {
  const { isElevatedAdmin, canViewAllBranches, assignedBranchId } =
    useBranchAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [form, setForm] = useState<DeliveryReceiptCompany | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoUrl, setPendingLogoUrl] = useState("");
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectedBranch =
    branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const saved = normalizeDeliveryReceiptCompany(
    selectedBranch?.deliveryReceipt
  );
  const value = form ?? saved;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBranches(true)
      .then((rows) => {
        if (cancelled) return;
        setBranches(rows);
        setSelectedBranchId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          if (!canViewAllBranches && assignedBranchId) {
            return (
              rows.find((row) => row.id === assignedBranchId)?.id ??
              rows[0]?.id ??
              ""
            );
          }
          return rows[0]?.id ?? "";
        });
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load branches");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignedBranchId, canViewAllBranches]);

  useEffect(() => {
    setForm(null);
    setPendingLogoFile(null);
    setPendingLogoUrl("");
    setLogoRemoved(false);
  }, [selectedBranchId]);

  const previewLogoUrl = pendingLogoUrl || (logoRemoved ? "" : value.logoUrl);
  const previewCompany = getDeliveryReceiptCompany(
    selectedBranch
      ? {
          ...selectedBranch,
          deliveryReceipt: {
            ...value,
            logoUrl: previewLogoUrl,
            logoStoragePath: logoRemoved ? "" : value.logoStoragePath,
          },
        }
      : {
          deliveryReceipt: {
            ...value,
            logoUrl: previewLogoUrl,
          },
        }
  );
  const previewHtml = useMemo(
    () =>
      buildDeliveryReceiptHtml(
        sampleDeliverySale(selectedBranch),
        previewCompany
      ),
    [previewCompany, selectedBranch]
  );

  const dirty =
    pendingLogoFile != null ||
    logoRemoved ||
    !companyEquals(
      {
        ...value,
        logoUrl: saved.logoUrl,
        logoStoragePath: saved.logoStoragePath,
      },
      saved
    );

  const updateField = <K extends keyof DeliveryReceiptCompany>(
    key: K,
    next: DeliveryReceiptCompany[K]
  ) => {
    setForm((current) => ({
      ...(current ?? saved),
      [key]: next,
    }));
  };

  const handleLogoPick = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be 2 MB or smaller");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingLogoFile(file);
      setPendingLogoUrl(typeof reader.result === "string" ? reader.result : "");
      setLogoRemoved(false);
    };
    reader.onerror = () => toast.error("Could not read that image");
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setPendingLogoFile(null);
    setPendingLogoUrl("");
    setLogoRemoved(true);
    setForm((current) => ({
      ...(current ?? saved),
      logoUrl: "",
      logoStoragePath: "",
    }));
  };

  const handleSave = async () => {
    if (!selectedBranch) return;
    setSaving(true);
    try {
      const next = normalizeDeliveryReceiptCompany({
        ...value,
        logoUrl: logoRemoved ? "" : value.logoUrl,
        logoStoragePath: logoRemoved ? "" : value.logoStoragePath,
      });

      if (pendingLogoFile) {
        const uploaded = await uploadDeliveryReceiptLogo(
          selectedBranch.id,
          pendingLogoFile
        );
        if (saved.logoStoragePath) {
          await deleteDeliveryReceiptLogo(saved.logoStoragePath).catch(
            console.error
          );
        }
        next.logoUrl = uploaded.url;
        next.logoStoragePath = uploaded.storagePath;
      } else if (logoRemoved && saved.logoStoragePath) {
        await deleteDeliveryReceiptLogo(saved.logoStoragePath).catch(
          console.error
        );
        next.logoUrl = "";
        next.logoStoragePath = "";
      }

      await updateBranch(selectedBranch.id, { deliveryReceipt: next });
      setBranches((rows) =>
        rows.map((row) =>
          row.id === selectedBranch.id
            ? { ...row, deliveryReceipt: next }
            : row
        )
      );
      setForm(null);
      setPendingLogoFile(null);
      setPendingLogoUrl("");
      setLogoRemoved(false);
      toast.success("Delivery receipt settings saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save delivery receipt settings");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setForm({ ...EMPTY_DELIVERY_RECEIPT_COMPANY });
    setPendingLogoFile(null);
    setPendingLogoUrl("");
    setLogoRemoved(Boolean(saved.logoUrl || saved.logoStoragePath));
  };

  const handleDownloadPreview = () => {
    setDownloading(true);
    void printDeliveryReceipt(
      sampleDeliverySale(selectedBranch),
      previewCompany,
      {
        title: selectedBranch
          ? `delivery-receipt-preview-${selectedBranch.code}`
          : "delivery-receipt-preview",
      }
    )
      .catch((error) => {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Printing is not available in this browser"
        );
      })
      .finally(() => setDownloading(false));
  };

  const canEdit = isElevatedAdmin && Boolean(selectedBranch);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Delivery receipt settings</h1>
        <p className="text-muted-foreground">
          Company header for each branch’s delivery receipts. Preview uses a
          sample customer and sale items.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
            <CardDescription>
              Saved per branch. Blank name, address, or phone falls back to the
              branch record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading branches…</p>
            ) : branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No branches found.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Select
                    value={selectedBranchId}
                    onValueChange={(v) => setSelectedBranchId(v ?? "")}
                    disabled={!canViewAllBranches || branches.length < 2}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a branch">
                        {(id) => {
                          const branch = branches.find((row) => row.id === id);
                          return branch
                            ? `${branch.name} (${branch.code})`
                            : null;
                        }}
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
                  <Label>Logo</Label>
                  <div className="flex items-start gap-3">
                    {previewLogoUrl ? (
                      <img
                        src={previewLogoUrl}
                        alt="Company logo"
                        className="h-16 w-16 rounded-md border object-contain bg-white"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                        <ImagePlus className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canEdit}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload logo
                      </Button>
                      {previewLogoUrl ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canEdit}
                          onClick={handleRemoveLogo}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleLogoPick(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, or SVG. Max 2 MB.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-company-name">Company name</Label>
                  <Input
                    id="delivery-company-name"
                    value={value.companyName}
                    onChange={(e) => updateField("companyName", e.target.value)}
                    placeholder={selectedBranch?.name || "Company name"}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-company-tagline">Subtitle</Label>
                  <Input
                    id="delivery-company-tagline"
                    value={value.tagline}
                    onChange={(e) => updateField("tagline", e.target.value)}
                    placeholder="Optional line under the company name"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-company-address">Address</Label>
                  <Textarea
                    id="delivery-company-address"
                    value={value.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    placeholder={
                      selectedBranch?.address || "Street, barangay, city"
                    }
                    rows={3}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-company-phone">Phone</Label>
                  <Input
                    id="delivery-company-phone"
                    value={value.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder={selectedBranch?.phone || "09xx xxx xxxx"}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-company-email">Email</Label>
                  <Input
                    id="delivery-company-email"
                    type="email"
                    value={value.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="hello@example.com"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-company-footer">Footer note</Label>
                  <Textarea
                    id="delivery-company-footer"
                    value={value.footerNote}
                    onChange={(e) => updateField("footerNote", e.target.value)}
                    placeholder="Thank you for doing business with us!"
                    rows={3}
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use the default thank-you line.
                  </p>
                </div>
                {isElevatedAdmin ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving || !dirty || !selectedBranch}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClear}
                      disabled={saving || !selectedBranch}
                    >
                      Clear
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Only admins can change company details on the receipt.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="xl:sticky xl:top-4">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Sample customer Juan Dela Cruz with three sale items
                {selectedBranch ? ` · ${selectedBranch.name}` : ""}.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadPreview}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-1.5 h-4 w-4" />
              )}
              Download PDF
            </Button>
          </CardHeader>
          <CardContent>
            <iframe
              title="Delivery receipt preview"
              className="h-[min(80vh,52rem)] w-full rounded-md border bg-white"
              srcDoc={previewHtml}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
