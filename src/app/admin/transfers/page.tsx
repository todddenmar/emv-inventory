import { redirect } from "next/navigation";

export default function AdminTransfersRedirectPage() {
  redirect("/admin/inventory/transfers");
}
