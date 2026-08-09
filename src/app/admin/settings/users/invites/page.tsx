"use client";

import { useEffect, useState } from "react";
import { Copy, Mail, Link2, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  createInvite,
  getInvites,
  isInviteValid,
  type InviteRole,
} from "@/lib/firestore/invites";
import { getBranches } from "@/lib/firestore/branches";
import { useAuthStore, useIsElevatedAdmin } from "@/stores/auth-store";
import { formatUserRole } from "@/components/layout/user-avatar";
import { formatDate } from "@/lib/format";
import type { Branch, Invite } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminInvitesPage() {
  const user = useAuthStore((s) => s.user);
  const isElevatedAdmin = useIsElevatedAdmin();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("manager");
  const [branchId, setBranchId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const loadInvites = () => {
    Promise.all([getInvites(), getBranches(true)])
      .then(([i, b]) => {
        setInvites(i);
        setBranches(b);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvites();
  }, []);

  if (!isElevatedAdmin) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Invites</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Only admins can create staff invites.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const resetForm = () => {
    setEmail("");
    setRole("manager");
    setBranchId("");
  };

  const handleCreateInvite = async () => {
    if (!user) return;
    if (role === "manager" && !branchId) {
      toast.error("Select a branch for this manager");
      return;
    }
    const branch = branches.find((b) => b.id === branchId);
    setSubmitting(true);
    try {
      const invite = await createInvite({
        createdBy: user.uid,
        createdByName: user.displayName || user.email || "Admin",
        email: email || null,
        role,
        branchId: role === "manager" ? branchId : null,
        branchName: role === "manager" ? (branch?.name ?? null) : null,
      });
      const link = `${window.location.origin}/invite/${invite.token}`;
      setLastLink(link);
      toast.success("Invite created");
      resetForm();
      loadInvites();

      if (email) {
        const roleLabel = formatUserRole(role);
        const subject = encodeURIComponent(
          `${roleLabel} invite — El Mio Vicente`
        );
        const body = encodeURIComponent(
          `You've been invited to join as ${roleLabel.toLowerCase()}.\n\nAccept your invite here:\n${link}\n\nThis link expires in 7 days.`
        );
        window.open(`mailto:${email}?subject=${subject}&body=${body}`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create invite"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Staff invites</h1>
          <p className="text-muted-foreground">
            Invite managers (branch-scoped) or admins (full access)
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <Link2 className="mr-2 h-4 w-4" />
          Create invite
        </Button>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite staff</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => {
                    const next = (v as InviteRole) ?? "manager";
                    setRole(next);
                    if (next !== "manager") setBranchId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role">
                      {(value) =>
                        value ? formatUserRole(value as InviteRole) : null
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role === "manager" ? (
                <div className="space-y-2">
                  <Label>Branch</Label>
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  Admins get full catalog and multi-branch access (except
                  product JSON import). No branch assignment needed.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="staff@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  If provided, opens your email client with the invite link.
                  The invite can still be shared manually.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={handleCreateInvite}
                disabled={submitting}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {email ? (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Create &amp; email invite
                  </>
                ) : (
                  <>
                    <Link2 className="mr-2 h-4 w-4" />
                    Create invite link
                  </>
                )}
              </Button>
              {lastLink && (
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Latest invite link:
                  </p>
                  <div className="flex gap-2">
                    <Input value={lastLink} readOnly className="text-xs" />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(lastLink);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite history</CardTitle>
          <CardDescription>Links expire after 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : invites.length === 0 ? (
            <p className="text-muted-foreground">No invites yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {formatUserRole(invite.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>{invite.branchName || "—"}</TableCell>
                    <TableCell>{invite.email || "—"}</TableCell>
                    <TableCell>{formatDate(invite.createdAt)}</TableCell>
                    <TableCell>{formatDate(invite.expiresAt)}</TableCell>
                    <TableCell>
                      {invite.usedAt ? (
                        <Badge variant="outline">Used</Badge>
                      ) : isInviteValid(invite) ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="secondary">Expired</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!invite.usedAt && isInviteValid(invite) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyLink(invite.token)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
