"use client";

import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Tabs — sekme bileşeni.
 *
 * İki kullanım modu:
 *
 * 1. Kontrollü mod (harici state):
 *    <Tabs value={tab} onValueChange={setTab}>
 *      <TabsList>
 *        <TabsTrigger value="a">Sekme A</TabsTrigger>
 *        <TabsTrigger value="b">Sekme B</TabsTrigger>
 *      </TabsList>
 *      <TabsContent value="a">İçerik A</TabsContent>
 *      <TabsContent value="b">İçerik B</TabsContent>
 *    </Tabs>
 *
 * 2. Uncontrolled mod (dahili state):
 *    <Tabs defaultValue="a">...</Tabs>
 *
 * Stil: projenin açık underline tab dili — mevcut OrdersViewTabs,
 * ReturnsViewTabs ile birebir uyumlu.
 * Seçili sekme primary renk, alt kenar çizgisi.
 */

/* ── Context ──────────────────────────────────────────────────────────── */

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs bileşenleri <Tabs> içinde kullanılmalı.");
  return ctx;
}

/* ── Tabs (root) ──────────────────────────────────────────────────────── */

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  children,
  className,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalValue, setInternalValue] = React.useState(
    defaultValue ?? "",
  );

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleChange = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

/* ── TabsList ─────────────────────────────────────────────────────────── */

export function TabsList({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap gap-4 border-b border-boundary",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── TabsTrigger ──────────────────────────────────────────────────────── */

export function TabsTrigger({
  value,
  children,
  disabled = false,
  className,
}: {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const { value: selected, onValueChange } = useTabsContext();
  const isSelected = value === selected;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      disabled={disabled}
      onClick={() => onValueChange(value)}
      className={cn(
        // Mevcut projedeki link-tab ile aynı dil
        "-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent",
        "px-0.5 pb-2 pt-1 text-[12.5px] leading-tight transition-colors md:min-h-9",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        "disabled:cursor-not-allowed disabled:opacity-50",
        isSelected
          ? "border-primary font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ── TabsContent ──────────────────────────────────────────────────────── */

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { value: selected } = useTabsContext();

  if (value !== selected) return null;

  return (
    <div
      role="tabpanel"
      className={cn("mt-4", className)}
    >
      {children}
    </div>
  );
}
