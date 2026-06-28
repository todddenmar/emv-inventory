"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";
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
import { subscribeToOrders, updateOrderStatus } from "@/lib/firestore/orders";
import { restockCancelledOrder } from "@/lib/firestore/inventory";
import { getBranches } from "@/lib/firestore/branches";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Branch, Order, OrderStatus } from "@/types";

const statuses: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const statusColors: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  confirmed: "default",
  preparing: "default",
  out_for_delivery: "default",
  delivered: "outline",
  cancelled: "destructive",
};

export default function AdminOrdersPage() {
  const { isMasterAdmin, assignedBranchId } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    getBranches().then(setBranches).catch(console.error);
    const unsubscribe = subscribeToOrders(setOrders);
    return () => unsubscribe();
  }, []);

  const branchMap = Object.fromEntries(branches.map((b) => [b.id, b]));

  const visibleOrders = useMemo(
    () =>
      isMasterAdmin
        ? orders
        : orders.filter((o) => o.branchId === assignedBranchId),
    [orders, isMasterAdmin, assignedBranchId]
  );

  const handleStatusChange = async (order: Order, status: OrderStatus) => {
    const wasCancelled = order.status === "cancelled";
    try {
      await updateOrderStatus(order.id, status);
      if (
        status === "cancelled" &&
        !wasCancelled &&
        order.branchId &&
        user
      ) {
        await restockCancelledOrder(
          order,
          user.uid,
          user.displayName ?? user.email,
          branchMap[order.branchId]?.name
        );
      }
      toast.success("Order status updated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        {!isMasterAdmin && (
          <p className="text-muted-foreground text-sm">
            Showing orders for your assigned branch only
          </p>
        )}
      </div>

      {visibleOrders.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No orders yet</CardTitle>
            <CardDescription>
              Customer orders will appear here in real time.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => (
            <Card key={order.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      #{order.id.slice(0, 8)} — {order.customerName}
                    </CardTitle>
                    <CardDescription>
                      {formatDate(order.createdAt)} · {order.customerPhone}
                      {order.branchId && branchMap[order.branchId] && (
                        <> · {branchMap[order.branchId].name}</>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColors[order.status]}>
                      {order.status.replace(/_/g, " ")}
                    </Badge>
                    <Select
                      value={order.status}
                      onValueChange={(v) =>
                        handleStatusChange(order, v as OrderStatus)
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
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

                <div className="mt-4 grid gap-4 border-t pt-4 md:grid-cols-2">
                  <div className="text-sm">
                    <p className="font-medium">Delivery address</p>
                    <p className="text-muted-foreground">
                      {order.deliveryAddress}
                    </p>
                    {order.deliveryLocation && (
                      <div className="mt-2 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {order.deliveryLocation.latitude.toFixed(6)},{" "}
                          {order.deliveryLocation.longitude.toFixed(6)}
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${order.deliveryLocation.latitude},${order.deliveryLocation.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {order.notes && (
                      <p className="mt-2 text-muted-foreground">
                        Notes: {order.notes}
                      </p>
                    )}
                    <p className="mt-2">Payment: COD</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">
                      {formatCurrency(order.total)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
