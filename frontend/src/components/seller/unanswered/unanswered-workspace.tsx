"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UnansweredAction, UnansweredView } from "@/lib/seller/unanswered";
import {
  resolveUnansweredMutationSuccess,
  UNANSWERED_DETAIL_EMPTY_GUIDANCE,
  UNANSWERED_DETAIL_NOT_FOUND_TITLE,
  unansweredWorkspaceHref,
} from "@/lib/seller/unanswered-format";
import type {
  UnansweredDetailBootstrap,
  UnansweredListBootstrap,
} from "@/lib/seller/unanswered-server";
import { cn } from "@/lib/utils/cn";

import { UnansweredListPanel } from "./unanswered-list-panel";
import { UnansweredQuestionDetail } from "./unanswered-question-detail";

/**
 * The two-pane Cevaplanamayan Sorular workspace — one coherent tool
 * surface: the question queue on the left, the selected question's
 * detail on the right (the same URL owns both, so refresh/back stays
 * exact).
 *
 *   Desktop (lg+) — the list takes ~40% and the detail ~60% of the
 *   workspace; both are always visible.
 *
 *   Mobile (< lg) — exactly one region renders: without a selection
 *   the tabs + queue; with a selection the detail full-width plus an
 *   obvious “Listeye dön” affordance that preserves the active view.
 *
 * Detail-region discipline:
 *   - no selection → the quiet locked guidance line (desktop only),
 *   - not_found    → the calm locked notice, list stays reachable,
 *   - unavailable  → honest retry surface; the queue stays usable,
 *   - ready        → the detail. `key` resets per-selection local
 *                    state (a draft from one question can never leak
 *                    into another).
 *
 * Mutation success (set_answer / dismiss): nothing is faked locally.
 * The backend truth decides what's next — when the mutation moves the
 * question out of the current queue the selection is dropped from the
 * URL and the navigation re-resolves a fresh first page; otherwise a
 * refresh re-resolves the truthful new state.
 */
export function UnansweredWorkspace({
  listBootstrap,
  detailBootstrap,
  view,
  selectedQuestionId,
}: {
  listBootstrap: UnansweredListBootstrap;
  /** null when the URL carries no (valid) selection. */
  detailBootstrap: UnansweredDetailBootstrap | null;
  view: UnansweredView;
  selectedQuestionId: number | null;
}) {
  const router = useRouter();
  const hasSelection = selectedQuestionId !== null;

  const onMutationSuccess = React.useCallback(
    (action: UnansweredAction) => {
      if (resolveUnansweredMutationSuccess(view, action) === "clear_selection") {
        router.push(unansweredWorkspaceHref({ view }) as Route);
        return;
      }
      router.refresh();
    },
    [view, router],
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div
        className={cn(
          "min-w-0 lg:border-r lg:border-divider",
          hasSelection && "hidden lg:block",
        )}
      >
        <UnansweredListPanel
          bootstrap={listBootstrap}
          view={view}
          selectedQuestionId={selectedQuestionId}
        />
      </div>
      <div className={cn("min-w-0", !hasSelection && "hidden lg:block")}>
        <UnansweredDetailRegion
          bootstrap={detailBootstrap}
          view={view}
          onMutationSuccess={onMutationSuccess}
        />
      </div>
    </div>
  );
}

function UnansweredDetailRegion({
  bootstrap,
  view,
  onMutationSuccess,
}: {
  bootstrap: UnansweredDetailBootstrap | null;
  view: UnansweredView;
  onMutationSuccess: (action: UnansweredAction) => void;
}) {
  if (bootstrap === null) {
    // Only visible from lg up: below that the region is hidden while
    // there is no selection, and the queue owns the screen.
    return (
      <div
        className="flex min-h-64 items-center justify-center px-6 py-16"
        role="status"
      >
        <p className="max-w-56 text-center text-[13px] leading-relaxed text-muted-foreground">
          {UNANSWERED_DETAIL_EMPTY_GUIDANCE}
        </p>
      </div>
    );
  }

  if (bootstrap.state === "ready") {
    return (
      <UnansweredQuestionDetail
        key={bootstrap.detail.question.id}
        detail={bootstrap.detail}
        view={view}
        onMutationSuccess={onMutationSuccess}
      />
    );
  }

  if (bootstrap.state === "not_found") {
    return (
      <WorkspaceNotice
        title={UNANSWERED_DETAIL_NOT_FOUND_TITLE}
        description="Bağlantı güncel olmayabilir ya da kayıt kaldırılmış olabilir. Listeye dönüp güncel bir soru seçebilirsiniz."
        view={view}
      />
    );
  }

  // unavailable | auth_rejected — honest retry, no raw internals.
  return (
    <WorkspaceRetry
      title="Soru şu anda yüklenemedi."
      description="Bağlantı kurulamadı. Tekrar deneyebilirsiniz."
      view={view}
    />
  );
}

/** Obvious mobile queue-return affordance, active view preserved. */
function MobileBackLink({ view }: { view: UnansweredView }) {
  return (
    <div className="border-b border-divider px-4 py-2.5 md:px-5 lg:hidden">
      <Link
        href={unansweredWorkspaceHref({ view }) as Route}
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
}: {
  title: string;
  description: string;
  view: UnansweredView;
}) {
  return (
    <div>
      <MobileBackLink view={view} />
      <div className="space-y-3 px-4 py-10 md:px-5" role="status">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link href={unansweredWorkspaceHref({ view }) as Route}>
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
}: {
  title: string;
  description: string;
  view: UnansweredView;
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
      <MobileBackLink view={view} />
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
