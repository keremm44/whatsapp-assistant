import type { Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { SellerIcon } from "@/components/seller/shell/icon-map";
import { SETTINGS_SHEET_MEASURE } from "@/components/seller/assistant-settings/settings-measure";
import type { AssistantSettingsHubBootstrap } from "@/lib/seller/assistant-settings-hub-server";
import {
  HUB_CARDS,
  HUB_UNAVAILABLE_SUMMARY,
  summarizeActiveProducts,
  summarizeActiveRules,
  summarizeAssistantKnowledge,
  summarizeOrderCollection,
  type HubCardDefinition,
} from "@/lib/seller/assistant-settings-hub";
import { cn } from "@/lib/utils/cn";

const summaryForCard = (
  card: HubCardDefinition,
  bootstrap: AssistantSettingsHubBootstrap,
): string => {
  if (card.key === "products") {
    if (bootstrap.products.state !== "ready") return HUB_UNAVAILABLE_SUMMARY;
    return summarizeActiveProducts(bootstrap.products.data.activeCount);
  }
  if (card.key === "rules") {
    if (bootstrap.rules.state !== "ready") return HUB_UNAVAILABLE_SUMMARY;
    return summarizeActiveRules(bootstrap.rules.data.activeCount);
  }
  if (bootstrap.settings.state !== "ready") return HUB_UNAVAILABLE_SUMMARY;
  if (card.key === "knowledge") {
    return summarizeAssistantKnowledge(bootstrap.settings.data);
  }
  return summarizeOrderCollection(bootstrap.settings.data);
};

/**
 * Asistan Ayarları hub — an operational index, not a feature-card grid.
 *
 * The previous treatment rendered four ~11rem tall raised cards in a
 * 2-up grid: icon, title, description, a large empty gap, then the
 * summary and an arrow. That is the classic SaaS settings-dashboard
 * grammar, and it now reads as older than the rest of the workspace.
 *
 * This is the same reduced-card grammar the other converged surfaces
 * use: ONE contiguous sheet whose destinations are separated by rules.
 * Each row keeps every piece of information it had — title,
 * description, factual summary, route — but the enclosure, the forced
 * equal height and the empty middle region are gone, so the four
 * destinations read as a calm list of places to go.
 *
 * The whole row remains the link (a generous target, never an
 * arrow-only hit area), and the icons stay small neutral line glyphs:
 * no discs, no per-destination colour, no illustration.
 *
 * WIDTH: the register is capped at the shared settings work-sheet
 * measure and left-aligned with the page heading. Without the cap it
 * inherited the 1180px page container, which pushed the chevron to the
 * far edge and made each destination read as an oversized table row
 * with a long empty gap in the middle. Below the cap the register
 * stays fluid, so tablet and mobile are unaffected.
 */
export function AssistantSettingsHub({
  bootstrap,
}: {
  bootstrap: AssistantSettingsHubBootstrap;
}) {
  return (
    <ul
      role="list"
      className={cn(
        "mt-8 divide-y divide-divider overflow-hidden rounded-sheet bg-raised shadow-surface border border-boundary/60",
        SETTINGS_SHEET_MEASURE,
      )}
    >
      {HUB_CARDS.map((card) => {
        const summary = summaryForCard(card, bootstrap);
        return (
          <li key={card.href}>
            <Link
              href={card.href as Route}
              className="group flex items-start gap-3.5 px-4 py-4 transition-colors hover:bg-elevated/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:px-5"
            >
              <SellerIcon
                name={card.icon}
                size={18}
                className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block type-row-primary text-foreground">
                  {card.title}
                </span>
                <span className="block max-w-prose type-row-secondary text-muted">
                  {card.description}
                </span>
                {/* Factual, backend-derived summary — the one piece of
                    live state on this surface. */}
                <span className="block type-meta text-muted-foreground">
                  {summary}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                size={15}
                strokeWidth={1.75}
                className="mt-1 shrink-0 text-muted-foreground/50 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-muted-foreground"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
