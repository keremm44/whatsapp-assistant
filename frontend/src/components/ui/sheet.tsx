"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Sheet — contextual drawer.
 *
 * Supports three sides: right (default), left, and bottom. The right
 * side is the canonical contextual drawer used in the seller panel for
 * conversation/return/request details. The left side is used for the
 * tablet navigation menu. The bottom side is used by the mobile bottom
 * navigation "more" menus.
 */

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Fixed dark scrim in BOTH themes (same principle as
      // DialogOverlay): theme-relative foreground is near-white under
      // the dark seller theme and washed the background pale gray
      // instead of letting it recede.
      "fixed inset-0 z-20 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-fade-in",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

type SheetSide = "right" | "left" | "bottom";

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: SheetSide;
  /**
   * Optional Portal container. By default the Sheet portals to
   * `document.body`, which ESCAPES the `.seller-theme` scoping class
   * and would render seller-surface sheets with the light root
   * palette. Callers inside the seller workspace pass a host element
   * that lives within the seller subtree so the drawer inherits the
   * dark-workshop tokens. Omitting this prop preserves the previous
   * body-portal behavior exactly.
   */
  portalContainer?: Element | DocumentFragment | null;
}

const sideStyles: Record<SheetSide, string> = {
  right:
    "inset-y-0 right-0 h-full w-full max-w-md border-l border-boundary data-[state=open]:animate-slide-in-right",
  left:
    "inset-y-0 left-0 h-full w-full max-w-md border-r border-boundary data-[state=open]:animate-slide-in-left",
  bottom:
    "inset-x-0 bottom-0 w-full max-h-[85vh] border-t border-boundary rounded-t-floating data-[state=open]:animate-slide-in-bottom",
};

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = "right", portalContainer, ...props }, ref) => (
  <SheetPortal container={portalContainer ?? undefined}>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Floating material + real elevation: a Sheet genuinely lifts
        // off the work sheet, unlike ordinary paper regions.
        "fixed z-30 bg-overlay p-6 shadow-2 focus-visible:outline-none",
        sideStyles[side],
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        // The X stays visually ~20px; the CONTROL gets a real touch
        // target: 44px on mobile, compact 36px from sm up.
        className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:right-3 sm:top-3 sm:h-9 sm:w-9"
        aria-label="Kapat"
      >
        <X className="h-5 w-5" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mb-4 flex flex-col gap-1 text-left", className)}
    {...props}
  />
);

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("pr-8 font-heading text-[18px] font-semibold leading-6 text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  type SheetSide,
};
