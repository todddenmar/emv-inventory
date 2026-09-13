"use client";

import { CustomerTypeSalesPage } from "@/components/admin/customer-type-sales-page";

export default function AdminDeliverySalesPage() {
  return (
    <CustomerTypeSalesPage
      customerType="delivery"
      title="Delivery sales"
      description="Sales marked as delivery, newest first"
    />
  );
}
