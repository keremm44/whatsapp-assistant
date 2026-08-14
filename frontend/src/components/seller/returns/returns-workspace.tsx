"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReturnIssueType, ReturnView } from "@/lib/seller/returns";
import type {
  ReturnDetailBootstrap,
  ReturnListBootstrap,
} from "@/lib/seller/returns-server";
import { returnsWorkspaceHref } from "@/lib/seller/returns-format";
import { cn } from "@/lib/utils/cn";

import { ReturnRequestDetail } from "./return-request-detail";
import { ReturnsListPanel } from "./returns-list-panel";

/**
 * The two-pane İade ve Sorunlar workspace — one coherent tool surface,
 * not two cards: a queue on the left and the selected request's detail
 * on the right (the same URL owns both, so refresh/back stays exact).
 *
 *   Desktop (lg+) — the list takes ~40% and the detail ~60% of the
 *   workspace; both are always visible.
 *
 *   Mobile (< lg) — exactly one region renders: without a selection
 *   the controls + queue; with a selection the detail full-width plus
 *   an obvious “Listeye dön” affordance that preserves the filters.
 *
 * Detail-region discipline:
 *   - no selection → the quiet locked guidance line (desktop only),
 *   - not_found    → calm notice, never a crash, list stays reachable,
 *   - unavailable  → honest retry surface; the list behind it is
 *                    unaffected,
 *   - ready        → the detail. `key` resets per-selection local
 *                    state (the note draft of one request can never
 *                    leak into another).
 *
 * mark_handled success (the only mutation): nothing is faked locally.
 * In the default “İncelenecekler” queue the record leaves the view, so
 * the selection is dropped from the URL and the navigation itself
 * re-resolves a fresh first page; in collecting/handled/all the same
 * record stays visible and a refresh re-resolves its truthful HANDLED
 * state.
 */
export function ReturnsWorkspace({
  listBootstrap,
  detailBootstrap,
  view,
  query,
  issueType,
  selectedRequestId,
}: {
  listBootstrap: ReturnListBootstrap;
  /** null when the URL carries no (valid) selection. */
  detailBootstrap: ReturnDetailBootstrap | null;
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
  selectedRequestId: number | null;
}) {
  const router = useRouter();
  const hasSelection = selectedRequestId !== null;

  const onHandledSuccess = React.useCallback(() => {
    if (view === "action_required") {
      router.push(
        returnsWorkspaceHref({ view, query, issueType }) as Route,
      );
      return;
    }
    router.refresh();
  }, [view, query, issueType, router]);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div
        className={cn(
          "min-w-0 lg:border-r lg:border-divider",
          hasSelection && "hidden lg:block",
        )}
      >
        <ReturnsListPanel
          bootstrap={listBootstrap}
          view={view}
          query={query}
          issueType={issueType}
          selectedRequestId={selectedRequestId}
        />
      </div>
      <div className={cn("min-w-0", !hasSelection && "hidden lg:block")}>
        <ReturnsDetailRegion
          bootstrap={detailBootstrap}
          view={view}
          query={query}
          issueType={issueType}
          onHandledSuccess={onHandledSuccess}
        />
      </div>
    </div>
  );
}

function ReturnsDetailRegion({
  bootstrap,
  view,
  query,
  issueType,
  onHandledSuccess,
}: {
  bootstrap: ReturnDetailBootstrap | null;
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
  onHandledSuccess: () => void;
}) {
  if (bootstrap === null) {
    // Only visible from lg up: below that the region is hidden while
    // there is no selection, and the queue owns the screen. Restrained
    // anchored guidance — intentional, not a dead area.
    return (
      <div
        className="flex min-h-64 items-center justify-center px-6 py-16"
        role="status"
      >
        <div className="flex max-w-60 flex-col items-center gap-2.5 text-center">
          <Inbox
            aria-hidden="true"
            size={20}
            strokeWidth={1.5}
            className="text-muted-foreground/70"
          />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            İncelemek için listeden bir kayıt seçin.
          </p>
        </div>
      </div>
    );
  }

  if (bootstrap.state === "ready") {
    return (
      <ReturnRequestDetail
        key={bootstrap.detail.request.id}
        detail={bootstrap.detail}
        view={view}
        query={query}
        issueType={issueType}
        onHandledSuccess={onHandledSuccess}
      />
    );
  }

  if (bootstrap.state === "not_found") {
    // 404 also covers a URL pointing at another tenant's record — the
    // copy stays neutral and never asserts what happened.
    return (
      <WorkspaceNotice
        title="Bu kayıt şu anda görüntülenemiyor."
        description="Bağlantı güncel olmayabilir ya da kayıt kaldırılmış olabilir. Listeye dönüp güncel bir kayıt seçebilirsiniz."
        view={view}
        query={query}
        issueType={issueType}
      />
    );
  }

  // unavailable | auth_rejected — honest retry, no raw internals.
  return (
    <WorkspaceRetry
      title="Kayıt şu anda yüklenemedi."
      description="Bağlantı kurulamadı. Tekrar deneyebilirsiniz."
      view={view}
      query={query}
      issueType={issueType}
    />
  );
}

/** Obvious mobile queue-return affordance, filters preserved. */
function MobileBackLink({
  view,
  query,
  issueType,
}: {
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
}) {
  return (
    <div className="border-b border-divider px-4 py-2.5 md:px-5 lg:hidden">
      <Link
        href={returnsWorkspaceHref({ view, query, issueType }) as Route}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
        <span>Listeye dön</span>
      </Link>
    </div>
  );
}

function WorkspaceNotice({
  title,
  description,
  view,
  query,
  issueType,
}: {
  title: string;
  description: string;
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
}) {
  return (
    <div>
      <MobileBackLink view={view} query={query} issueType={issueType} />
      <div className="space-y-3 px-4 py-10 md:px-5" role="status">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link
              href={returnsWorkspaceHref({ view, query, issueType }) as Route}
            >
              Listeye dön
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Retrying re-runs the server page (same mechanics as the queue's own
 * retry surface), which re-resolves the selection without touching the
 * auth session.
 */
function WorkspaceRetry({
  title,
  description,
  view,
  query,
  issueType,
}: {
  title: string;
  description: string;
  view: ReturnView;
  query: string | null;
  issueType: ReturnIssueType | null;
}) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!isPending) {
      setIsRetrying(false);
    }
  }, [isPending]);

  const onRetry = () => {
    if (isRetrying || isPending) return;
    setIsRetrying(true);
    startTransition(() => {
      router.refresh();
    });
  };

  const disabled = isRetrying || isPending;

  return (
    <div>
      <MobileBackLink view={view} query={query} issueType={issueType} />
      <div className="space-y-3 px-4 py-10 md:px-5" role="status">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRetry}
            disabled={disabled}
            aria-busy={disabled}
          >
            Tekrar dene
          </Button>
        </div>
      </div>
    </div>
  );
}
