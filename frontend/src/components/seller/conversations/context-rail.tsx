import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  ArrowRight,
  HelpCircle,
  Package,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import type {
  ConversationControlHistoryEntry,
  ConversationOrderDetail,
  ConversationReturnIssueDetail,
  ConversationUnansweredGroup,
} from "@/lib/seller/conversations";
import {
  conversationOrderDestination,
  conversationReturnDestination,
  conversationUnansweredDestination,
} from "@/lib/seller/conversations-destinations";
import {
  ORDER_STATUS_LABELS,
  RETURN_ISSUE_TYPE_LABELS,
} from "@/lib/seller/conversations-format";
import { cn } from "@/lib/utils/cn";

import { ControlHistorySection } from "./control-history-section";

/**
 * Conditional context rail — the right region of the workbench.
 *
 * Rendered ONLY when the selected conversation actually carries
 * context: an active order, an active return/issue, one or more open
 * unanswered questions — or a non-empty control history (the
 * read-only Konuşma geçmişi). Its appearance alone communicates
 * "there is relevant context here"; when nothing exists the region
 * is removed entirely and the conversation expands.
 *
 * Block order is deliberate: the actionable business context blocks
 * come first; Konuşma geçmişi is supporting context and renders last.
 *
 * Each block is compact and read-only: the rail points the seller to
 * the real destination surfaces (/seller/orders, /seller/returns,
 * /seller/unanswered) instead of implementing order/return/unanswered
 * handling inside Conversations. No invented detail routes, no
 * invented fields (no payment, revenue, shipping, or fulfillment).
 *
 * The component is server-safe and pure: the same node renders in the
 * static xl+ rail column and inside the compact/mobile context Sheet.
 */

export function ConversationContextRail({
  order,
  returnIssue,
  unanswered,
  controlHistory,
  renderedAt,
}: {
  order: ConversationOrderDetail | null;
  returnIssue: ConversationReturnIssueDetail | null;
  unanswered: ConversationUnansweredGroup[];
  /** Detail-bootstrap history (bounded, newest first) — no extra fetch. */
  controlHistory: ConversationControlHistoryEntry[];
  renderedAt: number;
}) {
  if (
    order === null &&
    returnIssue === null &&
    unanswered.length === 0 &&
    controlHistory.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-col divide-y divide-divider">
      {order ? <OrderContextBlock order={order} /> : null}
      {returnIssue ? <ReturnIssueContextBlock issue={returnIssue} /> : null}
      {unanswered.length > 0 ? (
        <UnansweredContextBlock groups={unanswered} />
      ) : null}
      <ControlHistorySection
        entries={controlHistory}
        renderedAt={renderedAt}
      />
    </div>
  );
}

function ContextBlock({
  icon: Icon,
  label,
  labelTone,
  destination,
  destinationLabel,
  children,
}: {
  icon: LucideIcon;
  label: string;
  labelTone: "primary" | "accent" | "neutral";
  destination: Route;
  destinationLabel: string;
  children: React.ReactNode;
}) {
  const toneClass =
    labelTone === "primary"
      ? "text-primary-text"
      : labelTone === "accent"
        ? "text-accent-text"
        : "text-muted-foreground";
  return (
    <section className="space-y-2.5 px-4 py-4">
      <p
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
          toneClass,
        )}
      >
        <Icon aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>{label}</span>
      </p>
      <div className="space-y-1.5">{children}</div>
      <Link
        href={destination}
        className={cn(
          "inline-flex items-center gap-1 text-[12.5px] font-medium text-primary-text transition-colors hover:text-primary-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm",
        )}
      >
        <span>{destinationLabel}</span>
        <ArrowRight aria-hidden="true" size={13} strokeWidth={1.75} />
      </Link>
    </section>
  );
}

/**
 * Active order — only fields truly present in the conversation read
 * model. Status uses the backend's own ORDER_DISPLAY_STATUS strings
 * (mirrored in conversations-format). No payment / revenue / cargo.
 */
