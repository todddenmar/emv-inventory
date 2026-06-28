"use client";

import { useEffect, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranches, updateBranch } from "@/lib/firestore/branches";
import {
  emptySocialLink,
  getSiteSettings,
  updateSiteSettings,
} from "@/lib/firestore/site-settings";
import { formatCoordinates, parseCoordinate } from "@/lib/location";
import type { Branch, SocialLink, SocialPlatform } from "@/types";

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "X (Twitter)" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "website", label: "Website" },
];

type BranchLocationForm = {
  address: string;
  latitude: string;
  longitude: string;
};

export default function AdminSettingsPage() {
  const { isMasterAdmin } = useBranchAccess();
  const [loading, setLoading] = useState(true);
  const [savingFooter, setSavingFooter] = useState(false);
  const [savingBranchId, setSavingBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchForms, setBranchForms] = useState<
    Record<string, BranchLocationForm>
  >({});

  const [footerForm, setFooterForm] = useState({
    footerAddress: "",
    footerPhone: "",
    footerEmail: "",
    socialLinks: [] as SocialLink[],
  });

  const loadData = async () => {
    const [settings, branchList] = await Promise.all([
      getSiteSettings(),
      getBranches(),
    ]);
    setFooterForm({
      footerAddress: settings.footerAddress,
      footerPhone: settings.footerPhone ?? "",
      footerEmail: settings.footerEmail ?? "",
      socialLinks:
        settings.socialLinks.length > 0
          ? settings.socialLinks
          : [emptySocialLink()],
    });
    setBranches(branchList);
    setBranchForms(
      Object.fromEntries(
        branchList.map((branch) => [
          branch.id,
          {
            address: branch.address,
            latitude:
              branch.latitude != null ? String(branch.latitude) : "",
            longitude:
              branch.longitude != null ? String(branch.longitude) : "",
          },
        ])
      )
    );
  };

  useEffect(() => {
    loadData()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (!isMasterAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only the master-admin can manage site settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  const updateSocialLink = (
    index: number,
    field: keyof SocialLink,
    value: string
  ) => {
    setFooterForm((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.map((link, i) =>
        i === index
          ? {
              ...link,
              [field]: field === "label" && !value.trim() ? null : value,
            }
          : link
      ),
    }));
  };

  const handleSaveFooter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFooter(true);
    try {
      await updateSiteSettings({
        footerAddress: footerForm.footerAddress.trim(),
        footerPhone: footerForm.footerPhone.trim() || null,
        footerEmail: footerForm.footerEmail.trim() || null,
        socialLinks: footerForm.socialLinks
          .filter((link) => link.url.trim())
          .map((link) => ({
            platform: link.platform,
            url: link.url.trim(),
            label: link.label?.trim() || null,
          })),
      });
      toast.success("Footer settings saved");
    } catch {
      toast.error("Failed to save footer settings");
    } finally {
      setSavingFooter(false);
    }
  };

  const handleSaveBranch = async (branch: Branch) => {
    const form = branchForms[branch.id];
    if (!form) return;

    const latitude = parseCoordinate(form.latitude);
    const longitude = parseCoordinate(form.longitude);

    if (
      (form.latitude.trim() && latitude == null) ||
      (form.longitude.trim() && longitude == null)
    ) {
      toast.error("Coordinates must be valid numbers");
      return;
    }

    if (
      (latitude != null && longitude == null) ||
      (latitude == null && longitude != null)
    ) {
      toast.error("Provide both latitude and longitude, or leave both empty");
      return;
    }

    setSavingBranchId(branch.id);
    try {
      await updateBranch(branch.id, {
        address: form.address.trim(),
        latitude,
        longitude,
      });
      toast.success(`${branch.name} location updated`);
      await loadData();
    } catch {
      toast.error("Failed to update branch location");
    } finally {
      setSavingBranchId(null);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading settings...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage footer contact info, social links, and branch locations
        </p>
      </div>

      <Tabs defaultValue="footer">
        <TabsList>
          <TabsTrigger value="footer">Footer & social</TabsTrigger>
          <TabsTrigger value="branches">Branch locations</TabsTrigger>
        </TabsList>

        <TabsContent value="footer" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Footer content</CardTitle>
              <CardDescription>
                Shown in the site footer on all public pages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveFooter} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="footer-address">Address</Label>
                  <Textarea
                    id="footer-address"
                    rows={3}
                    value={footerForm.footerAddress}
                    onChange={(e) =>
                      setFooterForm({
                        ...footerForm,
                        footerAddress: e.target.value,
                      })
                    }
                    placeholder="Main office address"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="footer-phone">Phone</Label>
                    <Input
                      id="footer-phone"
                      value={footerForm.footerPhone}
                      onChange={(e) =>
                        setFooterForm({
                          ...footerForm,
                          footerPhone: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="footer-email">Email</Label>
                    <Input
                      id="footer-email"
                      type="email"
                      value={footerForm.footerEmail}
                      onChange={(e) =>
                        setFooterForm({
                          ...footerForm,
                          footerEmail: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Social links</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setFooterForm({
                          ...footerForm,
                          socialLinks: [
                            ...footerForm.socialLinks,
                            emptySocialLink(),
                          ],
                        })
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add link
                    </Button>
                  </div>

                  {footerForm.socialLinks.map((link, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[160px_1fr_1fr_auto]"
                    >
                      <div className="space-y-2">
                        <Label className="text-xs">Platform</Label>
                        <Select
                          value={link.platform}
                          onValueChange={(v) =>
                            updateSocialLink(
                              index,
                              "platform",
                              (v as SocialPlatform) ?? "website"
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLATFORMS.map((platform) => (
                              <SelectItem
                                key={platform.value}
                                value={platform.value}
                              >
                                {platform.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">URL</Label>
                        <Input
                          value={link.url}
                          onChange={(e) =>
                            updateSocialLink(index, "url", e.target.value)
                          }
                          placeholder="https://"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Label (optional)</Label>
                        <Input
                          value={link.label ?? ""}
                          onChange={(e) =>
                            updateSocialLink(index, "label", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={footerForm.socialLinks.length <= 1}
                          onClick={() =>
                            setFooterForm({
                              ...footerForm,
                              socialLinks: footerForm.socialLinks.filter(
                                (_, i) => i !== index
                              ),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button type="submit" disabled={savingFooter}>
                  {savingFooter && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save footer settings
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Branch locations</CardTitle>
              <CardDescription>
                Address and map coordinates for each branch. Coordinates power
                &quot;View on map&quot; links in the footer.
              </CardDescription>
            </CardHeader>
          </Card>

          {branches.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-muted-foreground">
                No branches yet. Create branches first under Branches.
              </CardContent>
            </Card>
          ) : (
            branches.map((branch) => {
              const form = branchForms[branch.id];
              if (!form) return null;
              const coords = formatCoordinates(
                parseCoordinate(form.latitude),
                parseCoordinate(form.longitude)
              );

              return (
                <Card key={branch.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{branch.name}</CardTitle>
                    <CardDescription>{branch.code}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Textarea
                        rows={2}
                        value={form.address}
                        onChange={(e) =>
                          setBranchForms({
                            ...branchForms,
                            [branch.id]: {
                              ...form,
                              address: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Latitude</Label>
                        <Input
                          value={form.latitude}
                          onChange={(e) =>
                            setBranchForms({
                              ...branchForms,
                              [branch.id]: {
                                ...form,
                                latitude: e.target.value,
                              },
                            })
                          }
                          placeholder="e.g. 14.5995"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Longitude</Label>
                        <Input
                          value={form.longitude}
                          onChange={(e) =>
                            setBranchForms({
                              ...branchForms,
                              [branch.id]: {
                                ...form,
                                longitude: e.target.value,
                              },
                            })
                          }
                          placeholder="e.g. 120.9842"
                        />
                      </div>
                    </div>
                    {coords && (
                      <p className="text-xs text-muted-foreground">
                        Preview: {coords}
                      </p>
                    )}
                    <Button
                      onClick={() => handleSaveBranch(branch)}
                      disabled={savingBranchId === branch.id}
                    >
                      {savingBranchId === branch.id && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save location
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
