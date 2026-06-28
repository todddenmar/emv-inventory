"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  createBanner,
  createTestimonial,
  deleteBanner,
  deleteTestimonial,
  getAllBanners,
  getAllTestimonials,
  updateBanner,
  updateTestimonial,
} from "@/lib/firestore/homepage";
import { getProducts } from "@/lib/firestore/products";
import { getProductThumbnailUrl } from "@/lib/products";
import {
  deleteHomepageImage,
  uploadHomepageImage,
} from "@/lib/storage/homepage";
import type { HomeBanner, Product, Testimonial } from "@/types";

export default function AdminHomepagePage() {
  const { isMasterAdmin } = useBranchAccess();
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerDialog, setBannerDialog] = useState(false);
  const [testimonialDialog, setTestimonialDialog] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HomeBanner | null>(null);
  const [editingTestimonial, setEditingTestimonial] =
    useState<Testimonial | null>(null);
  const [deleteBannerId, setDeleteBannerId] = useState<string | null>(null);
  const [deleteTestimonialId, setDeleteTestimonialId] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  const [bannerForm, setBannerForm] = useState({
    title: "",
    subtitle: "",
    linkUrl: "",
    order: 0,
    imageFile: null as File | null,
    imagePreview: "",
  });

  const [testimonialForm, setTestimonialForm] = useState({
    customerName: "",
    quote: "",
    productId: "",
    order: 0,
    customerFile: null as File | null,
    customerPreview: "",
    productFile: null as File | null,
    productPreview: "",
  });

  const loadData = () => {
    Promise.all([getAllBanners(), getAllTestimonials(), getProducts()])
      .then(([b, t, p]) => {
        setBanners(b);
        setTestimonials(t);
        setProducts(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  if (!isMasterAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only the master-admin can manage homepage content.
          </p>
        </CardContent>
      </Card>
    );
  }

  const openBannerCreate = () => {
    setEditingBanner(null);
    setBannerForm({
      title: "",
      subtitle: "",
      linkUrl: "",
      order: banners.length,
      imageFile: null,
      imagePreview: "",
    });
    setBannerDialog(true);
  };

  const openBannerEdit = (banner: HomeBanner) => {
    setEditingBanner(banner);
    setBannerForm({
      title: banner.title,
      subtitle: banner.subtitle ?? "",
      linkUrl: banner.linkUrl ?? "",
      order: banner.order,
      imageFile: null,
      imagePreview: banner.imageUrl,
    });
    setBannerDialog(true);
  };

  const saveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!editingBanner && !bannerForm.imageFile) {
      toast.error("Banner image is required");
      return;
    }

    setSubmitting(true);
    try {
      let id = editingBanner?.id;
      let imageUrl = editingBanner?.imageUrl ?? "";
      let storagePath = editingBanner?.storagePath ?? "";

      if (!id) {
        id = await createBanner({
          title: bannerForm.title.trim(),
          subtitle: bannerForm.subtitle.trim() || null,
          imageUrl: "",
          storagePath: "",
          linkUrl: bannerForm.linkUrl.trim() || null,
          order: bannerForm.order,
          isActive: true,
        });
      }

      if (bannerForm.imageFile && id) {
        if (storagePath) await deleteHomepageImage(storagePath).catch(() => {});
        const uploaded = await uploadHomepageImage(
          "banners",
          id,
          bannerForm.imageFile
        );
        imageUrl = uploaded.url;
        storagePath = uploaded.storagePath;
      }

      await updateBanner(id!, {
        title: bannerForm.title.trim(),
        subtitle: bannerForm.subtitle.trim() || null,
        imageUrl,
        storagePath,
        linkUrl: bannerForm.linkUrl.trim() || null,
        order: bannerForm.order,
        isActive: true,
      });

      toast.success(editingBanner ? "Banner updated" : "Banner created");
      setBannerDialog(false);
      loadData();
    } catch {
      toast.error("Failed to save banner");
    } finally {
      setSubmitting(false);
    }
  };

  const openTestimonialCreate = () => {
    setEditingTestimonial(null);
    setTestimonialForm({
      customerName: "",
      quote: "",
      productId: "",
      order: testimonials.length,
      customerFile: null,
      customerPreview: "",
      productFile: null,
      productPreview: "",
    });
    setTestimonialDialog(true);
  };

  const openTestimonialEdit = (item: Testimonial) => {
    setEditingTestimonial(item);
    setTestimonialForm({
      customerName: item.customerName,
      quote: item.quote ?? "",
      productId: item.productId ?? "",
      order: item.order,
      customerFile: null,
      customerPreview: item.customerImageUrl,
      productFile: null,
      productPreview: item.productImageUrl ?? "",
    });
    setTestimonialDialog(true);
  };

  const saveTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testimonialForm.customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!testimonialForm.productId) {
      toast.error("Select a product");
      return;
    }
    if (!editingTestimonial && !testimonialForm.customerFile) {
      toast.error("Customer photo is required");
      return;
    }

    const product = products.find((p) => p.id === testimonialForm.productId);
    if (!product) {
      toast.error("Product not found");
      return;
    }

    setSubmitting(true);
    try {
      let id = editingTestimonial?.id;
      let customerImageUrl = editingTestimonial?.customerImageUrl ?? "";
      let customerImageStoragePath =
        editingTestimonial?.customerImageStoragePath ?? "";
      let productImageUrl =
        editingTestimonial?.productImageUrl ??
        (getProductThumbnailUrl(product) || null);
      let productImageStoragePath =
        editingTestimonial?.productImageStoragePath ?? null;

      if (!id) {
        id = await createTestimonial({
          customerName: testimonialForm.customerName.trim(),
          quote: testimonialForm.quote.trim() || null,
          customerImageUrl: "",
          customerImageStoragePath: "",
          productId: product.id,
          productName: product.name,
          productImageUrl,
          productImageStoragePath,
          order: testimonialForm.order,
          isActive: true,
        });
      }

      if (testimonialForm.customerFile && id) {
        if (customerImageStoragePath)
          await deleteHomepageImage(customerImageStoragePath).catch(() => {});
        const uploaded = await uploadHomepageImage(
          "testimonials",
          id,
          testimonialForm.customerFile,
          "customer"
        );
        customerImageUrl = uploaded.url;
        customerImageStoragePath = uploaded.storagePath;
      }

      if (testimonialForm.productFile && id) {
        if (productImageStoragePath)
          await deleteHomepageImage(productImageStoragePath).catch(() => {});
        const uploaded = await uploadHomepageImage(
          "testimonials",
          id,
          testimonialForm.productFile,
          "product"
        );
        productImageUrl = uploaded.url;
        productImageStoragePath = uploaded.storagePath;
      }

      await updateTestimonial(id!, {
        customerName: testimonialForm.customerName.trim(),
        quote: testimonialForm.quote.trim() || null,
        customerImageUrl,
        customerImageStoragePath,
        productId: product.id,
        productName: product.name,
        productImageUrl,
        productImageStoragePath,
        order: testimonialForm.order,
        isActive: true,
      });

      toast.success(
        editingTestimonial ? "Testimonial updated" : "Testimonial created"
      );
      setTestimonialDialog(false);
      loadData();
    } catch {
      toast.error("Failed to save testimonial");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Homepage</h1>
        <p className="text-muted-foreground">
          Manage banners and customer testimonials
        </p>
      </div>

      <Tabs defaultValue="banners">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="banners">Banners</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
        </TabsList>

        <TabsContent value="banners" className="space-y-4">
          <Button onClick={openBannerCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add banner
          </Button>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : banners.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-muted-foreground">
                No banners yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {banners.map((banner) => (
                <Card key={banner.id} className="overflow-hidden">
                  <div className="aspect-[2/1] bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={banner.imageUrl}
                      alt={banner.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{banner.title}</CardTitle>
                    <CardDescription>Order: {banner.order}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openBannerEdit(banner)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteBannerId(banner.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="testimonials" className="space-y-4">
          <Button onClick={openTestimonialCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add testimonial
          </Button>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : testimonials.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-muted-foreground">
                No testimonials yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex gap-3 pt-6">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.customerImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.customerName}</p>
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {item.productName}
                      </Badge>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openTestimonialEdit(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTestimonialId(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={bannerDialog} onOpenChange={setBannerDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBanner ? "Edit banner" : "Add banner"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveBanner} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={bannerForm.title}
                onChange={(e) =>
                  setBannerForm({ ...bannerForm, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Textarea
                rows={2}
                value={bannerForm.subtitle}
                onChange={(e) =>
                  setBannerForm({ ...bannerForm, subtitle: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Link URL (optional)</Label>
              <Input
                placeholder="/shop"
                value={bannerForm.linkUrl}
                onChange={(e) =>
                  setBannerForm({ ...bannerForm, linkUrl: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Display order</Label>
              <Input
                type="number"
                value={bannerForm.order}
                onChange={(e) =>
                  setBannerForm({
                    ...bannerForm,
                    order: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Banner image</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBannerForm({
                    ...bannerForm,
                    imageFile: file,
                    imagePreview: URL.createObjectURL(file),
                  });
                }}
              />
              {bannerForm.imagePreview && (
                <div className="aspect-[2/1] overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bannerForm.imagePreview}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save banner
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={testimonialDialog} onOpenChange={setTestimonialDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTestimonial ? "Edit testimonial" : "Add testimonial"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveTestimonial} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer name</Label>
              <Input
                value={testimonialForm.customerName}
                onChange={(e) =>
                  setTestimonialForm({
                    ...testimonialForm,
                    customerName: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Quote (optional)</Label>
              <Textarea
                rows={3}
                value={testimonialForm.quote}
                onChange={(e) =>
                  setTestimonialForm({
                    ...testimonialForm,
                    quote: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Product purchased</Label>
              <Select
                value={testimonialForm.productId}
                onValueChange={(v) =>
                  setTestimonialForm({
                    ...testimonialForm,
                    productId: v ?? "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer photo</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setTestimonialForm({
                    ...testimonialForm,
                    customerFile: file,
                    customerPreview: URL.createObjectURL(file),
                  });
                }}
              />
              {testimonialForm.customerPreview && (
                <div className="h-20 w-20 overflow-hidden rounded-full border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={testimonialForm.customerPreview}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Product photo (optional override)</Label>
              <p className="text-xs text-muted-foreground">
                Uses product thumbnail if not provided
              </p>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setTestimonialForm({
                    ...testimonialForm,
                    productFile: file,
                    productPreview: URL.createObjectURL(file),
                  });
                }}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save testimonial
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteBannerId}
        onOpenChange={() => setDeleteBannerId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete banner?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteBannerId) return;
                await deleteBanner(deleteBannerId);
                toast.success("Banner deleted");
                setDeleteBannerId(null);
                loadData();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTestimonialId}
        onOpenChange={() => setDeleteTestimonialId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete testimonial?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTestimonialId) return;
                await deleteTestimonial(deleteTestimonialId);
                toast.success("Testimonial deleted");
                setDeleteTestimonialId(null);
                loadData();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
