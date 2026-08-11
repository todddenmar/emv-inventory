import { redirect } from "next/navigation";

export default function LegacyCategoryGroupsRedirect() {
  redirect("/admin/settings/category-groups");
}
