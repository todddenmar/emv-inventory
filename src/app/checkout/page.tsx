"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LinkButton } from "@/components/ui/link-button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MapPin, Loader2 } from "lucide-react";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { createOrder } from "@/lib/firestore/orders";
import { getOnlineShopBranch } from "@/lib/firestore/branches";
import { decrementBranchStock } from "@/lib/firestore/inventory";
import { signInAsGuest } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";

const checkoutSchema = z.object({
  customerName: z.string().min(2, "Name is required"),
  customerPhone: z.string().min(7, "Valid phone number required"),
  customerEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  deliveryAddress: z.string().min(10, "Please provide a full delivery address"),
  notes: z.string().optional(),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const clearCart = useCartStore((s) => s.clearCart);
  const user = useAuthStore((s) => s.user);
  const [submitting, setSubmitting] = useState(false);
  const { location, loading: geoLoading, error: geoError, getLocation } =
    useGeolocation();

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      deliveryAddress: "",
      notes: "",
    },
  });

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Nothing to checkout</h1>
        <LinkButton href="/" className="mt-4">
          Back to shop
        </LinkButton>
      </div>
    );
  }

  const onSubmit = async (data: CheckoutForm) => {
    if (!location) {
      toast.error("Please share your location for delivery");
      return;
    }

    setSubmitting(true);
    try {
      let customerId = user?.uid ?? null;
      if (!customerId) {
        const guestUser = await signInAsGuest();
        customerId = guestUser.uid;
      }

      const shopBranch = await getOnlineShopBranch();
      if (!shopBranch) {
        throw new Error("Online shop branch is not configured");
      }

      const orderItems = items.map((i) => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      }));

      const orderId = await createOrder({
        branchId: shopBranch.id,
        customerId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail || null,
        deliveryAddress: data.deliveryAddress,
        deliveryLocation: location,
        items: orderItems,
        subtotal,
        total: subtotal,
        paymentMethod: "COD",
        status: "pending",
        notes: data.notes || null,
      });

      for (const item of items) {
        await decrementBranchStock(
          shopBranch.id,
          item.productId,
          item.quantity,
          {
            productName: item.name,
            branchName: shopBranch.name,
            referenceId: orderId,
            referenceLabel: `Order #${orderId.slice(-6).toUpperCase()}`,
            performedBy: customerId ?? "guest",
            performedByName: data.customerName,
          }
        );
      }

      clearCart();
      toast.success("Order placed successfully!");
      router.push(`/orders?placed=${orderId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to place order"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
          <CardDescription>
            {items.length} item(s) — {formatCurrency(subtotal)} (COD)
          </CardDescription>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input placeholder="Juan Dela Cruz" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone number</FormLabel>
                    <FormControl>
                      <Input placeholder="+63 9XX XXX XXXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
              <CardDescription>
                We need your address and current location for delivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="deliveryAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Street, barangay, city, province..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Current location</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  onClick={getLocation}
                  disabled={geoLoading}
                  className="w-full"
                >
                  {geoLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="mr-2 h-4 w-4" />
                  )}
                  {location
                    ? "Location captured — tap to refresh"
                    : "Share my location"}
                </Button>
                {location && (
                  <p className="text-sm text-muted-foreground">
                    Lat: {location.latitude.toFixed(6)}, Lng:{" "}
                    {location.longitude.toFixed(6)}
                    {location.accuracy &&
                      ` (±${Math.round(location.accuracy)}m)`}
                  </p>
                )}
                {geoError && (
                  <Alert variant="destructive">
                    <AlertDescription>{geoError}</AlertDescription>
                  </Alert>
                )}
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Landmarks, gate code, etc."
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between text-lg font-semibold mb-4">
                <span>Total (COD)</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || !location}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Place order — Pay on delivery
              </Button>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
