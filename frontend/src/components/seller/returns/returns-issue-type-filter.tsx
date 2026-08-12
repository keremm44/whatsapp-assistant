"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronDown } from "lucide-react";

import type { ReturnIssueType, ReturnView } from "@/lib/seller/returns";
import {
  RETURN_ISSUE_TYPE_FILTER_ALL_LABEL,
  RETURN_ISSUE_TYPE_OPTIONS,
  normalizeReturnIssueTypeParam,
  returnsWorkspaceHref,
} from "@/lib/seller/returns-format";

/**
 * Compact canonical issue-type filter (native select — no new
 * dependency, full keyboard semantics for free).
 *
 * The control's value is always the CANONICAL backend issue_type; the
 * display labels only render. Changing the type keeps the current view
 * + search, clears the selected request, and (via the URL, which never
 * carries an offset) restarts pagination from the first page.
 */
export function ReturnsIssueTypeFilter({
  view,
  query,
  issueType,
}: {
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = normalizeReturnIssueTypeParam(event.target.value);
    if (next === issueType) return;
    startTransition(() => {
      router.push(
        returnsWorkspaceHref({
          view,
          query,
          issueType: next,
        }) as Route,
      );
    });
  };

  return (
    <div className="w-full sm:w-64">
      <label
        htmlFor="returns-issue-type"
        className="mb-1 block text-[12px] font-medium text-muted-foreground"
      >
        Sorun türü
      </label>
      <div className="relative">
        <select
          id="returns-issue-type"
          name="type"
          value={issueType ?? ""}
          onChange={onChange}
          disabled={isPending}
          aria-busy={isPending}
          className="h-10 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        >
          <option value="">{RETURN_ISSUE_TYPE_FILTER_ALL_LABEL}</option>
          {RETURN_ISSUE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
