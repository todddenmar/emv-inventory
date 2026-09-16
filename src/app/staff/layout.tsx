import { StaffGuard } from "@/components/staff/staff-guard";
import { StaffShell } from "@/components/staff/staff-shell";
import { BranchSetupGuard } from "@/components/admin/branch-setup-guard";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StaffGuard>
      <BranchSetupGuard>
        <StaffShell>{children}</StaffShell>
      </BranchSetupGuard>
    </StaffGuard>
  );
}
