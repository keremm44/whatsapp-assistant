"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, PanelRight } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ConversationControlBootstrap } from "@/lib/seller/conversations-server";
import type { ConversationDetail } from "@/lib/seller/conversations";
import {
  conversationsListHref,
  getConversationCustomerDisplay,
} from "@/lib/seller/conversations-format";
import { cn } from "@/lib/utils/cn";

import { ConversationControlArea } from "./control-area";
import { MessageTimeline } from "./message-timeline";

/**
 * Selected-conversation region (center column) of the workbench.
 *
 * Composition:
 *   Header    — customer identity, a mobile back affordance to the
 *               queue, the backend-authoritative control chip and the
 *               single V1 handoff action (ConversationControlArea),
 *               and the "Bağlam" trigger that opens the context Sheet
 *               on viewports where the static rail cannot fit. The
 *               trigger renders only when real context exists — a
 *               dead context button is never shown.
 *   Timeline  — MessageTimeline with its own scroll region on
 *               desktop; natural page flow on mobile.
 *
 * The context rail CONTENT arrives as a server-rendered node
 * (`contextRail`) so the identical, server-parsed block renders both
 * in the static xl+ column (placed by the page) and inside this
 * Sheet — the two never drift apart.
 *
 * The Sheet portals into `portalHost`, a display:contents node inside
 * the seller subtree, because the default body-level portal would
 * escape `.seller-theme` and render the drawer with the light root
 * palette.
 */
export function ConversationDetailPanel({
  customerId,
  detail,
  initialControl,
  renderedAt,
  attentionOnly,
  hasContext,
  contextRail,
}: {
  customerId: number;
  detail: ConversationDetail;
  initialControl: ConversationControlBootstrap;
  renderedAt: number;
  /** Current list filter — keeps the back link on the same view. */
  attentionOnly: boolean;
  hasContext: boolean;
  contextRail: React.ReactNode;
}) {
  const [isContextOpen, setIsContextOpen] = React.useState(false);
  const [portalHost, setPortalHost] = React.useState<HTMLDivElement | null>(
    null,
  );

  const display = getConversationCustomerDisplay(detail.customer);
  const moderationNote = detail.customer.isBlocked
    ? "Bu numara sistem tarafından engellenmiş durumda."
    : detail.customer.isMuted
      ? "Bu numara geçici olarak susturulmuş durumda."
      : null;

  return (
    <>
      {/* Portal host: keeps the context Sheet inside .seller-theme. */}
      <div ref={setPortalHost} className="contents" />

      <header className="space-y-2 border-b border-divider px-0 py-3.5 md:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-1">
            <Link
              href={conversationsListHref(attentionOnly) as Route}
              aria-label="Konuşmalara geri dön"
              title="Konuşmalara geri dön"
              className={cn(
                "-ml-1 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors md:hidden",
                "hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.75} />
            </Link>
            <div className="min-w-0">
              <h2
                className="truncate font-heading text-[15px] font-semibold leading-snug text-foreground"
                title={display.primary}
              >
                {display.primary}
              </h2>
              {display.secondary ? (
                <p className="truncate text-[12px] text-muted-foreground">
                  {display.secondary}
                </p>
              ) : null}
              {moderationNote ? (
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                  {moderationNote}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-start gap-1.5">
            {hasContext ? (
              <button
                type="button"
                onClick={() => setIsContextOpen(true)}
                aria-label="Konuşma bağlamını aç"
                aria-haspopup="dialog"
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors xl:hidden",
                  "hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                )}
              >
                <PanelRight aria-hidden="true" size={16} strokeWidth={1.75} />
                <span>Bağlam</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-start justify-start md:justify-end">
          <ConversationControlArea
            customerId={customerId}
            initialControl={initialControl}
          />
        </div>
      </header>

      <MessageTimeline
        customerId={customerId}
        initialMessages={detail.messages}
        initialMessagePage={detail.messagePage}
        renderedAt={renderedAt}
      />

      {hasContext ? (
        <Sheet open={isContextOpen} onOpenChange={setIsContextOpen}>
          <SheetContent
            side="right"
            portalContainer={portalHost}
            className="w-full max-w-sm gap-0 p-0"
          >
            <SheetHeader className="border-b border-divider px-4 pb-3 pt-4">
              <SheetTitle className="text-[15px] font-semibold">
                Konuşma bağlamı
              </SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto">{contextRail}</div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}
