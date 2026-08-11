import { redirect } from "next/navigation";

export default function LegacyVouchersRedirect() {
  redirect("/admin/settings/vouchers");
}
