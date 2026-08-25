import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

/**
 * Badge — genel amaçlı durum etiketi.
 *
 * StatusChip'ten farkı:
 *   - StatusChip yalnızca iş kayıt durumlarını (attention/success/paused)
 *     ifade eder ve dot marker taşır.
 *   - Badge daha geniş amaçlıdır: sayısal değer, kategori,
 *     etiket, filtre — her şey için kullanılabilir.
 *
 * Tonlar design token'lara bağlıdır, hex hardcode yoktur.
 *
 * Kullanım:
 *   <Badge>Varsayılan</Badge>
 *   <Badge tone="success">Tamamlandı</Badge>
 *   <Badge tone="warning" size="sm">Beklemede</Badge>
 *   <Badge tone="info" dot>3 yeni</Badge>
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 font-medium leading-none transition-colors",
  {
    variants: {
      tone: {
        default:     "bg-recessed text-muted-foreground border border-boundary/60",
        primary:     "bg-primary/10 text-primary-text border border-primary/20",
        success:     "bg-success-muted text-success border border-success/20",
        warning:     "bg-warning-muted text-warning border border-warning/20",
        destructive: "bg-destructive-muted text-destructive border border-destructive/20",
        info:        "bg-info-muted text-info border border-info/20",
        attention:   "bg-accent-muted text-accent-text border border-accent/20",
        paused:      "bg-paused-muted text-paused border border-paused/20",
      },
      size: {
        sm: "rounded-pill px-1.5 py-px text-[10px]",
        md: "rounded-pill px-2 py-0.5 text-[11px]",
        lg: "rounded-control px-2.5 py-1 text-[12.5px]",
      },
    },
    defaultVariants: {
      tone: "default",
      size: "md",
    },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>["size"]>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Önce küçük bir dolgu noktası gösterir (StatusChip stili). */
  dot?: boolean;
}

export function Badge({
  tone,
  size,
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}
