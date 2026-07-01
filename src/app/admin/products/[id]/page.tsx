"use client";

import { use } from "react";
import { ProductFormPage } from "@/components/admin/product-form-page";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ProductFormPage productId={id} />;
}
