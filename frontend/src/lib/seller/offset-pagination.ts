/**
 * Shared offset-pagination mitigation for live seller queues.
 *
 * Backend list contracts on Orders / Returns / Unanswered / Conversations
 * are offset-based. Rows can move between requests, so a later page may
 * contain duplicates of already-loaded rows, and an empty page can appear
 * even when more work still exists.
 *
 * This helper does NOT invent a cursor API. It only encodes the strongest
 * safe frontend rule on top of the proven contract:
 *
 *   - empty page              → stop
 *   - short page (page-size)  → stop (Orders / Returns / Unanswered)
 *   - full page               → more may exist
 *   - page of only duplicates → advance the offset and optionally
 *                               auto-continue, capped so a pathological
 *                               backend cannot loop forever
 *   - global-total lists      → moreAvailable follows loaded < total
 *
 * Callers still own merge/dedupe and never reorder rows client-side.
 */

/** Cap on automatic “all-duplicates, keep going” fetches per click. */
export const OFFSET_PAGE_AUTO_CONTINUE_CAP = 3;

export type OffsetPageMoreRule =
  | { kind: "page_size" }
  | { kind: "global_total"; loadedCount: number; total: number };

export type OffsetPageAdvance = {
  nextOffset: number;
  moreAvailable: boolean;
  shouldAutoContinue: boolean;
};

/**
 * Decide how a just-fetched offset page should advance the queue.
 *
 * `appendedCount` is the number of NEW ids after the caller's dedupe.
 * `incomingCount` is the raw page length the backend returned.
 */
export const decideOffsetPageAdvance = (input: {
  incomingCount: number;
  appendedCount: number;
  incomingOffset: number;
  pageSize: number;
  autoContinueCount: number;
  moreRule: OffsetPageMoreRule;
}): OffsetPageAdvance => {
  const nextOffset = input.incomingOffset + input.incomingCount;
  const empty = input.incomingCount === 0;
  const fullPage = input.incomingCount >= input.pageSize && input.incomingCount > 0;
  const onlyDuplicates = input.incomingCount > 0 && input.appendedCount === 0;

  if (empty) {
    return {
      nextOffset,
      moreAvailable: false,
      shouldAutoContinue: false,
    };
  }

  const moreAvailable =
    input.moreRule.kind === "global_total"
      ? input.moreRule.loadedCount < input.moreRule.total
      : fullPage;

  if (
    onlyDuplicates &&
    moreAvailable &&
    input.autoContinueCount < OFFSET_PAGE_AUTO_CONTINUE_CAP
  ) {
    return {
      nextOffset,
      moreAvailable,
      shouldAutoContinue: true,
    };
  }

  return {
    nextOffset,
    moreAvailable,
    shouldAutoContinue: false,
  };
};

/* ------------------------------------------------------------------ */
/* Load-more lifecycle (stale-context cancellation)                    */
/* ------------------------------------------------------------------ */

/**
 * Minimal shape of the mutable in-flight reference every list panel
 * keeps (React's `useRef<AbortController | null>`). Typed structurally
 * so the race rules stay verifiable with Node's built-in test runner.
 */
export type InflightLoadMoreRef = { current: AbortController | null };

/**
 * Cancel the active load-more request because the list context was
 * replaced (new server bootstrap after a filter/search/tab change,
 * router refresh, or freshness re-resolution).
 *
 * Aborting makes every await-point check in the request body bail out,
 * so a late response can never append rows, advance the offset, change
 * moreAvailable, or set an error against the NEW list state. Clearing
 * the ref immediately also re-opens the single-in-flight gate so the
 * seller can start a fresh load-more in the new context right away.
 */
export const cancelInflightLoadMore = (
  inflight: InflightLoadMoreRef,
): void => {
  inflight.current?.abort();
  inflight.current = null;
};

/**
 * Whether a finishing request still OWNS the panel's load-more
 * lifecycle state. Only the owner may clear the in-flight ref and
 * reset the shared `isLoadingMore` flag:
 *
 *   - normal completion            → ref still holds this controller
 *                                    → finalize (clear ref + loading)
 *   - cancelled by context change  → ref was already cleared
 *                                    → do NOT touch panel state
 *   - superseded by a newer request → ref holds the newer controller
 *                                    → do NOT touch panel state
 *
 * Without this guard an old request's `finally` block could stomp the
 * loading/controller state that now belongs to a newer request.
 */
export const ownsLoadMoreLifecycle = (
  inflight: InflightLoadMoreRef,
  controller: AbortController,
): boolean => inflight.current === controller;
