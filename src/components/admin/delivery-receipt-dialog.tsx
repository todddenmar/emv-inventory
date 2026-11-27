"use client";

import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildDeliveryReceiptHtml,
  printDeliveryReceipt,
} from "@/lib/delivery-receipt";
import type { DeliveryReceiptCompany, PosSale } from "@/types";

export function DeliveryReceiptDialog({
  sale,
  company,
  open,
  onOpenChange,
}: {
  sale: PosSale | null;
  company?: DeliveryReceiptCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const html = sale ? buildDeliveryReceiptHtml(sale, company) : "";

  const handlePrint = () => {
    if (!sale) return;
    void printDeliveryReceipt(sale, company).catch((error) => {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Printing is not available in this browser"
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Delivery receipt</DialogTitle>
          <DialogDescription>
            Company header for this sale’s branch, plus customer and items
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4">
          {sale ? (
            <iframe
              title="Delivery receipt preview"
              className="h-[min(70vh,40rem)] w-full rounded-md border bg-white"
              srcDoc={html}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No sale selected.
            </p>
          )}
        </div>
        <DialogFooter className="px-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button type="button" disabled={!sale} onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
