"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAppSettings } from "@/hooks/use-app-settings";
import { updateAppSettings } from "@/lib/firestore/app-settings";
import type { CatalogImageSource } from "@/lib/products";

export default function AdminSettingsGeneralPage() {
  const { isMasterAdmin } = useBranchAccess();
  const { settings, loading, setSettings } = useAppSettings();
  const [catalogImageSource, setCatalogImageSource] =
    useState<CatalogImageSource | null>(null);
  const [hideSidebarLabelsUntilHover, setHideSidebarLabelsUntilHover] =
    useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      setCatalogImageSource(null);
      setHideSidebarLabelsUntilHover(null);
    }
  }, [loading, settings]);

  const imageValue = catalogImageSource ?? settings.catalogImageSource;
  const labelsValue =
    hideSidebarLabelsUntilHover ?? settings.hideSidebarLabelsUntilHover;

  const dirty =
    imageValue !== settings.catalogImageSource ||
    labelsValue !== settings.hideSidebarLabelsUntilHover;

  if (!isMasterAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only the master-admin can change general settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  const imageSourceLabel = (v: string | null) => {
    if (v === "none") return "No images";
    if (v === "variant") return "Variant image";
    return "Product image";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await updateAppSettings({
        catalogImageSource: imageValue,
        hideSidebarLabelsUntilHover: labelsValue,
      });
      setSettings(next);
      setCatalogImageSource(null);
      setHideSidebarLabelsUntilHover(null);
      toast.success("General settings saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">General</h1>
        <p className="text-muted-foreground">
          App-wide display preferences for inventory, POS, and navigation
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalog images</CardTitle>
          <CardDescription>
            Control whether POS, inventory, and assortment show product or
            variant thumbnails — or hide images entirely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading settings…</p>
          ) : (
            <div className="max-w-md space-y-2">
              <Label>Image display</Label>
              <Select
                value={imageValue}
                onValueChange={(v) =>
                  setCatalogImageSource((v as CatalogImageSource) ?? "product")
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v) => imageSourceLabel(v as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product image</SelectItem>
                  <SelectItem value="variant">Variant image</SelectItem>
                  <SelectItem value="none">No images</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {imageValue === "none"
                  ? "Thumbnails are hidden in POS, inventory, and assortment."
                  : imageValue === "variant"
                    ? "Uses each variant’s assigned image, falling back to the product thumbnail when missing."
                    : "Uses the product thumbnail for every variant."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navigation</CardTitle>
          <CardDescription>
            Compact the main admin sidebar to icons only until you hover it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading settings…</p>
          ) : (
            <div className="flex max-w-xl items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="hide-sidebar-labels">
                  Hide sidebar labels until hover
                </Label>
                <p className="text-sm text-muted-foreground">
                  Desktop only. Mobile menu always shows full labels.
                </p>
              </div>
              <Switch
                id="hide-sidebar-labels"
                checked={labelsValue}
                onCheckedChange={setHideSidebarLabelsUntilHover}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && (
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      )}
    </div>
  );
}