function OrderContextBlock({ order }: { order: ConversationOrderDetail }) {
  return (
    <ContextBlock
      icon={Package}
      label="Sipariş"
      labelTone="primary"
      destination={conversationOrderDestination(order) as Route}
      destinationLabel="Sipariş bilgilerine git"
    >
      {order.externalOrderNumber ? (
        <p className="text-[13.5px] font-medium text-foreground">
          Sipariş {order.externalOrderNumber}
        </p>
      ) : null}
      {order.productNameSnapshot ? (
        <p
          className="truncate text-[12.5px] text-muted-foreground"
          title={order.productNameSnapshot}
        >
          {order.productNameSnapshot}
        </p>
      ) : null}
      <p className="text-[12px] text-muted-foreground">
        {ORDER_STATUS_LABELS[order.status]}
      </p>
      {order.customText ? (
        <p
          className="text-[12px] leading-snug text-muted-foreground"
          title={order.customText}
        >
          Üzerine yazılacak: “{order.customText}”
        </p>
      ) : null}
      {order.status === "SELLER_REVIEW_REQUIRED" &&
      order.reviewReasonNote ? (
        <p className="line-clamp-3 text-[12px] leading-snug text-muted-foreground">
          {order.reviewReasonNote}
        </p>
      ) : null}
    </ContextBlock>
  );
}

/**
 * Active return / issue — canonical backend issue labels
 * (RETURN_ISSUE_TYPE_LABELS mirror ISSUE_TYPE_DISPLAY_NAMES) plus the
 * order/product snapshots the read model actually carries.
 */
function ReturnIssueContextBlock({
  issue,
}: {
  issue: ConversationReturnIssueDetail;
}) {
  return (
    <ContextBlock
      icon={Undo2}
      label="İade / Sorun"
      labelTone="accent"
      destination={conversationReturnDestination(issue) as Route}
      destinationLabel="İade ve sorunlara git"
    >
      <p className="text-[13.5px] font-medium text-foreground">
        {RETURN_ISSUE_TYPE_LABELS[issue.issueType]}
      </p>
      {issue.externalOrderNumberSnapshot ? (
        <p className="text-[12.5px] text-muted-foreground">
          Sipariş {issue.externalOrderNumberSnapshot}
        </p>
      ) : null}
      {issue.productNameSnapshot ? (
        <p
          className="truncate text-[12.5px] text-muted-foreground"
          title={issue.productNameSnapshot}
        >
          {issue.productNameSnapshot}
        </p>
      ) : null}
      {issue.reasonText ? (
        <p className="line-clamp-3 text-[12px] leading-snug text-muted-foreground">
          {issue.reasonText}
        </p>
      ) : null}
    </ContextBlock>
  );
}

/**
 * Open unanswered questions — ONE compact block regardless of how
 * many groups are open; the count communicates multiplicity calmly.
 * The first group in the payload is the most recently seen one
 * (backend orders by last_seen_at DESC).
 */
function UnansweredContextBlock({
  groups,
}: {
  groups: ConversationUnansweredGroup[];
}) {
  const latest = groups[0];
  const question =
    latest && typeof latest.question === "string"
      ? latest.question.trim()
      : "";
  return (
    <ContextBlock
      icon={HelpCircle}
      label="Cevaplanamayan soru"
      labelTone="neutral"
      destination={
        (latest
          ? conversationUnansweredDestination(latest)
          : "/seller/unanswered") as Route
      }
      destinationLabel="Cevaplanamayan sorulara git"
    >
      {groups.length > 1 ? (
        <p className="text-[12px] text-muted-foreground">
          Bu konuşmada {groups.length} açık soru var.
        </p>
      ) : null}
      {question.length > 0 ? (
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
          “{question}”
        </p>
      ) : null}
      {latest && latest.occurrenceCount > 1 ? (
        <p className="text-[12px] text-muted-foreground">
          {latest.occurrenceCount} kez soruldu
        </p>
      ) : null}
    </ContextBlock>
  );
}
