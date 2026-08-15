import type { Route } from "next";
import Link from "next/link";

import { SellerIcon } from "@/components/seller/shell/icon-map";
import { Surface } from "@/components/shared/surface";
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

export function AssistantSettingsHub({
  bootstrap,
}: {
  bootstrap: AssistantSettingsHubBootstrap;
}) {
  return (
    <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {HUB_CARDS.map((card) => {
        const summary = summaryForCard(card, bootstrap);
        return (
          <li key={card.href}>
            <Link
              href={card.href as Route}
              className={cn(
                "block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <Surface className="flex h-full min-h-[11rem] flex-col justify-between gap-5 px-5 py-5 transition-colors hover:bg-selected/40">
                <div className="space-y-3">
                  <SellerIcon
                    name={card.icon}
                    className="text-muted-foreground"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {card.title}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-[13px] leading-snug text-foreground">
                    {summary}
                  </p>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-sm text-muted-foreground"
                  >
                    →
                  </span>
                </div>
              </Surface>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
