"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Dialog — centered modal. Used sparingly; the panel prefers sheets
 * (right-side drawers) and inline forms over modal interruptions.
 */

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Dark translucent backdrop in BOTH themes. `bg-foreground/40`
      // was theme-relative: under the dark seller theme the foreground
      // token is near-white, which washed the whole app in light gray
      // instead of letting the background recede. A fixed ~60% black
      // scrim keeps the page faintly perceptible while the dialog
      // clearly owns the focus, and matches the conventional dark
      // overlay in the light admin theme as well.
      "fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-fade-in",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /**
     * Optional Portal container. By default the Dialog portals to
     * `document.body`, which ESCAPES the `.seller-theme` scoping class
     * and would render seller-surface dialogs with the light root
     * palette. Callers inside the seller workspace pass a host element
     * that lives within the seller subtree so the dialog inherits the
     * dark-workshop tokens (same contract as Sheet.portalContainer).
     * Omitting this prop preserves the previous body-portal behavior
     * exactly.
     */
    portalContainer?: Element | DocumentFragment | null;
  }
>(({ className, children, portalContainer, ...props }, ref) => (
  <DialogPortal container={portalContainer ?? undefined}>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-40 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-floating border border-boundary bg-floating p-6 shadow-2 focus-visible:outline-none",
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
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-1 text-left", className)}
    {...props}
  />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("pr-8 font-heading text-lg text-foreground", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm leading-relaxed text-muted", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
};
