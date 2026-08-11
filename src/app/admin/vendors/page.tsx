import { redirect } from "next/navigation";

export default function LegacyVendorsRedirect() {
  redirect("/admin/settings/vendors");
}
