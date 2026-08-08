import { redirect } from "next/navigation";

export default function ProductImportRedirectPage() {
  redirect("/admin/settings/import");
}
