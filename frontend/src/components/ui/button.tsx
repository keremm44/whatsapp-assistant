import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

/**
 * Sakin Ustalık button.
 *
 * Default style uses petrol (--color-primary). Clay is reserved for warm
 * accents and is not used for primary CTAs. Destructive is reserved for
 * genuinely destructive actions.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-button text-primary-foreground hover:bg-primary-button-hover active:bg-primary-active",
        secondary:
          // A quiet filled step of the working material rather than a
          // bare outlined rectangle; hover completes the fill and
          // lifts the edge one small step.
          "bg-surface-2/70 text-foreground hover:bg-surface-2",
        ghost: "text-foreground hover:bg-surface-2",
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
