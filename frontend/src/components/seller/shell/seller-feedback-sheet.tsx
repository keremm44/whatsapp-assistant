"use client";

import * as React from "react";

import { SellerFeedbackWorkspace } from "@/components/seller/settings/seller-feedback-workspace";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

/**
 * Always-available seller → admin contact surface.
 *
 * Feedback keeps its existing backend contract and workspace behavior; this
 * component only changes discoverability by moving the entry point into the
 * persistent topbar. The full form and seller history live in one drawer so
 * reaching the team never requires navigating away from the current task.
 */
export function SellerFeedbackSheet({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [portalContainer, setPortalContainer] = React.useState<Element | null>(
    null,
  );

  React.useEffect(() => {
    setPortalContainer(document.querySelector(".seller-theme"));
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-control border border-primary/30 bg-primary/5 px-3 text-[13px] font-medium text-foreground transition-colors",
            "hover:border-primary/50 hover:bg-primary/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          )}
          aria-label="Bize ulaş"
        >
          <SellerIcon name="HelpCircle" size={16} className="text-primary" />
          <span>Bize Ulaş</span>
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        portalContainer={portalContainer}
        className="flex w-full flex-col gap-0 bg-overlay p-0 sm:max-w-[520px]"
      >
        <SheetHeader className="mb-0 border-b border-divider px-5 pb-4 pt-6 sm:px-6">
          <SheetTitle>Bize Ulaş</SheetTitle>
          <SheetDescription className="max-w-[34rem] leading-relaxed">
            Bir şey yolunda gitmiyorsa, bir sorun yaşıyorsan ya da bir önerin varsa bize buradan yazabilirsin. Mesajını doğrudan göreceğiz ve seninle iletişime geçeceğiz.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="[&>section>div:first-child]:hidden [&>section]:space-y-5">
            <SellerFeedbackWorkspace />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
