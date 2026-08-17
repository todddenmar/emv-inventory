import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { BranchSetupGuard } from "@/components/admin/branch-setup-guard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <BranchSetupGuard>
        <AdminShell>{children}</AdminShell>
      </BranchSetupGuard>
    </AdminGuard>
  );
}
