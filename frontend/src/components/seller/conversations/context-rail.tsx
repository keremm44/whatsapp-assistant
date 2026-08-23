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
import type { ConversationAiContext } from "@/lib/seller/conversations-server";
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

import { AssistantContextSection } from "./assistant-context-section";
import { ControlHistorySection } from "./control-history-section";

export function ConversationContextRail({
  order,
  returnIssue,
  unanswered,
  controlHistory,
  aiContext,
  renderedAt,
}: {
  order: ConversationOrderDetail | null;
  returnIssue: ConversationReturnIssueDetail | null;
  unanswered: ConversationUnansweredGroup[];
  controlHistory: ConversationControlHistoryEntry[];
  aiContext: ConversationAiContext | null;
  renderedAt: number;
}) {
  if (
    order === null &&
    returnIssue === null &&
    unanswered.length === 0 &&
    controlHistory.length === 0 &&
    aiContext === null
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
      {aiContext ? <AssistantContextSection context={aiContext} /> : null}
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
  labelTone: "attention" | "neutral";
  destination: Route;
  destinationLabel: string;
  children: React.ReactNode;
}) {
  const toneClass =
    labelTone === "attention" ? "text-attention" : "text-muted-foreground";
  return (
    <section className="space-y-2.5 px-5 py-5">
      <p
        className={cn(
          "flex items-center gap-1.5 type-meta font-semibold",
          toneClass,
        )}
      >
        <Icon aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>{label}</span>
      </p>
      <div className="space-y-1">{children}</div>
      <Link
        href={destination}
        className={cn(
          "inline-flex min-h-11 items-center gap-1 type-row-secondary font-semibold text-primary transition-colors hover:text-primary-hover md:min-h-0",
          "rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <span>{destinationLabel}</span>
        <ArrowRight aria-hidden="true" size={13} strokeWidth={1.75} />
      </Link>
    </section>
  );
}

function OrderContextBlock({ order }: { order: ConversationOrderDetail }) {
  return (
    <ContextBlock
      icon={Package}
      label="Sipariş"
      labelTone="neutral"
      destination={conversationOrderDestination(order) as Route}
      destinationLabel="Sipariş bilgilerine git"
    >
      {order.externalOrderNumber ? (
        <p className="type-row-primary text-foreground">
          Sipariş {order.externalOrderNumber}
        </p>
      ) : null}
      {order.productNameSnapshot ? (
        <p
          className="truncate type-row-secondary text-muted-foreground"
          title={order.productNameSnapshot}
        >
          {order.productNameSnapshot}
        </p>
      ) : null}
      <p className="type-row-secondary text-muted-foreground">
        {ORDER_STATUS_LABELS[order.status]}
      </p>
      {order.customText ? (
        <p
          className="type-row-secondary text-muted"
          title={order.customText}
        >
          Üzerine yazılacak: “{order.customText}”
        </p>
      ) : null}
      {order.sellerActionRequired && order.reviewReasonNote ? (
        <p className="line-clamp-3 type-row-secondary text-muted">
          {order.reviewReasonNote}
        </p>
      ) : null}
    </ContextBlock>
  );
}

function ReturnIssueContextBlock({
  issue,
}: {
  issue: ConversationReturnIssueDetail;
}) {
  return (
    <ContextBlock
      icon={Undo2}
      label="İade / sorun"
      labelTone={issue.sellerActionRequired ? "attention" : "neutral"}
      destination={conversationReturnDestination(issue) as Route}
      destinationLabel="İade ve sorunlara git"
    >
      <p className="type-row-primary text-foreground">
        {RETURN_ISSUE_TYPE_LABELS[issue.issueType]}
      </p>
      {issue.externalOrderNumberSnapshot ? (
        <p className="type-row-secondary text-muted-foreground">
          Sipariş {issue.externalOrderNumberSnapshot}
        </p>
      ) : null}
      {issue.productNameSnapshot ? (
        <p
          className="truncate type-row-secondary text-muted-foreground"
          title={issue.productNameSnapshot}
        >
          {issue.productNameSnapshot}
        </p>
      ) : null}
      {issue.reasonText ? (
        <p className="line-clamp-3 type-row-secondary text-muted">
          {issue.reasonText}
        </p>
      ) : null}
    </ContextBlock>
  );
}

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
        <p className="type-row-secondary text-muted-foreground">
          Bu konuşmada {groups.length} açık soru var.
        </p>
      ) : null}
      {question.length > 0 ? (
        <p className="line-clamp-2 type-row-primary text-foreground">
          “{question}”
        </p>
      ) : null}
      {latest && latest.occurrenceCount > 1 ? (
        <p className="type-row-secondary text-muted-foreground">
          {latest.occurrenceCount} kez soruldu
        </p>
      ) : null}
    </ContextBlock>
  );
}
