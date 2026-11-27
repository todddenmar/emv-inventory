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
  buildTransferDeliveryReceiptHtml,
  printTransferDeliveryReceipt,
  type TransferReceiptDestination,
} from "@/lib/delivery-receipt";
import type { BranchTransfer, DeliveryReceiptCompany } from "@/types";

export function TransferDeliveryReceiptDialog({
  transfer,
  company,
  destination,
  open,
  onOpenChange,
}: {
  transfer: BranchTransfer | null;
  company?: DeliveryReceiptCompany | null;
  destination?: TransferReceiptDestination | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const html = transfer
    ? buildTransferDeliveryReceiptHtml(transfer, company, destination)
    : "";

  const handlePrint = () => {
    if (!transfer) return;
    void printTransferDeliveryReceipt(transfer, company, destination).catch(
      (error) => {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Printing is not available in this browser"
        );
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Delivery receipt</DialogTitle>
          <DialogDescription>
            Sending branch company header, with the destination branch as Bill
            To
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4">
          {transfer ? (
            <iframe
              title="Transfer delivery receipt preview"
              className="h-[min(70vh,40rem)] w-full rounded-md border bg-white"
              srcDoc={html}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No transfer selected.
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
          <Button type="button" disabled={!transfer} onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
