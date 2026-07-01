"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createDraftProduct } from "@/lib/firestore/products";

export default function NewProductPage() {
  const router = useRouter();
  const creatingRef = useRef(false);

  useEffect(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;

    createDraftProduct()
      .then((id) => router.replace(`/admin/products/${id}`))
      .catch(() => {
        toast.error("Failed to create draft");
        router.replace("/admin/products");
      });
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Creating draft...
    </div>
  );
}
