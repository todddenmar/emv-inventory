"use client";

import { CustomerTypeSalesPage } from "@/components/admin/customer-type-sales-page";

export default function AdminWalkInSalesPage() {
  return (
    <CustomerTypeSalesPage
      customerType="walk_in"
      title="Walk-in sales"
      description="Shop and wholesale walk-in receipts, newest first"
    />
  );
}
