"use client";

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Select — design-token uyumlu dropdown bileşeni.
 *
 * Radix UI Select bağımlılığı yok — projenin mevcut pattern'ına sadık
 * (sıfır yeni npm paketi). Klavye navigasyonu, ARIA rolleri, portal
 * tabanlı overlay içerir.
 *
 * API:
 *   <Select value={val} onValueChange={setVal} placeholder="Seçin...">
 *     <SelectItem value="a">Seçenek A</SelectItem>
 *     <SelectItem value="b">Seçenek B</SelectItem>
 *   </Select>
 *
 * Ayrıca native select wrapper da sağlanır:
 *   <NativeSelect value={val} onChange={...}>
 *     <option value="a">Seçenek A</option>
 *   </NativeSelect>
 *
 * NativeSelect: mobil-first durumlar veya form submit için tercih edilir.
 * Select: gelişmiş UX gerektiren durumlar için kullanılır.
 */

/* ── Context ──────────────────────────────────────────────────────────── */

type SelectContextValue = {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerId: string;
  listboxId: string;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("SelectItem must be used inside <Select>");
  return ctx;
}

/* ── SelectItem ───────────────────────────────────────────────────────── */

export function SelectItem({
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
  const { value: selected, onValueChange, setOpen } = useSelectContext();
  const isSelected = value === selected;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled}
      data-value={value}
      onClick={() => {
        if (!disabled) {
          onValueChange(value);
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onValueChange(value);
          setOpen(false);
        }
      }}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        "flex cursor-pointer select-none items-center justify-between gap-2 rounded-control px-3 py-2 type-row-secondary text-foreground",
        "outline-none transition-colors",
        isSelected
          ? "bg-primary/10 text-primary-text font-medium"
          : "hover:bg-elevated focus:bg-elevated",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {isSelected ? (
        <Check size={13} strokeWidth={2.5} className="shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </div>
  );
}

/* ── Select ───────────────────────────────────────────────────────────── */

export function Select({
  value,
  onValueChange,
  placeholder = "Seçin…",
  disabled = false,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  const triggerId = `select-trigger-${id}`;
  const listboxId = `select-listbox-${id}`;

  // Dışarı tıklandığında kapat
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        listboxRef.current &&
        !listboxRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape ile kapat
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Aktif seçeneğin label'ını bul
  const selectedLabel = React.useMemo(() => {
    const items = React.Children.toArray(children);
    for (const child of items) {
      if (
        React.isValidElement<{ value: string; children: React.ReactNode }>(child) &&
        child.props.value === value
      ) {
        return child.props.children;
      }
    }
    return null;
  }, [children, value]);

  return (
    <SelectContext.Provider
      value={{ value, onValueChange, open, setOpen, triggerId, listboxId }}
    >
      <div className={cn("relative", className)}>
        {/* Trigger */}
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-control",
            "border border-boundary bg-control px-3 py-2",
            "type-row-secondary text-left text-foreground",
            "shadow-inset transition-colors",
            "hover:border-primary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span className={cn("min-w-0 truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel ?? placeholder}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-150",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        {/* Dropdown */}
        {open ? (
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
            className={cn(
              "absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-[8rem]",
              "overflow-hidden rounded-floating border border-boundary/80 bg-floating shadow-2",
              "motion-safe:animate-fade-in",
            )}
          >
            <div className="p-1 space-y-0.5">{children}</div>
          </div>
        ) : null}
      </div>
    </SelectContext.Provider>
  );
}

/* ── NativeSelect ─────────────────────────────────────────────────────── */

/**
 * NativeSelect — projedeki `<select>` elemanlarını tek tip görünüme
 * kavuşturmak için hafif wrapper. Mobil dostu (browser native picker),
 * form submit ile çalışır.
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "h-10 w-full appearance-none rounded-control",
        "border border-boundary bg-control pl-3 pr-8 py-2",
        "type-row-secondary text-foreground shadow-inset",
        "transition-colors hover:border-primary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    {/* Özel ok ikonu — appearance-none ile native ok gizlendi */}
    <ChevronDown
      size={14}
      strokeWidth={2}
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
  </div>
));
NativeSelect.displayName = "NativeSelect";
