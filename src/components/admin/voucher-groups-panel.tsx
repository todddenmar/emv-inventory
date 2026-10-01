"use client";

import { useMemo, useState } from "react";
import { FolderPlus, Loader2, MoreHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { VoucherGenerateDialog } from "@/components/admin/voucher-generate-dialog";
import {
  createVoucherGroup,
  deleteVoucherGroup,
  emptyVoucherGroupStats,
  updateVoucherGroup,
  voucherStatsByGroup,
  type VoucherGroupStats,
} from "@/lib/firestore/voucher-groups";
import { useAuthStore } from "@/stores/auth-store";
import type { Voucher, VoucherGroup } from "@/types";

export function VoucherGroupsPanel({
  groups,
  vouchers,
  loading,
  onChanged,
  onViewGroup,
}: {
  groups: VoucherGroup[];
  vouchers: Voucher[];
  loading: boolean;
  onChanged: () => void;
  /** groupId, or "none" for ungrouped vouchers. */
  onViewGroup: (groupId: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VoucherGroup | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<VoucherGroup | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateGroupId, setGenerateGroupId] = useState<string | null>(null);

  const openGenerate = (groupId: string | null) => {
    setGenerateGroupId(groupId);
    setGenerateOpen(true);
  };

  const stats = useMemo(() => voucherStatsByGroup(vouchers), [vouchers]);
  const ungrouped = stats.get("") ?? emptyVoucherGroupStats();

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setFormOpen(true);
  };

  const openEdit = (group: VoucherGroup) => {
    setEditing(group);
    setName(group.name);
    setDescription(group.description);
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      toast.error("Enter a group name");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateVoucherGroup(editing.id, { name, description });
        toast.success("Group updated");
      } else {
        await createVoucherGroup({
          name,
          description,
          createdBy: user.uid,
          createdByName: user.displayName ?? user.email,
        });
        toast.success(`Created ${name.trim()}`);
      }
      setFormOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save group");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteVoucherGroup(deleting.id);
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete group");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Group voucher batches and track how many are still available.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => openGenerate(groups[0]?.id ?? null)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate vouchers
          </Button>
          <Button variant="outline" onClick={openCreate}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New group
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No groups yet. Create one, then select vouchers in the Vouchers tab
            and assign them.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              title={group.name}
              description={group.description}
              stats={stats.get(group.id) ?? emptyVoucherGroupStats()}
              onView={() => onViewGroup(group.id)}
              onGenerate={() => openGenerate(group.id)}
              onEdit={() => openEdit(group)}
              onDelete={() => setDeleting(group)}
            />
          ))}
          {ungrouped.total > 0 ? (
            <GroupCard
              title="No group"
              description="Vouchers not assigned to any group"
              stats={ungrouped}
              muted
              onView={() => onViewGroup("none")}
            />
          ) : null}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit group" : "New voucher group"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="voucher-group-name">Name</Label>
              <Input
                id="voucher-group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. October giveaway batch"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voucher-group-description">
                Description (optional)
              </Label>
              <Textarea
                id="voucher-group-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Create group"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <VoucherGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        groups={groups}
        defaultGroupId={generateGroupId}
        onGenerated={onChanged}
      />

      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The vouchers in this group are kept; they just won&apos;t belong to
              a group anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GroupCard({
  title,
  description,
  stats,
  muted,
  onView,
  onGenerate,
  onEdit,
  onDelete,
}: {
  title: string;
  description: string;
  stats: VoucherGroupStats;
  muted?: boolean;
  onView: () => void;
  onGenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const notAvailable = stats.total - stats.available;
  const availablePct =
    stats.total > 0 ? Math.round((stats.available / stats.total) * 100) : 0;
  const breakdown = [
    stats.used ? `${stats.used} used` : null,
    stats.expired ? `${stats.expired} expired` : null,
    stats.void ? `${stats.void} void` : null,
  ].filter(Boolean);

  return (
    <Card className={muted ? "border-dashed" : undefined}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="break-words text-base">{title}</CardTitle>
          {description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {onEdit || onDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" size="icon-sm" variant="ghost">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Group actions</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {onEdit ? (
                <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/60 p-2">
            <p className="text-lg font-semibold tabular-nums">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg bg-emerald-500/10 p-2">
            <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {stats.available}
            </p>
            <p className="text-[11px] text-muted-foreground">Available</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-2">
            <p className="text-lg font-semibold tabular-nums">{notAvailable}</p>
            <p className="text-[11px] text-muted-foreground">Not available</p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${availablePct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.total === 0
              ? "No vouchers assigned yet"
              : `${availablePct}% available${
                  breakdown.length ? ` · ${breakdown.join(" · ")}` : ""
                }`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onView}
          >
            View vouchers
          </Button>
          {onGenerate ? (
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={onGenerate}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Generate
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
