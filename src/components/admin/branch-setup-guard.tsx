"use client";

import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function BranchSetupGuard({ children }: { children: React.ReactNode }) {
  const { isBranchStaff, hasBranchAssignment, isCashier } = useBranchAccess();

  if (isBranchStaff && !hasBranchAssignment) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Branch not assigned</CardTitle>
            <CardDescription>
              Your {isCashier ? "cashier" : "manager"} account does not have a
              branch yet. Ask an admin to assign you to a branch or send you a
              new invite linked to a branch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You will only see your branch once setup is complete.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
