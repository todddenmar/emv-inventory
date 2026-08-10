"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  createReseller,
  getResellers,
  setResellerActive,
  updateReseller,
} from "@/lib/firestore/resellers";
import type { Reseller } from "@/types";

type ResellerForm = {
  name: string;
  mobile: string;
  email: string;
  address: string;
  notes: string;
};

const emptyForm = (): ResellerForm => ({
  name: "",
  mobile: "",
  email: "",
  address: "",
  notes: "",
});

export default function AdminResellersPage() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Reseller | null>(null);
  const [form, setForm] = useState<ResellerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    getResellers()
      .then(setResellers)
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load resellers");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resellers;
    return resellers.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.mobile?.toLowerCase().includes(q) ?? false) ||
        (r.email?.toLowerCase().includes(q) ?? false)
    );
  }, [resellers, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (reseller: Reseller) => {
    setEditing(reseller);
    setForm({
      name: reseller.name,
      mobile: reseller.mobile ?? "",
      email: reseller.email ?? "",
      address: reseller.address ?? "",
      notes: reseller.notes ?? "",
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
      const payload = {
        name: form.name.trim(),
        mobile: form.mobile.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await updateReseller(editing.id, payload);
        toast.success("Reseller updated");
      } else {
        await createReseller(payload);
        toast.success("Reseller created");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (reseller: Reseller) => {
    try {
      await setResellerActive(reseller.id, !reseller.isActive);
      toast.success(reseller.isActive ? "Reseller deactivated" : "Reseller activated");
      load();
    } catch {
      toast.error("Failed to update reseller");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resellers</h1>
          <p className="text-muted-foreground">
            Saved accounts for prepaid vouchers and POS checkout
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add reseller
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>All resellers</CardTitle>
            <CardDescription>Search by name, mobile, or email</CardDescription>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">No resellers found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((reseller) => (
                  <TableRow key={reseller.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{reseller.name}</p>
                        {reseller.address ? (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {reseller.address}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{reseller.mobile || "—"}</TableCell>
                    <TableCell>{reseller.email || "—"}</TableCell>
                    <TableCell>
                      {reseller.isActive ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(reseller)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(reseller)}
                      >
                        {reseller.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit reseller" : "Add reseller"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="reseller-name">Name</Label>
              <Input
                id="reseller-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reseller-mobile">Mobile</Label>
              <Input
                id="reseller-mobile"
                value={form.mobile}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mobile: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reseller-email">Email</Label>
              <Input
                id="reseller-email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reseller-address">Address</Label>
              <Textarea
                id="reseller-address"
                value={form.address}
                rows={2}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reseller-notes">Notes</Label>
              <Textarea
                id="reseller-notes"
                value={form.notes}
                rows={2}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editing ? "Save changes" : "Create reseller"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
