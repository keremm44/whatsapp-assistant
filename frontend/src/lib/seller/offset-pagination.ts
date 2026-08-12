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
