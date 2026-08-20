import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

import styles from "@/components/marketing/marketing-chassis.module.css";

/** Quiet window chrome — unused on the document surface, kept for tests/tools. */
export function WindowLights({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex items-center gap-1.5", className)}
    >
      <span className="h-2 w-2 rounded-full bg-chrome-foreground/25" />
      <span className="h-2 w-2 rounded-full bg-chrome-foreground/18" />
      <span className="h-2 w-2 rounded-full bg-chrome-foreground/12" />
    </span>
  );
}

export function InstrumentChassis({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.field} aria-hidden="true">
        <div className={styles.well} />
        <div className={styles.wellAlt} />
        <div className={styles.gridFine} />
        <div className={styles.gridCoarse} />
        <div className={styles.scan} />
        <div className={styles.noise} />
        <div className={styles.vignette} />
      </div>
      <span className={`${styles.corner} ${styles.tl}`} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.tr}`} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.bl}`} aria-hidden="true" />
      <span className={`${styles.corner} ${styles.br}`} aria-hidden="true" />
      <span className={`${styles.rail} ${styles.railLeft}`} aria-hidden="true" />
      <span className={`${styles.rail} ${styles.railRight}`} aria-hidden="true" />
      <div className={styles.body}>{children}</div>
    </div>
  );
}

export function InstrumentSpec() {
  return (
    <p className={styles.spec} aria-hidden="true">
      <span>Kontrollü asistan</span>
      <span className={styles.specDot}>/</span>
      <span>Kayıtlı bilgi</span>
      <span className={styles.specDot}>/</span>
      <span>Uydurmaz</span>
      <span className={styles.specDot}>/</span>
      <span>Karar sizde</span>
    </p>
  );
}
