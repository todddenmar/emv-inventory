"use client";

import { CustomerTypeSalesPage } from "@/components/admin/customer-type-sales-page";

export default function AdminReservationSalesPage() {
  return (
    <CustomerTypeSalesPage
      customerType="reservation"
      title="Reservation sales"
      description="Sales marked as reservation, newest first"
    />
  );
}
