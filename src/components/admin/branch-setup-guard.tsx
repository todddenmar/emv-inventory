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
  const { isManager, hasBranchAssignment } = useBranchAccess();

  if (isManager && !hasBranchAssignment) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Branch not assigned</CardTitle>
            <CardDescription>
              Your manager account does not have a branch yet. Ask the
              master-admin to assign you to a branch or send you a new invite
              linked to a branch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You will only see inventory for your assigned branch
              once setup is complete.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
