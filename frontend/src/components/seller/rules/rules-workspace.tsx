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
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li key={rule.id}>
              <article className="rounded-md border border-border bg-surface px-4 py-4 md:px-5">
                <div className="space-y-3">
                  <div>
                    <p className="text-[12px] font-medium text-muted-foreground">
                      {RULE_TRIGGER_HEADING}
                    </p>
                    <p className="mt-1 break-words text-sm font-medium text-foreground">
                      {rule.triggerText}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-muted-foreground">
                      {RULE_RESPONSE_HEADING}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                      {rule.responseText}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12.5px] text-muted-foreground">
                      {getRuleStatusLabel(rule.isActive)}
                      {" · "}
                      {getRuleHitCountLabel(rule.hitCount)}
                    </p>
                    <RuleRowActions rule={rule} />
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RulesViewTabs({ activeView }: { activeView: RuleView }) {
  return (
    <nav
      aria-label="Cevap görünümü"
      className="flex flex-wrap rounded-md border border-border bg-surface p-0.5"
    >
      {RULE_VIEW_TABS.map((tab) => (
        <Link
          key={tab.view}
          href={rulesWorkspaceHref(tab.view) as Route}
          aria-current={tab.view === activeView ? "page" : undefined}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-center text-[12.5px] font-medium leading-tight transition-colors md:min-h-9",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            tab.view === activeView
              ? "bg-surface-2 text-foreground shadow-surface"
              : "text-muted-foreground hover:text-foreground",
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
