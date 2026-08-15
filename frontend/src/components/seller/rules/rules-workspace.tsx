"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { useRecordMutationGate } from "@/components/shared/use-record-mutation-gate";
import { Button } from "@/components/ui/button";
import type { RuleView, SellerRule } from "@/lib/seller/rules";
import {
  getRuleHitCountLabel,
  getRuleStatusLabel,
  getRuleStatusTone,
  RULE_RESPONSE_HEADING,
  RULE_TRIGGER_HEADING,
  RULES_UNAVAILABLE_DESCRIPTION,
  RULES_UNAVAILABLE_TITLE,
  RULE_VIEW_TABS,
  rulesListEmptyCopy,
  rulesWorkspaceHref,
} from "@/lib/seller/rules-format";
import type { RulesListBootstrap } from "@/lib/seller/rules-server";
import { cn } from "@/lib/utils/cn";

import { RuleCreateDialog, RuleEditDialog, RuleStatusDialog } from "./rule-dialogs";

export function RulesWorkspace({
  listBootstrap,
  view,
}: {
  listBootstrap: RulesListBootstrap;
  view: RuleView;
}) {
  if (listBootstrap.state !== "ready") {
    return (
      <WorkspaceRetry
        title={RULES_UNAVAILABLE_TITLE}
        description={RULES_UNAVAILABLE_DESCRIPTION}
      />
    );
  }

  const rules = listBootstrap.page.rules;
  const empty = rulesListEmptyCopy(view);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <RulesViewTabs activeView={view} />
        <RuleCreateDialog />
      </div>
      {rules.length === 0 ? (
        <EmptyState
          variant="compact"
          title={empty.title}
          description={empty.description ?? undefined}
        />
      ) : (
        // One contiguous response register: rules are separated by
        // rules, not by individual cards. The sheet carries the only
        // boundary; each entry is a ruled row inside it.
        <ul
          role="list"
          className="divide-y divide-divider overflow-hidden rounded-sheet bg-raised"
        >
          {rules.map((rule) => (
            <li key={rule.id}>
              <RuleRow rule={rule} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One entry in the response register.
 *
 * Hierarchy (all existing data and wording preserved):
 *   1. trigger phrase — the strong identity line, the thing a seller
 *      scans for
 *   2. response text — secondary but fully readable, never clamped
 *   3. status · hit count — quiet metadata
 *   4. actions — quiet utilities aligned to the end of the meta line
 *
 * No per-rule card, no per-rule icon, no colour-coding by rule type.
 * The only colour is the truthful active/inactive state.
 */
function RuleRow({ rule }: { rule: SellerRule }) {
  const statusTone = getRuleStatusTone(rule.isActive);
  return (
    <article className="px-4 py-4 transition-colors hover:bg-elevated/40 md:px-5">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="type-meta text-muted-foreground">
            {RULE_TRIGGER_HEADING}
          </p>
          <p className="break-words type-row-primary text-foreground">
            {rule.triggerText}
          </p>
        </div>
        <div className="space-y-1">
          <p className="type-meta text-muted-foreground">
            {RULE_RESPONSE_HEADING}
          </p>
          <p className="whitespace-pre-wrap break-words type-body text-muted">
            {rule.responseText}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-0.5">
          <p className="type-row-secondary text-muted-foreground">
            <span
              className={cn(
                "font-medium",
                statusTone === "success" ? "text-success" : "text-paused",
              )}
            >
              {getRuleStatusLabel(rule.isActive)}
            </span>
            {" · "}
            {getRuleHitCountLabel(rule.hitCount)}
          </p>
          <RuleRowActions rule={rule} />
        </div>
      </div>
    </article>
  );
}

/**
 * The three approved rule views, in the same open underline grammar
 * already used by Orders / Returns / Unanswered: neutral background,
 * one structural bottom rule, and an active state carried by a cyan
 * underline + stronger weight + aria-current. No filled tab, no cyan
 * fill — cyan stays a signal.
 *
 * Labels, routes and view behaviour are unchanged.
 */
function RulesViewTabs({ activeView }: { activeView: RuleView }) {
  return (
    <nav
      aria-label="Cevap görünümü"
      className="flex flex-wrap gap-4 border-b border-boundary"
    >
      {RULE_VIEW_TABS.map((tab) => (
        <Link
          key={tab.view}
          href={rulesWorkspaceHref(tab.view) as Route}
          aria-current={tab.view === activeView ? "page" : undefined}
          className={cn(
            // Open underline tab: neutral background, cyan rule only.
            "-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-0.5 pb-2 pt-1 text-[12.5px] leading-tight transition-colors md:min-h-9",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
            tab.view === activeView
              ? "border-primary font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function WorkspaceRetry({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!isPending) setIsRetrying(false);
  }, [isPending]);

  const disabled = isRetrying || isPending;

  return (
    <div className="space-y-3 py-6" role="status">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-busy={disabled}
        onClick={() => {
          if (disabled) return;
          setIsRetrying(true);
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        Tekrar dene
      </Button>
    </div>
  );
}

/**
 * Per-record action group. Edit and Status PATCH the same
 * rule.version, so each row owns ONE shared mutation gate: starting
 * either action natively disables the sibling (and fails its submit
 * closed) until the mutation and its authoritative refresh finish.
 * Scoped strictly to this rule — other rows and the create action
 * stay independent.
 */
function RuleRowActions({ rule }: { rule: SellerRule }) {
  const gate = useRecordMutationGate();
  return (
    <div className="flex flex-wrap gap-2">
      <RuleEditDialog rule={rule} gate={gate} />
      <RuleStatusDialog rule={rule} gate={gate} />
    </div>
  );
}
