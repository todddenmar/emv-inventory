"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TablePagination } from "@/components/admin/table-pagination";
import { formatUserRole } from "@/components/layout/user-avatar";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  archiveBranch,
  assignBranchManager,
  createBranch,
  getBranches,
  restoreBranch,
  updateBranch,
} from "@/lib/firestore/branches";
import {
  assignUserBranch,
  getManagers,
  getStaffUsers,
} from "@/lib/firestore/users";
import { parseCoordinate } from "@/lib/location";
import { paginateItems } from "@/lib/pagination";
import type { AppUser, Branch } from "@/types";

type BranchTab = "active" | "archived";

export default function AdminBranchesPage() {
  const { isElevatedAdmin } = useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<AppUser[]>([]);
  const [staffUsers, setStaffUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<BranchTab>("active");
  const [page, setPage] = useState(1);
  const [archiveTarget, setArchiveTarget] = useState<Branch | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Branch | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    latitude: "",
    longitude: "",
    phone: "",
    managerId: "",
    supportsWholesale: false,
  });

  const loadData = () => {
    Promise.all([getBranches(), getManagers(), getStaffUsers()])
      .then(([b, m, staff]) => {
        setBranches(b);
        setManagers(m);
        setStaffUsers(staff);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const usersByBranchId = useMemo(() => {
    const map = new Map<string, AppUser[]>();
    for (const user of staffUsers) {
      if (!user.branchId) continue;
      const list = map.get(user.branchId) ?? [];
      list.push(user);
      map.set(user.branchId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const roleOrder = (role: string) => {
          if (role === "admin" || role === "master-admin") return 0;
          if (role === "staff") return 1;
          if (role === "cashier") return 2;
          return 3;
        };
        const byRole = roleOrder(a.role) - roleOrder(b.role);
        if (byRole !== 0) return byRole;
        const nameA = (a.displayName || a.email || a.uid).toLowerCase();
        const nameB = (b.displayName || b.email || b.uid).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }
    return map;
  }, [staffUsers]);

  useEffect(() => {
    loadData();
  }, []);

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.isActive),
    [branches]
  );
  const archivedBranches = useMemo(
    () => branches.filter((branch) => !branch.isActive),
    [branches]
  );
  const visibleBranches =
    tab === "active" ? activeBranches : archivedBranches;

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(visibleBranches, page),
    [visibleBranches, page]
  );

  if (!isElevatedAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins can manage branches.
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
      supportsWholesale: false,
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
      supportsWholesale: branch.supportsWholesale === true,
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
        isActive: editing?.isActive ?? true,
        supportsWholesale: form.supportsWholesale,
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

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setStatusBusy(true);
    try {
      await archiveBranch(archiveTarget.id);
      toast.success(`Archived ${archiveTarget.name}`);
      setArchiveTarget(null);
      loadData();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to archive branch"
      );
    } finally {
      setStatusBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setStatusBusy(true);
    try {
      await restoreBranch(restoreTarget.id);
      toast.success(`Restored ${restoreTarget.name}`);
      setRestoreTarget(null);
      loadData();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to restore branch"
      );
    } finally {
      setStatusBusy(false);
    }
  };

  const renderBranchCards = (rows: Branch[]) => {
    if (rows.length === 0) {
      return (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              {tab === "active"
                ? "No active branches yet. Create your first branch to start tracking inventory."
                : "No archived branches."}
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((branch) => {
            const assigned = usersByBranchId.get(branch.id) ?? [];
            return (
              <Card key={branch.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CardTitle className="text-base leading-tight">
                          {branch.name}
                        </CardTitle>
                        {!branch.isActive ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Archived
                          </Badge>
                        ) : null}
                        {branch.supportsWholesale ? (
                          <Badge variant="outline" className="text-[10px]">
                            Wholesale
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription className="font-mono text-xs tracking-wide">
                        {branch.code}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="shrink-0"
                            aria-label={`${branch.name} actions`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(branch)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {branch.isActive ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setArchiveTarget(branch)}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => setRestoreTarget(branch)}
                          >
                            <ArchiveRestore className="mr-2 h-4 w-4" />
                            Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-1">
                    {branch.address ? (
                      <p className="text-muted-foreground">{branch.address}</p>
                    ) : (
                      <p className="text-muted-foreground">No address set</p>
                    )}
                    {branch.phone ? (
                      <p className="text-muted-foreground">{branch.phone}</p>
                    ) : null}
                    {branch.managerName ? (
                      <p>
                        <span className="text-muted-foreground">Manager: </span>
                        {branch.managerName}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      Assigned users
                      <span className="tabular-nums">({assigned.length})</span>
                    </div>
                    {assigned.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No staff or cashiers assigned to this branch.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {assigned.map((user) => (
                          <li
                            key={user.uid}
                            className="flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium leading-snug">
                                {user.displayName || user.email || user.uid}
                              </p>
                              {user.displayName && user.email ? (
                                <p className="truncate text-xs text-muted-foreground">
                                  {user.email}
                                </p>
                              ) : null}
                            </div>
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px] capitalize"
                            >
                              {formatUserRole(user.role, user.isAnonymous)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <TablePagination
          page={safePage}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-muted-foreground">
            Manage store locations and assign managers. Archived branches stay
            out of selection fields until restored.
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
            <label className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                checked={form.supportsWholesale}
                onCheckedChange={(checked) =>
                  setForm({
                    ...form,
                    supportsWholesale: checked === true,
                  })
                }
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium leading-none">
                  Supports wholesale
                </span>
                <span className="block text-xs text-muted-foreground">
                  Enable wholesale POS for this branch. Typically only one
                  branch should have this on.
                </span>
              </span>
            </label>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Update branch" : "Create branch"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={archiveTarget != null}
        onOpenChange={(open) => {
          if (!open && !statusBusy) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this branch?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? `${archiveTarget.name} will be hidden from branch selection fields. You can restore it later from the Archived tab.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusBusy}
              onClick={(e) => {
                e.preventDefault();
                void handleArchive();
              }}
            >
              {statusBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={restoreTarget != null}
        onOpenChange={(open) => {
          if (!open && !statusBusy) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this branch?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget
                ? `${restoreTarget.name} will show again in branch selection fields.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusBusy}
              onClick={(e) => {
                e.preventDefault();
                void handleRestore();
              }}
            >
              {statusBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading ? (
        <p className="text-muted-foreground">Loading branches...</p>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value === "archived" ? "archived" : "active");
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="active" className="px-3">
              Active ({activeBranches.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="px-3">
              Archived ({archivedBranches.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            {renderBranchCards(pagedItems)}
          </TabsContent>
          <TabsContent value="archived" className="mt-4">
            {renderBranchCards(pagedItems)}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
