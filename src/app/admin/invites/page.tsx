import { redirect } from "next/navigation";

export default function InvitesRedirectPage() {
  redirect("/admin/settings/users/invites");
}
