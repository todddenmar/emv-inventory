import {
  FileJson,
  ListChecks,
  Settings2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type SettingsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  masterOnly: boolean;
  underUsers?: boolean;
  description: string;
};

export const settingsNavItems: SettingsNavItem[] = [
  {
    href: "/admin/settings/general",
    label: "General",
    icon: Settings2,
    masterOnly: true,
    description: "App-wide display and catalog preferences",
  },
  {
    href: "/admin/settings/assortment",
    label: "Branch assortment",
    icon: ListChecks,
    masterOnly: false,
    description: "Choose which variants each branch sells",
  },
  {
    href: "/admin/settings/import",
    label: "Product JSON import",
    icon: FileJson,
    masterOnly: true,
    description: "Import products from EMV JSON catalogs",
  },
  {
    href: "/admin/settings/users",
    label: "Users",
    icon: Users,
    masterOnly: true,
    description: "Manage staff roles and branch assignment",
  },
  {
    href: "/admin/settings/users/invites",
    label: "Invites",
    icon: UserPlus,
    masterOnly: true,
    underUsers: true,
    description: "Create manager invite links",
  },
];
