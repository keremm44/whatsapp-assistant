import type { Route } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Surface } from "@/components/shared/surface";
import { assistantSubRoutes } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "@/components/seller/shell/icon-map";

/**
 * Asistan Ayarları — navigation hub.
 *
 * The two navigation rows genuinely are navigation cards and therefore
 * earn bounded surfaces. They are not placeholders.
 */
export default function SellerAssistantSettingsPage() {
  return (
    <PageContainer className="py-8 sm:py-10">
      <PageHeader
        caption="Asistan"
        title="Asistan Ayarları"
        description="Asistanın müşterilere yardımcı olurken kullanabileceği bilgileri yönetin."
      />

      <ul className="mt-8 flex flex-col gap-3">
        {assistantSubRoutes.map((entry) => (
          <li key={entry.href}>
            <Link
              href={entry.href as Route}
              className={cn(
                "block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <Surface className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
                <div className="flex items-center gap-3">
                  <SellerIcon
                    name={entry.icon}
                    className="text-muted-foreground"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {entry.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.label === "Ürünler"
                        ? "Asistanın müşterilere ürünleriniz hakkında verebileceği bilgileri yönetin."
                        : "Asistanın müşterilerle konuşurken kullanacağı satıcı tanımlı kuralları yönetin."}
                    </p>
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className="text-sm text-muted-foreground"
                >
                  →
                </span>
              </Surface>
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
