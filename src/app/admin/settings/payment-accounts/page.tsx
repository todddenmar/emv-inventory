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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePagination } from "@/components/admin/table-pagination";
import {
  createPaymentAccount,
  getPaymentAccounts,
  paymentAccountTypeLabel,
  setPaymentAccountActive,
  updatePaymentAccount,
} from "@/lib/firestore/payment-accounts";
import { paginateItems } from "@/lib/pagination";
import type { PaymentAccount, PaymentAccountType } from "@/types";

type AccountForm = {
  type: PaymentAccountType;
  provider: string;
  accountName: string;
  accountNumber: string;
};

const emptyForm = (): AccountForm => ({
  type: "ewallet",
  provider: "",
  accountName: "",
  accountNumber: "",
});

export default function AdminPaymentAccountsPage() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PaymentAccountType | "all">(
    "all"
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const load = () => {
    getPaymentAccounts()
      .then(setAccounts)
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load payment accounts");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.provider.toLowerCase().includes(q) ||
        a.accountName.toLowerCase().includes(q) ||
        a.accountNumber.toLowerCase().includes(q)
      );
    });
  }, [accounts, search, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

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

  const openEdit = (account: PaymentAccount) => {
    setEditing(account);
    setForm({
      type: account.type,
      provider: account.provider,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.provider.trim()) {
      toast.error("Provider is required");
      return;
    }
    if (!form.accountName.trim()) {
      toast.error("Account name is required");
      return;
    }
    if (!form.accountNumber.trim()) {
      toast.error("Account number is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: form.type,
        provider: form.provider.trim(),
        accountName: form.accountName.trim(),
        accountNumber: form.accountNumber.trim(),
      };
      if (editing) {
        await updatePaymentAccount(editing.id, payload);
        toast.success("Payment account updated");
      } else {
        await createPaymentAccount(payload);
        toast.success("Payment account created");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (account: PaymentAccount) => {
    try {
      await setPaymentAccountActive(account.id, !account.isActive);
      toast.success(
        account.isActive ? "Account deactivated" : "Account activated"
      );
      load();
    } catch {
      toast.error("Failed to update account");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payment accounts</h1>
          <p className="text-muted-foreground">
            E-wallet accounts used when checkout payment is E-wallet
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add account
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>All accounts</CardTitle>
            <CardDescription>
              Provider, account name, and account number
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) =>
                setTypeFilter((v as PaymentAccountType | "all") ?? "all")
              }
            >
              <SelectTrigger className="sm:w-40">
                <SelectValue>
                  {(value) =>
                    value === "ewallet"
                      ? "E-wallet"
                      : value === "bank_transfer"
                        ? "Bank transfer"
                        : "All types"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="ewallet">E-wallet</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">No payment accounts found.</p>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Account name</TableHead>
                    <TableHead>Account number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        {paymentAccountTypeLabel(account.type)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {account.provider}
                      </TableCell>
                      <TableCell>{account.accountName}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {account.accountNumber}
                      </TableCell>
                      <TableCell>
                        {account.isActive ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(account)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(account)}
                          >
                            {account.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit payment account" : "Add payment account"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    type: (v as PaymentAccountType) ?? "ewallet",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value) =>
                      value === "bank_transfer"
                        ? "Bank transfer"
                        : "E-wallet"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ewallet">E-wallet</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pa-provider">Provider</Label>
              <Input
                id="pa-provider"
                value={form.provider}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, provider: e.target.value }))
                }
                placeholder={
                  form.type === "ewallet" ? "e.g. GCash, Maya" : "e.g. BDO, BPI"
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pa-account-name">Account name</Label>
              <Input
                id="pa-account-name"
                value={form.accountName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, accountName: e.target.value }))
                }
                placeholder="Registered name on the account"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pa-account-number">Account number</Label>
              <Input
                id="pa-account-number"
                value={form.accountNumber}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    accountNumber: e.target.value,
                  }))
                }
                placeholder="Mobile number or bank account number"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editing ? "Save changes" : "Create account"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
