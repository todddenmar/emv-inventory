"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type FreebieShortfall = {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sourceCategoryIds: string[];
  needed: number;
  available: number;
};

interface FreebieShortfallDialogProps {
  open: boolean;
  shortfall: FreebieShortfall | null;
  onContinueWithout: () => void;
  onChooseAnother: () => void;
}

export function FreebieShortfallDialog({
  open,
  shortfall,
  onContinueWithout,
  onChooseAnother,
}: FreebieShortfallDialogProps) {
  const label = shortfall
    ? shortfall.variantLabel
      ? `${shortfall.productName} — ${shortfall.variantLabel}`
      : shortfall.productName
    : "";

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Freebie unavailable</DialogTitle>
          <DialogDescription>
            {shortfall ? (
              <>
                Need {shortfall.needed}× {label}, but only {shortfall.available}{" "}
                in stock at this branch. Continue without this freebie, or pick
                another variant?
              </>
            ) : (
              "A freebie could not be added."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" className="w-full" onClick={onChooseAnother}>
            Choose another variant
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onContinueWithout}
          >
            Continue without freebie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
