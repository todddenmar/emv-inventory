import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { BranchSetupGuard } from "@/components/admin/branch-setup-guard";
import { AdminHeader } from "@/components/layout/admin-header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <BranchSetupGuard>
        <div className="flex min-h-screen w-full flex-col">
          <AdminHeader />
          <div className="flex w-full flex-1 flex-col md:flex-row">
            <AdminSidebar />
            <div className="w-full flex-1 overflow-auto p-4 md:p-6">
              {children}
            </div>
          </div>
        </div>
      </BranchSetupGuard>
    </AdminGuard>
  );
}
