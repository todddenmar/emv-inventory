"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  assignBranchManager,
  createBranch,
  getBranches,
  updateBranch,
} from "@/lib/firestore/branches";
import { assignUserBranch, getManagers } from "@/lib/firestore/users";
import { parseCoordinate } from "@/lib/location";
import type { AppUser, Branch } from "@/types";

export default function AdminBranchesPage() {
  const { isMasterAdmin } = useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    latitude: "",
    longitude: "",
    phone: "",
    managerId: "",
  });

  const loadData = () => {
    Promise.all([getBranches(), getManagers()])
      .then(([b, m]) => {
        setBranches(b);
        setManagers(m);
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
            Only the master-admin can manage branches.
          </p>
        </CardContent>
      </Card>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      code: "",
      address: "",
      latitude: "",
      longitude: "",
      phone: "",
      managerId: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditing(branch);
    setForm({
      name: branch.name,
      code: branch.code,
      address: branch.address,
      latitude: branch.latitude != null ? String(branch.latitude) : "",
      longitude: branch.longitude != null ? String(branch.longitude) : "",
      phone: branch.phone ?? "",
      managerId: branch.managerId ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Name and code are required");
      return;
    }

    setSubmitting(true);
    try {
      const latitude = parseCoordinate(form.latitude);
      const longitude = parseCoordinate(form.longitude);

      if (
        (form.latitude.trim() && latitude == null) ||
        (form.longitude.trim() && longitude == null)
      ) {
        toast.error("Coordinates must be valid numbers");
        setSubmitting(false);
        return;
      }

      if (
        (latitude != null && longitude == null) ||
        (latitude == null && longitude != null)
      ) {
        toast.error("Provide both latitude and longitude, or leave both empty");
        setSubmitting(false);
        return;
      }

      const manager = managers.find((m) => m.uid === form.managerId);
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        address: form.address.trim(),
        latitude,
        longitude,
        phone: form.phone.trim() || null,
        managerId: form.managerId || null,
        managerName: manager?.displayName || manager?.email || null,
        isActive: true,
      };

      let branchId = editing?.id;
      if (editing) {
        await updateBranch(editing.id, payload);
        toast.success("Branch updated");
      } else {
        branchId = await createBranch(payload);
        toast.success("Branch created");
      }

      if (branchId && form.managerId) {
        await assignUserBranch(form.managerId, branchId);
        await assignBranchManager(
          branchId,
          form.managerId,
          manager?.displayName || manager?.email || "Manager"
        );
      }

      setDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save branch");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-muted-foreground">
            Manage store locations and assign managers
          </p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add branch
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit branch" : "Add branch"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branch-name">Branch name</Label>
                <Input
                  id="branch-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Main Store"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-code">Code</Label>
                <Input
                  id="branch-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="MAIN"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">Address</Label>
              <Textarea
                id="branch-address"
                rows={2}
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branch-latitude">Latitude (optional)</Label>
                <Input
                  id="branch-latitude"
                  value={form.latitude}
                  onChange={(e) =>
                    setForm({ ...form, latitude: e.target.value })
                  }
                  placeholder="14.5995"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-longitude">Longitude (optional)</Label>
                <Input
                  id="branch-longitude"
                  value={form.longitude}
                  onChange={(e) =>
                    setForm({ ...form, longitude: e.target.value })
                  }
                  placeholder="120.9842"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-phone">Phone (optional)</Label>
              <Input
                id="branch-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Assign manager</Label>
              <Select
                value={form.managerId || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, managerId: v === "none" ? "" : v ?? "" })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select manager">
                    {(value) => {
                      if (!value || value === "none") return "No manager";
                      const manager = managers.find((m) => m.uid === value);
                      return (
                        manager?.displayName ||
                        manager?.email ||
                        null
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No manager</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.uid} value={m.uid}>
                      {m.displayName || m.email || m.uid}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Update branch" : "Create branch"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? (
        <p className="text-muted-foreground">Loading branches...</p>
      ) : branches.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              No branches yet. Create your first branch to start tracking
              inventory.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branches.map((branch) => (
            <Card key={branch.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{branch.name}</CardTitle>
                    <CardDescription>{branch.code}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant={branch.isActive ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {branch.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{branch.address}</p>
                {branch.phone && <p>{branch.phone}</p>}
                <p>
                  <span className="text-muted-foreground">Manager: </span>
                  {branch.managerName || "Unassigned"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => openEdit(branch)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit branch
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
