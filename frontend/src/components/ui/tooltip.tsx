"use client";

import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Tooltip — hover/focus tetiklemeli kısa açıklama balonu.
 *
 * Radix UI bağımlılığı yok.
 *
 * Kullanım:
 *   <Tooltip content="Daha fazla bilgi">
 *     <button>?</button>
 *   </Tooltip>
 *
 * Pozisyon: varsayılan "top", isteğe bağlı "bottom" | "left" | "right".
 *
 * Erişilebilirlik:
 *   - Tooltip içeriği role="tooltip" ile işaretlenir.
 *   - Trigger elemanı aria-describedby ile bağlanır.
 *   - Klavye: focus ile açılır, blur ile kapanır.
 *   - prefers-reduced-motion: animasyon devre dışı bırakılır.
 */

type TooltipSide = "top" | "bottom" | "left" | "right";

const SIDE_CLASSES: Record<TooltipSide, string> = {
  top:    "bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2",
  bottom: "top-[calc(100%+6px)] left-1/2 -translate-x-1/2",
  left:   "right-[calc(100%+6px)] top-1/2 -translate-y-1/2",
  right:  "left-[calc(100%+6px)] top-1/2 -translate-y-1/2",
};

type TooltipChildProps = {
  "aria-describedby"?: string;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
};

export function Tooltip({
  content,
  side = "top",
  children,
  className,
}: {
  /** Tooltip içeriği — kısa, en fazla 2 satır. */
  content: React.ReactNode;
  side?: TooltipSide;
  children: React.ReactElement<TooltipChildProps>;
  className?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  const id = React.useId();
  const tooltipId = `tooltip-${id}`;

  const childProps = children.props;

  // Çocuğa aria-describedby + event handler'ları ekle
  const child = React.cloneElement(children, {
    "aria-describedby": visible ? tooltipId : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      setVisible(true);
      childProps.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      setVisible(false);
      childProps.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      setVisible(true);
      childProps.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      setVisible(false);
      childProps.onBlur?.(e);
    },
  } satisfies TooltipChildProps);

  return (
    <span className="relative inline-flex">
      {child}
      {visible ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 w-max max-w-[200px]",
            "rounded-floating border border-boundary/80 bg-floating px-2.5 py-1.5",
            "type-meta text-foreground shadow-2",
            "motion-safe:animate-fade-in",
            SIDE_CLASSES[side],
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

/**
 * TooltipProvider — Radix UI uyumlu API için alias.
 * Bu implementasyonda Provider gereksizdir ama
 * gelecekte Radix'e geçiş kolaylaşsın diye sağlanır.
 */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
