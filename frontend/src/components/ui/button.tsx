import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

/**
 * Working Ledger button.
 *
 * Geometry: controls use the 4px control radius so they read as
 * crisp instruments against the softly-squared 6px work sheets.
 *
 * Color semantics: the filled default is INTERACTION BLUE (primary
 * action). Oxide is never a button fill — it is a seller-attention
 * state, not an action. Destructive is reserved for genuinely
 * destructive actions.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-[color,background-color,border-color,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-button text-primary-foreground hover:bg-primary-button-hover active:bg-primary-active",
        secondary:
          // Recessed material against paper: a real control
          // affordance without becoming a second primary action.
          "bg-recessed text-foreground hover:bg-elevated/70",
        ghost: "text-foreground hover:bg-elevated",
        link: "text-primary underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        // Mobile-first touch targets: 44px on touch-sized screens,
        // returning to the existing compact desktop heights from sm up.
        sm: "h-11 px-3 sm:h-9",
        md: "h-11 px-4 sm:h-10",
        lg: "h-11 px-6 text-base",
        icon: "h-11 w-11 sm:h-10 sm:w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
