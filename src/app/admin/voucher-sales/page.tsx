import { redirect } from "next/navigation";

export default function LegacyVoucherSalesRedirect() {
  redirect("/admin/sales/vouchers");
}
