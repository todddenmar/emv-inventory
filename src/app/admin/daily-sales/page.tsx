import { redirect } from "next/navigation";

export default function DailySalesRedirectPage() {
  redirect("/admin/reports/daily-sales");
}
