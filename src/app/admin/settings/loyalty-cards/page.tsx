"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MoreHorizontal, Plus, Search } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  createLoyaltyCard,
  getLoyaltyCards,
  setLoyaltyCardActive,
  updateLoyaltyCard,
} from "@/lib/firestore/loyalty-cards";
import { formatDateInputLabel } from "@/lib/dates";
import { paginateItems } from "@/lib/pagination";
import type { LoyaltyCard } from "@/types";

type LoyaltyCardForm = {
  name: string;
  birthDate: string;
  address: string;
  contact: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  familyInfo: string;
  email: string;
};

const emptyForm = (): LoyaltyCardForm => ({
  name: "",
  birthDate: "",
  address: "",
  contact: "",
  emergencyContactName: "",
  emergencyContactNumber: "",
  familyInfo: "",
  email: "",
});

function formatBirthDate(value: string | null): string {
  if (!value) return "—";
  try {
    return formatDateInputLabel(value);
  } catch {
    return value;
  }
}

export default function AdminLoyaltyCardsPage() {
  const { isElevatedAdmin } = useBranchAccess();
  const [cards, setCards] = useState<LoyaltyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyCard | null>(null);
  const [form, setForm] = useState<LoyaltyCardForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const load = () => {
    getLoyaltyCards()
      .then(setCards)
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load loyalty cards");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (card) =>
        card.name.toLowerCase().includes(q) ||
        (card.email?.toLowerCase().includes(q) ?? false) ||
        (card.contact?.toLowerCase().includes(q) ?? false) ||
        (card.address?.toLowerCase().includes(q) ?? false) ||
        (card.emergencyContactName?.toLowerCase().includes(q) ?? false) ||
        (card.emergencyContactNumber?.toLowerCase().includes(q) ?? false) ||
        (card.familyInfo?.toLowerCase().includes(q) ?? false)
    );
  }, [cards, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(filtered, page), [filtered, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (card: LoyaltyCard) => {
    setEditing(card);
    setForm({
      name: card.name,
      birthDate: card.birthDate ?? "",
      address: card.address ?? "",
      contact: card.contact ?? "",
      emergencyContactName: card.emergencyContactName ?? "",
      emergencyContactNumber: card.emergencyContactNumber ?? "",
      familyInfo: card.familyInfo ?? "",
      email: card.email ?? "",
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
        birthDate: form.birthDate.trim() || null,
        address: form.address.trim() || null,
        contact: form.contact.trim() || null,
        emergencyContactName: form.emergencyContactName.trim() || null,
        emergencyContactNumber: form.emergencyContactNumber.trim() || null,
        familyInfo: form.familyInfo.trim() || null,
        email: form.email.trim() || null,
      };
      if (editing) {
        await updateLoyaltyCard(editing.id, payload);
        toast.success("Loyalty card updated");
      } else {
        await createLoyaltyCard(payload);
        toast.success("Loyalty card created");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (card: LoyaltyCard) => {
    try {
      await setLoyaltyCardActive(card.id, !card.isActive);
      toast.success(card.isActive ? "Card deactivated" : "Card activated");
      load();
    } catch {
      toast.error("Failed to update loyalty card");
    }
  };

  if (!isElevatedAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins can manage loyalty cards.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Loyalty cards</h1>
          <p className="text-muted-foreground">
            Customer membership profiles for loyalty cards
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add loyalty card
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>All loyalty cards</CardTitle>
            <CardDescription>
              Ordered by name (Z–A). Search name, contact, email, or address.
            </CardDescription>
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
            <p className="text-muted-foreground">No loyalty cards found.</p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Birth date</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Emergency contact</TableHead>
                      <TableHead>Family info</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((card) => (
                      <TableRow key={card.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {card.name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatBirthDate(card.birthDate)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {card.contact || "—"}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate">
                          {card.email || "—"}
                        </TableCell>
                        <TableCell className="max-w-[12rem]">
                          <span className="line-clamp-2 text-sm">
                            {card.address || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[12rem]">
                          {card.emergencyContactName ||
                          card.emergencyContactNumber ? (
                            <div className="text-sm">
                              <p className="font-medium">
                                {card.emergencyContactName || "—"}
                              </p>
                              <p className="text-muted-foreground">
                                {card.emergencyContactNumber || "—"}
                              </p>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="max-w-[12rem]">
                          <span className="line-clamp-2 text-sm">
                            {card.familyInfo || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {card.isActive ? (
                            <Badge>Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(card)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => toggleActive(card)}
                              >
                                {card.isActive ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                page={safePage}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit loyalty card" : "Add loyalty card"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="loyalty-name">Name</Label>
              <Input
                id="loyalty-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loyalty-birth-date">Birth date</Label>
              <Input
                id="loyalty-birth-date"
                type="date"
                value={form.birthDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, birthDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loyalty-email">Email address</Label>
              <Input
                id="loyalty-email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loyalty-contact">Contact</Label>
              <Input
                id="loyalty-contact"
                value={form.contact}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contact: e.target.value }))
                }
                placeholder="Mobile or phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loyalty-address">Address</Label>
              <Textarea
                id="loyalty-address"
                value={form.address}
                rows={2}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="loyalty-emergency-name">
                  Emergency contact name
                </Label>
                <Input
                  id="loyalty-emergency-name"
                  value={form.emergencyContactName}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      emergencyContactName: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loyalty-emergency-number">
                  Emergency contact number
                </Label>
                <Input
                  id="loyalty-emergency-number"
                  value={form.emergencyContactNumber}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      emergencyContactNumber: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loyalty-family">Basic family info</Label>
              <Textarea
                id="loyalty-family"
                value={form.familyInfo}
                rows={3}
                placeholder="Spouse, children, household notes…"
                onChange={(e) =>
                  setForm((f) => ({ ...f, familyInfo: e.target.value }))
                }
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editing ? "Save changes" : "Create loyalty card"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
