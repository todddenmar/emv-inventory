"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LinkButton } from "@/components/ui/link-button";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/stores/auth-store";
import { getCustomerOrders } from "@/lib/firestore/orders";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Order, OrderStatus } from "@/types";

const statusColors: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  confirmed: "default",
  preparing: "default",
  out_for_delivery: "default",
  delivered: "outline",
  cancelled: "destructive",
};

function OrdersContent() {
  const searchParams = useSearchParams();
  const placedId = searchParams.get("placed");
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (placedId) {
      toast.success("Your order has been placed!");
    }
  }, [placedId]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setFetching(false);
      return;
    }
    getCustomerOrders(user.uid)
      .then(setOrders)
      .catch(console.error)
      .finally(() => setFetching(false));
  }, [user, loading]);

  if (loading || fetching) {
    return <p className="p-8 text-center text-muted-foreground">Loading...</p>;
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">My Orders</h1>
        <p className="text-muted-foreground mt-2">
          Sign in to view your order history.
        </p>
        <LinkButton href="/login?redirect=/orders" className="mt-4">
          Sign in
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>

      {placedId && (
        <Card className="mb-6 border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <p className="font-medium">Order placed successfully!</p>
            <p className="text-sm text-muted-foreground">
              Order ID: {placedId} — Pay cash on delivery when your order
              arrives.
            </p>
          </CardContent>
        </Card>
      )}

      {orders.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No orders yet</CardTitle>
            <CardDescription>
              Your orders will appear here after checkout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton href="/">Start shopping</LinkButton>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Order #{order.id.slice(0, 8)}
                  </CardTitle>
                  <Badge variant={statusColors[order.status]}>
                    {order.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <CardDescription>{formatDate(order.createdAt)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.price * item.quantity)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 flex justify-between border-t pt-4">
                  <div className="text-sm text-muted-foreground">
                    <p>{order.deliveryAddress}</p>
                    {order.deliveryLocation && (
                      <p className="flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3" />
                        {order.deliveryLocation.latitude.toFixed(4)},{" "}
                        {order.deliveryLocation.longitude.toFixed(4)}
                      </p>
                    )}
                    <p className="mt-1">Payment: COD</p>
                  </div>
                  <p className="font-semibold">
                    {formatCurrency(order.total)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center">Loading...</p>}>
      <OrdersContent />
    </Suspense>
  );
}
