import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/utils";

const styles = {
  primary:
    "bg-[var(--green)] text-white hover:bg-[var(--green-dark)] shadow-[0_8px_24px_rgba(45,91,71,.16)]",
  secondary:
    "border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--green)]",
  quiet: "text-[var(--ink)] hover:bg-[var(--sage)]",
};

type Variant = keyof typeof styles;

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--green)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  className,
  variant = "primary",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--green)] active:translate-y-px",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
