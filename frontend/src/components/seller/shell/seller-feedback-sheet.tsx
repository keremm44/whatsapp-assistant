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
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-control border border-boundary bg-raised px-3 text-[13px] font-medium text-foreground transition-colors",
            "hover:border-chrome-foreground/25 hover:bg-elevated",
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
        className="flex w-full flex-col gap-0 bg-raised p-0 sm:max-w-[520px]"
      >
        <SheetHeader className="mb-0 border-b border-divider px-5 pb-5 pt-6 sm:px-6 sm:pt-7">
          <SheetTitle className="font-heading text-[22px] font-semibold leading-7 tracking-[-0.02em] text-foreground">
            Bize Ulaş
          </SheetTitle>
          <SheetDescription className="mt-1 max-w-[31rem] text-[14px] leading-6 text-muted-foreground">
            Bir şey yolunda gitmiyorsa, bir sorun yaşıyorsan ya da bir önerin varsa bize buradan yazabilirsin. Mesajını doğrudan göreceğiz ve seninle iletişime geçeceğiz.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <div
            className={cn(
              "[&>section>div:first-child]:hidden [&>section]:space-y-7",
              "[&>section>form]:space-y-5 [&>section>form]:rounded-none [&>section>form]:border-0 [&>section>form]:bg-transparent [&>section>form]:p-0",
              "[&_form_label]:text-[13px] [&_form_label]:font-semibold [&_form_label]:leading-5",
              "[&_form_select]:border-boundary [&_form_select]:bg-sunken",
              "[&_form_input]:border-boundary [&_form_input]:bg-sunken",
              "[&_form_textarea]:border-boundary [&_form_textarea]:bg-sunken",
              "[&_h3]:font-heading [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:leading-6",
            )}
          >
            <SellerFeedbackWorkspace />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
