"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  UserAvatar,
  formatUserRole,
} from "@/components/layout/user-avatar";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranches } from "@/lib/firestore/branches";
import { getAllUsers, updateUserAccess } from "@/lib/firestore/users";
import { syncAuthClaims } from "@/lib/auth-claims";
import { isMasterAdminRole, roleAssignableBy } from "@/lib/roles";
import type { AppUser, Branch, UserRole } from "@/types";

const roleBadgeVariant = (
  role: UserRole
): "default" | "secondary" | "outline" => {
  switch (role) {
    case "master-admin":
      return "default";
    case "admin":
      return "default";
    case "manager":
      return "secondary";
    case "customer":
      return "outline";
  }
};

export default function AdminUsersPage() {
  const {
    isElevatedAdmin,
    isMasterAdmin,
    user: currentUser,
  } = useBranchAccess();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<UserRole>("customer");
  const [branchId, setBranchId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const branchMap = Object.fromEntries(branches.map((b) => [b.id, b]));

  const roleOptions = useMemo(() => {
    const all: UserRole[] = ["customer", "manager", "admin", "master-admin"];
    if (!currentUser) return all.filter((r) => r !== "master-admin");
    return all.filter((r) => roleAssignableBy(currentUser.role, r));
  }, [currentUser]);

  const loadData = () => {
    Promise.all([getAllUsers(), getBranches(true)])
      .then(([u, b]) => {
        setUsers(u);
        setBranches(b);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const visibleUsers = useMemo(() => {
    if (isMasterAdmin) return users;
    return users.filter((u) => !isMasterAdminRole(u.role));
  }, [users, isMasterAdmin]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleUsers;
    return visibleUsers.filter((u) => {
      const haystack = [
        u.displayName,
        u.email,
        u.uid,
        formatUserRole(u.role, u.isAnonymous),
        u.branchId ? branchMap[u.branchId]?.name : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleUsers, search, branchMap]);

  const openEdit = (user: AppUser) => {
    setEditingUser(user);
    setRole(user.role);
    setBranchId(user.branchId ?? "");
  };

  const closeEdit = () => {
    setEditingUser(null);
    setRole("customer");
    setBranchId("");
  };

  const handleSave = async () => {
    if (!editingUser || !currentUser) return;

    if (role === "manager" && !branchId) {
      toast.error("Select a branch for managers");
      return;
    }

    setSubmitting(true);
    try {
      await updateUserAccess(
        editingUser.uid,
        {
          role,
          branchId: role === "manager" ? branchId : null,
        },
        currentUser.uid
      );
      await syncAuthClaims(editingUser.uid).catch(console.error);
      toast.success("User access updated");
      closeEdit();
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isElevatedAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins can manage user roles.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Assign admin and manager roles, and link managers to branches
          </p>
        </div>
        <LinkButton href="/admin/settings/users/invites" variant="outline">
          Manage invites
        </LinkButton>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            {visibleUsers.length} accounts · Managers need a branch assignment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <p className="text-muted-foreground">Loading users...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-muted-foreground">No users found.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.uid}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            displayName={user.displayName}
                            email={user.email}
                            photoURL={user.photoURL}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {user.displayName || "Unnamed user"}
                              {user.uid === currentUser?.uid && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  (you)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {user.email || user.uid}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(user.role)} className="capitalize">
                          {formatUserRole(user.role, user.isAnonymous)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.branchId
                          ? branchMap[user.branchId]?.name ?? "Unknown branch"
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={user.isAnonymous}
                          onClick={() => openEdit(user)}
                        >
                          Manage access
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage user access</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <UserAvatar
                  displayName={editingUser.displayName}
                  email={editingUser.email}
                  photoURL={editingUser.photoURL}
                  size="default"
                />
                <div className="min-w-0">
                  <p className="font-medium">
                    {editingUser.displayName || "Unnamed user"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {editingUser.email}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => {
                    const nextRole = (v ?? "customer") as UserRole;
                    setRole(nextRole);
                    if (nextRole !== "manager") {
                      setBranchId("");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role">
                      {(value) =>
                        value ? formatUserRole(value as UserRole) : null
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {formatUserRole(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {role === "manager" && (
                <div className="space-y-2">
                  <Label>Assigned branch</Label>
                  <Select
                    value={branchId}
                    onValueChange={(v) => setBranchId(v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch">
                        {(value) => {
                          if (!value) return null;
                          const branch = branches.find((b) => b.id === value);
                          return branch
                            ? `${branch.name} (${branch.code})`
                            : null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name} ({branch.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {role === "master-admin" && (
                <p className="text-sm text-muted-foreground">
                  Master admins have full access, including product JSON import.
                </p>
              )}

              {role === "admin" && (
                <p className="text-sm text-muted-foreground">
                  Admins have full catalog and branch access, except product
                  JSON import.
                </p>
              )}

              {role === "customer" && (
                <p className="text-sm text-muted-foreground">
                  Customers have no access to this inventory app.
                </p>
              )}

              <Button
                className="w-full"
                onClick={handleSave}
                disabled={submitting}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
