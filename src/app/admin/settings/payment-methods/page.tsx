"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createPaymentMethod,
  getPaymentMethods,
  setPaymentMethodActive,
  updatePaymentMethod,
} from "@/lib/firestore/payment-methods";
import type { PaymentMethod } from "@/types";

type MethodForm = {
  name: string;
  shortLabel: string;
  isCash: boolean;
};

const emptyForm = (): MethodForm => ({
  name: "",
  shortLabel: "",
  isCash: false,
});

export default function AdminPaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState<MethodForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    getPaymentMethods()
      .then(setMethods)
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load payment methods");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (method: PaymentMethod) => {
    setEditing(method);
    setForm({
      name: method.name,
      shortLabel: method.shortLabel,
      isCash: method.isCash,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updatePaymentMethod(editing.id, {
          name: form.name,
          shortLabel: form.shortLabel,
          isCash: form.isCash,
        });
        toast.success("Payment method updated");
      } else {
        await createPaymentMethod({
          name: form.name,
          shortLabel: form.shortLabel,
          isCash: form.isCash,
        });
        toast.success("Payment method created");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (method: PaymentMethod) => {
    try {
      await setPaymentMethodActive(method.id, !method.isActive);
      toast.success(method.isActive ? "Method hidden from POS" : "Method shown in POS");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payment methods</h1>
          <p className="text-muted-foreground">
            Tenders cashiers can collect. Non-cash methods are deducted on the
            cash summary.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add method
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All methods</CardTitle>
          <CardDescription>
            Cash stays in the till. Everything marked not cash is subtracted from
            closing cash.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Till label</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>POS</TableHead>
                    <TableHead className="w-24 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {methods.map((method) => (
                    <TableRow key={method.id}>
                      <TableCell className="font-medium">
                        {method.name}
                        {method.isBuiltIn ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            built-in
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {method.shortLabel || "—"}
                      </TableCell>
                      <TableCell>
                        {method.isCash ? (
                          <Badge>Cash</Badge>
                        ) : (
                          <Badge variant="outline">Non-cash</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {method.isActive ? "Shown" : "Hidden"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(method)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          {method.key !== "cash" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void toggleActive(method)}
                            >
                              {method.isActive ? "Hide" : "Show"}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit payment method" : "Add payment method"}
              </DialogTitle>
              <DialogDescription>
                Non-cash methods (card/swipe, bank transfer, financing, and
                anything you add) are deducted from closing cash.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="method-name">Name</Label>
                <Input
                  id="method-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Card/Swipe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="method-short">Till label</Label>
                <Input
                  id="method-short"
                  value={form.shortLabel}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      shortLabel: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="e.g. SW"
                  maxLength={8}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div>
                  <Label htmlFor="method-cash">Counts as cash</Label>
                  <p className="text-xs text-muted-foreground">
                    Off = deduct this tender from the cash summary
                  </p>
                </div>
                <Switch
                  id="method-cash"
                  checked={form.isCash}
                  disabled={editing?.key === "cash"}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isCash: checked }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
