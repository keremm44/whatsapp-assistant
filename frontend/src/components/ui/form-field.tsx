import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-[var(--ink)]"
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm text-[var(--error)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-4 text-base transition outline-none placeholder:text-[var(--muted)]/70 focus:border-[var(--green)] focus:ring-3 focus:ring-[var(--sage)] disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-base transition outline-none placeholder:text-[var(--muted)]/70 focus:border-[var(--green)] focus:ring-3 focus:ring-[var(--sage)] disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
