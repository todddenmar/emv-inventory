"use client";

import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar, formatUserRole } from "@/components/layout/user-avatar";
import { useAuthStore } from "@/stores/auth-store";
import { signOutUser } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  compact?: boolean;
  showAdminLink?: boolean;
  className?: string;
}

export function UserMenu({
  compact = false,
  showAdminLink = true,
  className,
}: UserMenuProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const handleSignOut = async () => {
    try {
      await signOutUser();
      useAuthStore.getState().setUser(null);
      toast.success("Signed out");
      router.replace("/login");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  if (!user) return null;

  const roleLabel = formatUserRole(user.role, user.isAnonymous);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={compact ? "icon" : "sm"}
            className={cn(
              compact ? "size-9 shrink-0 p-1" : "h-auto gap-2.5 py-1.5 pl-1.5 pr-3",
              className
            )}
          >
            <UserAvatar
              displayName={user.displayName}
              email={user.email}
              photoURL={user.photoURL}
              size="sm"
            />
            {!compact && (
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-medium leading-tight">
                  {user.displayName || "Account"}
                </p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {roleLabel}
                </p>
              </div>
            )}
            {compact && <span className="sr-only">Account menu</span>}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem disabled className="flex items-start gap-3 px-3 py-3 opacity-100">
          <UserAvatar
            displayName={user.displayName}
            email={user.email}
            photoURL={user.photoURL}
            size="default"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate font-medium leading-tight">
              {user.displayName || "Account"}
            </p>
            <p className="text-xs capitalize text-muted-foreground">{roleLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email || "No email on file"}
            </p>
          </div>
        </DropdownMenuItem>
        {showAdminLink &&
          (user.role === "master-admin" || user.role === "manager") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/admin")}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Admin dashboard
              </DropdownMenuItem>
            </>
          )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
