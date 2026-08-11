import { redirect } from "next/navigation";

export default function LegacyResellersRedirect() {
  redirect("/admin/settings/resellers");
}
