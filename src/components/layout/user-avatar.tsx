"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

function getInitials(
  displayName: string | null | undefined,
  email: string | null | undefined
): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }
  if (email?.trim()) {
    return email[0].toUpperCase();
  }
  return "?";
}

export function formatUserRole(
  role: UserRole,
  isAnonymous?: boolean
): string {
  if (isAnonymous) return "Guest";
  switch (role) {
    case "master-admin":
      return "Master admin";
    case "admin":
      return "Admin";
    case "owner":
      return "Owner";
    case "manager":
      return "Manager";
    case "cashier":
      return "Cashier";
    case "customer":
      return "Customer";
  }
}

interface UserAvatarProps {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  size?: "default" | "sm" | "lg";
  padded?: boolean;
  className?: string;
}

export function UserAvatar({
  displayName = null,
  email = null,
  photoURL = null,
  size = "default",
  padded = true,
  className,
}: UserAvatarProps) {
  const initials = getInitials(displayName, email);

  return (
    <Avatar
      size={size}
      className={cn(
        padded && "box-content p-0.5 ring-1 ring-border/60",
        className
      )}
    >
      {photoURL ? (
        <AvatarImage src={photoURL} alt={displayName || email || "User"} />
      ) : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
