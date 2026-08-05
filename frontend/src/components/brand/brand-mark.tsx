import Link from "next/link";
import { brand } from "@/config/brand";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={`${brand.brandName} ana sayfa`}
      className="inline-flex shrink-0 items-center gap-2 rounded-md font-semibold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--green)]"
    >
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-[9px] bg-[var(--green)] text-sm text-white"
      >
        {brand.initial}
      </span>
      <span className={compact ? "hidden sm:inline" : "inline"}>
        {brand.brandName}
      </span>
    </Link>
  );
}
